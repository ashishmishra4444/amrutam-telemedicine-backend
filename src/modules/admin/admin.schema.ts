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

export const adminAnalyticsQuerySchema = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .refine(
    (data) =>
      data.from === undefined ||
      data.to === undefined ||
      new Date(data.from).getTime() <= new Date(data.to).getTime(),
    {
      message: "'from' must be earlier than or equal to 'to'.",
      path: ["from"],
    },
  );

export type AdminAnalyticsQuery = z.infer<typeof adminAnalyticsQuerySchema>;
