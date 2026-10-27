import { Prisma } from "@prisma/client";
import type { UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { AppError } from "../../common/errors/app-error";
import type { CreatePrescriptionInput } from "./prescription.schema";

type ListOptions = {
  page: number;
  limit: number;
};

export async function createPrescription(
  userId: string,
  input: CreatePrescriptionInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!doctor) {
        throw new AppError(
          403,
          "DOCTOR_PROFILE_REQUIRED",
          "A doctor profile is required to issue prescriptions.",
        );
      }

      const consultation = await tx.consultation.findFirst({
        where: {
          id: input.consultationId,
          doctorId: doctor.id,
        },
        select: {
          id: true,
          patientId: true,
          doctorId: true,
          status: true,
        },
      });

      if (!consultation) {
        throw new AppError(
          404,
          "CONSULTATION_NOT_FOUND",
          "The consultation was not found for this doctor.",
        );
      }

      if (consultation.status !== "COMPLETED") {
        throw new AppError(
          409,
          "CONSULTATION_NOT_COMPLETED",
          "A prescription can only be issued for a completed consultation.",
        );
      }

      const existing = await tx.prescription.findUnique({
        where: { consultationId: consultation.id },
        select: { id: true },
      });

      if (existing) {
        throw new AppError(
          409,
          "PRESCRIPTION_ALREADY_EXISTS",
          "A prescription already exists for this consultation.",
        );
      }

      return await tx.prescription.create({
        data: {
          consultationId: consultation.id,
          doctorId: consultation.doctorId,
          patientId: consultation.patientId,
          notes: input.notes,
        },
        select: {
          id: true,
          consultationId: true,
          doctorId: true,
          patientId: true,
          notes: true,
          issuedAt: true,
          updatedAt: true,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        409,
        "PRESCRIPTION_ALREADY_EXISTS",
        "A prescription already exists for this consultation.",
      );
    }

    throw error;
  }
}

export async function listPrescriptions(
  userId: string,
  role: UserRole,
  options: ListOptions,
) {
  let where: Prisma.PrescriptionWhereInput;

  if (role === "PATIENT") {
    where = { patientId: userId };
  } else if (role === "DOCTOR") {
    where = { doctor: { userId } };
  } else {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only patients and doctors can access prescriptions.",
    );
  }

  const [items, total] = await prisma.$transaction([
    prisma.prescription.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: {
        id: true,
        consultationId: true,
        notes: true,
        issuedAt: true,
        updatedAt: true,
        patient: {
          select: {
            id: true,
            profile: { select: { fullName: true } },
          },
        },
        doctor: {
          select: {
            id: true,
            specialization: true,
            user: {
              select: {
                id: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.prescription.count({ where }),
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

export async function getPrescriptionById(
  prescriptionId: string,
  userId: string,
  role: UserRole,
) {
  let where: Prisma.PrescriptionWhereInput;

  if (role === "PATIENT") {
    where = { id: prescriptionId, patientId: userId };
  } else if (role === "DOCTOR") {
    where = { id: prescriptionId, doctor: { userId } };
  } else {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only patients and doctors can access prescriptions.",
    );
  }

  const prescription = await prisma.prescription.findFirst({
    where,
    select: {
      id: true,
      consultationId: true,
      doctorId: true,
      patientId: true,
      notes: true,
      issuedAt: true,
      updatedAt: true,
    },
  });

  if (!prescription) {
    throw new AppError(
      404,
      "PRESCRIPTION_NOT_FOUND",
      "The prescription was not found for this account.",
    );
  }

  return prescription;
}
