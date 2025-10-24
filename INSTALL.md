# Quick Installation Guide

Follow these steps to install the Heating Room Card in your Home Assistant.

## Prerequisites

**⚠️ IMPORTANT:** Before installing this card, you must first install the Heating Manager integration.

- **Home Assistant**: 2023.1 or later
- **Heating Manager Integration**: **REQUIRED** - [Install from GitHub](https://github.com/vatons/heating_manager)
  - This custom component creates the climate entities that this card displays
  - Without it, this card will not function
  - Follow the installation instructions in the Heating Manager repository
- At least one climate entity from Heating Manager (e.g., `climate.living_room_hm`)

## Installation Steps

### Step 1: Copy the Card Files

Copy the following files to your Home Assistant:

**Option A: Using File Editor or SSH**

1. Create the directory `/config/www/heating-manager-ui/`
2. Copy these files into that directory:
   - `heating-manager-ui.js`
   - `heating-manager-ui-editor.js`

**Option B: Using Samba/Windows File Share**

1. Navigate to your Home Assistant config folder
2. Go to the `www` folder (create it if it doesn't exist)
3. Create a new folder called `heating-manager-ui`
4. Copy the files into this folder

Your file structure should look like:
```
/config/
├── www/
│   └── heating-manager-ui/
│       ├── heating-manager-ui.js
│       └── heating-manager-ui-editor.js
```

### Step 2: Add the Resource to Lovelace

1. Go to **Settings** → **Dashboards** → **Resources** (top right menu)
2. Click **Add Resource**
3. Enter the URL: `/local/heating-manager-ui/heating-manager-ui.js`
4. Select **JavaScript Module** as the type
5. Click **Create**

Alternatively, you can add it manually to your `configuration.yaml`:

```yaml
lovelace:
  mode: yaml
  resources:
    - url: /local/heating-manager-ui/heating-manager-ui.js
      type: module
```

### Step 3: Add the Card Editor Resource

Repeat step 2 for the editor:

1. Go to **Settings** → **Dashboards** → **Resources**
2. Click **Add Resource**
3. Enter the URL: `/local/heating-manager-ui/heating-manager-ui-editor.js`
4. Select **JavaScript Module** as the type
5. Click **Create**

Or add to `configuration.yaml`:

```yaml
lovelace:
  mode: yaml
  resources:
    - url: /local/heating-manager-ui/heating-manager-ui.js
      type: module
    - url: /local/heating-manager-ui/heating-manager-ui-editor.js
      type: module
```

### Step 4: Clear Your Browser Cache

This is **important** - the card won't load without this step!

- **Chrome/Edge**: Press `Ctrl + F5` (Windows) or `Cmd + Shift + R` (Mac)
- **Firefox**: Press `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- **Safari**: Press `Cmd + Option + R`

Or manually:
1. Open Developer Tools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

### Step 5: Add the Card to Your Dashboard

**Option A: Using the UI**

1. Edit your dashboard (three dots → Edit Dashboard)
2. Click **Add Card**
3. Search for "Heating Room Card"
4. Select your climate entity
5. Configure options as desired
6. Click **Save**

**Option B: Using YAML**

1. Edit your dashboard in YAML mode
2. Add this configuration:

```yaml
type: custom:heating-room-card
entity: climate.living_room_hm
```

3. Save the dashboard

### Step 6: Verify Installation

You should now see the card displaying:
- Current temperature (large number)
- Target temperature (top right)
- Status bar at the top (colored when heating)
- ETA when heating (if available)
- Room name in the header

## Troubleshooting

### Card doesn't appear

**Check 1: Resource is loaded**
1. Go to Developer Tools (F12) → Console
2. Look for the message: `HEATING-ROOM-CARD v1.0.0`
3. If you don't see it, the resource isn't loading

**Check 2: Files are in the correct location**
```
/config/www/heating-manager-ui/heating-manager-ui.js
/config/www/heating-manager-ui/heating-manager-ui-editor.js
```

**Check 3: Resource URL is correct**
- Should be `/local/heating-manager-ui/heating-manager-ui.js`
- NOT `/www/heating-manager-ui/heating-manager-ui.js`
- NOT `/config/www/heating-manager-ui/heating-manager-ui.js`

**Check 4: Clear cache**
- Hard refresh your browser (Ctrl+F5)
- Try in an incognito/private window

### Card shows "Entity not found"

**Check 1: Entity exists**
1. Go to **Developer Tools** → **States**
2. Search for your entity (e.g., `climate.living_room_hm`)
3. Verify it exists and has data

**Check 2: Heating Manager is loaded**
1. Go to **Settings** → **Devices & Services**
2. Verify "Heating Manager" is listed
3. If not listed, install it from: [https://github.com/vatons/heating_manager](https://github.com/vatons/heating_manager)
4. Check that climate entities are created

### ETA doesn't show

The ETA section only appears when:
1. The room is actively heating (`hvac_action: heating`)
2. The entity has heating analytics data
3. `show_eta` is set to `true` (default)

To verify analytics are available:
1. Go to **Developer Tools** → **States**
2. Find your climate entity
3. Check for `heating_analytics` in the attributes
4. Look for `estimated_time_to_target.minutes`

If analytics are missing, check your Heating Manager configuration.

### Card looks broken or unstyled

**Check 1: Theme compatibility**
- Try switching to the default Home Assistant theme
- Some custom themes may override colors

**Check 2: Browser compatibility**
- Use a modern browser (Chrome, Firefox, Safari, Edge)
- Update your browser to the latest version

**Check 3: JavaScript errors**
1. Open Developer Tools (F12) → Console
2. Look for red error messages
3. Report the error if it's related to the card

### "Custom element doesn't exist"

This error means the card isn't loaded. Follow these steps:

1. Verify files are in `/config/www/heating-manager-ui/`
2. Check resource is added to Lovelace
3. Clear browser cache completely
4. Restart Home Assistant
5. Hard refresh browser (Ctrl+F5)

## Advanced Setup

### Using with Multiple Homes

If you have multiple Home Assistant instances:

1. Copy the files to each instance's `/config/www/heating-manager-ui/`
2. Add the resources to each instance's Lovelace configuration
3. The card will work independently in each instance

### Version Control

To track which version you have installed:

1. Open the JavaScript file
2. Look for the version number in the console log message
3. Current version: **v1.0.0**

### Updating

To update to a new version:

1. Download the new files
2. Replace the old files in `/config/www/heating-manager-ui/`
3. Increment the resource URL (or clear cache):
   - `/local/heating-manager-ui/heating-manager-ui.js?v=2`
4. Hard refresh your browser

## Getting Help

If you're still having issues:

1. **Check the browser console** (F12 → Console) for error messages
2. **Verify your setup** against this guide
3. **Check the README.md** for additional documentation
4. **Report issues** on GitHub with:
   - Your Home Assistant version
   - Browser and version
   - Console error messages
   - Your card configuration (YAML)

## Next Steps

- Read the [README.md](README.md) for full documentation
- Check [example-dashboard.yaml](example-dashboard.yaml) for layout ideas
- Customize the card with your own tap actions
- Create a custom theme with heating colors

Enjoy your new heating dashboard! 🔥
