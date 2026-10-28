import { beforeEach, describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { EventEmitter } from "node:events";
import {
  getMetricsAsJson,
  getMetricsAsText,
  metricsMiddleware,
  normalizePath,
  resetMetrics,
} from "../metrics";

describe("Observability Metrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe("normalizePath", () => {
    it("preserves static routes", () => {
      expect(normalizePath("/health/live")).toBe("/health/live");
      expect(normalizePath("/api/v1/auth/login")).toBe("/api/v1/auth/login");
    });

    it("replaces UUIDs with :id to prevent high cardinality", () => {
      const path = "/api/v1/doctors/9485df6c-d499-455b-bd62-541b80750b23/availability";
      expect(normalizePath(path)).toBe("/api/v1/doctors/:id/availability");
    });

    it("strips query strings", () => {
      const path = "/api/v1/doctors?specialization=Cardiology&minFee=100";
      expect(normalizePath(path)).toBe("/api/v1/doctors");
    });

    it("replaces integer path parameters with :id", () => {
      const path = "/api/v1/users/12345/profile";
      expect(normalizePath(path)).toBe("/api/v1/users/:id/profile");
    });
  });

  describe("metricsMiddleware", () => {
    function createMockReqRes(path: string, method: string, statusCode: number) {
      const req = {
        path,
        method,
        baseUrl: "",
      } as unknown as Request;

      const resEmitter = new EventEmitter();
      const res = Object.assign(resEmitter, {
        statusCode,
      }) as unknown as Response;

      return { req, res, resEmitter };
    }

    it("ignores /metrics endpoint itself", () => {
      const { req, res } = createMockReqRes("/metrics", "GET", 200);
      let nextCalled = false;

      metricsMiddleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(getMetricsAsJson().totalRequests).toBe(0);
    });

    it("records requests and latency upon response completion", () => {
      const { req, res, resEmitter } = createMockReqRes("/api/v1/doctors", "GET", 200);

      metricsMiddleware(req, res, () => {});
      expect(getMetricsAsJson().activeRequests).toBe(1);

      resEmitter.emit("finish");

      const metrics = getMetricsAsJson();
      expect(metrics.activeRequests).toBe(0);
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.requestsByMethodAndStatus["GET /api/v1/doctors 200"]).toBe(1);
    });

    it("counts errors for status >= 400", () => {
      const { req, res, resEmitter } = createMockReqRes("/api/v1/auth/login", "POST", 401);

      metricsMiddleware(req, res, () => {});
      resEmitter.emit("finish");

      const metrics = getMetricsAsJson();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.requestsByMethodAndStatus["POST /api/v1/auth/login 401"]).toBe(1);
    });
  });

  describe("Exposition formats", () => {
    it("exports metrics in standard Prometheus text format", () => {
      const text = getMetricsAsText();
      expect(text).toContain("# HELP http_requests_total");
      expect(text).toContain("# TYPE http_requests_total counter");
      expect(text).toContain("# HELP process_uptime_seconds");
      expect(text).toContain("# TYPE http_request_duration_seconds histogram");
    });

    it("exports metrics in JSON format with process and latency details", () => {
      const json = getMetricsAsJson();
      expect(json.service).toBe("amrutam-telemedicine-backend");
      expect(typeof json.uptimeSeconds).toBe("number");
      expect(json.latencyMs).toHaveProperty("avgDurationMs");
      expect(json.latencyMs).toHaveProperty("p95Ms");
      expect(json.process).toHaveProperty("heapUsedBytes");
    });
  });
});
