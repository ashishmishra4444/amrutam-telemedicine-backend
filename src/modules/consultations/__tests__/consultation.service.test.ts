import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    idempotencyKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    availabilitySlot: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    consultation: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
}));

import { AppError } from "../../../common/errors/app-error";
import { createConsultation } from "../consultation.service";

const patientId = "1c1989f2-ac61-4f25-ab81-d829b0c76da6";
const slotId = "ce25938b-9f79-4489-843d-6cc9ee84c997";
const doctorId = "786166d4-f29f-4f21-a13b-d72c4c992203";

const input = {
  slotId,
  reason: "General consultation",
};

const slot = {
  id: slotId,
  doctorId,
  startsAt: new Date(Date.now() + 60 * 60 * 1000),
  status: "AVAILABLE",
  doctor: {
    verified: true,
    user: { status: "ACTIVE" },
  },
};

const consultation = {
  id: "4d082c4a-4d6f-413e-ab99-43d6563c0da9",
  patientId,
  doctorId,
  slotId,
  status: "BOOKED",
  reason: "General consultation",
  createdAt: new Date("2026-10-26T17:37:47.862Z"),
};

const idempotencyKey = {
  userId: patientId,
  key: "booking-test-001",
  requestHash: "unused",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  responseStatus: null,
  responseBody: null,
  id: "idempotency-record-1",
};

describe("createConsultation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) =>
        callback(prismaMock),
    );

    prismaMock.idempotencyKey.findUnique.mockResolvedValue(null);
    prismaMock.idempotencyKey.create.mockResolvedValue(idempotencyKey);
    prismaMock.idempotencyKey.update.mockResolvedValue(idempotencyKey);
    prismaMock.idempotencyKey.delete.mockResolvedValue(idempotencyKey);

    prismaMock.availabilitySlot.findUnique.mockResolvedValue(slot);
    prismaMock.availabilitySlot.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.consultation.create.mockResolvedValue(consultation);

    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it("creates a consultation and stores the idempotent response", async () => {
    const result = await createConsultation(
      patientId,
      input,
      "booking-test-001",
    );

    expect(result.statusCode).toBe(201);
    expect(result.replayed).toBe(false);
    expect(result.body.data.id).toBe(consultation.id);
    expect(prismaMock.availabilitySlot.updateMany).toHaveBeenCalled();
    expect(prismaMock.consultation.create).toHaveBeenCalled();
    expect(prismaMock.idempotencyKey.update).toHaveBeenCalled();

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: patientId,
        action: "CONSULTATION_BOOKED",
        resourceType: "CONSULTATION",
        resourceId: consultation.id,
        requestId: null,
        outcome: "SUCCESS",
        metadata: {
          status: "BOOKED",
          doctorId,
          slotId,
        },
      },
    });
  });

  it("replays the stored response for the same idempotency key and request", async () => {
    const requestHash = await import("node:crypto").then(({ createHash }) =>
      createHash("sha256")
        .update(
          JSON.stringify({
            slotId: input.slotId,
            reason: input.reason,
          }),
        )
        .digest("hex"),
    );

    const storedBody = {
      message: "Consultation booked successfully.",
      data: {
        ...consultation,
        createdAt: consultation.createdAt.toISOString(),
      },
    };

    prismaMock.idempotencyKey.findUnique.mockResolvedValue({
      ...idempotencyKey,
      requestHash,
      responseStatus: 201,
      responseBody: storedBody,
    });

    const result = await createConsultation(
      patientId,
      input,
      "booking-test-001",
    );

    expect(result.replayed).toBe(true);
    expect(result.body).toEqual(storedBody);
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key for a different request", async () => {
    prismaMock.idempotencyKey.findUnique.mockResolvedValue({
      ...idempotencyKey,
      requestHash: "different-request-hash",
    });

    await expect(
      createConsultation(
        patientId,
        { slotId, reason: "Follow-up consultation" },
        "booking-test-001",
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
    });

    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("rejects a slot that is not available", async () => {
    prismaMock.availabilitySlot.findUnique.mockResolvedValue({
      ...slot,
      status: "BOOKED",
    });

    await expect(
      createConsultation(patientId, input, "booking-test-002"),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "SLOT_UNAVAILABLE",
    });

    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("rejects a slot claim when another request has already claimed it", async () => {
    prismaMock.availabilitySlot.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      createConsultation(patientId, input, "booking-test-003"),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "SLOT_UNAVAILABLE",
    });

    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });
});
