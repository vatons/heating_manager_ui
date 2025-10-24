/**
 * Visual Editor for Heating Room Card
 *
 * Provides a user-friendly interface for configuring the heating room card
 * directly in the Home Assistant UI.
 */

class HeatingRoomCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = config;
    this.render();
  }

  set hass(hass) {
    this._hass = hass; 

    // Update entity selector if needed
    if (!this._config) {
      this._config = {};
    }
  }

  configChanged(newConfig) {
    const event = new Event('config-changed', {
      bubbles: true,
      composed: true,
    });
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
  }

  render() {
    if (!this._hass || !this._config) {
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        .card-config {
          padding: 16px;
        }

        .config-row {
          display: flex;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--divider-color);
        }

        .config-row:last-child {
          border-bottom: none;
        }

        .config-label {
          flex: 1;
          font-weight: 500;
          color: var(--primary-text-color);
        }

        .config-description {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }

        .config-value {
          flex: 0 0 auto;
        }

        ha-entity-picker,
        ha-textfield {
          width: 100%;
          max-width: 300px;
        }

        .section-header {
          font-size: 16px;
          font-weight: 600;
          margin-top: 24px;
          margin-bottom: 12px;
          color: var(--primary-text-color);
        }

        .section-header:first-child {
          margin-top: 0;
        }

        .help-text {
          font-size: 13px;
          color: var(--secondary-text-color);
          font-style: italic;
          margin-top: 8px;
          padding: 8px;
          background-color: var(--secondary-background-color);
          border-radius: 4px;
        }

        mwc-button {
          margin-top: 16px;
        }
      </style>

      <div class="card-config">
        <!-- Entity Selection -->
        <div class="section-header">Required Settings</div>

        <div class="config-row">
          <div style="flex: 1;">
            <div class="config-label">Entity</div>
            <div class="config-description">
              Select the climate entity to display
            </div>
          </div>
        </div>
        <div class="config-row">
          <div style="flex: 1;">
            <ha-entity-picker
              .hass="${this._hass}"
              .value="${this._config.entity || ''}"
              .includeDomains="${['climate']}"
              @value-changed="${this._entityChanged}"
              allow-custom-entity
            ></ha-entity-picker>
          </div>
        </div>

        <!-- Display Options -->
        <div class="section-header">Display Options</div>

        <div class="config-row">
          <div style="flex: 1;">
            <div class="config-label">Custom Name</div>
            <div class="config-description">
              Override the entity's friendly name (optional)
            </div>
          </div>
        </div>
        <div class="config-row">
          <div style="flex: 1;">
            <ha-textfield
              .value="${this._config.name || ''}"
              @input="${this._nameChanged}"
              placeholder="Leave empty to use entity name"
            ></ha-textfield>
          </div>
        </div>

        <!-- Help Text -->
        <div class="help-text">
          💡 This card requires a Heating Manager climate entity. Make sure your entity has the following attributes:
          <code>current_temperature</code>, <code>temperature</code>, and <code>hvac_action</code>.
          <br><br>
          Optional boost attributes: <code>boost.temperature</code>, <code>boost.end_time</code>
        </div>
      </div>
    `;
  }

  _entityChanged(ev) {
    if (!this._config || !this._hass) {
      return;
    }

    const newConfig = {
      ...this._config,
      entity: ev.detail.value,
    };

    this._config = newConfig;
    this.configChanged(newConfig);
    this.render();
  }

  _nameChanged(ev) {
    if (!this._config || !this._hass) {
      return;
    }

    const newConfig = {
      ...this._config,
      name: ev.target.value || undefined,
    };

    this._config = newConfig;
    this.configChanged(newConfig);
  }
}

customElements.define('heating-room-card-editor', HeatingRoomCardEditor);
