# Changelog

All notable changes to the Heating Manager cards (formerly Heating Room Card) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-08

Rewritten for Heating Manager 3.2 and Home Assistant 2026.10.

### Added
- **Heating Manager zone** card (`custom:heating-zone-card`): a zone with all of its rooms, found automatically, each with its status and a boost button. Pick and order rooms with `rooms`.
- Target − / + buttons. Taps are combined into one change, sent a second after the last tap.
- **Resume schedule** after a manual temperature, **Turn off / Turn on** for rooms, **Boost all / Cancel boosts** for zones and the whole house, and **Away** on the whole-house card.
- Status line: schedule (`Schedule until 17:00`), manual temperature, boost countdown with its target, away and off; the next schedule change; trend; time to target; sensors that stopped reporting.
- Monitoring-only zones and boiler protection holds (`Heating (min on)`, `Waiting (min off)`).
- °F support: the integration's own attributes (boost, schedule, manual temperatures) are converted to your unit system.
- Visual editors built on Home Assistant's form, limited to Heating Manager entities, with a hint about what the chosen entity shows. The card picker previews your own rooms and zones.
- `boost_duration`, `show_controls`, `show_schedule`, `show_analytics`, `show_room_boost`, `hold_action` options.
- Sizes for sections views (`getGridOptions`), keyboard access, and clear messages for missing, unavailable or non-Heating Manager entities.
- Tests: unit tests (Vitest), contract tests against the real integration, and end-to-end tests in Home Assistant 2026.10 with Chromium.

### Changed
- Rooms, zones and the whole house are recognised by their attributes, not by `_hm` / `_zone` in the entity ID.
- Boost uses `heating_manager.set_boost` / `clear_boost` (one call, the integration's default temperature and duration).
- Changes show at once and stay until the entity confirms them (Heating Manager refreshes at most every 10 seconds), or go back with a message if Home Assistant rejects them.
- Tap actions use Home Assistant's standard action handling (`hass-action`), so every action type works.
- Card names: "Heating Manager room" and "Heating Manager zone". Room names are shown without their zone.

### Removed
- `heating-manager-ui-editor.js`: the editor is part of `heating-manager-ui.js`. Remove it from your resources if you added it.
- Support for Heating Manager 1.x and 2.x entities. Use version 1.0 of the cards with them.

### Fixed
- The visual editor didn't work (it was never loaded, and its template syntax needs Lit).
- Temperature trends were never shown: the integration reports `heating_rapidly`, `cooling_slowly` and so on.
- Names are escaped.

## [1.0.0] - 2024-10-19

### Added
- Initial release of Heating Room Card
- **Core Features:**
  - Large, easy-to-read current temperature display
  - Target temperature shown in top right
  - Visual heating indicator with color changes
  - Animated status bar (pulses when heating)
  - Time to target temperature display (ETA)
  - Confidence level for ETA estimates
  - Boost mode badge with time remaining
  - Temperature trend indicator (rising/falling/stable)

- **Customization:**
  - Configurable display options (show/hide ETA, boost, trend)
  - Custom tap actions support
  - Custom name override
  - Theme variable support for colors
  - Fully responsive design (mobile + desktop)

- **UI Editor:**
  - Visual configuration editor
  - Entity picker with climate domain filter
  - Toggle switches for feature display
  - Helpful descriptions and tooltips

- **Documentation:**
  - Comprehensive README with examples
  - Quick installation guide (INSTALL.md)
  - 10+ example dashboard configurations
  - 4 example theme configurations
  - Troubleshooting guide
  - Custom variable reference

- **Developer Features:**
  - Vanilla Web Component (no build required)
  - Home Assistant best practices
  - Material Design styling
  - Smooth CSS transitions
  - Console version logging

### Technical Details
- Built as custom element extending HTMLElement
- Uses Shadow DOM for style encapsulation
- Supports Home Assistant 2023.1+
- Compatible with all modern browsers
- No external dependencies

### Data Requirements
Works with Heating Manager integration climate entities that provide:
- `current_temperature` (required)
- `temperature` (required)
- `hvac_action` (required)
- `heating_analytics.estimated_time_to_target.minutes` (optional)
- `heating_analytics.estimated_time_to_target.confidence_percent` (optional)
- `heating_analytics.temperature_trend` (optional)
- `boost.temperature` (optional)
- `boost.time_remaining_minutes` (optional)
