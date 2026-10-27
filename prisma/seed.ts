import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Database seeding is disabled in production.");
  }

  const email = process.env.SEED_DOCTOR_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_DOCTOR_PASSWORD;
  const fullName = process.env.SEED_DOCTOR_NAME?.trim();
  const specialization = process.env.SEED_DOCTOR_SPECIALIZATION?.trim();

  if (!email || !password || !fullName || !specialization) {
    throw new Error(
      "Set SEED_DOCTOR_EMAIL, SEED_DOCTOR_PASSWORD, " +
        "SEED_DOCTOR_NAME and SEED_DOCTOR_SPECIALIZATION in .env.",
    );
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Seed password must not exceed 72 UTF-8 bytes.");
  }

  if (password.length < 12) {
    throw new Error("Seed password must contain at least 12 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (existingUser && existingUser.role !== "DOCTOR") {
      throw new Error(
        "The seed email belongs to a non-doctor account. " +
          "Use a separate development email.",
      );
    }

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : await tx.user.create({
          data: {
            email,
            passwordHash,
            role: "DOCTOR",
            status: "ACTIVE",
            profile: {
              create: { fullName },
            },
          },
          select: { id: true },
        });

    await tx.profile.upsert({
      where: { userId: user.id },
      update: { fullName },
      create: { userId: user.id, fullName },
    });

    await tx.doctor.upsert({
      where: { userId: user.id },
      update: {
        specialization,
        verified: true,
      },
      create: {
        userId: user.id,
        specialization,
        experienceYears: 1,
        consultationFee: 500,
        verified: true,
      },
    });
  });

  console.log("Development doctor seed completed.");
  console.log(`Doctor email: ${email}`);
  console.log("Doctor password: not displayed.");
}

main()
  .catch((error: unknown) => {
    console.error("Development doctor seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
