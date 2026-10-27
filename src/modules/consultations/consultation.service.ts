import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { AppError } from "../../common/errors/app-error";
import type { CreateConsultationInput } from "./consultation.schema";

type BookingBody = {
  message: string;
  data: {
    id: string;
    patientId: string;
    doctorId: string;
    slotId: string;
    status: string;
    reason: string | null;
    createdAt: string;
  };
};

type BookingResult = {
  statusCode: number;
  body: BookingBody;
  replayed: boolean;
};

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function hashRequest(input: CreateConsultationInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        slotId: input.slotId,
        reason: input.reason ?? null,
      }),
    )
    .digest("hex");
}

export async function createConsultation(
  patientId: string,
  input: CreateConsultationInput,
  idempotencyKey: string,
): Promise<BookingResult> {
  const requestHash = hashRequest(input);

  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();

      const existingKey = await tx.idempotencyKey.findUnique({
        where: {
          userId_key: {
            userId: patientId,
            key: idempotencyKey,
          },
        },
      });

      if (existingKey && existingKey.expiresAt > now) {
        if (existingKey.requestHash !== requestHash) {
          throw new AppError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different request.",
          );
        }

        if (
          existingKey.responseStatus !== null &&
          existingKey.responseBody !== null
        ) {
          return {
            statusCode: existingKey.responseStatus,
            body: existingKey.responseBody as unknown as BookingBody,
            replayed: true,
          };
        }

        throw new AppError(
          409,
          "IDEMPOTENCY_REQUEST_IN_PROGRESS",
          "A request with this idempotency key is already in progress.",
        );
      }

      if (existingKey) {
        await tx.idempotencyKey.delete({
          where: { id: existingKey.id },
        });
      }

      const slot = await tx.availabilitySlot.findUnique({
        where: { id: input.slotId },
        select: {
          id: true,
          doctorId: true,
          startsAt: true,
          status: true,
          doctor: {
            select: {
              verified: true,
              user: {
                select: { status: true },
              },
            },
          },
        },
      });

      if (!slot) {
        throw new AppError(
          404,
          "SLOT_NOT_FOUND",
          "The requested availability slot was not found.",
        );
      }

      if (
        slot.status !== "AVAILABLE" ||
        slot.startsAt <= now ||
        !slot.doctor.verified ||
        slot.doctor.user.status !== "ACTIVE"
      ) {
        throw new AppError(
          409,
          "SLOT_UNAVAILABLE",
          "This availability slot is not available for booking.",
        );
      }

      await tx.idempotencyKey.create({
        data: {
          userId: patientId,
          key: idempotencyKey,
          requestHash,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });

      // Atomically claim the slot. Only one concurrent request can
      // change an AVAILABLE slot to BOOKED.
      const claimed = await tx.availabilitySlot.updateMany({
        where: {
          id: slot.id,
          status: "AVAILABLE",
          startsAt: { gt: now },
        },
        data: { status: "BOOKED" },
      });

      if (claimed.count !== 1) {
        throw new AppError(
          409,
          "SLOT_UNAVAILABLE",
          "This availability slot has already been booked.",
        );
      }

      const consultation = await tx.consultation.create({
        data: {
          patientId,
          doctorId: slot.doctorId,
          slotId: slot.id,
          status: "BOOKED",
          reason: input.reason?.trim() || null,
        },
        select: {
          id: true,
          patientId: true,
          doctorId: true,
          slotId: true,
          status: true,
          reason: true,
          createdAt: true,
        },
      });

      const body: BookingBody = {
        message: "Consultation booked successfully.",
        data: {
          ...consultation,
          createdAt: consultation.createdAt.toISOString(),
        },
      };

      await tx.idempotencyKey.update({
        where: {
          userId_key: {
            userId: patientId,
            key: idempotencyKey,
          },
        },
        data: {
          responseStatus: 201,
          responseBody: body as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        statusCode: 201,
        body,
        replayed: false,
      };
    });
  } catch (error) {
    // A concurrent retry can race to insert the same unique key.
    // Recover the completed response if another request won that race.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: {
          userId_key: {
            userId: patientId,
            key: idempotencyKey,
          },
        },
      });

      if (existing && existing.expiresAt > new Date()) {
        if (existing.requestHash !== requestHash) {
          throw new AppError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different request.",
          );
        }

        if (
          existing.responseStatus !== null &&
          existing.responseBody !== null
        ) {
          return {
            statusCode: existing.responseStatus,
            body: existing.responseBody as unknown as BookingBody,
            replayed: true,
          };
        }
      }
    }

    throw error;
  }
}
