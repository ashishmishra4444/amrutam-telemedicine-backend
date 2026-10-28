import type { Request, Response, NextFunction } from "express";

export interface LatencyStats {
  count: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface MetricsSnapshot {
  service: string;
  uptimeSeconds: number;
  activeRequests: number;
  totalRequests: number;
  totalErrors: number;
  requestsByMethodAndStatus: Record<string, number>;
  latencyMs: LatencyStats;
  process: {
    heapUsedBytes: number;
    heapTotalBytes: number;
    rssBytes: number;
    externalBytes: number;
  };
}

const PROMETHEUS_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
];

// In-memory metrics state
let activeRequests = 0;
let totalRequests = 0;
let totalErrors = 0;
const requestsByRouteStatus = new Map<string, number>();

// Latency tracking
const durationsMs: number[] = [];
const MAX_RECORDED_DURATIONS = 10_000;
let minDurationMs = Number.POSITIVE_INFINITY;
let maxDurationMs = 0;
let sumDurationMs = 0;

const bucketCounts = new Map<number, number>(
  PROMETHEUS_BUCKETS_SECONDS.map((b) => [b, 0]),
);

/**
 * Normalizes URL paths by replacing UUIDs and numeric IDs to prevent metric cardinality explosion.
 */
export function normalizePath(urlPath: string): string {
  const pathWithoutQuery = urlPath.split("?")[0] || "/";

  return pathWithoutQuery
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ":id",
    )
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Express middleware to record request counts, status codes, and latency metrics.
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Exclude /metrics itself from metric counting to avoid skewing stats
  if (req.path === "/metrics") {
    next();
    return;
  }

  const startNanos = process.hrtime.bigint();
  activeRequests++;

  res.on("finish", () => {
    activeRequests = Math.max(0, activeRequests - 1);
    totalRequests++;

    const endNanos = process.hrtime.bigint();
    const durationMs = Number(endNanos - startNanos) / 1_000_000;
    const durationSeconds = durationMs / 1000;

    const method = req.method.toUpperCase();
    const route = normalizePath(req.baseUrl ? `${req.baseUrl}${req.path}` : req.path);
    const statusCode = res.statusCode;

    const key = `${method} ${route} ${statusCode}`;
    requestsByRouteStatus.set(key, (requestsByRouteStatus.get(key) ?? 0) + 1);

    if (statusCode >= 400) {
      totalErrors++;
    }

    // Update latency stats
    sumDurationMs += durationMs;
    if (durationMs < minDurationMs) minDurationMs = durationMs;
    if (durationMs > maxDurationMs) maxDurationMs = durationMs;

    if (durationsMs.length < MAX_RECORDED_DURATIONS) {
      durationsMs.push(durationMs);
    } else {
      // Ring-buffer like replacement
      durationsMs[totalRequests % MAX_RECORDED_DURATIONS] = durationMs;
    }

    // Update Prometheus histogram buckets
    for (const bucket of PROMETHEUS_BUCKETS_SECONDS) {
      if (durationSeconds <= bucket) {
        bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
      }
    }
  });

  next();
}

/**
 * Returns structured metrics as a JSON-serializable snapshot.
 */
export function getMetricsAsJson(): MetricsSnapshot {
  const sortedDurations = [...durationsMs].sort((a, b) => a - b);
  const mem = process.memoryUsage();

  const count = durationsMs.length;
  const avgDurationMs = count > 0 ? Number((sumDurationMs / totalRequests).toFixed(2)) : 0;

  const latency: LatencyStats = {
    count: totalRequests,
    totalDurationMs: Number(sumDurationMs.toFixed(2)),
    minDurationMs: minDurationMs === Number.POSITIVE_INFINITY ? 0 : Number(minDurationMs.toFixed(2)),
    maxDurationMs: Number(maxDurationMs.toFixed(2)),
    avgDurationMs,
    p50Ms: Number(calculatePercentile(sortedDurations, 50).toFixed(2)),
    p90Ms: Number(calculatePercentile(sortedDurations, 90).toFixed(2)),
    p95Ms: Number(calculatePercentile(sortedDurations, 95).toFixed(2)),
    p99Ms: Number(calculatePercentile(sortedDurations, 99).toFixed(2)),
  };

  const requestsByMap: Record<string, number> = {};
  for (const [k, v] of requestsByRouteStatus.entries()) {
    requestsByMap[k] = v;
  }

  return {
    service: "amrutam-telemedicine-backend",
    uptimeSeconds: Math.floor(process.uptime()),
    activeRequests,
    totalRequests,
    totalErrors,
    requestsByMethodAndStatus: requestsByMap,
    latencyMs: latency,
    process: {
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      rssBytes: mem.rss,
      externalBytes: mem.external,
    },
  };
}

/**
 * Returns metrics in standard Prometheus exposition text format (0.0.4).
 */
export function getMetricsAsText(): string {
  const lines: string[] = [];
  const snapshot = getMetricsAsJson();

  // HELP and TYPE headers
  lines.push("# HELP process_uptime_seconds The process uptime in seconds.");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${snapshot.uptimeSeconds}`);

  lines.push("# HELP process_heap_bytes Process heap memory usage in bytes.");
  lines.push("# TYPE process_heap_bytes gauge");
  lines.push(`process_heap_bytes{type="used"} ${snapshot.process.heapUsedBytes}`);
  lines.push(`process_heap_bytes{type="total"} ${snapshot.process.heapTotalBytes}`);
  lines.push(`process_heap_bytes{type="rss"} ${snapshot.process.rssBytes}`);

  lines.push("# HELP http_requests_active In-flight HTTP requests.");
  lines.push("# TYPE http_requests_active gauge");
  lines.push(`http_requests_active ${snapshot.activeRequests}`);

  lines.push("# HELP http_requests_total Total number of HTTP requests processed.");
  lines.push("# TYPE http_requests_total counter");
  for (const [key, count] of requestsByRouteStatus.entries()) {
    const [method, route, status] = key.split(" ");
    lines.push(
      `http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`,
    );
  }
  if (requestsByRouteStatus.size === 0) {
    lines.push(`http_requests_total 0`);
  }

  lines.push("# HELP http_errors_total Total number of HTTP errors (status >= 400).");
  lines.push("# TYPE http_errors_total counter");
  lines.push(`http_errors_total ${snapshot.totalErrors}`);

  lines.push("# HELP http_request_duration_seconds HTTP request duration histogram in seconds.");
  lines.push("# TYPE http_request_duration_seconds histogram");
  for (const bucket of PROMETHEUS_BUCKETS_SECONDS) {
    const count = bucketCounts.get(bucket) ?? 0;
    lines.push(`http_request_duration_seconds_bucket{le="${bucket}"} ${count}`);
  }
  lines.push(`http_request_duration_seconds_bucket{le="+Inf"} ${snapshot.totalRequests}`);
  lines.push(`http_request_duration_seconds_sum ${(snapshot.latencyMs.totalDurationMs / 1000).toFixed(4)}`);
  lines.push(`http_request_duration_seconds_count ${snapshot.totalRequests}`);

  return `${lines.join("\n")}\n`;
}

/**
 * Resets in-memory metrics. Used primarily in test suites.
 */
export function resetMetrics(): void {
  activeRequests = 0;
  totalRequests = 0;
  totalErrors = 0;
  requestsByRouteStatus.clear();
  durationsMs.length = 0;
  minDurationMs = Number.POSITIVE_INFINITY;
  maxDurationMs = 0;
  sumDurationMs = 0;
  for (const bucket of PROMETHEUS_BUCKETS_SECONDS) {
    bucketCounts.set(bucket, 0);
  }
}
