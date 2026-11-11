import { validateMovementResponse } from '../utils/validation.js';

export class CommandApi {
  constructor(http, vehicleId, origin = 'WEB') { this.http = http; this.vehicleId = Number(vehicleId); this.origin = origin; }
  async getCommands() { return this.http.get(`/vehiculos/${this.vehicleId}/comandos`); }
  async executeMovement(commandId) {
    const data = await this.http.post(`/vehiculos/${this.vehicleId}/movimientos`, {
      id_comando: Number(commandId),
      origen: this.origin,
    }, { auth: true, timeoutMs: 12000 });
    return validateMovementResponse(data);
  }
}
