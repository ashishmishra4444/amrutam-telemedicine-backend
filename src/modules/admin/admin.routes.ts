import { Router } from "express";
import { authenticate, authorize } from "../../common/middleware/authenticate";
import { getAnalyticsHandler } from "./admin.controller";

const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(authorize("ADMIN"));

adminRouter.get("/analytics", getAnalyticsHandler);

export default adminRouter;
