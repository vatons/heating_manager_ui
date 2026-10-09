import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeatingRoomCard, OPTIMISTIC_TIMEOUT_MS } from '../heating-manager-ui.js';
import {
  $, $$, BATHROOM, FIXTURE_NOW, GLOBAL, HALL, KITCHEN, ROOM, STUDY, TRV, ZONE,
  button, captureEvents, click, flush, makeHass, mount, text, withRoomDuration, withState,
} from './helpers.js';

const TAG = 'heating-room-card';

beforeEach(() => {
  vi.useFakeTimers({ now: FIXTURE_NOW });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('config', () => {
  const card = () => document.createElement(TAG);

  it('needs a climate entity', () => {
    expect(() => card().setConfig({})).toThrow(/Choose a Heating Manager entity/);
    expect(() => card().setConfig({ entity: 'sensor.lounge_temp' })).toThrow(/not a climate entity/);
  });

  it('checks the boost duration', () => {
    expect(() => card().setConfig({ entity: ROOM, boost_duration: 'soon' })).toThrow(/boost_duration/);
    expect(() => card().setConfig({ entity: ROOM, boost_duration: 0 })).toThrow(/boost_duration/);
    expect(() => card().setConfig({ entity: ROOM, boost_duration: 45 })).not.toThrow();
  });

  it('suggests a real room when added from the card picker', () => {
    // The first room with a sensor (Hall has none, so can't be boosted)
    expect(HeatingRoomCard.getStubConfig(makeHass())).toEqual({ entity: KITCHEN });
    expect(HeatingRoomCard.getStubConfig({ states: {} })).toEqual({ entity: 'climate.heating_manager' });
  });

  it('has a visual editor and sizes for masonry and sections views', () => {
    expect(HeatingRoomCard.getConfigElement().tagName.toLowerCase()).toBe('heating-room-card-editor');
    const el = mount(TAG, { entity: ROOM }, makeHass());
    expect(el.getCardSize()).toBe(4);
    expect(el.getGridOptions()).toEqual({ columns: 6, min_columns: 4 });
  });

  it('is listed in the card picker', () => {
    expect(window.customCards.map((c) => c.type)).toEqual(expect.arrayContaining(['heating-room-card', 'heating-zone-card']));
    expect(window.customCards.filter((c) => c.type === TAG)).toHaveLength(1);
  });
});

describe('a room', () => {
  it('shows its temperature, target, status and analytics', () => {
    const el = mount(TAG, { entity: ROOM }, makeHass());
    expect(text($(el, '.name'))).toBe('Lounge');
    expect(text($(el, '.sub'))).toBe('Downstairs');
    expect(text($(el, '.current'))).toBe('18.0°C');
    expect(text($(el, '.target-value .value'))).toBe('20.0°C');
    expect(text($(el, '.chip'))).toBe('Heating');
    expect($(el, '.bar').classList.contains('heating')).toBe(true);
    expect(text($(el, '.status'))).toBe('Boost · 1:00:00 left to 20.0°C');
    const info = text($(el, '.info'));
    expect(info).toContain('17:00 → 21.0°C');
    expect(info).toContain('Warming');
    expect(info).toMatch(/Target in ~3h 19m \(15:19\)/);
  });

  it('counts the boost down every second without re-rendering', () => {
    const el = mount(TAG, { entity: ROOM }, makeHass());
    const status = $(el, '[data-countdown]');
    vi.advanceTimersByTime(1000);
    expect(text(status)).toBe('Boost · 59:59 left');
    vi.advanceTimersByTime(60_000);
    expect(text(status)).toBe('Boost · 58:59 left');
    expect($(el, '[data-countdown]')).toBe(status);
  });

  it('stops counting when removed from the page', () => {
    const el = mount(TAG, { entity: ROOM }, makeHass());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    el.remove();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("doesn't re-render for unrelated state changes", () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: ROOM }, hass);
    const card = $(el, 'ha-card');
    el.hass = withState(hass, 'sensor.kitchen_temp', { state: '12' });
    expect($(el, 'ha-card')).toBe(card);
    el.hass = withState(hass, ROOM, { attributes: { current_temperature: 18.5 } });
    expect($(el, 'ha-card')).not.toBe(card);
    expect(text($(el, '.current'))).toBe('18.5°C');
  });

  it('uses the custom name', () => {
    const el = mount(TAG, { entity: ROOM, name: 'Front room' }, makeHass());
    expect(text($(el, '.name'))).toBe('Front room');
  });

  it('escapes names', () => {
    const hass = withState(makeHass(), ROOM, { attributes: { friendly_name: '<img src=x onerror=alert(1)>' } });
    const el = mount(TAG, { entity: ROOM }, hass);
    expect($(el, 'img')).toBeNull();
    expect(text($(el, '.name'))).toBe('<img src=x onerror=alert(1)>');
  });

  it('hides controls and analytics when asked', () => {
    const el = mount(TAG, { entity: ROOM, show_controls: false, show_analytics: false, show_schedule: false }, makeHass());
    expect($(el, '.actions')).toBeNull();
    expect($(el, '[data-action="up"]')).toBeNull();
    expect($(el, '.info')).toBeNull();
    expect(text($(el, '.target-value'))).toBe('Target 20.0°C');
  });

  it('warns about sensors that stopped reporting', () => {
    let hass = makeHass();
    const sensors = hass.states[ROOM].attributes.sensors.map((s) => ({ ...s, status: 'timeout' }));
    hass = withState(hass, ROOM, { attributes: { sensors } });
    const el = mount(TAG, { entity: ROOM }, hass);
    expect(text($(el, '.info .warn'))).toBe('2 sensors not reporting');
  });

  it('in °F', () => {
    const el = mount(TAG, { entity: ROOM }, makeHass('v3.2.0-fahrenheit'));
    expect(text($(el, '.current'))).toBe('64°F');
    expect(text($(el, '.target-value .value'))).toBe('68°F');
    expect(text($(el, '.status'))).toBe('Boost · 30:00 left to 68°F');
    expect(text($(el, '.info'))).toContain('17:00 → 70°F');
  });
});

describe('boost', () => {
  it('boosts with the integration’s default length', async () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: KITCHEN }, hass);
    const boost = button(el, 'boost');
    expect(text(boost)).toBe('Boost');
    click(boost);
    expect(hass.callService).toHaveBeenCalledWith('heating_manager', 'set_boost', {}, { entity_id: KITCHEN }, false);
    // Shown at once, before the entity updates
    expect(button(el, 'boost').getAttribute('aria-pressed')).toBe('true');
    expect(text($(el, '.status'))).toBe('Boost · 30:00 left');
  });

  it('boosts for the configured length', () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: KITCHEN, boost_duration: 45 }, hass);
    click(button(el, 'boost'));
    expect(hass.callService).toHaveBeenCalledWith('heating_manager', 'set_boost', { duration: 45 }, { entity_id: KITCHEN }, false);
    expect(text($(el, '.status'))).toBe('Boost · 45:00 left');
  });

  it('cancels a boost', () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: ROOM }, hass);
    expect(text(button(el, 'boost'))).toBe('Cancel boost');
    click(button(el, 'boost'));
    expect(hass.callService).toHaveBeenCalledWith('heating_manager', 'clear_boost', {}, { entity_id: ROOM }, false);
    expect(button(el, 'boost').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps showing the boost while the integration catches up, then trusts the entity', async () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: KITCHEN }, hass);
    click(button(el, 'boost'));
    await flush();
    // The integration's refresh is debounced: an update can still show the old state
    el.hass = withState(hass, KITCHEN, { attributes: { current_temperature: 18.1 } });
    expect(button(el, 'boost').getAttribute('aria-pressed')).toBe('true');
    // The boost never showed up (e.g. cancelled elsewhere): back to the entity's state
    vi.advanceTimersByTime(OPTIMISTIC_TIMEOUT_MS + 100);
    expect(button(el, 'boost').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches to the real end time once the entity confirms', async () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: KITCHEN }, hass);
    click(button(el, 'boost'));
    await flush();
    vi.advanceTimersByTime(5000);
    el.hass = withState(hass, KITCHEN, {
      attributes: { boost: { temperature: 20, end_time: '2026-01-14T20:20:00+00:00', duration_minutes: 20, time_remaining_minutes: 20 } },
    });
    // 20:20 end, 5 s after the tap
    expect(text($(el, '.status'))).toBe('Boost · 19:55 left to 20.0°C');
    vi.advanceTimersByTime(OPTIMISTIC_TIMEOUT_MS);
    expect(button(el, 'boost').getAttribute('aria-pressed')).toBe('true');
  });

  it('says why a boost failed and undoes it', async () => {
    const hass = makeHass('v3.2.0-celsius', {
      callService: vi.fn(async () => { throw new Error('room temperature is unavailable'); }),
    });
    const el = mount(TAG, { entity: KITCHEN }, hass);
    const events = captureEvents(el, 'hass-notification');
    click(button(el, 'boost'));
    await flush();
    expect(events).toEqual([{ type: 'hass-notification', detail: { message: "Couldn't boost Kitchen: room temperature is unavailable" } }]);
    expect(button(el, 'boost').getAttribute('aria-pressed')).toBe('false');
    expect(button(el, 'boost').disabled).toBe(false);
  });

  it('is disabled for rooms without a temperature sensor', () => {
    const el = mount(TAG, { entity: HALL }, makeHass());
    expect(button(el, 'boost').disabled).toBe(true);
    expect(button(el, 'boost').title).toBe('Boost needs a temperature sensor in this room');
    expect(text($(el, '.info'))).toContain('Using TRV temperature');
  });

  it('shows an off room on again when boosted (as the integration does)', () => {
    const el = mount(TAG, { entity: STUDY }, makeHass());
    expect(text($(el, '.chip'))).toBe('Off');
    click(button(el, 'boost'));
    expect(text($(el, '.chip'))).not.toBe('Off');
  });

  it("starts the countdown from the room's own boost duration", () => {
    const hass = withRoomDuration(makeHass(), KITCHEN, 45);
    const el = mount(TAG, { entity: KITCHEN }, hass);
    expect(button(el, 'boost').title).toBe('Boost for 45 min');
    click(button(el, 'boost'));
    // The integration applies the room's duration itself, so none is sent
    expect(hass.callService).toHaveBeenCalledWith('heating_manager', 'set_boost', {}, { entity_id: KITCHEN }, false);
    expect(text($(el, '.status'))).toBe('Boost · 45:00 left');
  });

  it("the card's boost_duration wins over the room's", () => {
    const hass = withRoomDuration(makeHass(), KITCHEN, 45);
    const el = mount(TAG, { entity: KITCHEN, boost_duration: 20 }, hass);
    click(button(el, 'boost'));
    expect(hass.callService).toHaveBeenCalledWith('heating_manager', 'set_boost', { duration: 20 }, { entity_id: KITCHEN }, false);
    expect(text($(el, '.status'))).toBe('Boost · 20:00 left');
  });
});

describe('everything else is in the more-info dialog', () => {
  it('Boost is the only control', () => {
    for (const entity of [ROOM, KITCHEN, STUDY, ZONE, GLOBAL]) {
      const el = mount(TAG, { entity }, makeHass());
      expect($$(el, '[data-action]').map((b) => b.dataset.action)).toEqual(['boost']);
    }
  });

  it('shows the target as a read-out', () => {
    const el = mount(TAG, { entity: KITCHEN }, makeHass());
    expect(text($(el, '.target-value'))).toBe('Target 19.5°C');
    expect($(el, '.target button')).toBeNull();
  });

  it('says a manual temperature is set, without a button to clear it', () => {
    const el = mount(TAG, { entity: KITCHEN }, makeHass());
    expect(text($(el, '.status'))).toBe('Manual until 17:00');
    expect(button(el, 'schedule')).toBeNull();
  });

  it('says where the rest is, and opens it on tap', () => {
    const el = mount(TAG, { entity: KITCHEN }, makeHass());
    expect(text($(el, '.hint'))).toBe('Tap for more controls');
    const events = captureEvents(el, 'hass-action');
    click($(el, '.title'));
    expect(events[0].detail).toMatchObject({ action: 'tap', config: { tap_action: { action: 'more-info' } } });
    expect(text($(mount(TAG, { entity: ZONE }, makeHass()), '.hint'))).toBe('Tap for more controls');
    expect(text($(mount(TAG, { entity: GLOBAL }, makeHass()), '.hint'))).toBe('Tap for away mode & more');
  });

  it('has no hint when a tap does something else', () => {
    const el = mount(TAG, { entity: KITCHEN, tap_action: { action: 'navigate', navigation_path: '/x' } }, makeHass());
    expect($(el, '.hint')).toBeNull();
  });
});

describe('away mode', () => {
  it('shows frost protection and holds the room controls', () => {
    const el = mount(TAG, { entity: ROOM }, makeHass('v3.2.0-away'));
    expect(text($(el, '.status'))).toBe('Away · frost protection');
    expect(button(el, 'boost').disabled).toBe(true);
  });
});

describe('away mode with a boost still running', () => {
  const awayBoosted = () => withState(makeHass('v3.2.0-away'), ROOM, {
    attributes: { boost: { temperature: 21, end_time: '2026-01-14T20:30:00+00:00', duration_minutes: 30, time_remaining_minutes: 30 } },
  });

  it('shows away (the integration targets frost protection) but lets you cancel the boost', () => {
    const hass = awayBoosted();
    const el = mount(TAG, { entity: ROOM }, hass);
    expect(text($(el, '.status'))).toBe('Away · frost protection');
    expect($(el, '[data-countdown]')).toBeNull();
    expect(text(button(el, 'boost'))).toBe('Cancel boost');
    expect(button(el, 'boost').disabled).toBe(false);
    click(button(el, 'boost'));
    expect(hass.callService).toHaveBeenCalledWith('heating_manager', 'clear_boost', {}, { entity_id: ROOM }, false);
  });
});

describe('a zone or the whole house', () => {
  it('shows a zone with boost for all its rooms', () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: ZONE }, hass);
    expect(text($(el, '.name'))).toBe('Downstairs');
    expect(text($(el, '.sub'))).toBe('2 rooms need heat');
    expect(text($(el, '.status'))).toBe('Schedule until 17:00 · 1 room boosted');
    click(button(el, 'boost'));
    expect(hass.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', { preset_mode: 'schedule' }, { entity_id: ZONE }, false);
  });

  it('shows a monitoring-only zone', () => {
    const el = mount(TAG, { entity: 'climate.upstairs' }, makeHass());
    expect(text($(el, '.chip'))).toBe('Monitoring');
    expect(text($(el, '.sub'))).toBe('Monitoring only');
  });

  it('boosts every room from the whole-house card; away mode is in its dialog', async () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: GLOBAL }, hass);
    expect(text($(el, '.sub'))).toBe('2 zones · 1 heating');
    expect(button(el, 'away')).toBeNull();
    expect(text(button(el, 'boost'))).toBe('Cancel boosts');
    click(button(el, 'boost'));
    expect(hass.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', { preset_mode: 'schedule' }, { entity_id: GLOBAL }, false);
    await flush();
    click(button(el, 'boost'));
    expect(hass.callService).toHaveBeenLastCalledWith('climate', 'set_preset_mode', { preset_mode: 'boost' }, { entity_id: GLOBAL }, false);
  });
});

describe('tap and hold', () => {
  it('opens more info on tap by default', () => {
    const el = mount(TAG, { entity: ROOM }, makeHass());
    const events = captureEvents(el, 'hass-action');
    click($(el, '.title'));
    expect(events).toEqual([{
      type: 'hass-action',
      detail: { action: 'tap', config: { entity: ROOM, tap_action: { action: 'more-info' }, hold_action: { action: 'none' } } },
    }]);
  });

  it('runs the configured actions', () => {
    const tap = { action: 'navigate', navigation_path: '/lovelace/heating' };
    const hold = { action: 'more-info' };
    const el = mount(TAG, { entity: ROOM, tap_action: tap, hold_action: hold }, makeHass());
    const events = captureEvents(el, 'hass-action');
    $(el, '.current').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    vi.advanceTimersByTime(600);
    $(el, '.current').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    click($(el, '.current'));
    expect(events.map((e) => e.detail.action)).toEqual(['hold']);
    click($(el, '.current'));
    expect(events.map((e) => e.detail.action)).toEqual(['hold', 'tap']);
    expect(events[1].detail.config.tap_action).toEqual(tap);
  });

  it('does nothing for action none', () => {
    const el = mount(TAG, { entity: ROOM, tap_action: { action: 'none' } }, makeHass());
    const events = captureEvents(el, 'hass-action');
    click($(el, '.title'));
    expect(events).toEqual([]);
  });

  it("buttons don't trigger the card's tap or hold", () => {
    const el = mount(TAG, { entity: KITCHEN }, makeHass());
    const events = captureEvents(el, 'hass-action');
    button(el, 'boost').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    vi.advanceTimersByTime(600);
    click(button(el, 'boost'));
    expect(events).toEqual([]);
  });

  it('works from the keyboard', () => {
    const el = mount(TAG, { entity: ROOM }, makeHass());
    const events = captureEvents(el, 'hass-action');
    expect($(el, '.title').getAttribute('tabindex')).toBe('0');
    $(el, '.title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    expect(events.map((e) => e.detail.action)).toEqual(['tap']);
  });
});

describe('problems', () => {
  it('a missing entity', () => {
    const el = mount(TAG, { entity: 'climate.gone' }, makeHass());
    expect(text($(el, '.warning'))).toContain('Entity not found: climate.gone');
  });

  it('an entity from another integration', () => {
    const el = mount(TAG, { entity: TRV }, makeHass());
    expect(text($(el, '.warning'))).toContain("climate.lounge_trv isn't a Heating Manager entity");
  });

  it('an unavailable room', () => {
    const hass = withState(makeHass(), ROOM, { state: 'unavailable' });
    hass.states[ROOM].attributes = { friendly_name: 'Downstairs Lounge' };
    const el = mount(TAG, { entity: ROOM }, hass);
    expect(text($(el, '.warning'))).toContain('climate.downstairs_lounge is unavailable');
  });

  it('a room before the integration’s first update', () => {
    const hass = makeHass();
    hass.states[ROOM] = { ...hass.states[ROOM], attributes: { friendly_name: 'Downstairs Lounge' } };
    const el = mount(TAG, { entity: ROOM }, hass);
    expect(text($(el, '.warning'))).toContain('Waiting for Heating Manager');
  });

  it('recovers when the entity comes back', () => {
    const hass = makeHass();
    const gone = { ...hass, states: { ...hass.states } };
    delete gone.states[BATHROOM];
    const el = mount(TAG, { entity: BATHROOM }, gone);
    expect($(el, '.warning')).not.toBeNull();
    el.hass = hass;
    expect($(el, '.warning')).toBeNull();
    expect(text($(el, '.name'))).toBe('Bathroom');
  });

  it('every action button is a real button', () => {
    const el = mount(TAG, { entity: KITCHEN }, makeHass());
    for (const node of $$(el, '[data-action]')) expect(node.tagName).toBe('BUTTON');
  });
});
