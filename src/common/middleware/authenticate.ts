import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { prisma } from "../../config/database";
import { authConfig } from "../../config/auth";
import { AppError } from "../errors/app-error";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: "PATIENT" | "DOCTOR" | "ADMIN";
  };
}

const JWT_ISSUER = "amrutam-telemedicine-backend";
const JWT_AUDIENCE = "amrutam-api";

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Authentication token is required.",
      );
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Authentication token is required.",
      );
    }

    let payload: string | JwtPayload;

    try {
      payload = jwt.verify(token, authConfig.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      throw new AppError(
        401,
        "INVALID_TOKEN",
        "Authentication token is invalid or expired.",
      );
    }

    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      !["PATIENT", "DOCTOR", "ADMIN"].includes(String(payload.role))
    ) {
      throw new AppError(
        401,
        "INVALID_TOKEN",
        "Authentication token is invalid.",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppError(401, "UNAUTHORIZED", "User account is unavailable.");
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(
  ...allowedRoles: Array<"PATIENT" | "DOCTOR" | "ADMIN">
) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Authentication is required."));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        new AppError(
          403,
          "FORBIDDEN",
          "You do not have permission to access this resource.",
        ),
      );
      return;
    }

    next();
  };
}
