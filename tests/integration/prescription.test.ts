import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database";
import {
  createPrescription,
  getPrescriptionById,
  listPrescriptions,
} from "../../src/modules/prescriptions/prescription.service";

const createdUserIds: string[] = [];

let patientId: string;
let otherPatientId: string;
let doctorUserId: string;
let doctorId: string;
let otherDoctorUserId: string;
let otherDoctorId: string;
let slotId: string;
let consultationId: string;

async function createPatient(email: string) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "integration-test-hash",
      role: "PATIENT",
      profile: { create: { fullName: "Prescription Test Patient" } },
    },
    select: { id: true },
  });

  createdUserIds.push(user.id);
  return user.id;
}

async function createDoctor(email: string) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "integration-test-hash",
      role: "DOCTOR",
      profile: { create: { fullName: "Prescription Test Doctor" } },
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

  createdUserIds.push(user.id);
  return {
    userId: user.id,
    doctorId: user.doctorProfile!.id,
  };
}

async function prepareRecords() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  patientId = await createPatient(
    `prescription-patient-${suffix}@example.test`,
  );
  otherPatientId = await createPatient(
    `prescription-other-patient-${suffix}@example.test`,
  );

  const doctor = await createDoctor(
    `prescription-doctor-${suffix}@example.test`,
  );
  doctorUserId = doctor.userId;
  doctorId = doctor.doctorId;

  const otherDoctor = await createDoctor(
    `prescription-other-doctor-${suffix}@example.test`,
  );
  otherDoctorUserId = otherDoctor.userId;
  otherDoctorId = otherDoctor.doctorId;

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
      status: "COMPLETED",
      reason: "Prescription integration test",
    },
    select: { id: true },
  });
  consultationId = consultation.id;
}

async function cleanupRecords() {
  if (createdUserIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.prescription.deleteMany({
      where: {
        OR: [
          { patientId: { in: createdUserIds } },
          { doctorId: { in: [doctorId, otherDoctorId].filter(Boolean) } },
        ],
      },
    });

    await tx.consultation.deleteMany({
      where: {
        OR: [
          { patientId: { in: createdUserIds } },
          { doctorId: { in: [doctorId, otherDoctorId].filter(Boolean) } },
        ],
      },
    });

    await tx.availabilitySlot.deleteMany({
      where: { doctorId: { in: [doctorId, otherDoctorId].filter(Boolean) } },
    });

    await tx.doctor.deleteMany({
      where: { id: { in: [doctorId, otherDoctorId].filter(Boolean) } },
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

describe("Prescription integration", () => {
  beforeEach(async () => {
    await prepareRecords();
  });

  afterEach(async () => {
    await cleanupRecords();
  });

  it("allows the assigned doctor to create a prescription for a completed consultation", async () => {
    const prescription = await createPrescription(doctorUserId, {
      consultationId,
      notes: "Take medication as directed.",
    });

    expect(prescription.consultationId).toBe(consultationId);
    expect(prescription.doctorId).toBe(doctorId);
    expect(prescription.patientId).toBe(patientId);
    expect(prescription.notes).toBe("Take medication as directed.");
  });

  it("rejects a prescription when the consultation is not completed", async () => {
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { status: "IN_PROGRESS" },
    });

    await expect(
      createPrescription(doctorUserId, { consultationId, notes: "Test notes" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONSULTATION_NOT_COMPLETED",
    });
  });

  it("prevents another doctor from issuing a prescription for the consultation", async () => {
    await expect(
      createPrescription(otherDoctorUserId, {
        consultationId,
        notes: "Unauthorized attempt",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "CONSULTATION_NOT_FOUND",
    });
  });

  it("prevents duplicate prescriptions for the same consultation", async () => {
    await createPrescription(doctorUserId, { consultationId, notes: "First" });

    await expect(
      createPrescription(doctorUserId, { consultationId, notes: "Second" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PRESCRIPTION_ALREADY_EXISTS",
    });
  });

  it("allows a patient to retrieve their own prescription", async () => {
    const created = await createPrescription(doctorUserId, {
      consultationId,
      notes: "Patient access test",
    });

    const result = await getPrescriptionById(created.id, patientId, "PATIENT");

    expect(result.id).toBe(created.id);
  });

  it("prevents another patient from retrieving the prescription", async () => {
    const created = await createPrescription(doctorUserId, {
      consultationId,
      notes: "Ownership test",
    });

    await expect(
      getPrescriptionById(created.id, otherPatientId, "PATIENT"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "PRESCRIPTION_NOT_FOUND",
    });
  });

  it("allows only the assigned doctor to retrieve the prescription", async () => {
    const created = await createPrescription(doctorUserId, {
      consultationId,
      notes: "Doctor access test",
    });

    const result = await getPrescriptionById(
      created.id,
      doctorUserId,
      "DOCTOR",
    );

    expect(result.id).toBe(created.id);

    await expect(
      getPrescriptionById(created.id, otherDoctorUserId, "DOCTOR"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "PRESCRIPTION_NOT_FOUND",
    });
  });

  it("lists prescriptions only for the requesting patient", async () => {
    await createPrescription(doctorUserId, {
      consultationId,
      notes: "Patient list test",
    });

    const ownResults = await listPrescriptions(patientId, "PATIENT", {
      page: 1,
      limit: 20,
    });

    const otherResults = await listPrescriptions(otherPatientId, "PATIENT", {
      page: 1,
      limit: 20,
    });

    expect(ownResults.pagination.total).toBe(1);
    expect(otherResults.pagination.total).toBe(0);
  });

  it("lists prescriptions only for the requesting doctor", async () => {
    await createPrescription(doctorUserId, {
      consultationId,
      notes: "Doctor list test",
    });

    const ownResults = await listPrescriptions(doctorUserId, "DOCTOR", {
      page: 1,
      limit: 20,
    });

    const otherResults = await listPrescriptions(otherDoctorUserId, "DOCTOR", {
      page: 1,
      limit: 20,
    });

    expect(ownResults.pagination.total).toBe(1);
    expect(otherResults.pagination.total).toBe(0);
  });
});
