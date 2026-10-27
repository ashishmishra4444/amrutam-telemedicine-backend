import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/authenticate";
import { AppError } from "../../common/errors/app-error";
import {
  consultationIdSchema,
  consultationListQuerySchema,
  updateConsultationStatusSchema,
} from "./consultation-lifecycle.schema";
import {
  listConsultations,
  updateConsultationStatus,
} from "./consultation-lifecycle.service";
import { getRequestId } from "../../observability/request-context";

export async function listConsultationsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const query = consultationListQuerySchema.parse(req.query);
    const result = await listConsultations(req.user.id, req.user.role, query);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateConsultationStatusController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const consultationId = consultationIdSchema.parse(
      req.params.consultationId,
    );
    const { status } = updateConsultationStatusSchema.parse(req.body);

    const result = await updateConsultationStatus(
      consultationId,
      req.user.id,
      req.user.role,
      status,
      getRequestId(req),
    );

    res.status(200).json({
      message: "Consultation status updated successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
