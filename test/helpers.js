import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

// The fixtures were recorded at 12:00 on Wednesday 2026-01-14 in the test
// time zone (America/Los_Angeles), i.e. 20:00 UTC.
export const FIXTURE_NOW = new Date('2026-01-14T20:00:00Z');

export const ROOM = 'climate.downstairs_lounge'; // boosted for 60 min
export const KITCHEN = 'climate.downstairs_kitchen'; // manual override 19.5
export const STUDY = 'climate.downstairs_study'; // switched off
export const HALL = 'climate.downstairs_hall'; // no sensors, can't boost
export const BATHROOM = 'climate.upstairs_bathroom'; // monitoring-only zone
export const ZONE = 'climate.downstairs';
export const UPSTAIRS = 'climate.upstairs';
export const GLOBAL = 'climate.heating_manager';
export const TRV = 'climate.lounge_trv';

export function loadFixture(name) {
  // Relative to the repository root (where vitest runs)
  return JSON.parse(readFileSync(resolve('test', 'fixtures', `${name}.json`), 'utf8'));
}

export const SERVICE_CALLS = loadFixture('service-calls').calls;

/** A hass object like the frontend's, built from a recorded fixture. */
export function makeHass(fixture = 'v3.2.0-celsius', { callService } = {}) {
  const data = typeof fixture === 'string' ? loadFixture(fixture) : fixture;
  return {
    states: structuredClone(data.states),
    entities: structuredClone(data.entities),
    config: {
      unit_system: { temperature: data.config.unit_system.temperature },
      time_zone: 'America/Los_Angeles',
    },
    locale: { language: 'en', time_format: '24', time_zone: 'server' },
    callService: callService || vi.fn(async () => ({ context: {} })),
  };
}

/** A new hass with one entity's state changed, as Home Assistant sends it. */
export function withState(hass, entityId, { state, attributes } = {}) {
  const old = hass.states[entityId];
  return {
    ...hass,
    states: {
      ...hass.states,
      [entityId]: {
        ...old,
        state: state ?? old.state,
        attributes: { ...old.attributes, ...attributes },
      },
    },
  };
}

/** Add the room's boost duration entity (Heating Manager 3.3+), as its device would have it. */
export function withRoomDuration(hass, roomEntityId, minutes) {
  const room = roomEntityId.split('.')[1];
  const entityId = `number.${room}_boost_duration`;
  const deviceId = hass.entities[roomEntityId].device_id;
  return {
    ...hass,
    entities: {
      ...hass.entities,
      [entityId]: { entity_id: entityId, platform: 'heating_manager', device_id: deviceId, translation_key: 'boost_duration' },
    },
    states: { ...hass.states, [entityId]: { entity_id: entityId, state: String(minutes), attributes: {} } },
  };
}

export function mount(tag, config, hass) {
  const el = document.createElement(tag);
  el.setConfig(config);
  el.hass = hass;
  document.body.appendChild(el);
  return el;
}

export function $(el, selector) {
  return el.shadowRoot.querySelector(selector);
}

export function $$(el, selector) {
  return [...el.shadowRoot.querySelectorAll(selector)];
}

export function text(node) {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

export function button(el, action, entity) {
  const selector = entity ? `[data-action="${action}"][data-entity="${entity}"]` : `[data-action="${action}"]`;
  return $(el, selector);
}

export function click(node) {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

/** Collect the frontend events a card fires (hass-action, hass-more-info, ...). */
export function captureEvents(el, ...types) {
  const events = [];
  types.forEach((type) => el.addEventListener(type, (ev) => events.push({ type, detail: ev.detail })));
  return events;
}

/** Let pending promise callbacks run. */
export async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}
