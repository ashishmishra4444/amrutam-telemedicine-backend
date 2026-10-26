import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .max(255)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address")
  .transform((value) => value.toLowerCase());

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(12).max(72),
  fullName: z.string().trim().min(2).max(150),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
