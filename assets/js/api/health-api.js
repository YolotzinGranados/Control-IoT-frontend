export class HealthApi {
  constructor(http, path = '/health') { this.http = http; this.path = path; }
  async check() { return this.http.getResult(this.path, { timeoutMs: 7000 }); }
}
