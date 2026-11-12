export class DemoApi {
  constructor(http, vehicleId) {
    this.http = http;
    this.vehicleId = Number(vehicleId);
  }

  async getDemos() {
    return this.http.get(
      `/vehiculos/${this.vehicleId}/demos`
    );
  }

  async startDemo(demoId) {
    return this.http.post(
      `/vehiculos/${this.vehicleId}/demos/${Number(demoId)}/iniciar`,
      undefined,
      {
        timeoutMs: 12000,
      }
    );
  }

  async cancelDemo() {
    return this.http.post(
      `/vehiculos/${this.vehicleId}/demos/cancelar`,
      undefined,
      {
        timeoutMs: 12000,
      }
    );
  }
}