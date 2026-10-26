import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authConfig } from "../../config/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { AppError } from "../../common/errors/app-error";
import type { LoginInput, RegisterInput } from "./auth.schema";

const BCRYPT_ROUNDS = 12;

export async function registerUser(input: RegisterInput) {
  const passwordBytes = Buffer.byteLength(input.password, "utf8");

  if (passwordBytes > 72) {
    throw new AppError(
      400,
      "INVALID_PASSWORD",
      "Password must not exceed 72 UTF-8 bytes.",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: "PATIENT",
        profile: {
          create: {
            fullName: input.fullName,
          },
        },
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        profile: {
          select: {
            fullName: true,
          },
        },
      },
    });

    return user;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        409,
        "EMAIL_ALREADY_EXISTS",
        "An account with this email already exists.",
      );
    }

    throw error;
  }
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      status: true,
    },
  });

  if (!user) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
    );
  }

  const passwordMatches = await bcrypt.compare(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches || user.status !== "ACTIVE") {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
    );
  }

  const accessToken = jwt.sign({ role: user.role }, authConfig.JWT_SECRET, {
    subject: user.id,
    expiresIn: authConfig.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    issuer: "amrutam-telemedicine-backend",
    audience: "amrutam-api",
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    accessToken,
    tokenType: "Bearer",
    expiresIn: authConfig.JWT_EXPIRES_IN,
  };
}
