import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { AppError } from "../../common/errors/app-error";
import { writeAuditEvent } from "../../observability/audit.service";

type ListOptions = {
  page: number;
  limit: number;
};

function paymentOwnerFilter(userId: string, role: UserRole) {
  if (role === "PATIENT") {
    return { consultation: { patientId: userId } };
  }

  if (role === "DOCTOR") {
    return { consultation: { doctor: { userId } } };
  }

  throw new AppError(
    403,
    "FORBIDDEN",
    "Only patients and doctors can access payments.",
  );
}

const paymentSelect = {
  id: true,
  consultationId: true,
  amount: true,
  currency: true,
  status: true,
  providerReference: true,
  createdAt: true,
  updatedAt: true,
  consultation: {
    select: {
      id: true,
      status: true,
      patientId: true,
      doctor: {
        select: {
          id: true,
          consultationFee: true,
          user: {
            select: {
              profile: {
                select: { fullName: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function createPayment(
  consultationId: string,
  userId: string,
  requestId?: string,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.findFirst({
        where: {
          id: consultationId,
          patientId: userId,
        },
        select: {
          id: true,
          status: true,
          doctor: {
            select: {
              consultationFee: true,
            },
          },
        },
      });

      if (!consultation) {
        throw new AppError(
          404,
          "CONSULTATION_NOT_FOUND",
          "The consultation was not found for this account.",
        );
      }

      if (
        consultation.status === "CANCELLED" ||
        consultation.status === "NO_SHOW"
      ) {
        throw new AppError(
          409,
          "PAYMENT_NOT_ALLOWED",
          "Payment cannot be initiated for a cancelled or missed consultation.",
        );
      }

      const existingPendingPayment = await tx.payment.findFirst({
        where: {
          consultationId,
          status: "PENDING",
        },
        select: { id: true },
      });

      if (existingPendingPayment) {
        throw new AppError(
          409,
          "PAYMENT_ALREADY_PENDING",
          "A pending payment already exists for this consultation.",
        );
      }

      const payment = await tx.payment.create({
        data: {
          consultationId,
          amount: consultation.doctor.consultationFee,
          currency: "INR",
          status: "PENDING",
        },
        select: paymentSelect,
      });

      await writeAuditEvent(
        {
          actorId: userId,
          action: "PAYMENT_INITIATED",
          resourceType: "PAYMENT",
          resourceId: payment.id,
          requestId,
          metadata: {
            consultationId: payment.consultationId,
            status: payment.status,
            currency: payment.currency,
          },
        },
        tx,
      );

      return payment;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        409,
        "PAYMENT_ALREADY_PENDING",
        "A pending payment already exists for this consultation.",
      );
    }

    throw error;
  }
}

export async function listPayments(
  userId: string,
  role: UserRole,
  options: ListOptions,
) {
  const where = paymentOwnerFilter(userId, role);

  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: paymentSelect,
    }),
    prisma.payment.count({ where }),
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

export async function getPayment(
  paymentId: string,
  userId: string,
  role: UserRole,
) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      ...paymentOwnerFilter(userId, role),
    },
    select: paymentSelect,
  });

  if (!payment) {
    throw new AppError(
      404,
      "PAYMENT_NOT_FOUND",
      "The payment was not found for this account.",
    );
  }

  return payment;
}
