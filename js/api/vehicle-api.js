import { validateVehicle } from '../utils/validation.js';

export class VehicleApi {
  constructor(http, vehicleId) { this.http = http; this.vehicleId = Number(vehicleId); }
  async getVehicle() {
    const data = await this.http.get(`/vehiculos/${this.vehicleId}`);
    return validateVehicle(data);
  }
}
