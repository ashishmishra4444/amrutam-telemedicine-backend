import { z } from "zod";

export const consultationIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "A valid consultation ID is required.",
  );

export const updateConsultationStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
});

export const consultationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type UpdateConsultationStatusInput = z.infer<
  typeof updateConsultationStatusSchema
>;
