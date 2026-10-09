/**
 * The cards make only the service calls in fixtures/service-calls.json, which
 * contract/test_backend_contract.py runs against the real integration, and
 * every call listed there is one a card makes.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '../heating-manager-ui.js';
import {
  FIXTURE_NOW, GLOBAL, KITCHEN, ROOM, SERVICE_CALLS, ZONE,
  button, click, flush, makeHass, mount, withState,
} from './helpers.js';

beforeEach(() => {
  vi.useFakeTimers({ now: FIXTURE_NOW });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const KINDS = { [ROOM]: 'room', [KITCHEN]: 'room', [ZONE]: 'zone', [GLOBAL]: 'global' };

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

  // Room card: boost (the room's duration, and the card's), cancel
  click(button(mount('heating-room-card', { entity: KITCHEN }, hass), 'boost'));
  click(button(mount('heating-room-card', { entity: ROOM, boost_duration: 60 }, unboosted), 'boost'));
  click(button(mount('heating-room-card', { entity: ROOM }, hass), 'boost'));
  // Boost all / Cancel boosts on a zone and the whole house
  const zoneCard = mount('heating-room-card', { entity: ZONE }, hass);
  click(button(zoneCard, 'boost'));
  await flush(); // the button is disabled while its call is in flight
  click(button(zoneCard, 'boost'));
  const house = mount('heating-room-card', { entity: GLOBAL }, hass);
  click(button(house, 'boost'));
  await flush();
  click(button(house, 'boost'));
  // Zone card
  click(button(mount('heating-zone-card', { entity: ZONE }, hass), 'boost'));

  const calls = hass.callService.mock.calls;
  const unmatched = calls.filter((call) => !contractFor(call));
  expect(unmatched).toEqual([]);
  const used = new Set(calls.map((call) => contractFor(call).id));
  // room_boost_temperature: the cards don't pick a boost temperature; the
  // contract checks set_boost's temperature unit for anyone who adds that.
  const unused = SERVICE_CALLS.map((c) => c.id).filter((id) => !used.has(id) && id !== 'room_boost_temperature');
  expect(unused).toEqual([]);
});
