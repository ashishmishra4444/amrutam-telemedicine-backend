import { z } from "zod";

export const createConsultationSchema = z.object({
  slotId: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      "A valid availability slot ID is required.",
    ),
  reason: z
    .string()
    .trim()
    .max(1000, "Reason must not exceed 1000 characters.")
    .optional(),
});

export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;
