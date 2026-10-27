import { z } from "zod";

export const createPrescriptionSchema = z.object({
  consultationId: z.uuid(),
  notes: z.string().trim().min(1).max(10000).optional(),
});

export const prescriptionIdSchema = z.uuid();

export const prescriptionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
