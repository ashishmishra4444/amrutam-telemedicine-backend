import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database";
import { createConsultation } from "../../src/modules/consultations/consultation.service";

const createdUserIds: string[] = [];
let doctorUserId: string;
let doctorId: string;
let slotId: string;
let patientOneId: string;
let patientTwoId: string;

async function createPatient(email: string) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "integration-test-hash",
      role: "PATIENT",
      profile: {
        create: { fullName: "Integration Test Patient" },
      },
    },
    select: { id: true },
  });

  createdUserIds.push(user.id);
  return user.id;
}

async function prepareRecords() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  patientOneId = await createPatient(`patient-one-${suffix}@example.test`);
  patientTwoId = await createPatient(`patient-two-${suffix}@example.test`);

  const doctorUser = await prisma.user.create({
    data: {
      email: `doctor-${suffix}@example.test`,
      passwordHash: "integration-test-hash",
      role: "DOCTOR",
      profile: {
        create: { fullName: "Integration Test Doctor" },
      },
      doctorProfile: {
        create: {
          specialization: "General Medicine",
          experienceYears: 1,
          consultationFee: 500,
          verified: true,
        },
      },
    },
    select: {
      id: true,
      doctorProfile: { select: { id: true } },
    },
  });

  doctorUserId = doctorUser.id;
  doctorId = doctorUser.doctorProfile!.id;
  createdUserIds.push(doctorUserId);

  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

  const slot = await prisma.availabilitySlot.create({
    data: {
      doctorId,
      startsAt,
      endsAt,
      status: "AVAILABLE",
    },
    select: { id: true },
  });

  slotId = slot.id;
}

async function cleanupRecords() {
  if (createdUserIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.idempotencyKey.deleteMany({
      where: { userId: { in: createdUserIds } },
    });

    if (slotId!) {
      await tx.consultation.deleteMany({ where: { slotId } });
      await tx.availabilitySlot.deleteMany({ where: { id: slotId } });
    }

    if (doctorId!) {
      await tx.doctor.deleteMany({ where: { id: doctorId } });
    }

    await tx.profile.deleteMany({
      where: { userId: { in: createdUserIds } },
    });

    await tx.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
  });

  createdUserIds.length = 0;
}

describe("PostgreSQL consultation concurrency", () => {
  beforeEach(async () => {
    await prepareRecords();
  });

  afterEach(async () => {
    await cleanupRecords();
  });

  it("allows only one patient to book a slot concurrently", async () => {
    const results = await Promise.allSettled([
      createConsultation(
        patientOneId,
        { slotId, reason: "Concurrent booking A" },
        `concurrent-a-${Date.now()}`,
      ),
      createConsultation(
        patientTwoId,
        { slotId, reason: "Concurrent booking B" },
        `concurrent-b-${Date.now()}`,
      ),
    ]);

    const successful = results.filter(
      (result) => result.status === "fulfilled",
    );
    const failed = results.filter((result) => result.status === "rejected");

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const consultationCount = await prisma.consultation.count({
      where: { slotId },
    });

    const savedSlot = await prisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slotId },
      select: { status: true },
    });

    expect(consultationCount).toBe(1);
    expect(savedSlot.status).toBe("BOOKED");
  });

  it("returns the same consultation for concurrent retries with the same key", async () => {
    const key = `same-key-${Date.now()}`;
    const input = { slotId, reason: "Idempotency integration test" };

    const results = await Promise.all([
      createConsultation(patientOneId, input, key),
      createConsultation(patientOneId, input, key),
    ]);

    expect(results[0].body.data.id).toBe(results[1].body.data.id);
    expect(results.some((result) => result.replayed)).toBe(true);

    const consultationCount = await prisma.consultation.count({
      where: { slotId },
    });

    expect(consultationCount).toBe(1);
  });
});
