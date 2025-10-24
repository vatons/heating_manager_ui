# Heating Room Card

A beautiful, modern custom Lovelace card for displaying detailed heating information in Home Assistant.

**⚠️ REQUIRES:** [Heating Manager Integration](https://github.com/vatons/heating_manager) must be installed first.

## Key Features

- 🌡️ **Large temperature display** with current and target temperatures
- 🔥 **Visual heating indicator** - Color-changing status bars (orange when heating)
- 🚀 **Boost button** - One-click boost activation with countdown timer
- 🏠 **Zone support** - Works with room and zone climate entities
- 🎨 **Fully themed** - Custom CSS variables for easy theming
- ⚡ **Optimistic UI** - Immediate visual feedback

## Quick Start

1. Install [Heating Manager](https://github.com/vatons/heating_manager) integration
2. Add this repository to HACS
3. Add to your Lovelace dashboard:

```yaml
type: custom:heating-room-card
entity: climate.living_room_hm
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `entity` | string | Yes | Climate entity ID |
| `name` | string | No | Custom display name |
| `tap_action` | object | No | Card tap action |

See [README](https://github.com/vatons/heating_manager_ui) for full documentation.
