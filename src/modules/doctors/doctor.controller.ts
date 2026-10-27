import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/authenticate";
import {
  createAvailabilitySchema,
  doctorAvailabilityQuerySchema,
  doctorIdSchema,
  doctorSearchSchema,
} from "./doctor.schema";
import {
  createAvailability,
  getDoctorById,
  listDoctorAvailability,
  searchDoctors,
} from "./doctor.service";
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

export async function searchDoctorsController(
  req: import("express").Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = doctorSearchSchema.parse(req.query);
    const result = await searchDoctors(input);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getDoctorController(
  req: import("express").Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doctorId = doctorIdSchema.parse(req.params.doctorId);
    const doctor = await getDoctorById(doctorId);
    res.status(200).json({ data: doctor });
  } catch (error) {
    next(error);
  }
}

export async function listDoctorAvailabilityController(
  req: import("express").Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doctorId = doctorIdSchema.parse(req.params.doctorId);
    const query = doctorAvailabilityQuerySchema.parse(req.query);

    const result = await listDoctorAvailability(doctorId, query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
