import { describe, expect, it } from "vitest";
import { adminAnalyticsQuerySchema } from "../admin.schema";

describe("adminAnalyticsQuerySchema", () => {
  it("allows empty query and defaults correctly", () => {
    const result = adminAnalyticsQuerySchema.parse({});
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
  });

  it("validates valid ISO date strings with timezone", () => {
    const result = adminAnalyticsQuerySchema.parse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-31T23:59:59.000Z",
    });
    expect(result.from).toBe("2026-01-01T00:00:00.000Z");
    expect(result.to).toBe("2026-01-31T23:59:59.000Z");
  });

  it("rejects invalid date format", () => {
    expect(() =>
      adminAnalyticsQuerySchema.parse({ from: "not-a-date" }),
    ).toThrow();
  });

  it("rejects when from is later than to", () => {
    expect(() =>
      adminAnalyticsQuerySchema.parse({
        from: "2026-02-01T00:00:00.000Z",
        to: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("allows equal from and to datetimes", () => {
    const same = "2026-01-01T00:00:00.000Z";
    const result = adminAnalyticsQuerySchema.parse({
      from: same,
      to: same,
    });
    expect(result.from).toBe(same);
    expect(result.to).toBe(same);
  });
});
