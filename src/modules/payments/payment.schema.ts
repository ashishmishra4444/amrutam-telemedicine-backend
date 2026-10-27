import { z } from "zod";

export const createPaymentSchema = z.object({
  consultationId: z.uuid(),
});

export const paymentIdSchema = z.uuid();

export const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
