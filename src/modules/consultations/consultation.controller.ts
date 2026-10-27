import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/authenticate";
import { AppError } from "../../common/errors/app-error";
import { createConsultationSchema } from "./consultation.schema";
import { createConsultation } from "./consultation.service";
import { getRequestId } from "../../observability/request-context";

export async function createConsultationController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    const idempotencyKey = req.get("Idempotency-Key")?.trim();

    if (
      !idempotencyKey ||
      idempotencyKey.length > 255 ||
      !/^[\x21-\x7E]+$/.test(idempotencyKey)
    ) {
      throw new AppError(
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Provide an Idempotency-Key header containing 1–255 printable ASCII characters.",
      );
    }

    const input = createConsultationSchema.parse(req.body);

    const result = await createConsultation(
      req.user.id,
      input,
      idempotencyKey,
      getRequestId(req),
    );

    res.setHeader("Idempotency-Replayed", String(result.replayed));
    res.status(result.statusCode).json(result.body);
  } catch (error) {
    next(error);
  }
}
