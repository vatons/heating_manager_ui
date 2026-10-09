# Heating Manager cards

Dashboard cards for the [Heating Manager](https://github.com/vatons/heating_manager) integration (3.2 or later).

- **Heating Manager room**: a room, zone or the whole house: temperature, target, status with a live boost countdown, schedule, trend, time to target, and Boost.
- **Heating Manager zone**: a zone with all of its rooms and Boost all.

Tap a card for Home Assistant's own dialog: target, heat/off, back to the schedule and away mode.

Add them from the card picker (**Add card → By card → search "Heating Manager"**). Both have a visual editor.

Upgrading from 1.0? Use the Heating Manager 3.x entities (e.g. `climate.downstairs_lounge`) and remove `heating-manager-ui-editor.js` from your resources if you added it. See the [README](https://github.com/vatons/heating_manager_ui) for details.
