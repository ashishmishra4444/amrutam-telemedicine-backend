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
