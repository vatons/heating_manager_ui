/**
 * End-to-end test: the cards in a real Home Assistant, in a real browser.
 *
 * Starts Home Assistant (HA_PYTHON: a Python with `homeassistant` and the
 * matching `home-assistant-frontend` installed) with the Heating Manager
 * integration from HM_BACKEND, onboards it, adds the cards to a dashboard and
 * drives them in Chromium with Playwright. Screenshots go to e2e/screenshots/.
 *
 *   HA_PYTHON=/path/to/venv/bin/python HM_BACKEND=../heating_manager npm run test:e2e
 *
 * CHROMIUM overrides the browser (default: Playwright's Chromium in /opt/pw-browsers).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'e2e', '.ha-config');
const SHOTS = join(ROOT, 'e2e', 'screenshots');
const BACKEND = resolve(process.env.HM_BACKEND || join(ROOT, '..', 'heating_manager'));
const HA_PYTHON = process.env.HA_PYTHON || 'python3';
// Home Assistant's default port: setting http: in YAML makes 2026.10 ask to confirm it
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT_ID = `${BASE}/`;

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const root = '/opt/pw-browsers';
  const dir = existsSync(root) && readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return dir ? join(root, dir, 'chrome-linux', 'chrome') : undefined;
}

// ---------------------------------------------------------------------------
// Home Assistant
// ---------------------------------------------------------------------------

function writeConfig() {
  rmSync(CONFIG, { recursive: true, force: true });
  mkdirSync(join(CONFIG, 'custom_components'), { recursive: true });
  mkdirSync(join(CONFIG, 'www'), { recursive: true });
  symlinkSync(join(BACKEND, 'custom_components', 'heating_manager'), join(CONFIG, 'custom_components', 'heating_manager'));
  cpSync(join(ROOT, 'heating-manager-ui.js'), join(CONFIG, 'www', 'heating-manager-ui.js'));

  const rooms = ['lounge', 'kitchen', 'study', 'hall'];
  const temps = { lounge: 17.5, kitchen: 19.6, study: 18.2, hall: 18.9 };
  // TRVs: generic thermostats, each with a heater switch and its own internal sensor
  const thermostats = rooms.map((r) => `
  - platform: generic_thermostat
    name: ${r} trv
    unique_id: ${r}_trv
    heater: input_boolean.${r}_valve
    target_sensor: sensor.${r}_trv_internal
    initial_hvac_mode: heat
    min_temp: 5
    max_temp: 30`).join('');
  const sensors = rooms.flatMap((r) => [
    `      - name: ${r} temp\n        unique_id: ${r}_temp\n        unit_of_measurement: "°C"\n        device_class: temperature\n        state: "{{ states('input_number.${r}_temp') }}"`,
    `      - name: ${r} trv internal\n        unique_id: ${r}_trv_internal\n        unit_of_measurement: "°C"\n        device_class: temperature\n        state: "{{ (states('input_number.${r}_temp') | float + 3) | round(1) }}"`,
  ]).join('\n');

  writeFileSync(join(CONFIG, 'configuration.yaml'), `
homeassistant:
  name: Heating test
  unit_system: metric
  time_zone: Europe/London
  latitude: 51.5
  longitude: 0
  elevation: 0
  country: GB
frontend:
config:
logger:
  default: warning
input_boolean:
${rooms.map((r) => `  ${r}_valve:\n    name: ${r} valve`).join('\n')}
input_number:
${rooms.map((r) => `  ${r}_temp:\n    min: 0\n    max: 40\n    step: 0.1\n    initial: ${temps[r]}`).join('\n')}
template:
  - sensor:
${sensors}
climate:${thermostats}
heating_manager:
  config_file: heating_manager.yaml
`);

  writeFileSync(join(CONFIG, 'heating_manager.yaml'), `
minimum_temp: 10
frost_protection_temp: 7
zones:
  downstairs:
    name: Downstairs
    schedule:
      weekday:
        - { start: "00:00", end: "12:00", temperature: 20 }
        - { start: "12:00", end: "00:00", temperature: 19 }
      weekend:
        - { start: "00:00", end: "12:00", temperature: 20 }
        - { start: "12:00", end: "00:00", temperature: 19 }
    rooms:
${rooms.map((r) => `      ${r}:
        name: ${r[0].toUpperCase()}${r.slice(1)}
        trvs: [climate.${r}_trv]
        sensors: ${r === 'hall' ? '[]' : `[sensor.${r}_temp]`}`).join('\n')}
`);
}

function startHomeAssistant() {
  const proc = spawn(HA_PYTHON, ['-m', 'homeassistant', '-c', CONFIG], { stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  const keep = (chunk) => {
    log.push(chunk.toString());
    if (log.length > 400) log.shift();
  };
  proc.stdout.on('data', keep);
  proc.stderr.on('data', keep);
  proc.log = log;
  return proc;
}

async function waitFor(check, what, timeoutMs = 180000, everyMs = 1000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    await new Promise((r) => { setTimeout(r, everyMs); });
  }
  throw new Error(`Timed out waiting for ${what}${last ? `: ${last.message}` : ''}`);
}

async function post(path, body, token, form = false) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
    },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function onboard() {
  const { auth_code: code } = await post('/api/onboarding/users', {
    client_id: CLIENT_ID, name: 'Test', username: 'test', password: 'test-password-1', language: 'en',
  });
  const tokens = await post('/auth/token', { grant_type: 'authorization_code', code, client_id: CLIENT_ID }, null, true);
  const token = tokens.access_token;
  await post('/api/onboarding/core_config', {}, token);
  await post('/api/onboarding/analytics', {}, token);
  await post('/api/onboarding/integration', { client_id: CLIENT_ID, redirect_uri: `${BASE}/?auth_callback=1` }, token);
  return tokens;
}

async function websocket(token, messages) {
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/api/websocket`);
  const pending = new Map();
  let id = 0;
  await new Promise((resolveOpen, reject) => {
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      else if (msg.type === 'auth_ok') resolveOpen();
      else if (msg.type === 'auth_invalid') reject(new Error('auth_invalid'));
      else if (pending.has(msg.id)) {
        const { ok, fail } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.success) ok(msg.result);
        else fail(new Error(JSON.stringify(msg.error)));
      }
    };
  });
  const results = [];
  for (const message of messages) {
    id += 1;
    const msgId = id;
    results.push(await new Promise((ok, fail) => {
      pending.set(msgId, { ok, fail });
      ws.send(JSON.stringify({ id: msgId, ...message }));
    }));
  }
  ws.close();
  return results;
}

async function getState(token, entityId) {
  const res = await fetch(`${BASE}/api/states/${entityId}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? res.json() : null;
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

const results = [];
let currentPage;
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    await currentPage?.screenshot({ path: join(SHOTS, `failed-${results.length}.png`), fullPage: true }).catch(() => {});
    console.log(`  ✗ ${name}\n    ${err.stack?.split('\n').slice(0, 4).join('\n    ')}`);
  }
}

const shadowText = (page, selector) => page.evaluate((sel) => {
  // Find the first matching element through every shadow root on the page
  const find = (root) => {
    const hit = root.querySelector(sel);
    if (hit) return hit;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const inner = find(el.shadowRoot);
        if (inner) return inner;
      }
    }
    return null;
  };
  return find(document)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
}, selector);

async function main() {
  const executablePath = findChromium();
  assert.ok(existsSync(BACKEND), `Heating Manager not found at ${BACKEND} (set HM_BACKEND)`);
  writeConfig();
  mkdirSync(SHOTS, { recursive: true });

  console.log(`Starting Home Assistant (${HA_PYTHON}) with Heating Manager from ${BACKEND}`);
  const ha = startHomeAssistant();
  let browser;
  try {
    await waitFor(async () => (await fetch(`${BASE}/api/onboarding`)).ok, 'Home Assistant to start');
    const tokens = await onboard();
    const token = tokens.access_token;
    writeFileSync(join(CONFIG, 'tokens.json'), JSON.stringify(tokens));
    // The integration's first update can run before the template sensors exist
    const lounge = await waitFor(
      () => getState(token, 'climate.downstairs_lounge').then((s) => s?.attributes?.current_temperature != null && s),
      'Heating Manager entities with temperatures',
    );
    const config = await (await fetch(`${BASE}/api/config`, { headers: { Authorization: `Bearer ${token}` } })).json();
    console.log(`Home Assistant ${config.version}; lounge ${lounge.attributes.current_temperature} → ${lounge.attributes.temperature}`);

    await websocket(token, [
      { type: 'lovelace/resources/create', res_type: 'module', url: `/local/heating-manager-ui.js?v=${Date.now()}` },
      { type: 'lovelace/dashboards/create', url_path: 'heating-test', title: 'Heating', mode: 'storage', show_in_sidebar: true },
      {
        type: 'lovelace/config/save',
        url_path: 'heating-test',
        config: {
          title: 'Heating',
          views: [
            {
              title: 'Heating', path: 'heating', type: 'sections', max_columns: 3,
              sections: [
                {
                  type: 'grid',
                  cards: [
                    { type: 'custom:heating-room-card', entity: 'climate.downstairs_lounge' },
                    { type: 'custom:heating-room-card', entity: 'climate.downstairs_kitchen' },
                    { type: 'custom:heating-room-card', entity: 'climate.downstairs_hall' },
                    { type: 'custom:heating-room-card', entity: 'climate.heating_manager' },
                  ],
                },
                { type: 'grid', cards: [{ type: 'custom:heating-zone-card', entity: 'climate.downstairs' }] },
              ],
            },
          ],
        },
      },
    ]);

    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    const hassTokens = {
      ...tokens, hassUrl: BASE, clientId: CLIENT_ID, expires: Date.now() + tokens.expires_in * 1000,
    };
    await context.addInitScript((t) => { localStorage.setItem('hassTokens', JSON.stringify(t)); }, hassTokens);
    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    page.on('pageerror', (err) => {
      // A rejected promise with a plain object reaches here as just "Object"; the
      // unhandledrejection listener below logs it with its details instead
      if (err.message !== 'Object') errors.push(`${err.message} ${err.stack || ''}`);
    });
    await context.addInitScript(() => {
      window.addEventListener('unhandledrejection', (ev) => {
        console.error(`unhandledrejection ${JSON.stringify(ev.reason)} ${ev.reason?.stack || ''}`);
      });
    });
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    const versionLog = new Promise((r) => {
      page.on('console', (msg) => { if (msg.text().includes('HEATING-MANAGER-UI')) r(msg.text()); });
    });

    console.log('Dashboard:');
    await step('loads the cards on a sections dashboard', async () => {
      await page.goto(`${BASE}/heating-test/heating`);
      await page.locator('heating-room-card').first().waitFor({ timeout: 60000 });
      await page.locator('heating-room-card .name').first().waitFor();
      await page.locator('heating-zone-card .row').first().waitFor();
      assert.match(await Promise.race([versionLog, new Promise((r) => { setTimeout(() => r(''), 5000); })]), /v2\.0\.0/);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(SHOTS, 'dashboard.png'), fullPage: true });
      await page.locator('heating-zone-card').screenshot({ path: join(SHOTS, 'zone-card.png') });
    });

    const loungeCard = page.locator('heating-room-card').filter({ has: page.locator('.name', { hasText: /^Lounge$/ }) });
    const kitchenCard = page.locator('heating-room-card').filter({ has: page.locator('.name', { hasText: /^Kitchen$/ }) });

    await step('shows the room from the live entity', async () => {
      const state = await getState(token, 'climate.downstairs_lounge');
      assert.equal((await loungeCard.locator('.current').textContent()).replace(/\s+/g, ''),
        `${state.attributes.current_temperature.toFixed(1)}°C`);
      assert.equal(await loungeCard.locator('.sub').first().textContent(), 'Downstairs');
    });

    await step('boosts a room', async () => {
      await loungeCard.locator('[data-action="boost"]').click();
      await waitFor(async () => (await getState(token, 'climate.downstairs_lounge')).attributes.preset_mode === 'boost',
        'the lounge to be boosted', 20000, 250);
      await loungeCard.locator('[data-countdown]').waitFor();
      assert.match(await loungeCard.locator('.status').textContent(), /Boost · (29|30):\d\d left/);
      assert.equal(await loungeCard.locator('[data-action="boost"]').getAttribute('aria-pressed'), 'true');
    });

    await step('sets a target with +', async () => {
      const before = (await getState(token, 'climate.downstairs_kitchen')).attributes.temperature;
      await kitchenCard.locator('[data-action="up"]').click();
      await kitchenCard.locator('[data-action="up"]').click();
      await waitFor(async () => (await getState(token, 'climate.downstairs_kitchen')).attributes.temperature === before + 1,
        'the kitchen target to change', 20000, 250);
      await waitFor(async () => (await kitchenCard.locator('[data-action="schedule"]').count()) === 1,
        'Resume schedule to show', 20000, 250);
    });

    await step('resumes the schedule', async () => {
      await kitchenCard.locator('[data-action="schedule"]').click();
      await waitFor(async () => !(await getState(token, 'climate.downstairs_kitchen')).attributes.manual_override.active,
        'the manual temperature to clear', 20000, 250);
    });

    await step('turns a room off and on', async () => {
      await kitchenCard.locator('[data-action="power"]').click();
      await waitFor(async () => (await getState(token, 'climate.downstairs_kitchen')).state === 'off', 'kitchen off', 20000, 250);
      await waitFor(async () => (await kitchenCard.locator('.chip').textContent()).trim() === 'Off', 'the Off chip', 20000, 250);
      await kitchenCard.locator('[data-action="power"]').click();
      await waitFor(async () => (await getState(token, 'climate.downstairs_kitchen')).state === 'heat', 'kitchen on', 20000, 250);
    });

    await step("can't boost a room without sensors", async () => {
      const hall = page.locator('heating-room-card').filter({ has: page.locator('.name', { hasText: /^Hall$/ }) });
      assert.equal(await hall.locator('[data-action="boost"]').isDisabled(), true);
    });

    await step('lists the zone’s rooms and boosts one from its row', async () => {
      const zone = page.locator('heating-zone-card');
      assert.deepEqual(await zone.locator('.rname').allTextContents(), ['Hall', 'Kitchen', 'Lounge', 'Study']);
      await zone.locator('[data-action="room-boost"][data-entity="climate.downstairs_study"]').click();
      await waitFor(async () => (await getState(token, 'climate.downstairs_study')).attributes.preset_mode === 'boost',
        'the study to be boosted', 20000, 250);
    });

    await step('opens more info from a zone row', async () => {
      await page.locator('heating-zone-card .row', { hasText: 'Kitchen' }).locator('.rname').click();
      const title = page.locator('ha-more-info-dialog').getByText('Downstairs Kitchen').first();
      await title.waitFor({ timeout: 10000 });
      await page.screenshot({ path: join(SHOTS, 'more-info.png') });
      await page.keyboard.press('Escape');
      await title.waitFor({ state: 'hidden', timeout: 10000 });
    });

    await step('turns away mode on and off from the whole-house card', async () => {
      const house = page.locator('heating-room-card').filter({ has: page.locator('.name', { hasText: /^Heating Manager$/ }) });
      await house.locator('[data-action="away"]').click();
      await waitFor(async () => (await getState(token, 'climate.heating_manager')).attributes.away_mode === true, 'away on', 20000, 250);
      await waitFor(async () => /Away/.test(await loungeCard.locator('.status').textContent()), 'the lounge to show away', 20000, 250);
      await page.screenshot({ path: join(SHOTS, 'away.png'), fullPage: true });
      await house.locator('[data-action="away"]').click();
      await waitFor(async () => (await getState(token, 'climate.heating_manager')).attributes.away_mode === false, 'away off', 20000, 250);
    });

    console.log('Card editor:');
    await step('adds a card from the card picker with a real room and the visual editor', async () => {
      await page.goto(`${BASE}/heating-test/heating?edit=1`);
      await page.locator('hui-grid-section button.add[aria-label="Add card"]').first().click();
      // 2026.10's "Add to dashboard" dialog opens on "By entity"
      await page.getByText('By card', { exact: true }).click();
      const picker = page.locator('hui-card-picker');
      await picker.locator('ha-input-search input').fill('Heating Manager');
      const tile = (name) => picker.locator('.card').filter({ has: page.locator('.card-header', { hasText: name }) });
      await tile('Heating Manager zone').first().waitFor({ timeout: 15000 });
      // The picker previews each card with its stub config: a real room and zone
      await tile('Heating Manager room').locator('heating-room-card .name', { hasText: 'Kitchen' }).waitFor({ timeout: 15000 });
      await tile('Heating Manager zone').locator('heating-zone-card .rname').first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(SHOTS, 'card-picker.png') });
      await tile('Heating Manager room').first().click();
      const editor = page.locator('heating-room-card-editor');
      await editor.waitFor({ state: 'attached', timeout: 15000 });
      await editor.locator('ha-form').first().waitFor({ state: 'attached', timeout: 15000 });
      await waitFor(async () => /Room in Downstairs/.test(await editor.locator('.hm-hint').textContent()),
        'the editor hint', 15000, 250);
      // The entity picker offers only Heating Manager entities
      await editor.locator('ha-selector-entity, ha-entity-picker').first().waitFor({ state: 'attached', timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: join(SHOTS, 'card-editor.png') });
      const preview = page.locator('hui-dialog-edit-card heating-room-card .name').first();
      assert.equal(await preview.textContent(), 'Kitchen');
      // Turning a switch in the visual editor updates the preview
      await editor.getByText('Display', { exact: true }).first().click();
      await editor.getByText('Show controls (target, boost, on/off)').first().waitFor({ timeout: 15000 });
      await page.screenshot({ path: join(SHOTS, 'card-editor-display.png') });
      await editor.locator('ha-switch').first().click();
      await waitFor(async () => (await page.locator('hui-dialog-edit-card heating-room-card .actions').count()) === 0,
        'the preview to hide the controls', 15000, 250);
    });

    await step('the zone card editor lists the zone’s rooms', async () => {
      await page.goto(`${BASE}/heating-test/heating?edit=1`);
      const mode = page.locator('hui-card-edit-mode', { has: page.locator('heating-zone-card') });
      await mode.hover({ force: true });
      await mode.locator('.control[aria-label="Edit card"]').click();
      const editor = page.locator('heating-zone-card-editor');
      await editor.waitFor({ state: 'attached', timeout: 15000 });
      await waitFor(async () => /4 rooms in Downstairs/.test(await editor.locator('.hm-hint').textContent()),
        'the zone editor hint', 15000, 250);
      await editor.getByText('Rooms to show (all if empty)').first().waitFor({ timeout: 15000 });
      await page.screenshot({ path: join(SHOTS, 'zone-editor.png') });
    });

    await step('no errors in the browser console', async () => {
      // Not ours: the frontend calling websocket commands this minimal config doesn't load,
      // and the browser's benign ResizeObserver notice
      const ours = errors.filter((e) => !/unknown_command|ResizeObserver loop|favicon|manifest|Failed to load resource/.test(e));
      if (ours.length) console.log(ours.join('\n'));
      assert.equal(ours.length, 0);
    });
  } catch (err) {
    results.push({ name: 'setup', ok: false, err });
    console.log(`Setup failed: ${err.stack}`);
    console.log(ha.log.slice(-60).join(''));
  } finally {
    await browser?.close();
    if (process.env.E2E_KEEP) {
      console.log(`E2E_KEEP: Home Assistant left running at ${BASE}; tokens in ${join(CONFIG, 'tokens.json')}`);
      return;
    }
    ha.kill('SIGTERM');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${SHOTS}`);
  if (failed.length) {
    console.log(ha.log.filter((l) => /heating_manager|ERROR/i.test(l)).slice(-30).join(''));
    process.exitCode = 1;
  }
}

main();
