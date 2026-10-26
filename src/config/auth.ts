import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const authConfigSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),
});

export const authConfig = authConfigSchema.parse({
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
});
