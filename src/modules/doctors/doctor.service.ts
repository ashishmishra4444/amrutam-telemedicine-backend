import { prisma } from "../../config/database";
import { AppError } from "../../common/errors/app-error";
import type { CreateAvailabilityInput } from "./doctor.schema";

export async function createAvailability(
  userId: string,
  input: CreateAvailabilityInput,
) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    select: {
      id: true,
      verified: true,
    },
  });

  if (!doctor) {
    throw new AppError(
      403,
      "DOCTOR_PROFILE_REQUIRED",
      "A doctor profile is required to manage availability.",
    );
  }

  if (!doctor.verified) {
    throw new AppError(
      403,
      "DOCTOR_NOT_VERIFIED",
      "Only verified doctors can create availability.",
    );
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  const overlappingSlot = await prisma.availabilitySlot.findFirst({
    where: {
      doctorId: doctor.id,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      status: { not: "BLOCKED" },
    },
    select: { id: true },
  });

  if (overlappingSlot) {
    throw new AppError(
      409,
      "AVAILABILITY_OVERLAP",
      "This availability overlaps an existing slot.",
    );
  }

  try {
    return await prisma.availabilitySlot.create({
      data: {
        doctorId: doctor.id,
        startsAt,
        endsAt,
        status: "AVAILABLE",
      },
      select: {
        id: true,
        doctorId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("availability_slots_no_overlapping_active_slots") ||
      message.includes("23P01")
    ) {
      throw new AppError(
        409,
        "AVAILABILITY_OVERLAP",
        "This availability overlaps an existing slot.",
      );
    }

    throw error;
  }
}
