import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database";
import {
  getDoctorById,
  listDoctorAvailability,
  searchDoctors,
} from "../../src/modules/doctors/doctor.service";

const createdUserIds: string[] = [];
const createdDoctorIds: string[] = [];
const createdSlotIds: string[] = [];

let doctorA: { userId: string; doctorId: string };
let doctorB: { userId: string; doctorId: string };
let inactiveDoctor: { userId: string; doctorId: string };
let unverifiedDoctor: { userId: string; doctorId: string };

async function createDoctor(options: {
  name: string;
  email: string;
  specialization: string;
  fee: number;
  experience: number;
  active?: boolean;
  verified?: boolean;
}) {
  const user = await prisma.user.create({
    data: {
      email: options.email,
      passwordHash: "integration-test-hash",
      role: "DOCTOR",
      status: options.active === false ? "INACTIVE" : "ACTIVE",
      profile: {
        create: { fullName: options.name },
      },
      doctorProfile: {
        create: {
          specialization: options.specialization,
          consultationFee: options.fee,
          experienceYears: options.experience,
          verified: options.verified ?? true,
        },
      },
    },
    select: {
      id: true,
      doctorProfile: { select: { id: true } },
    },
  });

  createdUserIds.push(user.id);
  createdDoctorIds.push(user.doctorProfile!.id);

  return {
    userId: user.id,
    doctorId: user.doctorProfile!.id,
  };
}

async function createSlot(
  doctorId: string,
  startsAt: Date,
  status: "AVAILABLE" | "BOOKED" | "BLOCKED" = "AVAILABLE",
) {
  const slot = await prisma.availabilitySlot.create({
    data: {
      doctorId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      status,
    },
    select: { id: true },
  });

  createdSlotIds.push(slot.id);
  return slot.id;
}

async function prepareRecords() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  doctorA = await createDoctor({
    name: "Discovery Test Alice",
    email: `discovery-alice-${suffix}@example.test`,
    specialization: "Cardiology",
    fee: 500,
    experience: 8,
  });

  doctorB = await createDoctor({
    name: "Discovery Test Bob",
    email: `discovery-bob-${suffix}@example.test`,
    specialization: "Dermatology",
    fee: 800,
    experience: 3,
  });

  inactiveDoctor = await createDoctor({
    name: "Discovery Inactive Doctor",
    email: `discovery-inactive-${suffix}@example.test`,
    specialization: "Cardiology",
    fee: 400,
    experience: 10,
    active: false,
  });

  unverifiedDoctor = await createDoctor({
    name: "Discovery Unverified Doctor",
    email: `discovery-unverified-${suffix}@example.test`,
    specialization: "Cardiology",
    fee: 300,
    experience: 5,
    verified: false,
  });
}

async function cleanupRecords() {
  if (createdUserIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.consultation.deleteMany({
      where: {
        OR: [
          { patientId: { in: createdUserIds } },
          { doctorId: { in: createdDoctorIds } },
        ],
      },
    });

    await tx.availabilitySlot.deleteMany({
      where: {
        OR: [
          { id: { in: createdSlotIds } },
          { doctorId: { in: createdDoctorIds } },
        ],
      },
    });

    await tx.payment.deleteMany({
      where: {
        consultation: {
          doctorId: { in: createdDoctorIds },
        },
      },
    });

    await tx.prescription.deleteMany({
      where: {
        OR: [
          { patientId: { in: createdUserIds } },
          { doctorId: { in: createdDoctorIds } },
        ],
      },
    });

    await tx.doctor.deleteMany({
      where: { id: { in: createdDoctorIds } },
    });

    await tx.profile.deleteMany({
      where: { userId: { in: createdUserIds } },
    });

    await tx.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
  });

  createdUserIds.length = 0;
  createdDoctorIds.length = 0;
  createdSlotIds.length = 0;
}

describe("Doctor discovery integration", () => {
  beforeEach(async () => {
    await prepareRecords();
  });

  afterEach(async () => {
    await cleanupRecords();
  });

  it("searches by doctor name", async () => {
    const result = await searchDoctors({
      search: "Alice",
      page: 1,
      limit: 20,
    });

    expect(result.data.map((doctor) => doctor.id)).toContain(doctorA.doctorId);
    expect(result.data.map((doctor) => doctor.id)).not.toContain(
      doctorB.doctorId,
    );
  });

  it("filters by specialization case-insensitively", async () => {
    const result = await searchDoctors({
      specialization: "derm",
      page: 1,
      limit: 20,
    });

    expect(result.data.map((doctor) => doctor.id)).toEqual([doctorB.doctorId]);
  });

  it("filters by consultation fee and experience", async () => {
    const result = await searchDoctors({
      minFee: 450,
      maxFee: 600,
      minExperience: 5,
      page: 1,
      limit: 20,
    });

    expect(result.data.map((doctor) => doctor.id)).toContain(doctorA.doctorId);
    expect(result.data.map((doctor) => doctor.id)).not.toContain(
      doctorB.doctorId,
    );
  });

  it("does not return inactive or unverified doctors", async () => {
    const result = await searchDoctors({
      specialization: "Cardiology",
      page: 1,
      limit: 20,
    });

    const ids = result.data.map((doctor) => doctor.id);

    expect(ids).not.toContain(inactiveDoctor.doctorId);
    expect(ids).not.toContain(unverifiedDoctor.doctorId);
  });

  it("paginates doctor search results", async () => {
    const firstPage = await searchDoctors({ page: 1, limit: 1 });
    const secondPage = await searchDoctors({ page: 2, limit: 1 });

    expect(firstPage.data).toHaveLength(1);
    expect(secondPage.data).toHaveLength(1);
    expect(firstPage.data[0].id).not.toBe(secondPage.data[0].id);
    expect(firstPage.pagination.total).toBeGreaterThanOrEqual(2);
  });

  it("returns a verified active doctor's public profile", async () => {
    const result = await getDoctorById(doctorA.doctorId);

    expect(result.id).toBe(doctorA.doctorId);
    expect(result.specialization).toBe("Cardiology");
    expect(Number(result.consultationFee)).toBe(500);
  });

  it("hides inactive and unverified doctor profiles", async () => {
    await expect(getDoctorById(inactiveDoctor.doctorId)).rejects.toMatchObject({
      statusCode: 404,
      code: "DOCTOR_NOT_FOUND",
    });

    await expect(
      getDoctorById(unverifiedDoctor.doctorId),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "DOCTOR_NOT_FOUND",
    });
  });

  it("lists only future available slots in chronological order", async () => {
    const now = Date.now();

    await createSlot(
      doctorA.doctorId,
      new Date(now + 3 * 60 * 60 * 1000),
      "AVAILABLE",
    );
    await createSlot(
      doctorA.doctorId,
      new Date(now + 2 * 60 * 60 * 1000),
      "AVAILABLE",
    );
    await createSlot(
      doctorA.doctorId,
      new Date(now + 4 * 60 * 60 * 1000),
      "BOOKED",
    );
    await createSlot(
      doctorA.doctorId,
      new Date(now - 2 * 60 * 60 * 1000),
      "AVAILABLE",
    );

    const result = await listDoctorAvailability(doctorA.doctorId, {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(2);
    expect(result.data.every((slot) => slot.status === "AVAILABLE")).toBe(true);
    expect(result.data[0].startsAt.getTime()).toBeLessThan(
      result.data[1].startsAt.getTime(),
    );
    expect(
      result.data.every((slot) => slot.startsAt.getTime() > Date.now()),
    ).toBe(true);
  });

  it("rejects availability lookup for an unverified doctor", async () => {
    await expect(
      listDoctorAvailability(unverifiedDoctor.doctorId, {
        page: 1,
        limit: 20,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "DOCTOR_NOT_FOUND",
    });
  });
});
