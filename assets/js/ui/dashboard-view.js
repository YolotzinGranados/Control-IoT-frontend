import { $, setText } from '../utils/dom.js';

export class DashboardView {
  constructor() {
    this.vehicleName = $('#vehicle-name');
    this.vehicleMeta = $('#vehicle-meta');
    this.vehicleStateChip = $('#vehicle-state-chip');
    this.vehicleStateText = $('#vehicle-state-text');
    this.globalAlert = $('#global-alert');
  }

  renderVehicle(vehicle) {
    setText(this.vehicleName, vehicle.nombre);
    const details = [vehicle.modelo, vehicle.microcontrolador].filter(Boolean).join(' · ');
    setText(this.vehicleMeta, `ID ${vehicle.id_vehiculo}${details ? ` · ${details}` : ''}`);
    this.setPhysicalState();
  }

  setPhysicalState() {
    // El backend actual no expone una señal de presencia autenticada del ESP8266/ESP32.
    this.vehicleStateChip.dataset.state = 'unknown';
    setText(this.vehicleStateText, 'ESP8266/ESP32: sin señal verificable');
  }

  showGlobalAlert(message) {
    setText(this.globalAlert, message);
    this.globalAlert.hidden = !message;
  }
}
