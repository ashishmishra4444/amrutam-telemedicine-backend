import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../common/middleware/authenticate";
import { adminAnalyticsQuerySchema } from "./admin.schema";
import { getAdminAnalytics } from "./admin.service";
import { getRequestId } from "../../observability/request-context";

export async function getAnalyticsHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = adminAnalyticsQuerySchema.parse(req.query);
    const requestId = getRequestId(req);
    const data = await getAdminAnalytics(query, req.user?.id, requestId);

    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}
