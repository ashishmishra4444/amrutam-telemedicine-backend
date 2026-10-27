import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database";
import {
  listConsultations,
  updateConsultationStatus,
} from "../../src/modules/consultations/consultation-lifecycle.service";

const createdUserIds: string[] = [];

let patientUserId: string;
let otherPatientUserId: string;
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

  patientUserId = await createPatient(
    `lifecycle-patient-${suffix}@example.test`,
  );
  otherPatientUserId = await createPatient(
    `lifecycle-other-patient-${suffix}@example.test`,
  );

  const doctorUser = await prisma.user.create({
    data: {
      email: `lifecycle-doctor-${suffix}@example.test`,
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
      status: "BOOKED",
    },
    select: { id: true },
  });

  slotId = slot.id;

  const consultation = await prisma.consultation.create({
    data: {
      patientId: patientUserId,
      doctorId,
      slotId,
      status: "BOOKED",
      reason: "Lifecycle integration test",
    },
    select: { id: true },
  });

  consultationId = consultation.id;
}

async function cleanupRecords() {
  if (createdUserIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.idempotencyKey.deleteMany({
      where: { userId: { in: createdUserIds } },
    });

    await tx.auditLog.deleteMany({
      where: {
        actorId: { in: createdUserIds },
      },
    });

    await tx.consultation.deleteMany({
      where: {
        OR: [{ patientId: { in: createdUserIds } }, { doctorId }],
      },
    });

    await tx.availabilitySlot.deleteMany({
      where: { doctorId },
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

describe("Consultation lifecycle integration", () => {
  beforeEach(async () => {
    await prepareRecords();
  });

  afterEach(async () => {
    await cleanupRecords();
  });

  it("cancels a booked consultation and releases its slot", async () => {
    const result = await updateConsultationStatus(
      consultationId,
      patientUserId,
      "PATIENT",
      "CANCELLED",
    );

    expect(result.status).toBe("CANCELLED");

    const slot = await prisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slotId },
      select: { status: true },
    });

    expect(slot.status).toBe("AVAILABLE");

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        actorId: patientUserId,
        action: "CONSULTATION_STATUS_CHANGED",
        resourceType: "CONSULTATION",
        resourceId: consultationId,
      },
      orderBy: { createdAt: "desc" },
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog?.requestId).toBeNull();
    expect(auditLog?.metadata).toEqual({
      previousStatus: "BOOKED",
      newStatus: "CANCELLED",
    });
  });

  it("allows a doctor to mark a confirmed consultation as no-show", async () => {
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { status: "CONFIRMED" },
    });

    const result = await updateConsultationStatus(
      consultationId,
      doctorUserId,
      "DOCTOR",
      "NO_SHOW",
    );

    expect(result.status).toBe("NO_SHOW");
  });

  it("rejects a doctor trying to cancel a confirmed consultation", async () => {
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { status: "CONFIRMED" },
    });

    await expect(
      updateConsultationStatus(
        consultationId,
        doctorUserId,
        "DOCTOR",
        "CANCELLED",
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  it("rejects a patient trying to confirm a consultation", async () => {
    await expect(
      updateConsultationStatus(
        consultationId,
        patientUserId,
        "PATIENT",
        "CONFIRMED",
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  it("rejects an invalid transition from a completed consultation", async () => {
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { status: "COMPLETED" },
    });

    await expect(
      updateConsultationStatus(
        consultationId,
        doctorUserId,
        "DOCTOR",
        "CONFIRMED",
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_STATUS_TRANSITION",
    });
  });

  it("prevents patients from listing another patient's consultations", async () => {
    const ownResults = await listConsultations(patientUserId, "PATIENT", {
      page: 1,
      limit: 20,
    });

    expect(ownResults.data.map((item) => item.id)).toContain(consultationId);

    const otherResults = await listConsultations(
      otherPatientUserId,
      "PATIENT",
      { page: 1, limit: 20 },
    );

    expect(otherResults.data.map((item) => item.id)).not.toContain(
      consultationId,
    );
    expect(otherResults.pagination.total).toBe(0);
  });

  it("prevents a doctor from accessing another doctor's consultations", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const otherDoctorUser = await prisma.user.create({
      data: {
        email: `lifecycle-other-doctor-${suffix}@example.test`,
        passwordHash: "integration-test-hash",
        role: "DOCTOR",
        profile: {
          create: { fullName: "Other Integration Doctor" },
        },
        doctorProfile: {
          create: {
            specialization: "Dermatology",
            experienceYears: 2,
            consultationFee: 600,
            verified: true,
          },
        },
      },
      select: {
        id: true,
        doctorProfile: { select: { id: true } },
      },
    });

    createdUserIds.push(otherDoctorUser.id);

    const results = await listConsultations(otherDoctorUser.id, "DOCTOR", {
      page: 1,
      limit: 20,
    });

    expect(results.data.map((item) => item.id)).not.toContain(consultationId);
    expect(results.pagination.total).toBe(0);

    await prisma.doctor.deleteMany({
      where: { id: otherDoctorUser.doctorProfile!.id },
    });
  });

  it("returns not found when a patient tries to cancel someone else's consultation", async () => {
    await expect(
      updateConsultationStatus(
        consultationId,
        otherPatientUserId,
        "PATIENT",
        "CANCELLED",
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "CONSULTATION_NOT_FOUND",
    });
  });
});
