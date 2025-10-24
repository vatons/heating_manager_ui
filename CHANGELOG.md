# Changelog

All notable changes to the Heating Room Card will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [Unreleased]

### Planned Features
- Multi-language support (i18n)
- Customizable units (°C/°F)
- Graph view option (temperature over time)
- Compact mode for smaller displays
- Advanced animations (temperature change visualization)
- Custom icon support
- More tap action options (hold, double-tap)
- Card templates/presets
- HACS integration

### Under Consideration
- Weekly/monthly heating statistics
- Energy consumption display (if available)
- Predictive ETA improvements
- Voice control indicators
- Schedule visualization
- Zone grouping support
- Drag-to-set temperature
- Color gradients based on temperature delta

## Future Versions

### [1.1.0] - Planned
- Multi-language support
- °F unit support
- Compact display mode
- Additional tap actions (hold, double-tap)

### [1.2.0] - Planned
- Temperature history graph
- Energy consumption display
- Advanced animations
- Custom icons

### [2.0.0] - Future
- Complete redesign with more layout options
- Schedule timeline visualization
- Advanced statistics and analytics
- Mobile app integration

## Version History

- **v1.0.0** (2024-10-19) - Initial release

---

## How to Update

### Updating from Future Versions

When a new version is released:

1. **Download new files:**
   - Download updated `heating-room-card.js`
   - Download updated `heating-room-card-editor.js` (if changed)

2. **Replace old files:**
   - Replace files in `/config/www/heating-room-card/`

3. **Clear cache:**
   - Method 1: Hard refresh browser (Ctrl+F5)
   - Method 2: Add version to resource URL:
     ```
     /local/heating-room-card/heating-room-card.js?v=1.1.0
     ```

4. **Check changelog:**
   - Review breaking changes
   - Update configuration if needed
   - Test card functionality

5. **Verify installation:**
   - Check browser console for version number
   - Confirm all features work as expected

### Breaking Changes

This section will list any breaking changes in future versions that require configuration updates.

**v1.0.0:** No breaking changes (initial release)

---

## Support

Report issues or request features:
- GitHub Issues: [Your repository URL]
- Home Assistant Community: [Forum thread URL]

## License

MIT License - See LICENSE file for details
