import { describe, expect, it } from "vitest";
import { createConsultationSchema } from "../consultation.schema";

describe("createConsultationSchema", () => {
  it("accepts a valid slot ID and consultation reason", () => {
    const result = createConsultationSchema.safeParse({
      slotId: "ce25938b-9f79-4489-843d-6cc9ee84c997",
      reason: "General consultation",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid slot ID without an optional reason", () => {
    const result = createConsultationSchema.safeParse({
      slotId: "ce25938b-9f79-4489-843d-6cc9ee84c997",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a malformed slot ID", () => {
    const result = createConsultationSchema.safeParse({
      slotId: "not-a-valid-uuid",
      reason: "General consultation",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a reason longer than 1000 characters", () => {
    const result = createConsultationSchema.safeParse({
      slotId: "ce25938b-9f79-4489-843d-6cc9ee84c997",
      reason: "a".repeat(1001),
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty slot ID", () => {
    const result = createConsultationSchema.safeParse({
      slotId: "",
    });

    expect(result.success).toBe(false);
  });
});
