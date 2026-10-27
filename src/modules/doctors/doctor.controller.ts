import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/authenticate";
import { createAvailabilitySchema } from "./doctor.schema";
import { createAvailability } from "./doctor.service";
import { AppError } from "../../common/errors/app-error";

export async function createAvailabilityController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const input = createAvailabilitySchema.parse(req.body);
    const availability = await createAvailability(req.user.id, input);

    res.status(201).json({
      message: "Availability created successfully.",
      data: availability,
    });
  } catch (error) {
    next(error);
  }
}
