import { prisma } from "../../config/database";
import { AppError } from "../../common/errors/app-error";
import type {
  CreateAvailabilityInput,
  DoctorSearchInput,
} from "./doctor.schema";

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

export async function searchDoctors(input: DoctorSearchInput) {
  const where = {
    verified: true,
    user: {
      status: "ACTIVE" as const,
      profile: input.search
        ? {
            fullName: {
              contains: input.search,
              mode: "insensitive" as const,
            },
          }
        : undefined,
    },
    specialization: input.specialization
      ? { contains: input.specialization, mode: "insensitive" as const }
      : undefined,
    consultationFee: {
      gte: input.minFee,
      lte: input.maxFee,
    },
    experienceYears:
      input.minExperience === undefined
        ? undefined
        : { gte: input.minExperience },
  };

  const [items, total] = await prisma.$transaction([
    prisma.doctor.findMany({
      where,
      orderBy: [
        { verified: "desc" },
        { experienceYears: "desc" },
        { id: "asc" },
      ],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: {
        id: true,
        specialization: true,
        experienceYears: true,
        consultationFee: true,
        verified: true,
        user: {
          select: {
            id: true,
            profile: {
              select: { fullName: true },
            },
          },
        },
      },
    }),
    prisma.doctor.count({ where }),
  ]);

  return {
    data: items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function getDoctorById(doctorId: string) {
  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      verified: true,
      user: { status: "ACTIVE" },
    },
    select: {
      id: true,
      specialization: true,
      experienceYears: true,
      consultationFee: true,
      verified: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          profile: {
            select: { fullName: true },
          },
        },
      },
    },
  });

  if (!doctor) {
    throw new AppError(404, "DOCTOR_NOT_FOUND", "The doctor was not found.");
  }

  return doctor;
}

type DoctorAvailabilityOptions = {
  from?: string;
  to?: string;
  page: number;
  limit: number;
};

export async function listDoctorAvailability(
  doctorId: string,
  options: DoctorAvailabilityOptions,
) {
  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      verified: true,
      user: { status: "ACTIVE" },
    },
    select: { id: true },
  });

  if (!doctor) {
    throw new AppError(404, "DOCTOR_NOT_FOUND", "The doctor was not found.");
  }

  const now = new Date();
  const from = options.from ? new Date(options.from) : now;

  const where = {
    doctorId,
    status: "AVAILABLE" as const,
    startsAt: {
      gt: now,
      gte: from,
      ...(options.to ? { lt: new Date(options.to) } : {}),
    },
  };

  const [items, total] = await prisma.$transaction([
    prisma.availabilitySlot.findMany({
      where,
      orderBy: { startsAt: "asc" },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
    }),
    prisma.availabilitySlot.count({ where }),
  ]);

  return {
    data: items,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit),
    },
  };
}
