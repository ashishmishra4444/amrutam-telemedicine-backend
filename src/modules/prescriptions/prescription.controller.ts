import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/authenticate";
import { AppError } from "../../common/errors/app-error";
import {
  createPrescriptionSchema,
  prescriptionIdSchema,
  prescriptionListQuerySchema,
} from "./prescription.schema";
import {
  createPrescription,
  getPrescriptionById,
  listPrescriptions,
} from "./prescription.service";

export async function createPrescriptionController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const input = createPrescriptionSchema.parse(req.body);
    const prescription = await createPrescription(req.user.id, input);

    res.status(201).json({
      message: "Prescription created successfully.",
      data: prescription,
    });
  } catch (error) {
    next(error);
  }
}

export async function listPrescriptionsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const query = prescriptionListQuerySchema.parse(req.query);
    const result = await listPrescriptions(req.user.id, req.user.role, query);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPrescriptionByIdController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const prescriptionId = prescriptionIdSchema.parse(
      req.params.prescriptionId,
    );

    const prescription = await getPrescriptionById(
      prescriptionId,
      req.user.id,
      req.user.role,
    );

    res.status(200).json({ data: prescription });
  } catch (error) {
    next(error);
  }
}
