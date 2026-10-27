import { z } from "zod";

const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    "Must be a valid ISO datetime with a timezone.",
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be a valid datetime.",
  });

export const createAvailabilitySchema = z
  .object({
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
  })
  .refine(
    (data) =>
      new Date(data.endsAt).getTime() > new Date(data.startsAt).getTime(),
    {
      message: "End time must be after start time.",
      path: ["endsAt"],
    },
  )
  .refine((data) => new Date(data.startsAt).getTime() > Date.now(), {
    message: "Availability must start in the future.",
    path: ["startsAt"],
  });

export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;

export const doctorSearchSchema = z
  .object({
    search: z.string().trim().min(1).max(120).optional(),
    specialization: z.string().trim().min(1).max(120).optional(),
    minFee: z.coerce.number().min(0).max(1000000).optional(),
    maxFee: z.coerce.number().min(0).max(1000000).optional(),
    minExperience: z.coerce.number().int().min(0).max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine(
    (data) =>
      data.minFee === undefined ||
      data.maxFee === undefined ||
      data.minFee <= data.maxFee,
    {
      message: "minFee must be less than or equal to maxFee.",
      path: ["minFee"],
    },
  );

export type DoctorSearchInput = z.infer<typeof doctorSearchSchema>;

export const doctorIdSchema = z.uuid();

export const doctorAvailabilityQuerySchema = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine(
    (data) =>
      data.from === undefined ||
      data.to === undefined ||
      new Date(data.from).getTime() < new Date(data.to).getTime(),
    {
      message: "from must be earlier than to.",
      path: ["to"],
    },
  );
