import { describe as suite, expect, it } from 'vitest';
import {
  boostSecondsLeft,
  describe,
  entityKind,
  escapeHtml,
  findEntities,
  formatCountdown,
  formatDuration,
  formatTemp,
  fromCelsius,
  heatingChip,
  isHeatingManagerEntity,
  roomName,
  roomsOfZone,
  statusLine,
  tempStep,
  trendInfo,
} from '../heating-manager-ui.js';
import {
  BATHROOM, FIXTURE_NOW, GLOBAL, HALL, KITCHEN, ROOM, STUDY, TRV, UPSTAIRS, ZONE,
  loadFixture, makeHass, withState,
} from './helpers.js';

const now = FIXTURE_NOW.getTime();

suite('fixtures', () => {
  it.each(['v3.2.0-celsius', 'v3.2.0-fahrenheit', 'v3.2.0-away'])('%s was recorded from Heating Manager 3.2.0 on HA 2026.10', (name) => {
    const data = loadFixture(name);
    expect(data.heating_manager).toBe('3.2.0');
    expect(data.homeassistant).toMatch(/^2026\.10\./);
  });
});

suite('entityKind', () => {
  const hass = makeHass();

  it('tells rooms, zones and the global entity apart by their attributes', () => {
    expect(entityKind(hass.states[ROOM])).toBe('room');
    expect(entityKind(hass.states[BATHROOM])).toBe('room');
    expect(entityKind(hass.states[ZONE])).toBe('zone');
    expect(entityKind(hass.states[UPSTAIRS])).toBe('zone');
    expect(entityKind(hass.states[GLOBAL])).toBe('global');
  });

  it("doesn't depend on entity ids (3.x ids are named after zones and rooms)", () => {
    const renamed = { ...hass.states[ZONE], entity_id: 'climate.ground_floor_zone_room' };
    expect(entityKind(renamed)).toBe('zone');
  });

  it('ignores other entities', () => {
    expect(entityKind(hass.states[TRV])).toBeNull();
    expect(entityKind(hass.states['sensor.lounge_temp'])).toBeNull();
    expect(entityKind(undefined)).toBeNull();
    expect(entityKind({ entity_id: 'climate.x', state: 'unavailable', attributes: {} })).toBeNull();
  });

  it('checks the entity registry for the integration', () => {
    expect(isHeatingManagerEntity(hass, ROOM)).toBe(true);
    expect(isHeatingManagerEntity(hass, TRV)).toBe(false);
    const noRegistry = { ...hass, entities: undefined };
    expect(isHeatingManagerEntity(noRegistry, ROOM)).toBe(true);
    expect(isHeatingManagerEntity(noRegistry, TRV)).toBe(false);
  });
});

suite('finding rooms', () => {
  const hass = makeHass();

  it("lists a zone's rooms by name", () => {
    expect(roomsOfZone(hass, 'downstairs').map((s) => s.entity_id)).toEqual([
      'climate.downstairs_hall', KITCHEN, ROOM, STUDY,
    ]);
    expect(roomsOfZone(hass, 'upstairs').map((s) => s.entity_id)).toEqual([BATHROOM]);
  });

  it('keeps only the chosen rooms, in the chosen order', () => {
    expect(roomsOfZone(hass, 'downstairs', [STUDY, ROOM, 'climate.gone']).map((s) => s.entity_id))
      .toEqual([STUDY, ROOM]);
  });

  it('finds every zone and the global entity', () => {
    expect(findEntities(hass, 'zone').map((s) => s.entity_id)).toEqual([ZONE, UPSTAIRS]);
    expect(findEntities(hass, 'global').map((s) => s.entity_id)).toEqual([GLOBAL]);
  });

  it('shows room names without their zone', () => {
    expect(roomName(hass.states[ROOM])).toBe('Lounge');
    expect(roomName(hass.states[BATHROOM])).toBe('Bathroom');
    const custom = withState(hass, ROOM, { attributes: { friendly_name: 'Front room' } });
    expect(roomName(custom.states[ROOM])).toBe('Front room');
  });
});

suite('formatting', () => {
  it('converts the integration’s °C attributes for °F homes', () => {
    expect(fromCelsius(20, '°F')).toBe(68);
    expect(fromCelsius(20, '°C')).toBe(20);
    expect(fromCelsius(null, '°F')).toBeNull();
  });

  it('shows °C to a tenth and °F in whole degrees', () => {
    expect(formatTemp(19.25, '°C')).toBe('19.3');
    expect(formatTemp(64.4, '°F', { withUnit: true })).toBe('64°F');
    expect(formatTemp(null, '°C')).toBe('--');
  });

  it('steps targets by 0.5 °C or 1 °F, or the entity’s own step', () => {
    expect(tempStep({ attributes: {} }, '°C')).toBe(0.5);
    expect(tempStep({ attributes: {} }, '°F')).toBe(1);
    expect(tempStep({ attributes: { target_temp_step: 0.1 } }, '°C')).toBe(0.1);
  });

  it('formats durations and countdowns', () => {
    expect(formatDuration(0.4)).toBe('< 1 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(199)).toBe('3h 19m');
    expect(formatCountdown(59)).toBe('00:59');
    expect(formatCountdown(3599)).toBe('59:59');
    expect(formatCountdown(3600)).toBe('1:00:00');
    expect(formatCountdown(-5)).toBe('00:00');
  });

  it('knows every trend the integration reports', () => {
    for (const trend of ['heating_rapidly', 'heating_slowly', 'stable', 'cooling_slowly', 'cooling_rapidly']) {
      expect(trendInfo(trend)).toMatchObject({ label: expect.any(String), icon: expect.stringMatching(/^mdi:/) });
    }
    expect(trendInfo('insufficient_data')).toBeNull();
    expect(trendInfo(undefined)).toBeNull();
  });

  it('escapes HTML', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">&\'')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
  });

  it('counts down to the boost end time', () => {
    expect(boostSecondsLeft({ end_time: '2026-01-14T21:00:00+00:00' }, now)).toBe(3600);
    expect(boostSecondsLeft({ end_time: '2026-01-14T19:00:00+00:00' }, now)).toBe(0);
    expect(boostSecondsLeft({ end_time: null }, now)).toBeNull();
  });
});

suite('describe', () => {
  it('a boosted room', () => {
    const hass = makeHass();
    const view = describe(hass, hass.states[ROOM], now);
    expect(view).toMatchObject({
      kind: 'room', name: 'Lounge', zoneName: 'Downstairs', unit: '°C',
      current: 18, target: 20, heating: true, off: false, away: false, canBoost: true,
      monitoringOnly: false, sensorsStale: 0,
      boost: { active: true, secondsLeft: 3600, temperature: 20 },
      schedule: { current: { start: '09:00', end: '17:00', temperature: 18 }, next: { start: '17:00', temperature: 21 } },
      trend: { label: 'Warming' },
      eta: { minutes: 199, confidence: 52 },
    });
    expect(statusLine(view)).toBe('Boost · 1:00:00 left');
    expect(heatingChip(view)).toMatchObject({ label: 'Heating', level: 'heating' });
  });

  it('a room switched off', () => {
    const hass = makeHass();
    const view = describe(hass, hass.states[STUDY], now);
    expect(view).toMatchObject({ off: true, heating: false, boost: { active: false } });
    expect(statusLine(view)).toBe('Off');
    expect(heatingChip(view).label).toBe('Off');
  });

  it('a room with a manual temperature', () => {
    const hass = makeHass();
    const view = describe(hass, hass.states[KITCHEN], now);
    expect(view.override).toEqual({ active: true, temperature: 19.5 });
    expect(statusLine(view)).toBe('Manual until 17:00');
  });

  it('a room without sensors cannot be boosted', () => {
    const hass = makeHass();
    const view = describe(hass, hass.states[HALL], now);
    expect(view).toMatchObject({ canBoost: false, sensorsMissing: true });
    expect(statusLine(view)).toBe('Schedule until 17:00');
  });

  it('a room with a sensor that stopped reporting', () => {
    let hass = makeHass();
    const sensors = hass.states[ROOM].attributes.sensors.map((s, i) => (i ? { ...s, status: 'timeout' } : s));
    hass = withState(hass, ROOM, { attributes: { sensors } });
    expect(describe(hass, hass.states[ROOM], now).sensorsStale).toBe(1);
  });

  it('a room in a monitoring-only zone', () => {
    const hass = makeHass();
    const view = describe(hass, hass.states[BATHROOM], now);
    expect(view.monitoringOnly).toBe(true);
    expect(heatingChip(view).label).toBe('Monitoring');
  });

  it('a zone', () => {
    const hass = makeHass();
    const view = describe(hass, hass.states[ZONE], now);
    expect(view).toMatchObject({
      kind: 'zone', name: 'Downstairs', heating: true, canBoost: true,
      boost: { active: true, rooms: ['lounge'] },
      stats: { roomsNeedingHeat: 2, requested: true, mode: 'any_room' },
    });
    expect(statusLine(view)).toBe('Schedule until 17:00 · 1 room boosted');
  });

  it('a zone held by the boiler protection times', () => {
    let hass = makeHass();
    hass = withState(hass, ZONE, { attributes: { demand_hold: 'min_off', heating_demand: false, hvac_action: 'idle' } });
    expect(heatingChip(describe(hass, hass.states[ZONE], now)).label).toBe('Waiting (min off)');
    hass = withState(hass, ZONE, { attributes: { demand_hold: 'min_on', heating_demand_requested: false, hvac_action: 'heating' } });
    expect(heatingChip(describe(hass, hass.states[ZONE], now)).label).toBe('Heating (min on)');
  });

  it('the whole house', () => {
    const hass = makeHass();
    const view = describe(hass, hass.states[GLOBAL], now);
    expect(view).toMatchObject({ kind: 'global', stats: { zones: 2, zonesHeating: 1, roomsNeedingHeat: 2 } });
  });

  it('in away mode', () => {
    const hass = makeHass('v3.2.0-away');
    for (const id of [ROOM, ZONE, GLOBAL]) {
      const view = describe(hass, hass.states[id], now);
      expect(view.away).toBe(true);
      expect(statusLine(view)).toBe('Away · frost protection');
    }
  });

  it('in °F: Home Assistant converts the entity, the card converts the integration’s attributes', () => {
    const hass = makeHass('v3.2.0-fahrenheit');
    const room = describe(hass, hass.states[ROOM], now);
    expect(room).toMatchObject({ unit: '°F', current: 64, target: 68, min: 41, max: 86, step: 1 });
    expect(room.boost.temperature).toBe(68);
    expect(room.schedule.current.temperature).toBeCloseTo(64.4);
    expect(room.schedule.next.temperature).toBeCloseTo(69.8);
  });

  it('unavailable', () => {
    const hass = makeHass();
    const view = describe(hass, { entity_id: ROOM, state: 'unavailable', attributes: {} }, now);
    expect(statusLine(view)).toBe('Unavailable');
  });
});
