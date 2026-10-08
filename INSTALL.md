# Installing the Heating Manager cards

You need Home Assistant 2025.7 or later and the [Heating Manager](https://github.com/vatons/heating_manager) integration, version 3.2 or later, set up with at least one zone.

## HACS

1. In HACS, open the menu (⋮) → **Custom repositories**, add `https://github.com/vatons/heating_manager_ui` with type **Dashboard**.
2. Search for **Heating Manager cards** and download it. HACS adds the dashboard resource.
3. Reload your browser.

## Manual

1. Copy `heating-manager-ui.js` to `/config/www/heating-manager-ui.js`.
2. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**. Enter `/local/heating-manager-ui.js`, choose **JavaScript module**, and select **Create**.
3. Reload your browser.

If you're upgrading from version 1.0, remove the `heating-manager-ui-editor.js` resource: the editor is now part of `heating-manager-ui.js`.

## Add a card

1. Edit a dashboard and choose **Add card**.
2. Choose **By card** and search for **Heating Manager**.
3. Pick **Heating Manager room** or **Heating Manager zone** and choose the room or zone.

## Check it's loaded

Open the browser's developer console (F12). You should see `HEATING-MANAGER-UI v2.0.0`. If you see an older version or nothing, clear the browser cache and reload.

If the card picker doesn't list the cards, check the resource URL under **Settings → Dashboards → Resources**.
