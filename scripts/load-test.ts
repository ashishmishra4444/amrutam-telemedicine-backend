/**
 * Lightweight, reproducible load-testing script for Amrutam Telemedicine Backend.
 * Uses native fetch and performance.now() - no external dependencies required.
 *
 * Can run against an external server (e.g. TARGET_URL=http://localhost:3000)
 * or automatically start an in-process instance if no external server is running.
 *
 * Usage:
 *   npm run test:load
 *   npx tsx scripts/load-test.ts
 *
 * Configuration via environment variables:
 *   TARGET_URL=http://localhost:3000
 *   ENDPOINT=/health/live
 *   CONCURRENCY=10
 *   TOTAL_REQUESTS=100
 *   AUTH_TOKEN="your_jwt_token_here" (optional)
 */

import app from "../src/app";

interface RequestResult {
  statusCode: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runLoadTest() {
  const defaultTargetUrl = process.env.TARGET_URL ?? "http://localhost:3000";
  const endpoint = process.env.ENDPOINT ?? "/health/live";
  const concurrency = Number(process.env.CONCURRENCY ?? 10);
  const totalRequests = Number(process.env.TOTAL_REQUESTS ?? 100);
  const method = (process.env.METHOD ?? "GET").toUpperCase();
  const authToken = process.env.AUTH_TOKEN;

  let activeUrl = defaultTargetUrl;
  let inProcessServer: ReturnType<typeof app.listen> | null = null;

  // Check if an external server is already reachable
  try {
    const probe = await fetch(`${defaultTargetUrl}/health/live`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!probe.ok && probe.status !== 200) {
      throw new Error();
    }
  } catch {
    // External server not running; spin up in-process server for this benchmark
    const port = 3001;
    inProcessServer = app.listen(port);
    activeUrl = `http://127.0.0.1:${port}`;
    console.log(`[Info] No running server at ${defaultTargetUrl}. Started in-process test server on port ${port}.`);
  }

  const url = `${activeUrl.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  console.log("===============================================================");
  console.log("  Amrutam Telemedicine Backend — Load Test Runner");
  console.log("===============================================================");
  console.log(`Target URL:      ${url}`);
  console.log(`HTTP Method:     ${method}`);
  console.log(`Concurrency:     ${concurrency}`);
  console.log(`Total Requests:  ${totalRequests}`);
  console.log(`Authorization:   ${authToken ? "Bearer token provided" : "None"}`);
  console.log("---------------------------------------------------------------");

  const results: RequestResult[] = [];
  let requestCounter = 0;

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const currentReqIndex = requestCounter++;
      if (currentReqIndex >= totalRequests) {
        break;
      }

      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const start = performance.now();
      try {
        const response = await fetch(url, {
          method,
          headers,
        });

        const duration = performance.now() - start;
        results.push({
          statusCode: response.status,
          durationMs: duration,
          success: response.ok,
        });
      } catch (err: unknown) {
        const duration = performance.now() - start;
        results.push({
          statusCode: 0,
          durationMs: duration,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  try {
    const overallStart = performance.now();
    const workers = Array.from({ length: concurrency }, (_, i) => worker(i + 1));
    await Promise.all(workers);
    const overallDurationMs = performance.now() - overallStart;

    // Process statistics
    const sortedDurations = results.map((r) => r.durationMs).sort((a, b) => a - b);
    const successfulRequests = results.filter((r) => r.success).length;
    const failedRequests = results.filter((r) => !r.success).length;

    const minDuration = sortedDurations[0] ?? 0;
    const maxDuration = sortedDurations[sortedDurations.length - 1] ?? 0;
    const sumDuration = sortedDurations.reduce((acc, d) => acc + d, 0);
    const avgDuration = results.length > 0 ? sumDuration / results.length : 0;

    const p50 = calculatePercentile(sortedDurations, 50);
    const p90 = calculatePercentile(sortedDurations, 90);
    const p95 = calculatePercentile(sortedDurations, 95);
    const p99 = calculatePercentile(sortedDurations, 99);

    const rps = (results.length / (overallDurationMs / 1000)).toFixed(2);

    console.log("\nLoad Test Summary Results:");
    console.log("---------------------------------------------------------------");
    console.log(`Total Time Elapsed:     ${(overallDurationMs / 1000).toFixed(2)} seconds`);
    console.log(`Throughput:             ${rps} requests/second`);
    console.log(`Total Requests:         ${results.length}`);
    console.log(`Successful (2xx):       ${successfulRequests} (${((successfulRequests / results.length) * 100).toFixed(1)}%)`);
    console.log(`Failed (non-2xx/err):   ${failedRequests}`);
    console.log("\nLatency Distribution (ms):");
    console.log(`  Min:                  ${minDuration.toFixed(2)} ms`);
    console.log(`  Average (Mean):       ${avgDuration.toFixed(2)} ms`);
    console.log(`  p50 (Median):         ${p50.toFixed(2)} ms`);
    console.log(`  p90:                  ${p90.toFixed(2)} ms`);
    console.log(`  p95:                  ${p95.toFixed(2)} ms`);
    console.log(`  p99:                  ${p99.toFixed(2)} ms`);
    console.log(`  Max:                  ${maxDuration.toFixed(2)} ms`);
    console.log("---------------------------------------------------------------");
    console.log("Target SLA Comparison:");
    console.log(`  Assignment Read Target:  p95 < 200 ms (Measured p95: ${p95.toFixed(2)} ms -> ${p95 < 200 ? "PASS" : "EXCEEDED"})`);
    console.log(`  Assignment Write Target: p95 < 500 ms (For write endpoints)`);
    console.log(`  Assignment Availability: 99.95% target`);
    console.log("===============================================================\n");

    if (failedRequests === results.length) {
      console.error("All requests failed.");
      process.exitCode = 1;
    }
  } finally {
    if (inProcessServer) {
      inProcessServer.close();
    }
  }
}

runLoadTest().catch((error) => {
  console.error("Load test runner crashed:", error);
  process.exitCode = 1;
});
