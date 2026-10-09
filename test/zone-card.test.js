import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeatingZoneCard } from '../heating-manager-ui.js';
import {
  $, $$, FIXTURE_NOW, HALL, KITCHEN, ROOM, STUDY, UPSTAIRS, ZONE,
  button, captureEvents, click, flush, makeHass, mount, text, withState,
} from './helpers.js';

const TAG = 'heating-zone-card';

beforeEach(() => {
  vi.useFakeTimers({ now: FIXTURE_NOW });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const rows = (el) => $$(el, '.row').map((row) => ({
  entity: row.dataset.tap,
  name: text(row.querySelector('.rname')),
  status: text(row.querySelector('.rstatus')),
  temps: text(row.querySelector('.temps')),
}));

describe('zone card', () => {
  it('finds every room in the zone', () => {
    const el = mount(TAG, { entity: ZONE }, makeHass());
    expect(rows(el)).toEqual([
      { entity: HALL, name: 'Hall', status: 'Idle', temps: '18.5°C → 18.0°C' },
      { entity: KITCHEN, name: 'Kitchen', status: 'Heating · manual', temps: '18.2°C → 19.5°C' },
      { entity: ROOM, name: 'Lounge', status: 'Boost · 1:00:00 left', temps: '18.0°C → 20.0°C' },
      { entity: STUDY, name: 'Study', status: 'Off', temps: '16.1°C off' },
    ]);
  });

  it('shows the zone, its schedule and heating demand', () => {
    const el = mount(TAG, { entity: ZONE }, makeHass());
    expect(text($(el, '.name'))).toBe('Downstairs 17.7°C');
    expect(text($(el, '.title .sub:not([style])'))).toBe(
      '2 rooms need heat · Now 18.0°C until 17:00 · Next 21.0°C at 17:00',
    );
    expect(text($(el, '.chip'))).toBe('Heating');
  });

  it('shows the chosen rooms in the chosen order', () => {
    const el = mount(TAG, { entity: ZONE, rooms: [STUDY, ROOM] }, makeHass());
    expect(rows(el).map((r) => r.name)).toEqual(['Study', 'Lounge']);
  });

  it('picks up new rooms without being edited', () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: ZONE }, hass);
    const conservatory = {
      ...hass.states[HALL],
      entity_id: 'climate.downstairs_conservatory',
      attributes: { ...hass.states[HALL].attributes, room_id: 'conservatory', friendly_name: 'Downstairs Conservatory' },
    };
    el.hass = {
      ...hass,
      states: { ...hass.states, [conservatory.entity_id]: conservatory },
      entities: { ...hass.entities, [conservatory.entity_id]: { entity_id: conservatory.entity_id, platform: 'heating_manager' } },
    };
    expect(rows(el).map((r) => r.name)).toEqual(['Conservatory', 'Hall', 'Kitchen', 'Lounge', 'Study']);
  });

  it('rooms have no buttons: a tap opens their details', () => {
    const el = mount(TAG, { entity: ZONE }, makeHass());
    expect($$(el, '.row button')).toEqual([]);
    expect($$(el, '[data-action]').map((b) => b.dataset.action)).toEqual(['boost']);
    expect(text($(el, '.hint'))).toBe('Tap a room, or the zone, for its target, heat/off and schedule');
  });

  it('shows an off room as off, even if its boost hasn’t ended (Heating Manager before 3.4)', () => {
    const hass = withState(makeHass(), STUDY, {
      attributes: { boost: { temperature: 21, end_time: '2026-01-14T20:30:00+00:00', duration_minutes: 30, time_remaining_minutes: 30 } },
    });
    const el = mount(TAG, { entity: ZONE }, hass);
    expect(rows(el)[3]).toMatchObject({ name: 'Study', status: 'Off' });
  });

  it('opens a room’s details from its row', () => {
    const el = mount(TAG, { entity: ZONE }, makeHass());
    const events = captureEvents(el, 'hass-more-info', 'hass-action');
    click($$(el, '.row')[2].querySelector('.rname'));
    expect(events).toEqual([{ type: 'hass-more-info', detail: { entityId: ROOM } }]);
    click($(el, '.title'));
    expect(events[1]).toMatchObject({ type: 'hass-action', detail: { action: 'tap', config: { entity: ZONE } } });
  });

  it('boosts or resets the whole zone', () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: ZONE }, hass);
    expect(text(button(el, 'boost'))).toBe('Cancel boosts');
    click(button(el, 'boost'));
    expect(hass.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', { preset_mode: 'schedule' }, { entity_id: ZONE }, false);
    expect(text(button(el, 'boost'))).toBe('Boost all');
  });

  it('hides Boost all when asked', () => {
    const bare = mount(TAG, { entity: ZONE, show_controls: false }, makeHass());
    expect($(bare, 'button')).toBeNull();
  });

  it('shows a monitoring-only zone', () => {
    const el = mount(TAG, { entity: UPSTAIRS }, makeHass());
    expect(text($(el, '.chip'))).toBe('Monitoring');
    expect(rows(el).map((r) => r.name)).toEqual(['Bathroom']);
  });

  it('in away mode', () => {
    const el = mount(TAG, { entity: ZONE }, makeHass('v3.2.0-away'));
    expect(text($(el, '.title .sub:not([style])'))).toContain('Away · frost protection');
    expect(button(el, 'boost')).toBeNull();
  });

  it('in away mode with a boost still running', () => {
    let hass = withState(makeHass('v3.2.0-away'), ROOM, {
      attributes: { boost: { temperature: 21, end_time: '2026-01-14T20:30:00+00:00', duration_minutes: 30, time_remaining_minutes: 30 } },
    });
    hass = withState(hass, ZONE, { attributes: { boost: { active: true, room_ids: ['lounge'] } } });
    const el = mount(TAG, { entity: ZONE }, hass);
    expect(rows(el)[2].status).toBe('Away');
    expect(text(button(el, 'boost'))).toBe('Cancel boosts');
  });

  it('in °F', () => {
    const el = mount(TAG, { entity: ZONE }, makeHass('v3.2.0-fahrenheit'));
    expect(text($(el, '.title .sub:not([style])'))).toContain('Now 64°F until 17:00 · Next 70°F at 17:00');
    expect(rows(el)[2].temps).toBe('64°F → 68°F');
  });

  it('a zone with a manual temperature', () => {
    const hass = withState(makeHass(), ZONE, {
      attributes: { manual_override: { active: true, temperature: 21 }, boost: { active: false, room_ids: [] } },
    });
    const el = mount(TAG, { entity: ZONE }, hass);
    expect(text($(el, '.title .sub:not([style])'))).toContain('Manual 21.0°C');
    // Cleared from the zone's dialog (Preset: Schedule)
    expect(button(el, 'schedule')).toBeNull();
  });

  it('needs a zone', () => {
    const el = mount(TAG, { entity: ROOM }, makeHass());
    expect(text($(el, '.warning'))).toContain('climate.downstairs_lounge is a room');
    expect(HeatingZoneCard.getStubConfig(makeHass())).toEqual({ entity: ZONE });
  });

  it('says how to add rooms to an empty zone', () => {
    const hass = makeHass();
    const states = Object.fromEntries(Object.entries(hass.states).filter(([, s]) => s.attributes.zone_id !== 'upstairs' || !s.attributes.room_id));
    const el = mount(TAG, { entity: UPSTAIRS }, { ...hass, states });
    expect(text($(el, '.empty'))).toContain('No rooms in this zone yet');
  });

  it('sizes itself by its rooms', () => {
    const el = mount(TAG, { entity: ZONE }, makeHass());
    expect(el.getCardSize()).toBe(7);
    expect(el.getGridOptions()).toEqual({ columns: 12, min_columns: 6 });
  });
});
