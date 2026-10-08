import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeHass, GLOBAL, ROOM, STUDY, TRV, ZONE } from './helpers.js';

// Stand-in for Home Assistant's ha-form: records what the editor gives it.
class FakeHaForm extends HTMLElement {}

beforeAll(async () => {
  customElements.define('ha-form', FakeHaForm);
  await import('../heating-manager-ui.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

function editor(tag, config, hass = makeHass()) {
  const el = document.createElement(tag);
  el.setConfig(config);
  el.hass = hass;
  document.body.appendChild(el);
  const events = [];
  el.addEventListener('config-changed', (ev) => events.push(ev.detail.config));
  return { el, form: el.querySelector('ha-form'), hint: el.querySelector('.hm-hint'), events };
}

function change(form, value) {
  form.dispatchEvent(new CustomEvent('value-changed', { detail: { value }, bubbles: true }));
}

const names = (schema) => schema.flatMap((s) => (s.schema ? names(s.schema) : [s.name]));

describe('room card editor', () => {
  it('uses Home Assistant’s form, limited to Heating Manager entities', () => {
    const { form } = editor('heating-room-card-editor', { entity: ROOM });
    expect(form).toBeInstanceOf(FakeHaForm);
    expect(form.schema[0]).toEqual({
      name: 'entity', required: true,
      selector: { entity: { filter: [{ integration: 'heating_manager', domain: 'climate' }] } },
    });
    expect(names(form.schema)).toEqual([
      'entity', 'name', 'show_controls', 'show_schedule', 'show_analytics', 'boost_duration', 'tap_action', 'hold_action',
    ]);
    expect(form.data).toEqual({ entity: ROOM, show_controls: true, show_schedule: true, show_analytics: true });
    expect(form.computeLabel({ name: 'boost_duration' })).toBe('Boost length (minutes)');
    expect(form.computeHelper({ name: 'boost_duration' })).toMatch(/integration's boost duration/);
  });

  it('keeps the YAML tidy: no defaults or empty values', () => {
    const { form, events } = editor('heating-room-card-editor', { entity: ROOM });
    change(form, { entity: ZONE, name: '', show_controls: true, show_schedule: false, boost_duration: 45, tap_action: undefined });
    expect(events).toEqual([{ entity: ZONE, show_schedule: false, boost_duration: 45 }]);
  });

  it('explains what the chosen entity shows', () => {
    const { el, form, hint } = editor('heating-room-card-editor', { entity: ROOM });
    expect(hint.textContent).toMatch(/^Room in Downstairs/);
    change(form, { entity: ZONE });
    expect(hint.textContent).toMatch(/^Zone:/);
    change(form, { entity: GLOBAL });
    expect(hint.textContent).toMatch(/^Whole house/);
    change(form, { entity: TRV });
    expect(hint.textContent).toBe("lounge_trv isn't a Heating Manager entity.");
    expect(hint.classList.contains('warn')).toBe(true);
    change(form, {});
    expect(hint.textContent).toBe('Choose a room or zone to get started.');
    expect(el.querySelectorAll('ha-form')).toHaveLength(1);
  });

  it('keeps the same form when hass updates', () => {
    const { el, form } = editor('heating-room-card-editor', { entity: ROOM });
    const hass = makeHass();
    el.hass = hass;
    expect(el.querySelector('ha-form')).toBe(form);
    expect(form.hass).toBe(hass);
  });
});

describe('zone card editor', () => {
  it('lists the zone’s rooms to pick and order', () => {
    const { form, hint } = editor('heating-zone-card-editor', { entity: ZONE });
    const rooms = form.schema.find((s) => s.name === 'rooms');
    expect(rooms.selector.select).toMatchObject({ multiple: true, reorder: true });
    expect(rooms.selector.select.options.map((o) => o.label)).toEqual(['Hall', 'Kitchen', 'Lounge', 'Study']);
    expect(hint.textContent).toBe('4 rooms in Downstairs. Tap a room for its details.');
    expect(form.computeLabel({ name: 'entity' })).toBe('Zone');
    expect(form.computeLabel({ name: 'rooms' })).toBe('Rooms to show (all if empty)');
  });

  it('warns when a room is chosen instead of a zone', () => {
    const { form, hint, events } = editor('heating-zone-card-editor', { entity: ZONE });
    change(form, { entity: ROOM, rooms: [] });
    expect(events).toEqual([{ entity: ROOM }]);
    expect(hint.classList.contains('warn')).toBe(true);
    expect(form.schema.find((s) => s.name === 'rooms')).toBeUndefined();
  });

  it('saves the chosen rooms', () => {
    const { form, events } = editor('heating-zone-card-editor', { entity: ZONE });
    change(form, { entity: ZONE, rooms: [STUDY, ROOM], show_room_boost: false });
    expect(events).toEqual([{ entity: ZONE, rooms: [STUDY, ROOM], show_room_boost: false }]);
  });
});
