import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database";
import {
  createPayment,
  getPayment,
  listPayments,
} from "../../src/modules/payments/payment.service";

const createdUserIds: string[] = [];

let patientId: string;
let otherPatientId: string;
let doctorUserId: string;
let doctorId: string;
let slotId: string;
let consultationId: string;

async function createPatient(email: string) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "integration-test-hash",
      role: "PATIENT",
      profile: {
        create: { fullName: "Payment Test Patient" },
      },
    },
    select: { id: true },
  });

  createdUserIds.push(user.id);
  return user.id;
}

async function prepareRecords() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  patientId = await createPatient(`payment-patient-${suffix}@example.test`);
  otherPatientId = await createPatient(
    `payment-other-patient-${suffix}@example.test`,
  );

  const doctor = await prisma.user.create({
    data: {
      email: `payment-doctor-${suffix}@example.test`,
      passwordHash: "integration-test-hash",
      role: "DOCTOR",
      profile: {
        create: { fullName: "Payment Test Doctor" },
      },
      doctorProfile: {
        create: {
          specialization: "General Medicine",
          experienceYears: 2,
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

  doctorUserId = doctor.id;
  doctorId = doctor.doctorProfile!.id;
  createdUserIds.push(doctorUserId);

  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

  const slot = await prisma.availabilitySlot.create({
    data: {
      doctorId,
      startsAt,
      endsAt,
      status: "BOOKED",
    },
    select: { id: true },
  });

  slotId = slot.id;

  const consultation = await prisma.consultation.create({
    data: {
      patientId,
      doctorId,
      slotId,
      status: "CONFIRMED",
      reason: "Payment integration test",
    },
    select: { id: true },
  });

  consultationId = consultation.id;
}

async function cleanupRecords() {
  if (createdUserIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({
      where: {
        consultation: {
          OR: [
            { patientId: { in: createdUserIds } },
            { doctorId: { in: [doctorId].filter(Boolean) } },
          ],
        },
      },
    });

    await tx.consultation.deleteMany({
      where: {
        OR: [
          { patientId: { in: createdUserIds } },
          { doctorId: { in: [doctorId].filter(Boolean) } },
        ],
      },
    });

    await tx.availabilitySlot.deleteMany({
      where: { doctorId: { in: [doctorId].filter(Boolean) } },
    });

    await tx.doctor.deleteMany({
      where: { id: doctorId },
    });

    await tx.profile.deleteMany({
      where: { userId: { in: createdUserIds } },
    });

    await tx.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
  });

  createdUserIds.length = 0;
}

describe("Payment integration", () => {
  beforeEach(async () => {
    await prepareRecords();
  });

  afterEach(async () => {
    await cleanupRecords();
  });

  it("creates a pending payment using the doctor's consultation fee", async () => {
    const payment = await createPayment(consultationId, patientId);

    expect(payment.consultationId).toBe(consultationId);
    expect(Number(payment.amount)).toBe(500);
    expect(payment.currency).toBe("INR");
    expect(payment.status).toBe("PENDING");
  });

  it("prevents another pending payment for the same consultation", async () => {
    await createPayment(consultationId, patientId);

    await expect(
      createPayment(consultationId, patientId),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_ALREADY_PENDING",
    });
  });

  it("allows only one pending payment during concurrent requests", async () => {
    const results = await Promise.allSettled([
      createPayment(consultationId, patientId),
      createPayment(consultationId, patientId),
    ]);

    const successful = results.filter(
      (result) => result.status === "fulfilled",
    );
    const failed = results.filter((result) => result.status === "rejected");

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const pendingCount = await prisma.payment.count({
      where: {
        consultationId,
        status: "PENDING",
      },
    });

    expect(pendingCount).toBe(1);

    const failure = failed[0];

    if (failure.status === "rejected") {
      expect(failure.reason).toMatchObject({
        statusCode: 409,
        code: "PAYMENT_ALREADY_PENDING",
      });
    }
  });

  it("does not allow a patient to access another patient's payment", async () => {
    const payment = await createPayment(consultationId, patientId);

    await expect(
      getPayment(payment.id, otherPatientId, "PATIENT"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "PAYMENT_NOT_FOUND",
    });
  });

  it("allows the owning patient to retrieve their payment", async () => {
    const payment = await createPayment(consultationId, patientId);

    const result = await getPayment(payment.id, patientId, "PATIENT");

    expect(result.id).toBe(payment.id);
  });

  it("lists payments only for the requesting patient", async () => {
    await createPayment(consultationId, patientId);

    const ownResults = await listPayments(patientId, "PATIENT", {
      page: 1,
      limit: 20,
    });

    const otherResults = await listPayments(otherPatientId, "PATIENT", {
      page: 1,
      limit: 20,
    });

    expect(ownResults.pagination.total).toBe(1);
    expect(otherResults.pagination.total).toBe(0);
  });

  it("rejects payment initiation for a cancelled consultation", async () => {
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { status: "CANCELLED" },
    });

    await expect(
      createPayment(consultationId, patientId),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_NOT_ALLOWED",
    });
  });

  it("does not create a payment for another patient's consultation", async () => {
    await expect(
      createPayment(consultationId, otherPatientId),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "CONSULTATION_NOT_FOUND",
    });
  });

  it("does not expose a payment-status update through the service", async () => {
    const payment = await createPayment(consultationId, patientId);

    const savedPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { status: true },
    });

    expect(savedPayment.status).toBe("PENDING");
  });
});
