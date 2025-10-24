# Heating Room Card

A beautiful, modern custom Lovelace card for displaying detailed heating information in Home Assistant. This is a **frontend UI component** designed specifically for the [Heating Manager](#heating-manager-dependency) custom component.

## Prerequisites

**⚠️ IMPORTANT:** This card requires the **Heating Manager** custom component to be installed and configured first.

### Required Dependencies

1. **Home Assistant**: 2023.1 or later
2. **[Heating Manager Integration](https://github.com/vatons/heating_manager)**: This custom component **must** be installed and configured
   - The Heating Manager integration creates the climate entities that this card displays
   - Without it, this card will not work
   - See [Heating Manager Dependency](#heating-manager-dependency) section below for details

### Heating Manager Dependency

This card is a **UI component** for the **Heating Manager** custom integration. The Heating Manager integration provides:
- Multi-zone heating management with schedules
- Room-level temperature control and boost functionality
- Climate entities with naming pattern: `climate.<room_id>_hm`
- Heating analytics data (ETA, trends, confidence metrics)
- Smart TRV control and sensor management

**Where to get Heating Manager:**
- **GitHub Repository**: [https://github.com/vatons/heating_manager](https://github.com/vatons/heating_manager)
- Installation: Follow the installation instructions in the Heating Manager README
- Configuration: Create a `heating_manager.yaml` file with your zones and rooms
- Version: 1.0.0 or later required

**Installation Order:**
1. ✅ Install and configure **[Heating Manager](https://github.com/vatons/heating_manager)** integration first
2. ✅ Verify climate entities are created (e.g., `climate.living_room_hm`)
3. ✅ Then install **Heating Room Card** (this component)

## Features

- **Large, easy-to-read temperature display** with current and target temperatures
- **Visual heating indicator** - Status bars change color when actively heating (orange when heating, gray when idle)
- **Boost button with countdown timer** - One-click boost activation with real-time countdown display
- **Zone support** - Works with both room and zone climate entities
- **Tap actions** - Customizable card tap actions (more-info, none, call-service)
- **Fully themed** - Matches Home Assistant's Material Design theme with custom CSS variables
- **Visual configuration editor** - Easy setup through Home Assistant UI
- **Optimistic UI updates** - Immediate visual feedback when activating/deactivating boost

## Card Display

### Heating State (Active)
When the room is actively heating, the card displays:
- **Orange status bars** at top and bottom
- **Current temperature** in large orange text
- **Target temperature** below current temperature
- **Boost button** (rocket icon) in header

### Idle State (Not Heating)
When the room is not heating:
- **Gray status bars**
- **Current temperature** in standard text color
- **Target temperature** below current temperature
- **Boost button** (rocket icon) in header

### Boost Mode Active
When boost is active on a room:
- **Orange countdown timer** button showing time remaining (MM:SS or HH:MM:SS format)
- All heating indicators active
- Clicking the countdown button deactivates boost

### Zone Entities
For zone climate entities (e.g., `climate.downstairs_zone_hm`):
- Same display as rooms
- Boost button shows orange rocket icon when zone has active boosts
- No countdown timer (zones don't have individual boost state)

## Installation

**Before proceeding**: Make sure you have installed and configured the [Heating Manager integration](https://github.com/vatons/heating_manager) first. This card will not work without it.

### Method 1: HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to "Frontend"
3. Click the three dots (⋮) in the top right corner
4. Select "Custom repositories"
5. Add the repository URL: `https://github.com/vatons/heating_manager_ui`
6. Select category: "Lovelace"
7. Click "Add"
8. Find "Heating Room Card" in the Frontend section
9. Click "Download"
10. **Restart Home Assistant**
11. Clear your browser cache (Ctrl+F5 / Cmd+Shift+R)

**Note:** HACS automatically adds the resource to your Lovelace configuration.

### Method 2: Manual Installation

1. Download `heating-room-card.js`
2. Copy it to `/config/www/heating-room-card/heating-room-card.js` in your Home Assistant
3. Add the resource to your Lovelace configuration:

```yaml
resources:
  - url: /local/heating-room-card/heating-room-card.js
    type: module
```

4. Restart Home Assistant
5. Clear your browser cache

## Configuration

### Basic Usage

Add the card to your Lovelace dashboard:

```yaml
type: custom:heating-room-card
entity: climate.living_room_hm
```

### Full Configuration

```yaml
type: custom:heating-room-card
entity: climate.living_room_hm
name: Living Room  # Optional: Override entity name
tap_action:  # Optional: Custom tap action
  action: more-info
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | **Required** | The climate entity ID (e.g., `climate.living_room_hm`) |
| `name` | string | Entity name | Custom name to display in the card header |
| `tap_action` | object | `{action: 'more-info'}` | Action when card is clicked |

### Tap Actions

You can customize what happens when you click the card:

```yaml
tap_action:
  action: more-info  # Opens the entity details dialog
```

```yaml
tap_action:
  action: none  # Disables clicking
```

```yaml
tap_action:
  action: call-service
  service: heating_manager.set_boost
  service_data:
    zone_id: downstairs
    room_id: living_room
    duration: 60
```

## Layout Examples

### Single Room

```yaml
type: custom:heating-room-card
entity: climate.living_room_hm
```

### Grid Layout (Multiple Rooms)

```yaml
type: grid
columns: 2
square: false
cards:
  - type: custom:heating-room-card
    entity: climate.living_room_hm
  - type: custom:heating-room-card
    entity: climate.kitchen_hm
  - type: custom:heating-room-card
    entity: climate.bedroom_hm
  - type: custom:heating-room-card
    entity: climate.office_hm
```

### Vertical Stack (Zone View)

```yaml
type: vertical-stack
cards:
  - type: markdown
    content: "## Downstairs Zone"
  - type: custom:heating-room-card
    entity: climate.living_room_hm
  - type: custom:heating-room-card
    entity: climate.kitchen_hm
  - type: markdown
    content: "## Upstairs Zone"
  - type: custom:heating-room-card
    entity: climate.bedroom_hm
  - type: custom:heating-room-card
    entity: climate.office_hm
```

## Theming

The card uses Home Assistant's CSS variables for theming. You can customize colors in your theme:

```yaml
# Example theme customization
my-theme:
  # Heating color (when actively heating)
  heating-color: "#ff6b35"
  heating-color-light: "#ff8c42"
  heating-color-alpha: "rgba(255, 107, 53, 0.1)"

  # Cool color (for trends)
  cool-color: "#03a9f4"

  # Standard HA variables also apply
  primary-color: "#03a9f4"
  accent-color: "#ff9800"
```

## Data Requirements

This card works with the [Heating Manager integration](https://github.com/vatons/heating_manager) and expects the following attributes on the climate entity:

**Required:**
- `current_temperature` - Current room temperature (number)
- `temperature` - Target temperature (number)
- `hvac_action` - Current action (heating/idle/off)

**Optional (for boost functionality):**
- `boost.temperature` - Boost target temperature (null if boost not active)
- `boost.end_time` - ISO timestamp when boost ends
- `boost.time_remaining_minutes` - Minutes remaining in boost
- `boost.active` - Boolean (for zone entities only)

## Troubleshooting

### Card doesn't appear
1. Check that you've added the resource to your Lovelace configuration
2. Clear your browser cache (Ctrl+F5 / Cmd+Shift+R)
3. Check the browser console for errors (F12)
4. Verify the entity ID exists and is correct

### Boost button doesn't work
1. Make sure you're clicking directly on the rocket icon or countdown timer
2. Check that the Heating Manager integration supports boost for your entity
3. For zones, boost activation works differently than rooms
4. Check browser console (F12) for any error messages

### Countdown timer not updating
- The countdown updates every second when boost is active
- If it's stuck, try refreshing the page (F5)
- Check that the entity's `boost.end_time` attribute is valid

### Card shows "Entity not found"
- **Most Common Cause**: Heating Manager integration is not installed or configured
  - Install from: [https://github.com/vatons/heating_manager](https://github.com/vatons/heating_manager)
  - Verify installation: Go to Settings → Devices & Services, look for "Heating Manager"
- Verify the entity ID is correct (should match pattern: `climate.<room_id>_hm`)
- Check that the Heating Manager integration is loaded and running
- Ensure the entity is available in Developer Tools → States

### Colors don't match my theme
Make sure you've defined the custom CSS variables in your theme (see Theming section above)

## Compatibility

- **Home Assistant**: 2023.1 or later
- **Heating Manager Integration**: **REQUIRED** - [Install from GitHub](https://github.com/vatons/heating_manager) (version 1.0.0+)
- **Browsers**: Chrome, Firefox, Safari, Edge (modern versions)
- **Mobile**: Fully responsive, works on all devices

## Development

Want to contribute or customize the card? Here's the structure:

```
heating_manager_ui/
├── heating-room-card.js         # Main card implementation
├── heating-room-card-editor.js  # Visual configuration editor
├── hacs.json                    # HACS integration metadata
├── info.md                      # HACS store listing
├── README.md                    # This file
├── INSTALL.md                   # Quick installation guide
├── CHANGELOG.md                 # Version history
├── example-dashboard.yaml       # Example Lovelace configurations
└── example-theme.yaml           # Example Home Assistant themes
```

**Technical Details:**
- Built as vanilla Web Components (no build step required)
- Uses Shadow DOM for style encapsulation
- No external dependencies
- Compatible with Home Assistant 2023.1+
- Editor provides visual configuration in HA UI

## Support

For issues, questions, or feature requests:
- **GitHub Issues**: [Your repository URL]
- **Home Assistant Community**: [Forum thread URL]

## License

MIT License - See main project LICENSE file for details

## Changelog

### v1.0.0 (2024-10-19)
- Initial release
- Large temperature display with current and target
- Visual heating status indicator with color-changing status bars
- Boost button with one-click activation
- Real-time countdown timer for active boosts
- Zone entity support
- Tap actions support (more-info, none, call-service)
- Visual configuration editor
- Full theme integration with custom CSS variables
- Optimistic UI updates for boost actions
