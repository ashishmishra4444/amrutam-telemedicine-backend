import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database";

const createdUserIds: string[] = [];
const createdDoctorIds: string[] = [];
const createdSlotIds: string[] = [];

async function createDoctor(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `overlap-doctor-${suffix}@example.test`,
      passwordHash: "integration-test-hash",
      role: "DOCTOR",
      status: "ACTIVE",
      profile: {
        create: { fullName: "Overlap Test Doctor" },
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

  createdUserIds.push(user.id);
  createdDoctorIds.push(user.doctorProfile!.id);

  return user.doctorProfile!.id;
}

async function createSlot(
  doctorId: string,
  startsAt: Date,
  endsAt: Date,
  status: "AVAILABLE" | "BLOCKED" = "AVAILABLE",
) {
  const slot = await prisma.availabilitySlot.create({
    data: { doctorId, startsAt, endsAt, status },
    select: { id: true },
  });

  createdSlotIds.push(slot.id);
  return slot.id;
}

async function cleanup() {
  await prisma.$transaction(async (tx) => {
    if (createdSlotIds.length > 0) {
      await tx.consultation.deleteMany({
        where: { slotId: { in: createdSlotIds } },
      });

      await tx.availabilitySlot.deleteMany({
        where: { id: { in: createdSlotIds } },
      });
    }

    if (createdDoctorIds.length > 0) {
      await tx.doctor.deleteMany({
        where: { id: { in: createdDoctorIds } },
      });
    }

    if (createdUserIds.length > 0) {
      await tx.profile.deleteMany({
        where: { userId: { in: createdUserIds } },
      });

      await tx.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  createdSlotIds.length = 0;
  createdDoctorIds.length = 0;
  createdUserIds.length = 0;
}

describe("PostgreSQL availability overlap constraint", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("rejects simultaneous overlapping slots for the same doctor", async () => {
    const doctorId = await createDoctor(`race-${Date.now()}`);
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const results = await Promise.allSettled([
      createSlot(doctorId, start, new Date(start.getTime() + 60 * 60 * 1000)),
      createSlot(
        doctorId,
        new Date(start.getTime() + 30 * 60 * 1000),
        new Date(start.getTime() + 90 * 60 * 1000),
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("allows adjacent slots for the same doctor", async () => {
    const doctorId = await createDoctor(`adjacent-${Date.now()}`);
    const start = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const middle = new Date(start.getTime() + 30 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    await createSlot(doctorId, start, middle);
    await expect(createSlot(doctorId, middle, end)).resolves.toBeTruthy();
  });

  it("allows overlapping slots for different doctors", async () => {
    const suffix = `different-${Date.now()}`;
    const doctorOne = await createDoctor(`${suffix}-one`);
    const doctorTwo = await createDoctor(`${suffix}-two`);
    const start = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    await createSlot(doctorOne, start, end);
    await expect(createSlot(doctorTwo, start, end)).resolves.toBeTruthy();
  });

  it("allows a blocked slot to overlap an available slot", async () => {
    const doctorId = await createDoctor(`blocked-${Date.now()}`);
    const start = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    await createSlot(doctorId, start, end, "BLOCKED");

    await expect(
      createSlot(
        doctorId,
        new Date(start.getTime() + 15 * 60 * 1000),
        new Date(end.getTime() + 15 * 60 * 1000),
        "AVAILABLE",
      ),
    ).resolves.toBeTruthy();
  });
});
