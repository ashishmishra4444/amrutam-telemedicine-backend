import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/authenticate";
import { AppError } from "../../common/errors/app-error";
import {
  createPaymentSchema,
  paymentIdSchema,
  paymentListQuerySchema,
} from "./payment.schema";
import { createPayment, getPayment, listPayments } from "./payment.service";
import { getRequestId } from "../../observability/request-context";

export async function createPaymentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const body = createPaymentSchema.parse(req.body);
    const payment = await createPayment(
      body.consultationId,
      user.id,
      getRequestId(req),
    );

    res.status(201).json({ data: payment });
  } catch (error) {
    next(error);
  }
}

export async function listPaymentsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const query = paymentListQuerySchema.parse(req.query);
    const result = await listPayments(user.id, user.role, query);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPaymentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const paymentId = paymentIdSchema.parse(req.params.paymentId);
    const payment = await getPayment(paymentId, user.id, user.role);

    res.status(200).json({ data: payment });
  } catch (error) {
    next(error);
  }
}
