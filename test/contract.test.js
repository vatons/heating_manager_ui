/**
 * The cards make only the service calls in fixtures/service-calls.json, which
 * contract/test_backend_contract.py runs against the real integration, and
 * every call listed there is one a card makes.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TARGET_DEBOUNCE_MS } from '../heating-manager-ui.js';
import {
  FIXTURE_NOW, GLOBAL, KITCHEN, ROOM, SERVICE_CALLS, STUDY, ZONE,
  button, click, flush, makeHass, mount, withState,
} from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: FIXTURE_NOW });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const KINDS = { [ROOM]: 'room', [KITCHEN]: 'room', [STUDY]: 'room', [ZONE]: 'zone', [GLOBAL]: 'global' };

/** The contract entry a call matches: same service, data keys and values (numbers aside), target kind. */
function contractFor([domain, service, data, target]) {
  const kind = target ? KINDS[target.entity_id] : null;
  return SERVICE_CALLS.find((c) => c.domain === domain && c.service === service && c.target === kind
    && Object.keys(c.data).sort().join() === Object.keys(data).sort().join()
    && Object.entries(c.data).every(([k, v]) => typeof v === 'number' || data[k] === v));
}

it('every call the cards make is in the contract, and every contract call is made', async () => {
  const hass = makeHass();
  const unboosted = withState(hass, ROOM, {
    attributes: { boost: { temperature: null, end_time: null, duration_minutes: null, time_remaining_minutes: null } },
  });

  // Room card: boost (default and set length), cancel, target, off/on, resume schedule
  click(button(mount('heating-room-card', { entity: KITCHEN }, hass), 'boost'));
  click(button(mount('heating-room-card', { entity: ROOM, boost_duration: 60 }, unboosted), 'boost'));
  click(button(mount('heating-room-card', { entity: ROOM }, hass), 'boost'));
  click(button(mount('heating-room-card', { entity: KITCHEN }, hass), 'up'));
  click(button(mount('heating-room-card', { entity: KITCHEN }, hass), 'power'));
  click(button(mount('heating-room-card', { entity: STUDY }, hass), 'power'));
  click(button(mount('heating-room-card', { entity: KITCHEN }, hass), 'schedule'));
  // Room card on a zone and on the whole house
  const zoneCard = mount('heating-room-card', { entity: ZONE }, hass);
  click(button(zoneCard, 'boost'));
  await flush(); // the button is disabled while its call is in flight
  click(button(zoneCard, 'boost'));
  click(button(zoneCard, 'down'));
  const house = mount('heating-room-card', { entity: GLOBAL }, hass);
  click(button(house, 'up'));
  click(button(house, 'boost'));
  click(button(house, 'away'));
  click(button(mount('heating-room-card', { entity: GLOBAL }, makeHass('v3.2.0-away', { callService: hass.callService })), 'away'));
  // Zone card
  const zone = mount('heating-zone-card', { entity: ZONE }, hass);
  click(button(zone, 'room-boost', KITCHEN));
  click(button(zone, 'room-boost', ROOM));
  click(button(zone, 'boost'));
  vi.advanceTimersByTime(TARGET_DEBOUNCE_MS);

  const calls = hass.callService.mock.calls;
  const unmatched = calls.filter((call) => !contractFor(call));
  expect(unmatched).toEqual([]);
  const used = new Set(calls.map((call) => contractFor(call).id));
  // room_boost_temperature: the cards don't pick a boost temperature; the
  // contract checks set_boost's temperature unit for anyone who adds that.
  const unused = SERVICE_CALLS.map((c) => c.id).filter((id) => !used.has(id) && id !== 'room_boost_temperature');
  expect(unused).toEqual([]);
});
