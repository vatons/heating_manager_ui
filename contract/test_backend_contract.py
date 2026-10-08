"""Contract between the cards and the Heating Manager integration.

Runs the real integration on Home Assistant and checks the two things the cards
depend on:

1. The entity states they read. Each scenario is recorded as a JSON fixture in
   test/fixtures/; the JS tests render the cards from these, so a change in the
   integration's attributes shows up as a fixture diff here and a failing card
   test there. Re-record with UPDATE_FIXTURES=1.
2. The service calls they make (test/fixtures/service-calls.json): each is run
   against the integration and must have the effect the card expects.
"""
from __future__ import annotations

import json
import os
from datetime import timedelta
from pathlib import Path

import pytest

from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.json import JSONEncoder
from homeassistant.util import dt as dt_util
from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from tests.conftest import FakeTRV, entry_from_options, local_dt, set_temp

from conftest import BACKEND

FIXTURES = Path(__file__).resolve().parents[1] / "test" / "fixtures"
REFRESH_COOLDOWN = 10  # seconds; DataUpdateCoordinator's default request debouncer
UPDATE = os.environ.get("UPDATE_FIXTURES") == "1"

ROOM = "climate.downstairs_lounge"
ROOM_OFF = "climate.downstairs_study"
ZONE = "climate.downstairs"
MONITOR_ROOM = "climate.upstairs_bathroom"
GLOBAL = "climate.heating_manager"

def make_room(name, trvs, sensors, **extra):
    """A room as the zone form stores it."""
    return {"name": name, "trvs": trvs, "sensors": [{"temperature": s} for s in sensors], **extra}


SCHEDULE = {
    "weekday": [
        {"start": "06:30", "end": "09:00", "temperature": 20.0},
        {"start": "09:00", "end": "17:00", "temperature": 18.0},
        {"start": "17:00", "end": "22:30", "temperature": 21.0},
    ],
    "weekend": [{"start": "08:00", "end": "23:00", "temperature": 20.0}],
}

OPTIONS = {
    "settings": {"minimum_temp": 10.0, "frost_protection_temp": 7.0},
    "zones": {
        "downstairs": {
            "name": "Downstairs",
            "schedule": SCHEDULE,
            "rooms": {
                "lounge": make_room(
                    "Lounge", ["climate.lounge_trv"], ["sensor.lounge_temp", "sensor.lounge_temp_2"]
                ),
                "kitchen": make_room(
                    "Kitchen", ["climate.kitchen_trv"], ["sensor.kitchen_temp"], temperature_offset=-1.0
                ),
                "study": make_room("Study", ["climate.study_trv"], ["sensor.study_temp"]),
                # TRV only: can't be boosted (no sensors)
                "hall": make_room("Hall", ["climate.hall_trv"], []),
            },
        },
        "upstairs": {
            "name": "Upstairs",
            "schedule": SCHEDULE,
            "monitoring_only": True,
            "rooms": {"bathroom": make_room("Bathroom", [], ["sensor.bathroom_temp"])},
        },
    },
}

TEMPS = {
    "sensor.lounge_temp": 17.2,
    "sensor.lounge_temp_2": 17.6,
    "sensor.kitchen_temp": 18.4,
    "sensor.study_temp": 16.1,
    "sensor.bathroom_temp": 20.3,
}


@pytest.fixture
async def heating(hass: HomeAssistant, add_trvs, freezer):
    """The integration set up from its config entry, with some history for analytics."""
    freezer.move_to(local_dt(hour=11, minute=0))

    async def _setup(fahrenheit: bool = False):
        if fahrenheit:
            hass.config.units = US_CUSTOMARY_SYSTEM
        await add_trvs(
            FakeTRV("lounge_trv", current_temperature=24.0),
            FakeTRV("kitchen_trv", current_temperature=21.0),
            FakeTRV("study_trv", current_temperature=19.0),
            FakeTRV("hall_trv", current_temperature=18.5),
        )
        for entity_id, value in TEMPS.items():
            set_temp(hass, entity_id, value)
        entry = entry_from_options(OPTIONS)
        entry.add_to_hass(hass)
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        coordinator = entry.runtime_data

        # An hour of readings, lounge warming and kitchen cooling, so the
        # analytics attributes (rates, ETA, trend) are populated.
        for step in range(1, 13):
            freezer.tick(timedelta(minutes=5))
            set_temp(hass, "sensor.lounge_temp", round(TEMPS["sensor.lounge_temp"] + 0.05 * step, 2))
            set_temp(hass, "sensor.lounge_temp_2", round(TEMPS["sensor.lounge_temp_2"] + 0.05 * step, 2))
            set_temp(hass, "sensor.kitchen_temp", round(TEMPS["sensor.kitchen_temp"] - 0.02 * step, 2))
            for entity_id in ("sensor.study_temp", "sensor.bathroom_temp"):
                set_temp(hass, entity_id, TEMPS[entity_id])
            await coordinator.async_refresh()
            await hass.async_block_till_done()
        return entry

    yield _setup
    for config_entry in hass.config_entries.async_entries("heating_manager"):
        await hass.config_entries.async_unload(config_entry.entry_id)


async def call(hass: HomeAssistant, domain: str, service: str, data: dict, entity_id: str | None):
    """Call a service and wait for the entities to show its effect.

    The integration refreshes at most once every 10 s (its coordinator's request
    debouncer), so a second action within 10 s of another shows up only when
    the cooldown ends. The cards keep their optimistic state for that long.
    """
    target = {"entity_id": entity_id} if entity_id else None
    await hass.services.async_call(domain, service, data, blocking=True, target=target)
    await hass.async_block_till_done()
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=REFRESH_COOLDOWN + 1))
    await hass.async_block_till_done()


def snapshot(hass: HomeAssistant, scenario: str) -> dict:
    """The parts of hass the cards read: states, entity registry and unit system."""
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)

    def device_id(entity: er.RegistryEntry) -> str | None:
        # Registry ids are random; name the device by its Heating Manager identifier
        device = dev_reg.async_get(entity.device_id) if entity.device_id else None
        return next((ident for _, ident in device.identifiers), None) if device else None

    entities = {
        e.entity_id: {"entity_id": e.entity_id, "platform": e.platform, "device_id": device_id(e)}
        for e in ent_reg.entities.values()
        if e.platform == "heating_manager"
    }
    states = {}
    for state in hass.states.async_all():
        if state.entity_id in entities or state.entity_id.startswith(("sensor.", "climate.")):
            data = json.loads(json.dumps(state.as_dict(), cls=JSONEncoder))
            data.pop("context", None)
            states[state.entity_id] = data
    manifest = json.loads(
        (BACKEND / "custom_components" / "heating_manager" / "manifest.json").read_text()
    )
    return {
        "scenario": scenario,
        "homeassistant": HA_VERSION,
        "heating_manager": manifest["version"],
        "config": {"unit_system": {"temperature": hass.config.units.temperature_unit}},
        "entities": dict(sorted(entities.items())),
        "states": dict(sorted(states.items())),
    }


def check_fixture(name: str, data: dict) -> None:
    path = FIXTURES / f"{name}.json"
    text = json.dumps(data, indent=2, sort_keys=False) + "\n"
    if UPDATE or not path.exists():
        path.write_text(text)
        return
    recorded = json.loads(path.read_text())
    assert recorded == json.loads(text), (
        f"{path.name} no longer matches the integration's states. If the change is "
        "expected, re-record with UPDATE_FIXTURES=1 and check the JS tests still pass."
    )


# ---------------------------------------------------------------------------
# 1. States
# ---------------------------------------------------------------------------

async def test_states_celsius(hass: HomeAssistant, heating):
    await heating()
    await call(hass, "heating_manager", "set_boost", {"duration": 60}, ROOM)
    await call(hass, "climate", "set_hvac_mode", {"hvac_mode": "off"}, ROOM_OFF)
    await call(hass, "climate", "set_temperature", {"temperature": 19.5}, "climate.downstairs_kitchen")

    data = snapshot(hass, "Downstairs: lounge boosted, study off, kitchen overridden; Upstairs monitoring only")
    room = data["states"][ROOM]
    assert room["state"] == "heat"
    assert room["attributes"]["room_id"] == "lounge"
    assert room["attributes"]["boost"]["duration_minutes"] == 60
    assert room["attributes"]["heating_analytics"]["temperature_trend"]
    assert data["states"][ROOM_OFF]["state"] == "off"
    assert data["states"][ZONE]["attributes"]["schedule"]["current_period"]["start"] == "09:00"
    assert data["states"][GLOBAL]["attributes"]["total_zones"] == 2
    check_fixture("v3.2.0-celsius", data)


async def test_states_fahrenheit(hass: HomeAssistant, heating):
    await heating(fahrenheit=True)
    await call(hass, "heating_manager", "set_boost", {"duration": 30}, ROOM)

    data = snapshot(hass, "Home Assistant set to °F; lounge boosted")
    room = data["states"][ROOM]["attributes"]
    # HA converts the climate entity's temperatures to °F ...
    assert room["temperature"] > 50
    # ... but the integration's own attributes stay in °C
    assert room["boost"]["temperature"] < 30
    check_fixture("v3.2.0-fahrenheit", data)


async def test_states_away(hass: HomeAssistant, heating):
    await heating()
    await call(hass, "heating_manager", "set_mode", {"mode": "away"}, None)
    data = snapshot(hass, "Away mode")
    assert data["states"][GLOBAL]["attributes"]["preset_mode"] == "away"
    check_fixture("v3.2.0-away", data)


# ---------------------------------------------------------------------------
# 2. Service calls
# ---------------------------------------------------------------------------

CALLS = json.loads((FIXTURES / "service-calls.json").read_text())["calls"]
TARGETS = {"room": ROOM, "zone": ZONE, "global": GLOBAL, None: None}


def attrs(hass, entity_id):
    return hass.states.get(entity_id).attributes


EXPECT = {
    # The integration's default boost: 30 min, 2 °C above the target (18 → 20)
    "room_boost_default": lambda hass: attrs(hass, ROOM)["boost"]["duration_minutes"] == 30
    and attrs(hass, ROOM)["boost"]["temperature"] == 20.0,
    "room_boost": lambda hass: attrs(hass, ROOM)["boost"]["duration_minutes"] == 60
    and attrs(hass, ROOM)["preset_mode"] == "boost",
    "room_boost_temperature": lambda hass: attrs(hass, ROOM)["boost"]["temperature"] == 23
    and attrs(hass, ROOM)["temperature"] == 23,
    "room_clear_boost": lambda hass: attrs(hass, ROOM)["boost"]["temperature"] is None,
    "room_set_temperature": lambda hass: attrs(hass, ROOM)["temperature"] == 20.5
    and attrs(hass, ROOM)["manual_override"] == {"active": True, "temperature": 20.5},
    "room_off": lambda hass: hass.states.get(ROOM).state == "off"
    and attrs(hass, ROOM)["hvac_action"] == "off",
    "room_on": lambda hass: hass.states.get(ROOM).state == "heat",
    "room_schedule": lambda hass: attrs(hass, ROOM)["preset_mode"] == "schedule"
    and not attrs(hass, ROOM)["manual_override"]["active"]
    and attrs(hass, ROOM)["boost"]["temperature"] is None,
    "zone_boost": lambda hass: attrs(hass, ZONE)["boost"]["active"]
    # Only rooms with sensors can be boosted
    and sorted(attrs(hass, ZONE)["boost"]["room_ids"]) == ["kitchen", "lounge", "study"],
    "zone_schedule": lambda hass: attrs(hass, ZONE)["preset_mode"] == "schedule"
    and not attrs(hass, ZONE)["boost"]["active"]
    and not attrs(hass, ZONE)["manual_override"]["active"],
    "zone_set_temperature": lambda hass: attrs(hass, ZONE)["manual_override"]
    == {"active": True, "temperature": 21},
    "global_set_temperature": lambda hass: attrs(hass, GLOBAL)["manual_override"]["zones"]
    == ["downstairs", "upstairs"],
    "global_schedule": lambda hass: attrs(hass, GLOBAL)["preset_mode"] == "schedule"
    and not attrs(hass, GLOBAL)["boost"]["active"],
    "away_on": lambda hass: attrs(hass, GLOBAL)["away_mode"] and attrs(hass, ROOM)["preset_mode"] == "away",
    "away_off": lambda hass: not attrs(hass, GLOBAL)["away_mode"],
}

# Calls that only show their effect from a starting state
SETUP = {
    "room_clear_boost": [("heating_manager", "set_boost", {}, ROOM)],
    "room_on": [("climate", "set_hvac_mode", {"hvac_mode": "off"}, ROOM)],
    "room_schedule": [("climate", "set_temperature", {"temperature": 23}, ROOM)],
    "zone_schedule": [
        ("climate", "set_preset_mode", {"preset_mode": "boost"}, ZONE),
        ("climate", "set_temperature", {"temperature": 22}, ZONE),
    ],
    "global_schedule": [("climate", "set_preset_mode", {"preset_mode": "boost"}, GLOBAL)],
    "away_off": [("heating_manager", "set_mode", {"mode": "away"}, None)],
}


def test_every_call_has_an_expectation():
    assert {c["id"] for c in CALLS} == set(EXPECT)


@pytest.mark.parametrize("spec", CALLS, ids=[c["id"] for c in CALLS])
async def test_service_call(hass: HomeAssistant, heating, spec):
    await heating()
    for args in SETUP.get(spec["id"], []):
        await call(hass, *args)
    await call(hass, spec["domain"], spec["service"], spec["data"], TARGETS[spec["target"]])
    assert EXPECT[spec["id"]](hass), json.dumps(
        {e: hass.states.get(e).as_dict() for e in (ROOM, ZONE, GLOBAL)}, cls=JSONEncoder, indent=1
    )


async def test_boost_temperature_is_in_the_unit_system(hass: HomeAssistant, heating):
    """set_boost's temperature is °F when HA is in °F; the card sends what it shows."""
    await heating(fahrenheit=True)
    await call(hass, "heating_manager", "set_boost", {"temperature": 73.4}, ROOM)
    assert attrs(hass, ROOM)["boost"]["temperature"] == pytest.approx(23.0)
    # HA shows °F climate temperatures in whole degrees
    assert attrs(hass, ROOM)["temperature"] == 73


async def test_room_without_sensors_cannot_be_boosted(hass: HomeAssistant, heating):
    """The card disables boost for such rooms (no "sensors" in their attributes)."""
    await heating()
    hall = attrs(hass, "climate.downstairs_hall")
    assert hall["sensors"] == []
    with pytest.raises(Exception):
        await call(hass, "heating_manager", "set_boost", {}, "climate.downstairs_hall")
