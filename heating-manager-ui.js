/**
 * Heating Manager cards for Home Assistant
 *
 * Lovelace cards for the Heating Manager integration (v3.2+):
 *
 *   custom:heating-room-card  One room, zone or the whole house: temperature,
 *                             target (+/-), boost, on/off, schedule and status.
 *   custom:heating-zone-card  A zone and all of its rooms, found automatically.
 *
 * Plain web components with no build step and no dependencies. Both cards have
 * a visual editor built on Home Assistant's own form (ha-form).
 */

export const VERSION = '2.0.0';
export const DOMAIN = 'heating_manager';

// How long an optimistic change is shown before trusting the entity again. The
// integration refreshes at most once every 10 s, so a second action within that
// time can take up to 10 s to show in the entity's state.
export const OPTIMISTIC_TIMEOUT_MS = 15000;
// Pause after the last +/- tap before the new target is sent.
export const TARGET_DEBOUNCE_MS = 1000;
const HOLD_MS = 500;

// ---------------------------------------------------------------------------
// Helpers (exported for the tests)
// ---------------------------------------------------------------------------

/** 'room', 'zone' or 'global' for a Heating Manager climate state, else null. */
export function entityKind(stateObj) {
  const attrs = stateObj?.attributes;
  if (!attrs || !stateObj.entity_id?.startsWith('climate.')) return null;
  if (attrs.room_id !== undefined && attrs.zone_id !== undefined) return 'room';
  if (attrs.zone_id !== undefined && attrs.heating_demand !== undefined) return 'zone';
  if (attrs.total_zones !== undefined) return 'global';
  return null;
}

/** Whether the entity comes from Heating Manager: by the entity registry, else by its attributes. */
export function isHeatingManagerEntity(hass, entityId) {
  const entry = hass?.entities?.[entityId];
  if (entry?.platform) return entry.platform === DOMAIN;
  return entityKind(hass?.states?.[entityId]) !== null;
}

/** All Heating Manager climate states of a kind ('room', 'zone', 'global'), by name. */
export function findEntities(hass, kind) {
  return Object.values(hass?.states || {})
    .filter((s) => entityKind(s) === kind && isHeatingManagerEntity(hass, s.entity_id))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

/** The rooms of a zone, in the order given by `order` (entity ids) then by name. */
export function roomsOfZone(hass, zoneId, order = []) {
  const rooms = findEntities(hass, 'room').filter((s) => s.attributes.zone_id === zoneId);
  if (!order?.length) return rooms;
  const rank = (s) => {
    const i = order.indexOf(s.entity_id);
    return i === -1 ? order.length : i;
  };
  return rooms
    .filter((s) => order.includes(s.entity_id))
    .sort((a, b) => rank(a) - rank(b));
}

/** The zone entity for a zone id. */
export function zoneEntity(hass, zoneId) {
  return findEntities(hass, 'zone').find((s) => s.attributes.zone_id === zoneId);
}

export function displayName(stateObj) {
  return stateObj?.attributes?.friendly_name || stateObj?.entity_id || '';
}

/** A room's name without its zone ("Downstairs Lounge" → "Lounge"). */
export function roomName(stateObj) {
  const name = displayName(stateObj);
  const zone = stateObj?.attributes?.zone_name;
  if (zone && name.startsWith(`${zone} `) && name.length > zone.length + 1) {
    return name.slice(zone.length + 1);
  }
  return name;
}

/** Home Assistant's temperature unit ('°C' or '°F'). */
export function tempUnit(hass) {
  return hass?.config?.unit_system?.temperature || '°C';
}

/**
 * Convert a temperature the integration reports in °C (its own attributes:
 * boost, schedule, manual override) to the unit Home Assistant displays.
 * The climate entity's own temperatures are already converted by Home Assistant.
 */
export function fromCelsius(value, unit) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return unit === '°F' ? (Number(value) * 9) / 5 + 32 : Number(value);
}

/** Target temperature step: 0.5 °C or 1 °F unless the entity sets one. */
export function tempStep(stateObj, unit) {
  return Number(stateObj?.attributes?.target_temp_step) || (unit === '°F' ? 1 : 0.5);
}

export function formatTemp(value, unit, { withUnit = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const decimals = unit === '°F' ? 0 : 1;
  const text = Number(value).toFixed(decimals);
  return withUnit ? `${text}${unit}` : text;
}

/** "45 min", "2h", "3h 20m". */
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return '';
  const total = Math.max(0, Math.round(Number(minutes)));
  if (total < 1) return '< 1 min';
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Boost countdown: "mm:ss", or "h:mm:ss" from an hour. */
export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

/** Clock time for an ISO timestamp in the user's locale. */
export function formatClock(iso, hass) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const options = { hour: '2-digit', minute: '2-digit' };
  const timeFormat = hass?.locale?.time_format;
  if (timeFormat === '12') options.hour12 = true;
  if (timeFormat === '24') options.hour12 = false;
  if (hass?.locale?.time_zone === 'server' && hass?.config?.time_zone) {
    options.timeZone = hass.config.time_zone;
  }
  try {
    return date.toLocaleTimeString(hass?.locale?.language || undefined, options);
  } catch (_err) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}

const TRENDS = {
  heating_rapidly: { icon: 'mdi:arrow-up-bold', label: 'Warming fast', dir: 'up' },
  heating_slowly: { icon: 'mdi:arrow-top-right', label: 'Warming', dir: 'up' },
  stable: { icon: 'mdi:arrow-right', label: 'Steady', dir: 'flat' },
  cooling_slowly: { icon: 'mdi:arrow-bottom-right', label: 'Cooling', dir: 'down' },
  cooling_rapidly: { icon: 'mdi:arrow-down-bold', label: 'Cooling fast', dir: 'down' },
};

/** Icon and label for the integration's temperature_trend, or null. */
export function trendInfo(trend) {
  return TRENDS[trend] || null;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** Seconds of boost left from its end_time, or null. */
export function boostSecondsLeft(boost, now = Date.now()) {
  if (!boost?.end_time) return null;
  const end = new Date(boost.end_time).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - now) / 1000));
}

/**
 * Everything a card shows about one entity, worked out from its state.
 * Pure: the cards render this, and the tests check it directly.
 */
export function describe(hass, stateObj, now = Date.now()) {
  const kind = entityKind(stateObj);
  const unit = tempUnit(hass);
  const a = stateObj?.attributes || {};
  const unavailable = !stateObj || ['unavailable', 'unknown'].includes(stateObj.state);
  const away = a.preset_mode === 'away' || a.away_mode === true;
  const off = kind === 'room' && (stateObj?.state === 'off' || a.hvac_action === 'off');
  const heating = a.hvac_action === 'heating';

  const view = {
    kind,
    unit,
    unavailable,
    name: kind === 'room' ? roomName(stateObj) : displayName(stateObj),
    zoneName: a.zone_name || null,
    current: a.current_temperature ?? null,
    target: a.temperature ?? null,
    min: a.min_temp ?? (unit === '°F' ? 41 : 5),
    max: a.max_temp ?? (unit === '°F' ? 86 : 30),
    step: tempStep(stateObj, unit),
    heating,
    off,
    away,
    monitoringOnly: false,
    boost: { active: false, secondsLeft: null, endTime: null, temperature: null, rooms: [] },
    override: { active: false, temperature: null },
    canBoost: false,
    sensorsMissing: false,
    sensorsStale: 0,
    hold: null,
    schedule: null,
    trend: null,
    eta: null,
    stats: null,
  };

  if (kind === 'room') {
    const boost = a.boost || {};
    view.boost.active = boost.temperature !== null && boost.temperature !== undefined;
    if (view.boost.active) {
      view.boost.endTime = boost.end_time || null;
      view.boost.secondsLeft = boostSecondsLeft(boost, now)
        ?? (boost.time_remaining_minutes != null ? boost.time_remaining_minutes * 60 : null);
      view.boost.temperature = fromCelsius(boost.temperature, unit);
    }
    const sensors = Array.isArray(a.sensors) ? a.sensors : [];
    view.sensorsMissing = sensors.length === 0;
    view.sensorsStale = sensors.filter((s) => s.status && s.status !== 'active').length;
    // The integration only boosts rooms with temperature sensors
    view.canBoost = !view.sensorsMissing;
    const zone = zoneEntity(hass, a.zone_id);
    view.monitoringOnly = zone?.attributes?.monitoring_only === true;
    if (zone) view.schedule = scheduleInfo(zone.attributes.schedule, unit);
    const analytics = a.heating_analytics || {};
    view.trend = trendInfo(analytics.temperature_trend);
    const eta = analytics.estimated_time_to_target || {};
    if (heating && eta.minutes !== null && eta.minutes !== undefined) {
      view.eta = {
        minutes: eta.minutes,
        timestamp: eta.timestamp || null,
        confidence: eta.confidence_percent ?? null,
      };
    }
  } else if (kind === 'zone' || kind === 'global') {
    view.boost.active = a.boost?.active === true;
    view.boost.rooms = a.boost?.room_ids || [];
    view.canBoost = true;
    view.hold = a.demand_hold || null;
    if (kind === 'zone') {
      view.monitoringOnly = a.monitoring_only === true;
      view.schedule = scheduleInfo(a.schedule, unit);
      view.stats = {
        roomsNeedingHeat: (a.rooms_needing_heat || []).length,
        requested: a.heating_demand_requested === true,
        mode: a.heating_demand_mode || null,
      };
    } else {
      view.stats = {
        zones: a.total_zones ?? 0,
        zonesHeating: a.zones_demanding_heat ?? 0,
        roomsNeedingHeat: (a.heating?.rooms_needing_heat || []).length,
      };
    }
  }

  const override = a.manual_override || {};
  if (override.active) {
    view.override.active = true;
    view.override.temperature = fromCelsius(override.temperature, unit);
  }
  return view;
}

function scheduleInfo(schedule, unit) {
  if (!schedule || typeof schedule !== 'object') return null;
  const period = (p) => (p ? {
    start: p.start, end: p.end, tomorrow: p.tomorrow === true,
    temperature: fromCelsius(p.temperature, unit),
  } : null);
  return {
    temperature: fromCelsius(schedule.current_temperature, unit),
    current: period(schedule.current_period),
    next: period(schedule.next_period),
  };
}

/** One line describing what the entity is doing, e.g. "Boost · 42:10 left". */
export function statusLine(view) {
  if (view.unavailable) return 'Unavailable';
  if (view.off) return 'Off';
  if (view.away) return 'Away · frost protection';
  if (view.kind === 'room' && view.boost.active) {
    return view.boost.secondsLeft != null ? `Boost · ${formatCountdown(view.boost.secondsLeft)} left` : 'Boost';
  }
  const parts = [];
  if (view.override.active) {
    const until = view.schedule?.current?.end;
    parts.push(until ? `Manual until ${until}` : 'Manual');
  } else if (view.schedule?.current) {
    parts.push(`Schedule until ${view.schedule.current.end}`);
  } else if (view.schedule?.next) {
    parts.push(`Schedule from ${view.schedule.next.start}${view.schedule.next.tomorrow ? ' tomorrow' : ''}`);
  }
  if (view.kind !== 'room' && view.boost.active) {
    const n = view.boost.rooms.length;
    parts.push(`${n} room${n === 1 ? '' : 's'} boosted`);
  }
  return parts.join(' · ');
}

/** Heating state chip: label and level ('heating', 'idle', 'off', 'warn'). */
export function heatingChip(view) {
  if (view.unavailable) return { label: 'Unavailable', level: 'off', icon: 'mdi:alert-circle-outline' };
  if (view.off) return { label: 'Off', level: 'off', icon: 'mdi:power' };
  if (view.monitoringOnly) return { label: 'Monitoring', level: 'idle', icon: 'mdi:eye-outline' };
  if (view.hold === 'min_on') return { label: 'Heating (min on)', level: 'heating', icon: 'mdi:fire' };
  if (view.hold === 'min_off' && view.stats?.requested !== false) {
    return { label: 'Waiting (min off)', level: 'warn', icon: 'mdi:timer-sand' };
  }
  if (view.heating) return { label: 'Heating', level: 'heating', icon: 'mdi:fire' };
  return { label: 'Idle', level: 'idle', icon: 'mdi:fire-off' };
}

/** Fire a Home Assistant frontend event (more-info, toast, action ...). */
function fireEvent(node, type, detail = {}) {
  const event = new Event(type, { bubbles: true, composed: true, cancelable: false });
  event.detail = detail;
  node.dispatchEvent(event);
  return event;
}

function errorMessage(err) {
  return err?.message || err?.error?.message || (typeof err === 'string' ? err : 'unknown error');
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const STYLES = `
  :host {
    --hm-heat: var(--heating-color, var(--state-climate-heat-color, #ff6b35));
    --hm-heat-soft: var(--heating-color-alpha, rgba(255, 107, 53, 0.12));
    --hm-boost: var(--boost-color, var(--hm-heat));
    --hm-off: var(--disabled-text-color, #9e9e9e);
    --hm-warn: var(--warning-color, #ffa600);
    --hm-radius: var(--ha-card-border-radius, 12px);
    display: block;
  }
  ha-card { height: 100%; overflow: hidden; position: relative; }
  ha-card.unavailable { opacity: 0.6; }
  .bar { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: var(--hm-off); opacity: 0.4; }
  .bar.heating {
    background: linear-gradient(90deg, var(--hm-heat), var(--heating-color-light, #ff8c42));
    opacity: 1; animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 50% { opacity: 0.6; } }
  @media (prefers-reduced-motion: reduce) { .bar.heating { animation: none; } }
  .content { padding: 16px; }
  .header { display: flex; align-items: flex-start; gap: 8px; }
  .title { flex: 1; min-width: 0; cursor: pointer; border-radius: 6px; }
  .title:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .name { font-size: 16px; font-weight: 500; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 6px;
    border-radius: 12px; font-size: 12px; font-weight: 500; white-space: nowrap;
    color: var(--secondary-text-color); background: var(--secondary-background-color, rgba(127,127,127,0.12)); }
  .chip ha-icon { --mdc-icon-size: 16px; }
  .chip.heating { color: var(--hm-heat); background: var(--hm-heat-soft); }
  .chip.warn { color: var(--hm-warn); }
  .chip.off { color: var(--hm-off); }
  .main { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin: 12px 0 8px; }
  .current { font-size: 44px; font-weight: 300; line-height: 1; color: var(--primary-text-color); cursor: pointer; white-space: nowrap; }
  .current.heating { color: var(--hm-heat); }
  .current .unit { font-size: 20px; opacity: 0.6; margin-left: 2px; vertical-align: top; }
  /* Beside the temperature, or under it (right-aligned) when the card is narrow */
  .target { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .target-value { min-width: 64px; text-align: center; }
  .target-value .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--secondary-text-color); }
  .target-value .value { font-size: 20px; font-weight: 500; color: var(--primary-text-color); }
  .target-value.pending .value { color: var(--primary-color); }
  button { font: inherit; color: inherit; }
  .round { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--divider-color, rgba(127,127,127,0.3));
    background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    color: var(--primary-text-color); padding: 0; }
  .round:hover:not([disabled]) { background: var(--secondary-background-color, rgba(127,127,127,0.12)); }
  .round[disabled] { opacity: 0.35; cursor: default; }
  .status { font-size: 13px; color: var(--secondary-text-color); min-height: 18px; }
  .info { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--secondary-text-color); margin-top: 6px; }
  .info span { display: inline-flex; align-items: center; gap: 4px; }
  .info ha-icon { --mdc-icon-size: 16px; }
  .info .up { color: var(--hm-heat); }
  .info .down { color: var(--cool-color, var(--info-color, #039be5)); }
  .info .warn { color: var(--hm-warn); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .action { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px;
    border-radius: 18px; border: 1px solid var(--divider-color, rgba(127,127,127,0.3)); background: transparent;
    cursor: pointer; font-size: 14px; font-weight: 500; color: var(--primary-text-color); }
  .action ha-icon { --mdc-icon-size: 18px; }
  .action:hover:not([disabled]) { background: var(--secondary-background-color, rgba(127,127,127,0.12)); }
  .action[disabled] { opacity: 0.4; cursor: default; }
  .action.on { background: var(--hm-boost); border-color: var(--hm-boost); color: var(--text-primary-color, #fff); }
  .action.busy { opacity: 0.7; }
  .round:focus-visible, .action:focus-visible, .row:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .warning { padding: 16px; color: var(--primary-text-color); display: flex; gap: 12px; align-items: flex-start; }
  .warning ha-icon { color: var(--hm-warn); flex-shrink: 0; }
  .warning code { font-size: 12px; }
  .rows { margin-top: 8px; border-top: 1px solid var(--divider-color, rgba(127,127,127,0.2)); }
  .row { display: flex; align-items: center; gap: 10px; padding: 8px 4px; cursor: pointer; border-radius: 8px; }
  .row:hover { background: var(--secondary-background-color, rgba(127,127,127,0.08)); }
  .row .icon { width: 28px; display: flex; justify-content: center; color: var(--secondary-text-color); }
  .row .icon.heating { color: var(--hm-heat); }
  .row .icon.off { color: var(--hm-off); }
  .row .what { flex: 1; min-width: 0; }
  .row .rname { font-size: 14px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .rstatus { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .temps { text-align: right; font-size: 14px; color: var(--primary-text-color); white-space: nowrap; }
  .row .temps .t { font-size: 12px; color: var(--secondary-text-color); }
  .row .mini { width: 32px; height: 32px; }
  .row .mini.on { background: var(--hm-boost); border-color: var(--hm-boost); color: var(--text-primary-color, #fff); }
  .empty { padding: 12px 4px; color: var(--secondary-text-color); font-size: 13px; }
`;

// ---------------------------------------------------------------------------
// Base card: config, hass updates, optimistic state, service calls, actions
// ---------------------------------------------------------------------------

class HeatingBaseCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._optimistic = {};
    this._busy = {};
    this._timers = {};
    this._renderKey = null;
    this.shadowRoot.addEventListener('click', (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener('keydown', (ev) => this._onKeyDown(ev));
    this.shadowRoot.addEventListener('pointerdown', (ev) => this._onPointerDown(ev));
    this.shadowRoot.addEventListener('pointerup', () => this._cancelHold());
    this.shadowRoot.addEventListener('pointercancel', () => this._cancelHold());
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    if (!config.entity) throw new Error('Choose a Heating Manager entity (entity: climate.…)');
    if (!String(config.entity).startsWith('climate.')) {
      throw new Error(`${config.entity} is not a climate entity; choose a Heating Manager room or zone`);
    }
    if (config.boost_duration !== undefined
        && !(Number.isInteger(Number(config.boost_duration)) && Number(config.boost_duration) > 0)) {
      throw new Error('boost_duration must be a whole number of minutes');
    }
    this._config = { ...this.constructor.defaults, ...config };
    this._optimistic = {};
    this._renderKey = null;
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._renderKey = null;
    if (this._hass && this._config) this._update();
  }

  disconnectedCallback() {
    this._stopTicker();
    this._cancelHold();
  }

  get _stateObj() {
    return this._hass?.states?.[this._config?.entity];
  }

  // -- Optimistic state ----------------------------------------------------
  //
  // A change made on the card shows at once and is kept until the entity
  // reports it, or OPTIMISTIC_TIMEOUT_MS passes (the call failed or was
  // overridden, so trust the entity again).

  _setOptimistic(key, value) {
    this._optimistic[key] = { value, until: Date.now() + OPTIMISTIC_TIMEOUT_MS };
    clearTimeout(this._timers[`opt_${key}`]);
    this._timers[`opt_${key}`] = setTimeout(() => this._update(), OPTIMISTIC_TIMEOUT_MS + 50);
  }

  _clearOptimistic(key) {
    delete this._optimistic[key];
  }

  /** The optimistic value for key, unless the entity now shows `actual` equal to it. */
  _resolve(key, actual, equals = (a, b) => a === b) {
    const pending = this._optimistic[key];
    if (!pending) return actual;
    if (Date.now() > pending.until || equals(actual, pending.value)) {
      delete this._optimistic[key];
      return actual;
    }
    return pending.value;
  }

  /** Boost length for countdowns before the entity reports its end time. */
  _boostMinutes() {
    return Number(this._config.boost_duration) || 30;
  }

  // -- Service calls -------------------------------------------------------

  async _call(label, domain, service, data = {}, entityId = this._config.entity, busyKey = null) {
    if (busyKey) {
      this._busy[busyKey] = true;
      this._update(true);
    }
    try {
      const target = entityId ? { entity_id: entityId } : undefined;
      // notifyOnError=false: the card shows its own, clearer, message
      await this._hass.callService(domain, service, data, target, false);
      return true;
    } catch (err) {
      fireEvent(this, 'hass-notification', { message: `Couldn't ${label}: ${errorMessage(err)}` });
      return false;
    } finally {
      if (busyKey) {
        delete this._busy[busyKey];
        this._update(true);
      }
    }
  }

  // -- Actions (tap, hold, keyboard) --------------------------------------

  _actionConfig() {
    return {
      entity: this._config.entity,
      tap_action: this._config.tap_action || { action: 'more-info' },
      hold_action: this._config.hold_action || { action: 'none' },
    };
  }

  _handleAction(action, entityId) {
    if (entityId && entityId !== this._config.entity) {
      fireEvent(this, 'hass-more-info', { entityId });
      return;
    }
    const config = this._actionConfig();
    const actionConfig = config[`${action}_action`];
    if (!actionConfig || actionConfig.action === 'none') return;
    fireEvent(this, 'hass-action', { config, action });
  }

  /** The tappable element an event is for, unless it's for one of the card's buttons. */
  _tapTarget(ev) {
    for (const node of ev.composedPath()) {
      if (node?.tagName === 'BUTTON') return null;
      if (node?.dataset?.tap !== undefined) return node;
    }
    return null;
  }

  _onPointerDown(ev) {
    const el = this._tapTarget(ev);
    if (!el || ev.button > 0) return;
    this._held = false;
    this._cancelHold();
    this._holdTimer = setTimeout(() => {
      this._held = true;
      this._handleAction('hold', el.dataset.tap || undefined);
    }, HOLD_MS);
  }

  _cancelHold() {
    clearTimeout(this._holdTimer);
    this._holdTimer = null;
  }

  _onKeyDown(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const el = this._tapTarget(ev);
    if (!el) return;
    ev.preventDefault();
    this._handleAction('tap', el.dataset.tap || undefined);
  }

  _onClick(ev) {
    const path = ev.composedPath();
    const button = path.find((n) => n?.dataset?.action !== undefined);
    if (button) {
      ev.stopPropagation();
      if (!button.disabled) this._onButton(button.dataset.action, button.dataset);
      return;
    }
    const tap = this._tapTarget(ev);
    if (!tap) return;
    this._cancelHold();
    if (this._held) {
      this._held = false;
      return;
    }
    this._handleAction('tap', tap.dataset.tap || undefined);
  }

  // -- Boost countdown -----------------------------------------------------

  _startTicker() {
    if (this._ticker) return;
    this._ticker = setInterval(() => this._tick(), 1000);
  }

  _stopTicker() {
    clearInterval(this._ticker);
    this._ticker = null;
  }

  /** Update the countdowns in place, without re-rendering the card. */
  _tick() {
    const nodes = this.shadowRoot.querySelectorAll('[data-countdown]');
    if (!nodes.length) {
      this._stopTicker();
      return;
    }
    let expired = false;
    nodes.forEach((node) => {
      const left = Math.round((Number(node.dataset.countdown) - Date.now()) / 1000);
      if (left <= 0) expired = true;
      node.textContent = node.dataset.prefix + formatCountdown(left) + node.dataset.suffix;
    });
    if (expired) {
      this._stopTicker();
      this._update(true);
    }
  }

  // -- Rendering -----------------------------------------------------------

  /** Re-render when what the card shows has changed (or when forced). */
  _update(force = false) {
    if (!this._config || !this._hass) return;
    const model = this._model();
    const key = JSON.stringify(model);
    if (!force && key === this._renderKey) return;
    this._renderKey = key;
    this.shadowRoot.innerHTML = `<style>${STYLES}</style>${this._render(model)}`;
    if (this.shadowRoot.querySelector('[data-countdown]')) this._startTicker();
    else this._stopTicker();
  }

  _renderWarning(message, detail = '') {
    return `<ha-card><div class="warning"><ha-icon icon="mdi:alert-outline"></ha-icon>
      <div><div>${message}</div>${detail ? `<div class="sub">${detail}</div>` : ''}</div></div></ha-card>`;
  }

  /** Error for an entity this card can't show, or ''. */
  _entityProblem(kinds) {
    const entityId = escapeHtml(this._config.entity);
    const stateObj = this._stateObj;
    if (!stateObj) {
      return this._renderWarning(`Entity not found: <code>${entityId}</code>`,
        'Check the entity in the card settings. Renamed rooms keep their entity; deleted ones lose it.');
    }
    if (['unavailable', 'unknown'].includes(stateObj.state) && !stateObj.attributes?.zone_id
        && !stateObj.attributes?.total_zones) {
      return this._renderWarning(`<code>${entityId}</code> is unavailable`,
        'Heating Manager may be starting up or reloading.');
    }
    const kind = entityKind(stateObj);
    if (!kind && this._hass.entities?.[stateObj.entity_id]?.platform === DOMAIN) {
      return this._renderWarning(`Waiting for Heating Manager…`,
        `<code>${entityId}</code> has no data yet. It appears after the integration's first update.`);
    }
    if (!kind || !isHeatingManagerEntity(this._hass, stateObj.entity_id)) {
      return this._renderWarning(`<code>${entityId}</code> isn't a Heating Manager entity`,
        'Choose one of the climate entities Heating Manager creates for its rooms and zones.');
    }
    if (!kinds.includes(kind)) {
      return this._renderWarning(`<code>${entityId}</code> is a ${kind}`,
        `This card shows a ${kinds.join(' or ')}.`);
    }
    return '';
  }
}

// ---------------------------------------------------------------------------
// Room card (rooms, zones and the global entity)
// ---------------------------------------------------------------------------

export class HeatingRoomCard extends HeatingBaseCard {
  static get defaults() {
    return {
      show_controls: true,
      show_schedule: true,
      show_analytics: true,
    };
  }

  static getConfigElement() {
    return document.createElement('heating-room-card-editor');
  }

  static getStubConfig(hass) {
    // Preview a room that shows everything: one with sensors, so it can be boosted
    const rooms = findEntities(hass, 'room');
    const entity = rooms.find((s) => s.attributes.sensors?.length) || rooms[0]
      || findEntities(hass, 'zone')[0] || findEntities(hass, 'global')[0];
    return { entity: entity?.entity_id || 'climate.heating_manager' };
  }

  getCardSize() {
    return this._config?.show_controls === false ? 3 : 4;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 4 };
  }

  _model() {
    const stateObj = this._stateObj;
    if (!stateObj || !entityKind(stateObj)) return { problem: true, entity: this._config.entity, state: stateObj?.state };
    const view = describe(this._hass, stateObj);
    if (this._config.name) view.name = this._config.name;

    // Optimistic overrides
    if (view.kind === 'room') {
      const boost = this._resolve('boost', view.boost.active);
      if (boost !== view.boost.active) {
        view.boost.active = boost;
        // Until the entity confirms, count down from now
        view.boost.endTime = boost
          ? new Date(this._optimistic.boost.since + this._boostMinutes() * 60000).toISOString()
          : null;
      }
      view.off = this._resolve('off', view.off);
      if (view.off) view.heating = false;
    } else {
      view.boost.active = this._resolve('boost', view.boost.active);
    }
    if (view.kind === 'global') view.away = this._resolve('away', view.away);
    view.override.active = this._resolve('override', view.override.active);
    const target = this._resolve('target', view.target, (a, b) => a !== null && Math.abs(a - b) < 0.01);
    view.targetPending = target !== view.target;
    view.target = target;
    // Countdowns are drawn live from the end time; seconds left would re-render every second
    view.boost.endMs = view.kind === 'room' && view.boost.active && view.boost.endTime
      ? new Date(view.boost.endTime).getTime() : null;
    delete view.boost.secondsLeft;
    delete view.boost.endTime;
    return { view, busy: { ...this._busy }, config: this._config };
  }

  _render(model) {
    if (model.problem) return this._entityProblem(['room', 'zone', 'global']);
    const { view, busy, config } = model;
    const unit = view.unit;
    const chip = heatingChip(view);
    const controls = config.show_controls !== false;
    const canSetTarget = !view.off && !view.away && !view.unavailable;
    const stepDown = view.target !== null && view.target - view.step >= view.min - 1e-9;
    const stepUp = view.target !== null && view.target + view.step <= view.max + 1e-9;

    // Away and off win over a boost (the integration targets frost protection / minimum)
    const showBoost = view.kind === 'room' && view.boost.active && !view.away && !view.off;
    let status = showBoost && view.boost.endMs
      ? `<span data-countdown="${view.boost.endMs}" data-prefix="Boost · " data-suffix=" left">Boost · ${formatCountdown((view.boost.endMs - Date.now()) / 1000)} left</span>`
      : escapeHtml(statusLine({ ...view, boost: { ...view.boost, secondsLeft: null } }));
    if (showBoost && view.boost.temperature !== null) {
      status += ` <span class="sub">to ${formatTemp(view.boost.temperature, unit, { withUnit: true })}</span>`;
    }

    const sub = view.kind === 'room'
      ? escapeHtml(view.zoneName || '')
      : view.kind === 'zone'
        ? zoneSummary(view)
        : globalSummary(view);

    const info = [];
    if (config.show_schedule !== false && view.schedule?.next && !view.away) {
      const n = view.schedule.next;
      info.push(`<span title="Next schedule period"><ha-icon icon="mdi:calendar-clock"></ha-icon>${n.tomorrow ? 'Tomorrow ' : ''}${escapeHtml(n.start)} → ${formatTemp(n.temperature, unit, { withUnit: true })}</span>`);
    }
    if (config.show_analytics !== false && view.kind === 'room') {
      if (view.trend) {
        info.push(`<span class="${view.trend.dir === 'up' ? 'up' : view.trend.dir === 'down' ? 'down' : ''}"><ha-icon icon="${view.trend.icon}"></ha-icon>${view.trend.label}</span>`);
      }
      if (view.eta && !view.off) {
        const at = view.eta.timestamp ? ` (${escapeHtml(formatClock(view.eta.timestamp, this._hass))})` : '';
        const low = view.eta.confidence !== null && view.eta.confidence < 50 ? ' · rough estimate' : '';
        info.push(`<span title="Estimated time to reach the target"><ha-icon icon="mdi:timer-outline"></ha-icon>Target in ~${formatDuration(view.eta.minutes)}${at}${low}</span>`);
      }
    }
    if (view.kind === 'room' && view.sensorsStale) {
      info.push(`<span class="warn"><ha-icon icon="mdi:thermometer-alert"></ha-icon>${view.sensorsStale} sensor${view.sensorsStale === 1 ? '' : 's'} not reporting</span>`);
    }
    if (view.kind === 'room' && view.sensorsMissing) {
      info.push(`<span><ha-icon icon="mdi:radiator"></ha-icon>Using TRV temperature</span>`);
    }

    const actions = [];
    if (controls && !view.unavailable) {
      if (view.kind === 'room') {
        const boostTitle = !view.canBoost ? 'Boost needs a temperature sensor in this room'
          : view.boost.active ? 'Cancel boost' : `Boost for ${formatDuration(Number(config.boost_duration) || null) || 'the default time'}`;
        actions.push(`<button class="action ${view.boost.active ? 'on' : ''} ${busy.boost ? 'busy' : ''}" data-action="boost"
          ${(!view.boost.active && (!view.canBoost || view.away)) || busy.boost ? 'disabled' : ''} title="${boostTitle}" aria-label="${boostTitle}" aria-pressed="${view.boost.active}">
          <ha-icon icon="mdi:rocket-launch"></ha-icon>${view.boost.active ? 'Cancel boost' : 'Boost'}</button>`);
        if (view.override.active && !view.boost.active) {
          actions.push(`<button class="action" data-action="schedule" ${busy.schedule ? 'disabled' : ''} title="Go back to the schedule">
            <ha-icon icon="mdi:calendar-sync"></ha-icon>Resume schedule</button>`);
        }
        const offTitle = view.off ? 'Turn this room back on' : 'Turn this room off (TRVs held at minimum)';
        actions.push(`<button class="action" data-action="power" ${busy.power || view.away ? 'disabled' : ''} title="${offTitle}" aria-label="${offTitle}">
          <ha-icon icon="mdi:power"></ha-icon>${view.off ? 'Turn on' : 'Turn off'}</button>`);
      } else {
        const label = view.boost.active ? 'Cancel boosts' : 'Boost all';
        const title = view.boost.active ? 'Cancel every boost and manual temperature' : 'Boost every room with a sensor';
        actions.push(`<button class="action ${view.boost.active ? 'on' : ''}" data-action="boost" ${busy.boost || (view.away && !view.boost.active) ? 'disabled' : ''}
          title="${title}" aria-pressed="${view.boost.active}"><ha-icon icon="mdi:rocket-launch"></ha-icon>${label}</button>`);
        if (view.override.active && !view.boost.active) {
          actions.push(`<button class="action" data-action="schedule" ${busy.schedule ? 'disabled' : ''}>
            <ha-icon icon="mdi:calendar-sync"></ha-icon>Resume schedule</button>`);
        }
        if (view.kind === 'global') {
          const title2 = view.away ? 'Go back to the schedules' : 'Frost protection in every zone';
          actions.push(`<button class="action ${view.away ? 'on' : ''}" data-action="away" ${busy.away ? 'disabled' : ''}
            title="${title2}" aria-pressed="${view.away}"><ha-icon icon="mdi:home-export-outline"></ha-icon>${view.away ? 'Away · end' : 'Away'}</button>`);
        }
      }
    }

    const target = controls && canSetTarget
      ? `<div class="target">
          <button class="round" data-action="down" ${stepDown ? '' : 'disabled'} aria-label="Lower target" title="Lower target"><ha-icon icon="mdi:minus"></ha-icon></button>
          <div class="target-value ${view.targetPending ? 'pending' : ''}"><div class="label">Target</div>
            <div class="value" aria-live="polite">${formatTemp(view.target, unit, { withUnit: true })}</div></div>
          <button class="round" data-action="up" ${stepUp ? '' : 'disabled'} aria-label="Raise target" title="Raise target"><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>`
      : `<div class="target"><div class="target-value"><div class="label">Target</div>
          <div class="value">${view.off ? 'Off' : formatTemp(view.target, unit, { withUnit: true })}</div></div></div>`;

    return `
      <ha-card class="${view.unavailable ? 'unavailable' : ''}">
        <div class="bar ${chip.level === 'heating' ? 'heating' : ''}"></div>
        <div class="content">
          <div class="header">
            <div class="title" data-tap="" role="button" tabindex="0" aria-label="${escapeHtml(view.name)} details">
              <div class="name">${escapeHtml(view.name)}</div>
              ${sub ? `<div class="sub">${sub}</div>` : ''}
            </div>
            <span class="chip ${chip.level}"><ha-icon icon="${chip.icon}"></ha-icon>${chip.label}</span>
          </div>
          <div class="main">
            <div class="current ${chip.level === 'heating' ? 'heating' : ''}" data-tap="">${formatTemp(view.current, unit)}<span class="unit">${unit}</span></div>
            ${target}
          </div>
          <div class="status">${status}</div>
          ${info.length ? `<div class="info">${info.join('')}</div>` : ''}
          ${actions.length ? `<div class="actions">${actions.join('')}</div>` : ''}
        </div>
      </ha-card>`;
  }

  _onButton(action) {
    const stateObj = this._stateObj;
    if (!stateObj) return;
    const view = this._model().view;
    switch (action) {
      case 'up':
      case 'down':
        this._stepTarget(view, action === 'up' ? 1 : -1);
        break;
      case 'boost':
        this._toggleBoost(view);
        break;
      case 'power':
        this._togglePower(view);
        break;
      case 'schedule':
        this._resumeSchedule(view);
        break;
      case 'away':
        this._toggleAway(view);
        break;
      default:
    }
  }

  _stepTarget(view, direction) {
    if (view.target === null) return;
    const step = view.step;
    let next = Math.round((view.target + direction * step) / step) * step;
    next = Math.min(view.max, Math.max(view.min, Number(next.toFixed(2))));
    this._setOptimistic('target', next);
    this._update();
    clearTimeout(this._timers.target);
    this._timers.target = setTimeout(async () => {
      const ok = await this._call(`set ${view.name} to ${formatTemp(next, view.unit, { withUnit: true })}`,
        'climate', 'set_temperature', { temperature: next });
      if (!ok) {
        this._clearOptimistic('target');
        this._update();
      }
    }, TARGET_DEBOUNCE_MS);
  }

  async _toggleBoost(view) {
    const turnOn = !view.boost.active;
    let ok;
    if (view.kind === 'room') {
      this._setOptimistic('boost', turnOn);
      this._optimistic.boost.since = Date.now();
      if (turnOn) this._setOptimistic('off', false);
      this._update();
      if (turnOn) {
        const data = {};
        if (this._config.boost_duration) data.duration = Number(this._config.boost_duration);
        ok = await this._call(`boost ${view.name}`, DOMAIN, 'set_boost', data, undefined, 'boost');
      } else {
        ok = await this._call(`cancel the boost in ${view.name}`, DOMAIN, 'clear_boost', {}, undefined, 'boost');
      }
    } else {
      this._setOptimistic('boost', turnOn);
      this._update();
      ok = await this._call(turnOn ? `boost ${view.name}` : `cancel boosts in ${view.name}`,
        'climate', 'set_preset_mode', { preset_mode: turnOn ? 'boost' : 'schedule' }, undefined, 'boost');
    }
    if (!ok) {
      this._clearOptimistic('boost');
      this._clearOptimistic('off');
      this._update();
    }
  }

  async _togglePower(view) {
    const off = !view.off;
    this._setOptimistic('off', off);
    this._update();
    const ok = await this._call(`turn ${view.name} ${off ? 'off' : 'on'}`, 'climate', 'set_hvac_mode',
      { hvac_mode: off ? 'off' : 'heat' }, undefined, 'power');
    if (!ok) {
      this._clearOptimistic('off');
      this._update();
    }
  }

  async _resumeSchedule(view) {
    this._setOptimistic('override', false);
    clearTimeout(this._timers.target);
    this._clearOptimistic('target');
    this._update();
    const ok = await this._call(`resume the schedule in ${view.name}`, 'climate', 'set_preset_mode',
      { preset_mode: 'schedule' }, undefined, 'schedule');
    if (!ok) {
      this._clearOptimistic('override');
      this._update();
    }
  }

  async _toggleAway(view) {
    const away = !view.away;
    this._setOptimistic('away', away);
    this._update();
    const ok = await this._call(away ? 'turn on away mode' : 'turn off away mode', DOMAIN, 'set_mode',
      { mode: away ? 'away' : 'schedule' }, null, 'away');
    if (!ok) {
      this._clearOptimistic('away');
      this._update();
    }
  }
}

function zoneSummary(view) {
  const parts = [];
  if (view.monitoringOnly) parts.push('Monitoring only');
  if (view.stats?.roomsNeedingHeat) {
    parts.push(`${view.stats.roomsNeedingHeat} room${view.stats.roomsNeedingHeat === 1 ? '' : 's'} need heat`);
  }
  if (view.stats?.mode === 'zone_average') parts.push('Zone average');
  return escapeHtml(parts.join(' · '));
}

function globalSummary(view) {
  const s = view.stats || {};
  const zones = `${s.zones} zone${s.zones === 1 ? '' : 's'}`;
  return escapeHtml(s.zonesHeating ? `${zones} · ${s.zonesHeating} heating` : zones);
}

// ---------------------------------------------------------------------------
// Zone card: a zone and its rooms
// ---------------------------------------------------------------------------

export class HeatingZoneCard extends HeatingBaseCard {
  static get defaults() {
    return { show_room_boost: true, show_controls: true };
  }

  static getConfigElement() {
    return document.createElement('heating-zone-card-editor');
  }

  static getStubConfig(hass) {
    const zone = findEntities(hass, 'zone')[0];
    return { entity: zone?.entity_id || 'climate.heating_manager' };
  }

  getCardSize() {
    const zoneId = this._stateObj?.attributes?.zone_id;
    return 3 + (zoneId ? roomsOfZone(this._hass, zoneId, this._config?.rooms).length : 2);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  _model() {
    const stateObj = this._stateObj;
    if (!stateObj || entityKind(stateObj) !== 'zone') return { problem: true, entity: this._config.entity, state: stateObj?.state };
    const zone = describe(this._hass, stateObj);
    if (this._config.name) zone.name = this._config.name;
    zone.boost.active = this._resolve('boost', zone.boost.active);
    const rooms = roomsOfZone(this._hass, stateObj.attributes.zone_id, this._config.rooms).map((s) => {
      const view = describe(this._hass, s);
      const key = `boost:${s.entity_id}`;
      const boost = this._resolve(key, view.boost.active);
      let endMs = view.boost.endTime ? new Date(view.boost.endTime).getTime() : null;
      if (boost !== view.boost.active) {
        endMs = boost ? this._optimistic[key].since + this._boostMinutes() * 60000 : null;
      }
      return {
        entity: s.entity_id,
        name: view.name,
        current: view.current,
        target: view.target,
        heating: view.heating && !view.off,
        off: view.off,
        away: view.away,
        unavailable: view.unavailable,
        override: view.override.active,
        canBoost: view.canBoost,
        boost,
        endMs: boost ? endMs : null,
        sensorsStale: view.sensorsStale,
      };
    });
    delete zone.boost.secondsLeft;
    return { zone, rooms, busy: { ...this._busy }, config: this._config };
  }

  _render(model) {
    if (model.problem) return this._entityProblem(['zone']);
    const { zone, rooms, busy, config } = model;
    const unit = zone.unit;
    const chip = heatingChip(zone);
    const sched = zone.schedule;
    const now = sched?.current
      ? `Now ${formatTemp(sched.current.temperature, unit, { withUnit: true })} until ${escapeHtml(sched.current.end)}`
      : sched ? `Now ${formatTemp(sched.temperature, unit, { withUnit: true })}` : '';
    const next = sched?.next
      ? `Next ${formatTemp(sched.next.temperature, unit, { withUnit: true })} at ${escapeHtml(sched.next.start)}${sched.next.tomorrow ? ' tomorrow' : ''}`
      : '';
    const subParts = [zoneSummary(zone), zone.away ? 'Away · frost protection' : [now, next].filter(Boolean).join(' · ')]
      .filter(Boolean);
    if (zone.override.active && !zone.away) {
      subParts.push(`Manual ${formatTemp(zone.override.temperature, unit, { withUnit: true })}`);
    }

    const rows = rooms.map((r) => {
      const icon = r.off ? 'mdi:power' : r.boost && !r.away ? 'mdi:rocket-launch' : r.heating ? 'mdi:fire' : 'mdi:thermometer';
      const iconClass = r.off ? 'off' : r.heating || r.boost ? 'heating' : '';
      let status = r.unavailable ? 'Unavailable' : r.off ? 'Off' : r.away ? 'Away' : r.heating ? 'Heating' : 'Idle';
      if (r.override && !r.boost && !r.off) status += ' · manual';
      if (r.sensorsStale) status += ` · ${r.sensorsStale} sensor${r.sensorsStale === 1 ? '' : 's'} not reporting`;
      const statusHtml = r.boost && r.endMs && !r.away
        ? `<span data-countdown="${r.endMs}" data-prefix="Boost · " data-suffix=" left">Boost · ${formatCountdown((r.endMs - Date.now()) / 1000)} left</span>`
        : escapeHtml(status);
      const boostButton = config.show_room_boost !== false && config.show_controls !== false
        ? `<button class="round mini ${r.boost ? 'on' : ''}" data-action="room-boost" data-entity="${escapeHtml(r.entity)}"
            ${(!r.boost && (!r.canBoost || r.away)) || r.unavailable || busy[`boost:${r.entity}`] ? 'disabled' : ''}
            aria-pressed="${r.boost}" aria-label="${r.boost ? 'Cancel boost' : 'Boost'} ${escapeHtml(r.name)}"
            title="${!r.canBoost ? 'Boost needs a temperature sensor in this room' : r.boost ? 'Cancel boost' : 'Boost'}">
            <ha-icon icon="mdi:rocket-launch"></ha-icon></button>`
        : '';
      return `<div class="row" data-tap="${escapeHtml(r.entity)}" role="button" tabindex="0" aria-label="${escapeHtml(r.name)} details">
          <div class="icon ${iconClass}"><ha-icon icon="${icon}"></ha-icon></div>
          <div class="what"><div class="rname">${escapeHtml(r.name)}</div><div class="rstatus">${statusHtml}</div></div>
          <div class="temps">${formatTemp(r.current, unit, { withUnit: true })}
            <div class="t">${r.off ? 'off' : `→ ${formatTemp(r.target, unit, { withUnit: true })}`}</div></div>
          ${boostButton}
        </div>`;
    });

    const actions = [];
    // In away mode only a lingering boost can be cancelled
    if (config.show_controls !== false && (!zone.away || zone.boost.active)) {
      actions.push(`<button class="action ${zone.boost.active ? 'on' : ''}" data-action="boost" ${busy.boost ? 'disabled' : ''}
        aria-pressed="${zone.boost.active}" title="${zone.boost.active ? 'Cancel every boost and manual temperature in this zone' : 'Boost every room with a sensor'}">
        <ha-icon icon="mdi:rocket-launch"></ha-icon>${zone.boost.active ? 'Cancel boosts' : 'Boost all'}</button>`);
      if (zone.override.active && !zone.boost.active) {
        actions.push(`<button class="action" data-action="schedule" ${busy.schedule ? 'disabled' : ''}>
          <ha-icon icon="mdi:calendar-sync"></ha-icon>Resume schedule</button>`);
      }
    }

    return `
      <ha-card class="${zone.unavailable ? 'unavailable' : ''}">
        <div class="bar ${chip.level === 'heating' ? 'heating' : ''}"></div>
        <div class="content">
          <div class="header">
            <div class="title" data-tap="" role="button" tabindex="0" aria-label="${escapeHtml(zone.name)} details">
              <div class="name">${escapeHtml(zone.name)}
                <span class="sub" style="display:inline">${formatTemp(zone.current, unit, { withUnit: true })}</span></div>
              ${subParts.length ? `<div class="sub">${subParts.join(' · ')}</div>` : ''}
            </div>
            <span class="chip ${chip.level}"><ha-icon icon="${chip.icon}"></ha-icon>${chip.label}</span>
          </div>
          <div class="rows">${rows.join('') || '<div class="empty">No rooms in this zone yet. Add them in the zone\'s settings on the Heating Manager integration page.</div>'}</div>
          ${actions.length ? `<div class="actions">${actions.join('')}</div>` : ''}
        </div>
      </ha-card>`;
  }

  _onButton(action, data) {
    const view = this._model();
    if (view.problem) return;
    if (action === 'room-boost') {
      const room = view.rooms.find((r) => r.entity === data.entity);
      if (room) this._toggleRoomBoost(room);
    } else if (action === 'boost') {
      this._toggleZoneBoost(view.zone);
    } else if (action === 'schedule') {
      this._call(`resume the schedule in ${view.zone.name}`, 'climate', 'set_preset_mode',
        { preset_mode: 'schedule' }, undefined, 'schedule');
    }
  }

  async _toggleRoomBoost(room) {
    const key = `boost:${room.entity}`;
    const turnOn = !room.boost;
    this._setOptimistic(key, turnOn);
    this._optimistic[key].since = Date.now();
    this._update();
    const data = {};
    if (turnOn && this._config.boost_duration) data.duration = Number(this._config.boost_duration);
    const ok = turnOn
      ? await this._call(`boost ${room.name}`, DOMAIN, 'set_boost', data, room.entity, key)
      : await this._call(`cancel the boost in ${room.name}`, DOMAIN, 'clear_boost', {}, room.entity, key);
    if (!ok) {
      this._clearOptimistic(key);
      this._update();
    }
  }

  async _toggleZoneBoost(zone) {
    const turnOn = !zone.boost.active;
    this._setOptimistic('boost', turnOn);
    this._update();
    const ok = await this._call(turnOn ? `boost ${zone.name}` : `cancel boosts in ${zone.name}`,
      'climate', 'set_preset_mode', { preset_mode: turnOn ? 'boost' : 'schedule' }, undefined, 'boost');
    if (!ok) {
      this._clearOptimistic('boost');
      this._update();
    }
  }
}

// ---------------------------------------------------------------------------
// Visual editors
// ---------------------------------------------------------------------------

const ENTITY_FILTER = { integration: DOMAIN, domain: 'climate' };

const LABELS = {
  entity: 'Room, zone or whole house',
  name: 'Name',
  show_controls: 'Show controls (target, boost, on/off)',
  show_schedule: 'Show the next schedule change',
  show_analytics: 'Show trend and time to target',
  boost_duration: 'Boost length (minutes)',
  tap_action: 'Tap action',
  hold_action: 'Hold action',
  rooms: 'Rooms to show (all if empty)',
  show_room_boost: 'Boost button on each room',
};

const HELPERS = {
  entity: 'Heating Manager creates one for each room and zone, plus "Heating Manager" for the whole house.',
  boost_duration: "Leave empty to use the integration's boost duration (Configure → Settings).",
  rooms: 'Pick rooms to show only those, in this order.',
};

/** Make sure Home Assistant's ha-form is loaded (it's lazy-loaded). */
export async function ensureHaForm() {
  if (customElements.get('ha-form')) return;
  try {
    const helpers = await window.loadCardHelpers?.();
    const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
    await card?.constructor?.getConfigElement?.();
  } catch (_err) {
    // Fall through: whenDefined below resolves when HA loads it
  }
  if (!customElements.get('ha-form')) {
    await Promise.race([
      customElements.whenDefined('ha-form'),
      new Promise((resolve) => { setTimeout(resolve, 3000); }),
    ]);
  }
}

class HeatingCardEditor extends HTMLElement {
  _labels() {
    return LABELS;
  }

  _helpers() {
    return HELPERS;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) {
      this._form.hass = hass;
      this._form.schema = this._schema();
      this._updateHint();
    } else {
      this._render();
    }
  }

  connectedCallback() {
    ensureHaForm().then(() => this._render());
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      if (!customElements.get('ha-form')) return;
      this.innerHTML = '';
      const style = document.createElement('style');
      style.textContent = '.hm-hint { margin-top: 12px; color: var(--secondary-text-color); font-size: 13px; }'
        + '.hm-hint.warn { color: var(--warning-color, #ffa600); }';
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => this._labels()[s.name] ?? s.title ?? s.name;
      this._form.computeHelper = (s) => this._helpers()[s.name];
      this._form.addEventListener('value-changed', (ev) => this._valueChanged(ev));
      this._hint = document.createElement('div');
      this._hint.className = 'hm-hint';
      this.append(style, this._form, this._hint);
    }
    this._form.hass = this._hass;
    this._form.data = { ...this._defaults(), ...this._config };
    this._form.schema = this._schema();
    this._updateHint();
  }

  _updateHint() {
    if (!this._hint) return;
    const message = this._hintText();
    this._hint.textContent = message?.text || '';
    this._hint.className = `hm-hint ${message?.warn ? 'warn' : ''}`;
  }

  _hintText() {
    const stateObj = this._hass?.states?.[this._config?.entity];
    if (!this._config?.entity) return { text: 'Choose a room or zone to get started.' };
    if (!stateObj) return { text: `${this._config.entity} doesn't exist.`, warn: true };
    const kind = entityKind(stateObj);
    if (!kind) return { text: `${displayName(stateObj)} isn't a Heating Manager entity.`, warn: true };
    return this._kindHint(kind, stateObj);
  }

  _valueChanged(ev) {
    ev.stopPropagation();
    const config = { ...ev.detail.value };
    // Drop empty optional values so the YAML stays tidy
    Object.keys(config).forEach((key) => {
      const value = config[key];
      if (value === '' || value === null || value === undefined
          || (Array.isArray(value) && value.length === 0)) delete config[key];
    });
    Object.entries(this._defaults()).forEach(([key, value]) => {
      if (config[key] === value) delete config[key];
    });
    this._config = config;
    this._form.data = { ...this._defaults(), ...config };
    this._form.schema = this._schema();
    this._updateHint();
    fireEvent(this, 'config-changed', { config });
  }
}

export class HeatingRoomCardEditor extends HeatingCardEditor {
  _defaults() {
    return HeatingRoomCard.defaults;
  }

  _schema() {
    return [
      { name: 'entity', required: true, selector: { entity: { filter: [ENTITY_FILTER] } } },
      { name: 'name', selector: { text: {} } },
      {
        type: 'expandable', name: '', flatten: true, title: 'Display', icon: 'mdi:eye-outline',
        schema: [
          { name: 'show_controls', selector: { boolean: {} } },
          { name: 'show_schedule', selector: { boolean: {} } },
          { name: 'show_analytics', selector: { boolean: {} } },
        ],
      },
      {
        type: 'expandable', name: '', flatten: true, title: 'Boost and actions', icon: 'mdi:gesture-tap',
        schema: [
          { name: 'boost_duration', selector: { number: { min: 1, max: 480, step: 5, mode: 'box', unit_of_measurement: 'min' } } },
          { name: 'tap_action', selector: { ui_action: {} } },
          { name: 'hold_action', selector: { ui_action: {} } },
        ],
      },
    ];
  }

  _kindHint(kind, stateObj) {
    if (kind === 'room') return { text: `Room in ${stateObj.attributes.zone_name || 'its zone'}: boost, on/off and target controls.` };
    if (kind === 'zone') return { text: 'Zone: average temperature, heating demand and boost for all its rooms. For a list of its rooms use the Heating Manager zone card.' };
    return { text: 'Whole house: heating demand across every zone, with away mode.' };
  }
}

export class HeatingZoneCardEditor extends HeatingCardEditor {
  _labels() {
    return { ...LABELS, entity: 'Zone' };
  }

  _helpers() {
    return { ...HELPERS, entity: 'Heating Manager creates one for each zone, named after it.' };
  }

  _defaults() {
    return HeatingZoneCard.defaults;
  }

  _schema() {
    const stateObj = this._hass?.states?.[this._config?.entity];
    const rooms = entityKind(stateObj) === 'zone' ? roomsOfZone(this._hass, stateObj.attributes.zone_id) : [];
    return [
      { name: 'entity', required: true, selector: { entity: { filter: [ENTITY_FILTER] } } },
      { name: 'name', selector: { text: {} } },
      ...(rooms.length ? [{
        name: 'rooms',
        selector: { select: { multiple: true, reorder: true, mode: 'list',
          options: rooms.map((r) => ({ value: r.entity_id, label: roomName(r) })) } },
      }] : []),
      {
        type: 'expandable', name: '', flatten: true, title: 'Display and boost', icon: 'mdi:eye-outline',
        schema: [
          { name: 'show_controls', selector: { boolean: {} } },
          { name: 'show_room_boost', selector: { boolean: {} } },
          { name: 'boost_duration', selector: { number: { min: 1, max: 480, step: 5, mode: 'box', unit_of_measurement: 'min' } } },
          { name: 'tap_action', selector: { ui_action: {} } },
        ],
      },
    ];
  }

  _kindHint(kind, stateObj) {
    if (kind === 'zone') {
      const n = roomsOfZone(this._hass, stateObj.attributes.zone_id).length;
      return { text: `${n} room${n === 1 ? '' : 's'} in ${displayName(stateObj)}. Tap a room for its details.` };
    }
    return { text: 'Choose a zone (not a room or the whole house) for this card.', warn: true };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const ELEMENTS = {
  'heating-room-card': HeatingRoomCard,
  'heating-zone-card': HeatingZoneCard,
  'heating-room-card-editor': HeatingRoomCardEditor,
  'heating-zone-card-editor': HeatingZoneCardEditor,
};
Object.entries(ELEMENTS).forEach(([tag, cls]) => {
  if (!customElements.get(tag)) customElements.define(tag, cls);
});

window.customCards = window.customCards || [];
[
  {
    type: 'heating-room-card',
    name: 'Heating Manager room',
    description: 'A Heating Manager room, zone or the whole house: temperature, target, boost, on/off and schedule.',
  },
  {
    type: 'heating-zone-card',
    name: 'Heating Manager zone',
    description: 'A Heating Manager zone with all of its rooms, each with its temperature, status and a boost button.',
  },
].forEach((card) => {
  if (!window.customCards.some((c) => c.type === card.type)) {
    window.customCards.push({
      ...card,
      preview: true,
      documentationURL: 'https://github.com/vatons/heating_manager_ui',
    });
  }
});

console.info(
  `%c HEATING-MANAGER-UI %c v${VERSION} `,
  'color: white; background: #ff6b35; font-weight: bold;',
  'color: #ff6b35; background: white; font-weight: bold;',
);
