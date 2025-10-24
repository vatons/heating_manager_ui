/**
 * Heating Room Card for Home Assistant
 *
 * A custom Lovelace card for displaying detailed heating information per room
 * including current temperature, target temperature, time to reach target,
 * and visual indicators for heating status.
 */

class HeatingRoomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('Please define an entity');
    }

    this.config = {
      entity: config.entity,
      name: config.name,
      tap_action: config.tap_action || { action: 'more-info' }
    };
  }

  set hass(hass) {
    this._hass = hass;

    const entity = hass.states[this.config.entity];
    if (!entity) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div class="card-content">
            <div class="unavailable">Entity ${this.config.entity} not found</div>
          </div>
        </ha-card>
      `;
      return;
    }

    // Check if we need to re-render based on specific values
    const currentTemp = entity.attributes.current_temperature;
    const targetTemp = entity.attributes.temperature;
    const boostEnabled = entity.attributes.boost?.temperature !== null && entity.attributes.boost?.temperature !== undefined;
    const hvacAction = entity.attributes.hvac_action;

    // If boost is enabled, ensure we have an expiry time and countdown timer
    if (boostEnabled) {
      // Set expiry time if we don't have one (page load or boost just enabled)
      if (!this._boostExpiryTime) {
        // Use the precise end_time from backend if available, otherwise calculate from minutes
        const endTimeStr = entity.attributes.boost?.end_time;
        if (endTimeStr) {
          this._boostExpiryTime = new Date(endTimeStr).getTime();
        } else {
          const boostTimeRemaining = entity.attributes.boost?.time_remaining_minutes || 30;
          this._boostExpiryTime = Date.now() + (boostTimeRemaining * 60 * 1000);
        }
      }

      // Start a timer to update just the countdown display every second
      if (!this._countdownInterval) {
        this._countdownInterval = setInterval(() => {
          this._updateCountdownDisplay();
        }, 1000);
      }
    }

    // If boost just became disabled, clear the expiry time and stop countdown
    if (!boostEnabled && this._previousValues && this._previousValues.boostEnabled) {
      this._boostExpiryTime = null;
      if (this._countdownInterval) {
        clearInterval(this._countdownInterval);
        this._countdownInterval = null;
      }
    }

    // Only re-render if one of the key values has changed
    if (!this._previousValues ||
        currentTemp !== this._previousValues.currentTemp ||
        targetTemp !== this._previousValues.targetTemp ||
        boostEnabled !== this._previousValues.boostEnabled ||
        hvacAction !== this._previousValues.hvacAction) {

      // Store current values for next comparison
      this._previousValues = {
        currentTemp,
        targetTemp,
        boostEnabled,
        hvacAction
      };

      this.render(entity);
    }
  }

  disconnectedCallback() {
    // Clean up intervals when card is removed
    if (this._renderInterval) {
      clearInterval(this._renderInterval);
      this._renderInterval = null;
    }
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
  }

  _updateCountdownDisplay() {
    // Update only the countdown text in the boost button
    const boostBtn = this.shadowRoot.querySelector('#boost-btn');
    if (boostBtn && this._boostExpiryTime) {
      const remainingSeconds = this._getBoostTimeRemaining();
      if (remainingSeconds > 0) {
        const span = boostBtn.querySelector('span');
        if (span) {
          span.textContent = this._formatBoostCountdown(remainingSeconds);
        }
      } else {
        // Boost has expired
        boostBtn.innerHTML = '<ha-icon icon="mdi:rocket-launch"></ha-icon>';
        if (this._countdownInterval) {
          clearInterval(this._countdownInterval);
          this._countdownInterval = null;
        }
      }
    }
  }

  _getBoostTimeRemaining() {
    if (!this._boostExpiryTime) return null;

    const now = Date.now();
    const remainingMs = this._boostExpiryTime - now;

    if (remainingMs <= 0) return 0;

    return Math.floor(remainingMs / 1000); // Return total seconds remaining
  }

  _formatBoostCountdown(totalSeconds) {
    if (!totalSeconds && totalSeconds !== 0) return null;

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // If 60 minutes or more, show hh:mm:ss format
    if (totalSeconds >= 3600) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // If less than 60 minutes, show mm:ss format
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  render(entity) {
    const currentTemp = entity.attributes.current_temperature;
    const targetTemp = entity.attributes.temperature;
    const hvacAction = entity.attributes.hvac_action || 'idle';
    const isHeating = hvacAction === 'heating';

    // Check if this is a zone entity (not a room)
    const isZone = this.config.entity.includes('_zone_hm') || this.config.entity.includes('_zone');

    // Get heating analytics
    const analytics = entity.attributes.heating_analytics || {};
    const etaMinutes = analytics.estimated_time_to_target?.minutes;
    const confidence = analytics.estimated_time_to_target?.confidence_percent;
    const trend = analytics.temperature_trend;

    // Get boost information
    const boost = entity.attributes.boost || {};
    // For zones: check boost.active, for rooms: check boost.temperature
    const isBoost = isZone ? boost.active === true : (boost.temperature !== null && boost.temperature !== undefined);
    const boostTimeRemaining = this._getBoostTimeRemaining();

    // Use optimistic boost state if actual state hasn't updated yet
    const isBoostActive = isBoost || this._optimisticBoostActive;

    // Clear optimistic state once actual state confirms boost
    if (isBoost && this._optimisticBoostActive) {
      this._optimisticBoostActive = false;
    }

    // Determine card state class
    const stateClass = isHeating ? 'heating' : 'idle';

    // Get friendly name
    const name = this.config.name || entity.attributes.friendly_name || 'Room';

    this.shadowRoot.innerHTML = `
      <style>
        ha-card {
          cursor: pointer;
          overflow: hidden;
          position: relative;
          transition: all 0.3s ease;
        }

        ha-card:hover {
          box-shadow: var(--ha-card-box-shadow, 0 4px 8px rgba(0,0,0,0.1));
        }

        .card-content {
          padding: 16px;
          position: relative;
        }

        /* Status indicator bar */
        .status-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          transition: background-color 0.3s ease;
        }

        .status-bar.bottom {
          top: auto;
          bottom: 0;
        }

        .status-bar.heating {
          background: linear-gradient(90deg,
            var(--heating-color, #ff6b35) 0%,
            var(--heating-color-light, #ff8c42) 100%);
          animation: pulse 2s ease-in-out infinite;
        }

        .status-bar.idle {
          background-color: var(--disabled-text-color, #bbb);
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        /* Header */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          margin-top: 4px;
          gap: 8px;
        }

        .room-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color);
          opacity: 0.8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
        }

        .boost-badge {
          background-color: var(--accent-color, #03a9f4);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Temperature Display */
        .temperature-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .current-temp {
          font-size: 52px;
          font-weight: 300;
          line-height: 1;
          transition: color 0.3s ease;
        }

        .current-temp.heating {
          color: var(--heating-color, #ff6b35);
        }

        .current-temp.idle {
          color: var(--primary-text-color);
        }

        .temp-unit {
          font-size: 26px;
          font-weight: 300;
          margin-left: 4px;
          opacity: 0.6;
        }

        .target-temp {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: var(--secondary-text-color);
          opacity: 0.8;
        }

        .target-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .target-value {
          font-size: 18px;
          font-weight: 500;
          color: var(--primary-text-color);
        }

        /* ETA Display */
        .eta-container {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background-color: var(--heating-color-alpha, rgba(255, 107, 53, 0.1));
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .eta-container.idle {
          background-color: var(--secondary-background-color, #f5f5f5);
        }

        .eta-icon {
          font-size: 20px;
        }

        .eta-content {
          flex: 1;
        }

        .eta-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.7;
          margin-bottom: 2px;
        }

        .eta-value {
          font-size: 16px;
          font-weight: 500;
        }

        .eta-confidence {
          font-size: 11px;
          opacity: 0.6;
          margin-top: 2px;
        }

        /* Info Row */
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid var(--divider-color, #e0e0e0);
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--secondary-text-color);
        }

        .trend-icon {
          font-size: 16px;
        }

        .trend-icon.rising {
          color: var(--heating-color, #ff6b35);
        }

        .trend-icon.falling {
          color: var(--cool-color, #03a9f4);
        }

        .trend-icon.stable {
          color: var(--secondary-text-color);
        }

        .status-text {
          font-size: 13px;
          font-weight: 500;
        }

        .status-text.heating {
          color: var(--heating-color, #ff6b35);
        }

        .status-text.idle {
          color: var(--secondary-text-color);
          opacity: 0.7;
        }

        .unavailable {
          padding: 16px;
          text-align: center;
          color: var(--error-color, #f44336);
        }

        /* Boost Button */
        .boost-button {
          background-color: transparent;
          color: var(--primary-text-color);
          border: none;
          padding: 0;
          border-radius: 20px;
          font-size: 18px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          flex-shrink: 0;
          min-width: 40px;
          height: 34px;
        }

        .boost-button.active {
          background-color: var(--heating-color, #ff6b35);
          color: white;
          padding: 0 12px;
          font-size: 12px;
        }

        .boost-button:active {
          transform: scale(0.95);
        }

        /* Boost Dialog */
        .boost-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .boost-dialog {
          background-color: var(--card-background-color, white);
          border-radius: 12px;
          padding: 24px;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .boost-dialog-header {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 20px;
          color: var(--primary-text-color);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .boost-dialog-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--primary-text-color);
          opacity: 0.8;
        }

        .form-input {
          padding: 12px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 8px;
          font-size: 16px;
          background-color: var(--card-background-color, white);
          color: var(--primary-text-color);
          font-family: inherit;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--accent-color, #03a9f4);
          box-shadow: 0 0 0 2px rgba(3, 169, 244, 0.1);
        }

        .boost-dialog-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .dialog-button {
          flex: 1;
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .dialog-button-primary {
          background-color: var(--accent-color, #03a9f4);
          color: white;
        }

        .dialog-button-primary:hover {
          background-color: var(--accent-color-dark, #0288d1);
        }

        .dialog-button-secondary {
          background-color: var(--secondary-background-color, #f5f5f5);
          color: var(--primary-text-color);
        }

        .dialog-button-secondary:hover {
          background-color: var(--divider-color, #e0e0e0);
        }

        .dialog-button:active {
          transform: scale(0.98);
        }
      </style>

      <ha-card>
        <div class="status-bar ${stateClass}"></div>
        <div class="card-content">
          <!-- Header -->
          <div class="header">
            <div class="room-name">${name}</div>
            <button class="boost-button ${isBoostActive && !isZone ? 'active' : ''}" id="boost-btn">
              ${isBoostActive && boostTimeRemaining && !isZone ?
                `<span>${this._formatBoostCountdown(boostTimeRemaining)}</span>` :
                `<ha-icon icon="mdi:rocket-launch" ${isBoostActive && isZone ? 'style="color: var(--heating-color, #ff6b35);"' : ''}></ha-icon>`
              }
            </button>
          </div>

          <!-- Temperature Display -->
          <div class="temperature-container">
            <div class="current-temp ${stateClass}">
              ${currentTemp !== null && currentTemp !== undefined ? currentTemp.toFixed(1) : '--'}
              <span class="temp-unit">°C</span>
            </div>
            <div class="target-temp">
              <span class="target-label">Target:</span>
              <span class="target-value">
                ${targetTemp !== null && targetTemp !== undefined ? targetTemp.toFixed(1) : '--'}°C
              </span>
            </div>
          </div>

        </div>
        <div class="status-bar bottom ${stateClass}"></div>
      </ha-card>

      <!-- Boost Dialog (hidden by default) -->
      <div class="boost-dialog-overlay" id="boost-dialog" style="display: none;">
        <div class="boost-dialog" id="boost-dialog-content">
          <!-- Content will be dynamically inserted based on boost state -->
        </div>
      </div>
    `;

    // Add tap action for the card
    const card = this.shadowRoot.querySelector('ha-card');
    card.addEventListener('click', (e) => {
      // Don't trigger card action if clicking boost button
      if (e.target.closest('.boost-button')) {
        return;
      }
      this._handleTapAction();
    });

    // Add boost button handler
    const boostBtn = this.shadowRoot.querySelector('#boost-btn');

    boostBtn.addEventListener('click', (e) => {
      e.stopPropagation();

      // Check current boost state and activate/deactivate immediately
      if (isBoost) {
        this._deactivateBoost();
      } else {
        this._activateBoost(targetTemp, currentTemp);
      }
    });
  }

  _activateBoost(targetTemp, currentTemp) {
    // Check if this is a zone entity
    const isZone = this.config.entity.includes('_zone_hm') || this.config.entity.includes('_zone');

    // Set optimistic boost state
    this._optimisticBoostActive = true;

    // Immediately update UI optimistically
    const boostBtn = this.shadowRoot.querySelector('#boost-btn');
    if (boostBtn) {
      if (isZone) {
        // For zones: show orange rocket, no background
        boostBtn.innerHTML = '<ha-icon icon="mdi:rocket-launch" style="color: var(--heating-color, #ff6b35);"></ha-icon>';
      } else {
        // For rooms: show countdown with orange background
        boostBtn.classList.add('active');
        const span = boostBtn.querySelector('span');
        if (span) {
          // Set initial countdown (30 minutes)
          this._boostExpiryTime = Date.now() + (30 * 60 * 1000);
          span.textContent = this._formatBoostCountdown(30 * 60);

          // Start countdown timer
          if (!this._countdownInterval) {
            this._countdownInterval = setInterval(() => {
              this._updateCountdownDisplay();
            }, 1000);
          }
        }
      }
    }

    // Use default boost settings: target temp + 2°C (or 22°C if no target), 30 minutes
    const boostTemp = targetTemp ? targetTemp + 2 : 22;
    const boostDuration = 30;

    // Call the Home Assistant service to set boost
    this._hass.callService('climate', 'set_preset_mode', {
      entity_id: this.config.entity,
      preset_mode: 'boost'
    }).then(() => {
      // Set the boost temperature and duration
      return this._hass.callService('climate', 'set_temperature', {
        entity_id: this.config.entity,
        temperature: boostTemp
      });
    }).catch(error => {
      console.error('Error activating boost:', error);
      // Revert UI on error
      if (boostBtn) {
        boostBtn.classList.remove('active');
        boostBtn.innerHTML = '<ha-icon icon="mdi:rocket-launch"></ha-icon>';
        if (this._countdownInterval) {
          clearInterval(this._countdownInterval);
          this._countdownInterval = null;
        }
        this._boostExpiryTime = null;
      }
    });
  }

  _deactivateBoost() {
    // Clear optimistic boost state
    this._optimisticBoostActive = false;

    // Immediately update UI optimistically
    const boostBtn = this.shadowRoot.querySelector('#boost-btn');
    if (boostBtn) {
      boostBtn.classList.remove('active');
      boostBtn.innerHTML = '<ha-icon icon="mdi:rocket-launch"></ha-icon>';
    }

    // Stop countdown timer
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
    this._boostExpiryTime = null;

    // Call the Home Assistant service to turn off boost
    // This will return to the schedule preset mode
    this._hass.callService('climate', 'set_preset_mode', {
      entity_id: this.config.entity,
      preset_mode: 'schedule'
    }).catch(error => {
      console.error('Error deactivating boost:', error);
      // Could optionally revert UI on error, but likely better to leave it off
    });
  }

  _formatETA(minutes) {
    if (minutes < 1) return 'Less than 1 min';
    if (minutes < 60) return `${Math.round(minutes)} min`;

    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);

    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }

  _getTrendIcon(trend) {
    switch (trend) {
      case 'rising': return '↗';
      case 'falling': return '↘';
      case 'stable': return '→';
      default: return '—';
    }
  }

  _getTrendText(trend) {
    switch (trend) {
      case 'rising': return 'Rising';
      case 'falling': return 'Falling';
      case 'stable': return 'Stable';
      default: return 'Unknown';
    }
  }

  _handleTapAction() {
    const action = this.config.tap_action;

    if (!action || action.action === 'none') {
      return;
    }

    const event = new Event('hass-action', {
      bubbles: true,
      composed: true,
    });

    event.detail = {
      config: this.config,
      action: action.action || 'more-info',
      entity: this.config.entity,
    };

    this.dispatchEvent(event);

    // Fallback for more-info
    if (action.action === 'more-info') {
      const moreInfoEvent = new Event('hass-more-info', {
        bubbles: true,
        composed: true,
      });
      moreInfoEvent.detail = { entityId: this.config.entity };
      this.dispatchEvent(moreInfoEvent);
    }
  }

  getCardSize() {
    return 3;
  }

  static getConfigElement() {
    return document.createElement('heating-room-card-editor');
  }

  static getStubConfig() {
    return {
      entity: 'climate.living_room_hm'
    };
  }
}

customElements.define('heating-room-card', HeatingRoomCard);

// Register the card with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'heating-room-card',
  name: 'Heating Room Card',
  description: 'A custom card for displaying detailed heating information per room',
  preview: true,
  documentationURL: 'https://github.com/your-repo/heating-room-card',
});

console.info(
  '%c HEATING-ROOM-CARD %c v1.0.0 ',
  'color: white; background: #ff6b35; font-weight: bold;',
  'color: #ff6b35; background: white; font-weight: bold;'
);
