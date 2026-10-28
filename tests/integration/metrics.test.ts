import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { resetMetrics } from "../../src/observability/metrics";

describe("Metrics Endpoint Integration", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("serves Prometheus text exposition format by default", async () => {
    const res = await request(app).get("/metrics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("# HELP http_requests_total");
    expect(res.text).toContain("# TYPE http_requests_total counter");
    expect(res.text).toContain("process_uptime_seconds");
  });

  it("serves JSON format when Accept header requests application/json", async () => {
    const res = await request(app)
      .get("/metrics")
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body).toHaveProperty("service", "amrutam-telemedicine-backend");
    expect(res.body).toHaveProperty("totalRequests");
    expect(res.body).toHaveProperty("latencyMs");
    expect(res.body).toHaveProperty("process");
  });

  it("updates request metrics after hitting API endpoints", async () => {
    // Hit health endpoint
    await request(app).get("/health/live");

    const res = await request(app)
      .get("/metrics")
      .set("Accept", "application/json");

    expect(res.body.totalRequests).toBeGreaterThanOrEqual(1);
    expect(res.body.requestsByMethodAndStatus).toHaveProperty(
      "GET /health/live 200",
      1,
    );
  });
});
