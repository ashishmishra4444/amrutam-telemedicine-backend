import { PrismaClient } from "@prisma/client";

const isTest = process.env.NODE_ENV === "test";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (isTest) {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL must be configured when NODE_ENV=test.");
  }

  const parsedUrl = new URL(testDatabaseUrl);

  if (parsedUrl.pathname.replace(/^\//, "") !== "amrutam_telemedicine_test") {
    throw new Error("Tests may only connect to amrutam_telemedicine_test.");
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(isTest ? { datasources: { db: { url: testDatabaseUrl! } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
