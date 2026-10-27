import { ConsultationStatus } from "@prisma/client";
import type { UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { AppError } from "../../common/errors/app-error";
import { writeAuditEvent } from "../../observability/audit.service";

type ListOptions = {
  page: number;
  limit: number;
};

const transitions: Partial<Record<ConsultationStatus, ConsultationStatus[]>> = {
  BOOKED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
};

function ownerFilter(userId: string, role: UserRole) {
  if (role === "PATIENT") {
    return { patientId: userId };
  }

  if (role === "DOCTOR") {
    return { doctor: { userId } };
  }

  throw new AppError(
    403,
    "FORBIDDEN",
    "Only patients and doctors can access consultations.",
  );
}

export async function listConsultations(
  userId: string,
  role: UserRole,
  options: ListOptions,
) {
  const where = ownerFilter(userId, role);

  const [items, total] = await prisma.$transaction([
    prisma.consultation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
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
            consultationFee: true,
            user: {
              select: {
                id: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
        slot: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
    }),
    prisma.consultation.count({ where }),
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

export async function updateConsultationStatus(
  consultationId: string,
  userId: string,
  role: UserRole,
  nextStatus: ConsultationStatus,
  requestId?: string,
) {
  const allowedRoles: Record<ConsultationStatus, UserRole[]> = {
    BOOKED: [],
    CONFIRMED: ["DOCTOR"],
    IN_PROGRESS: ["DOCTOR"],
    COMPLETED: ["DOCTOR"],
    CANCELLED: ["PATIENT"],
    NO_SHOW: ["DOCTOR"],
  };

  if (!allowedRoles[nextStatus]?.includes(role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Your role is not allowed to perform this status transition.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const consultation = await tx.consultation.findFirst({
      where: {
        id: consultationId,
        ...ownerFilter(userId, role),
      },
      select: {
        id: true,
        status: true,
        slotId: true,
        patientId: true,
        doctorId: true,
      },
    });

    if (!consultation) {
      throw new AppError(
        404,
        "CONSULTATION_NOT_FOUND",
        "The consultation was not found for this account.",
      );
    }

    if (!transitions[consultation.status]?.includes(nextStatus)) {
      throw new AppError(
        409,
        "INVALID_STATUS_TRANSITION",
        `Cannot change consultation status from ${consultation.status} to ${nextStatus}.`,
      );
    }

    const updated = await tx.consultation.updateMany({
      where: {
        id: consultation.id,
        status: consultation.status,
      },
      data: { status: nextStatus },
    });

    if (updated.count !== 1) {
      throw new AppError(
        409,
        "CONSULTATION_STATUS_CONFLICT",
        "The consultation status changed concurrently. Refresh and try again.",
      );
    }

    await writeAuditEvent(
      {
        actorId: userId,
        action: "CONSULTATION_STATUS_CHANGED",
        resourceType: "CONSULTATION",
        resourceId: consultation.id,
        requestId,
        metadata: {
          previousStatus: consultation.status,
          newStatus: nextStatus,
        },
      },
      tx,
    );

    if (nextStatus === "CANCELLED") {
      await tx.availabilitySlot.updateMany({
        where: {
          id: consultation.slotId,
          status: "BOOKED",
        },
        data: { status: "AVAILABLE" },
      });
    }

    const result = await tx.consultation.findUnique({
      where: { id: consultation.id },
      select: {
        id: true,
        patientId: true,
        doctorId: true,
        slotId: true,
        status: true,
        reason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!result) {
      throw new AppError(
        500,
        "CONSULTATION_UPDATE_FAILED",
        "Could not retrieve the updated consultation.",
      );
    }

    return result;
  });
}
