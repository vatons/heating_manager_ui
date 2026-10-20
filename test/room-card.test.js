import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeatingRoomCard, OPTIMISTIC_TIMEOUT_MS } from '../heating-manager-ui.js';
import {
  $, $$, BATHROOM, FIXTURE_NOW, GLOBAL, HALL, KITCHEN, ROOM, STUDY, TRV, ZONE,
  button, captureEvents, click, flush, makeHass, mount, text, withRoomDuration, withSkip, withState,
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
    expect(text(boost)).toBe('Boost for 30 min');
    click(boost);
    expect(hass.callService).toHaveBeenCalledWith('heating_manager', 'set_boost', {}, { entity_id: KITCHEN }, false);
    // Shown at once, before the entity updates
    expect(button(el, 'boost').getAttribute('aria-checked')).toBe('true');
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
    expect(button(el, 'boost').getAttribute('aria-checked')).toBe('false');
  });

  it('keeps showing the boost while the integration catches up, then trusts the entity', async () => {
    const hass = makeHass();
    const el = mount(TAG, { entity: KITCHEN }, hass);
    click(button(el, 'boost'));
    await flush();
    // The integration's refresh is debounced: an update can still show the old state
    el.hass = withState(hass, KITCHEN, { attributes: { current_temperature: 18.1 } });
    expect(button(el, 'boost').getAttribute('aria-checked')).toBe('true');
    // The boost never showed up (e.g. cancelled elsewhere): back to the entity's state
    vi.advanceTimersByTime(OPTIMISTIC_TIMEOUT_MS + 100);
    expect(button(el, 'boost').getAttribute('aria-checked')).toBe('false');
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
    expect(button(el, 'boost').getAttribute('aria-checked')).toBe('true');
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
    expect(button(el, 'boost').getAttribute('aria-checked')).toBe('false');
    expect(button(el, 'boost').disabled).toBe(false);
  });

  it('is disabled for rooms without a temperature sensor', () => {
    const el = mount(TAG, { entity: HALL }, makeHass());
    expect(button(el, 'boost').disabled).toBe(true);
    // Says why, under the menu item
    expect(text($(el, '[data-action="boost"] .why'))).toBe('Needs a temperature sensor in this room');
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
    expect(text(button(el, 'boost'))).toBe('Boost for 45 min');
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

  it('says a room is skipped, without the change it skipped to', () => {
    const hass = withState(makeHass(), KITCHEN, {
      attributes: { preset_mode: 'skip_to_next', manual_override: { active: true, temperature: 21, skipped: true, from_zone: true } },
    });
    const el = mount(TAG, { entity: KITCHEN }, hass);
    expect(text($(el, '.status'))).toBe('Skipped · 21.0°C until 22:30');
    expect(text($(el, '.info') || { textContent: '' })).not.toContain('→');
  });

  describe('the ⋮ menu', () => {
    const menu = (el) => $(el, '.menu');
    const menuButton = (el) => $(el, '[data-menu]');
    const key = (el, k) => el.shadowRoot.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));

    it('is closed until ⋮ is pressed, then lists Boost and Skip', () => {
      const el = mount(TAG, { entity: KITCHEN }, withSkip(makeHass()));
      expect(menu(el).hidden).toBe(true);
      expect(menuButton(el).getAttribute('aria-expanded')).toBe('false');
      click(menuButton(el));
      expect(menu(el).hidden).toBe(false);
      expect(menuButton(el).getAttribute('aria-expanded')).toBe('true');
      expect($$(el, '.menu [role="menuitemcheckbox"]').map((b) => b.dataset.action)).toEqual(['boost', 'skip']);
      // The first item has focus, for the keyboard
      expect(el.shadowRoot.activeElement?.dataset.action).toBe('boost');
    });

    it('closes when an item is chosen, and does it', () => {
      const hass = withSkip(makeHass());
      const el = mount(TAG, { entity: KITCHEN }, hass);
      click(menuButton(el));
      click(button(el, 'skip'));
      expect(menu(el).hidden).toBe(true);
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', { preset_mode: 'skip_to_next' },
        { entity_id: KITCHEN }, false);
    });

    it('stays open when a disabled item is pressed', () => {
      const el = mount(TAG, { entity: HALL }, withSkip(makeHass()));
      click(menuButton(el));
      click(button(el, 'boost'));
      expect(menu(el).hidden).toBe(false);
    });

    it('closes on Escape, back to ⋮, and the arrows move between items', () => {
      const el = mount(TAG, { entity: KITCHEN }, withSkip(makeHass()));
      click(menuButton(el));
      key(el, 'ArrowDown');
      expect(el.shadowRoot.activeElement?.dataset.action).toBe('skip');
      key(el, 'ArrowDown');
      expect(el.shadowRoot.activeElement?.dataset.action).toBe('boost');
      key(el, 'ArrowUp');
      expect(el.shadowRoot.activeElement?.dataset.action).toBe('skip');
      key(el, 'Escape');
      expect(menu(el).hidden).toBe(true);
      expect(el.shadowRoot.activeElement).toBe(menuButton(el));
    });

    it('closes on a tap outside the card, not inside it', () => {
      const el = mount(TAG, { entity: KITCHEN }, withSkip(makeHass()));
      click(menuButton(el));
      $(el, '.menu').dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      expect(menu(el).hidden).toBe(false);
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(menu(el).hidden).toBe(true);
    });

    it('⋮ is coloured while a boost or skip is on', () => {
      expect(menuButton(mount(TAG, { entity: ROOM }, makeHass())).classList.contains('on')).toBe(true);
      expect(menuButton(mount(TAG, { entity: HALL }, makeHass())).classList.contains('on')).toBe(false);
    });

    it('isn\u2019t there with show_controls: false', () => {
      expect(menuButton(mount(TAG, { entity: KITCHEN, show_controls: false }, withSkip(makeHass())))).toBeNull();
    });
  });

  describe('Skip (Heating Manager 3.12+)', () => {
    it('isn\u2019t there before Heating Manager 3.12', () => {
      expect(button(mount(TAG, { entity: KITCHEN }, makeHass()), 'skip')).toBeNull();
    });

    it('skips to the next scheduled temperature, showing it straight away', async () => {
      const hass = withSkip(makeHass());
      const el = mount(TAG, { entity: KITCHEN }, hass);
      const skip = button(el, 'skip');
      expect(text(skip)).toBe('Skip to next');
      expect(skip.getAttribute('title')).toBe('To 21.0°C now, the next scheduled temperature');
      click(skip);
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', { preset_mode: 'skip_to_next' },
        { entity_id: KITCHEN }, false);
      await flush();
      expect(text($(el, '.status'))).toBe('Skipped · 21.0°C until 22:30');
      expect(text(button(el, 'skip'))).toBe('Cancel skip');
      expect(button(el, 'skip').getAttribute('aria-checked')).toBe('true');
    });

    it('while skipped, goes back to the schedule', () => {
      const hass = withState(withSkip(makeHass()), KITCHEN, {
        attributes: { preset_mode: 'skip_to_next', manual_override: { active: true, temperature: 21, skipped: true, until: '22:30' } },
      });
      const el = mount(TAG, { entity: KITCHEN }, hass);
      expect(button(el, 'skip').getAttribute('title')).toBe('Back to the schedule');
      click(button(el, 'skip'));
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', { preset_mode: 'schedule' },
        { entity_id: KITCHEN }, false);
    });

    it('a skip ends the boost on the card too', async () => {
      const el = mount(TAG, { entity: ROOM }, withSkip(makeHass()));
      expect(button(el, 'boost').getAttribute('aria-checked')).toBe('true');
      click(button(el, 'skip'));
      await flush();
      expect(button(el, 'boost').getAttribute('aria-checked')).toBe('false');
      expect(text($(el, '.status'))).toMatch(/^Skipped/);
    });

    it('goes back if Home Assistant rejects it', async () => {
      const hass = withSkip(makeHass());
      hass.callService.mockRejectedValueOnce(new Error('No schedule change to skip to'));
      const el = mount(TAG, { entity: KITCHEN }, hass);
      const errors = captureEvents(el, 'hass-notification');
      click(button(el, 'skip'));
      await flush();
      await flush();
      expect(text($(el, '.status'))).toBe('Manual until 17:00');
      expect(errors[0].detail.message).toContain('No schedule change to skip to');
    });

    it('is disabled when off, in away mode, or with nothing to skip to', () => {
      const hass = withSkip(makeHass());
      expect(button(mount(TAG, { entity: STUDY }, hass), 'skip').disabled).toBe(true);
      const away = withSkip(makeHass('v3.2.0-away'));
      expect(button(mount(TAG, { entity: KITCHEN }, away), 'skip').disabled).toBe(true);
      const zone = hass.states[ZONE].attributes.schedule;
      const flat = withState(hass, ZONE, { attributes: { schedule: { ...zone, next_period: null } } });
      const el = mount(TAG, { entity: KITCHEN }, flat);
      expect(button(el, 'skip').disabled).toBe(true);
      expect(button(el, 'skip').getAttribute('title')).toBe('No schedule change to skip to');
    });

    it('hides with the Boost button', () => {
      expect(button(mount(TAG, { entity: KITCHEN, show_controls: false }, withSkip(makeHass())), 'skip')).toBeNull();
    });

    it('on the whole house skips every zone', () => {
      const hass = withSkip(makeHass());
      const el = mount(TAG, { entity: GLOBAL }, hass);
      expect(button(el, 'skip').getAttribute('title')).toBe('Every zone to its next scheduled temperature now');
      click(button(el, 'skip'));
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', { preset_mode: 'skip_to_next' },
        { entity_id: GLOBAL }, false);
    });
  });

  it('a skipped room in °F', () => {
    const hass = withState(makeHass('v3.2.0-fahrenheit'), KITCHEN, {
      attributes: { manual_override: { active: true, temperature: 21, skipped: true } },
    });
    expect(text($(mount(TAG, { entity: KITCHEN }, hass), '.status'))).toBe('Skipped · 70°F until 22:30');
  });

  it('opens the rest on tap, without a hint', () => {
    const el = mount(TAG, { entity: KITCHEN }, makeHass());
    const events = captureEvents(el, 'hass-action');
    click($(el, '.title'));
    expect(events[0].detail).toMatchObject({ action: 'tap', config: { tap_action: { action: 'more-info' } } });
    for (const entity of [KITCHEN, ZONE, GLOBAL]) {
      expect($(mount(TAG, { entity }, makeHass()), '.hint')).toBeNull();
    }
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
