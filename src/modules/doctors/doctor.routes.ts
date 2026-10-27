import { Router } from "express";
import { authenticate, authorize } from "../../common/middleware/authenticate";
import { createAvailabilityController } from "./doctor.controller";

const doctorRouter = Router();

doctorRouter.post(
  "/availability",
  authenticate,
  authorize("DOCTOR"),
  createAvailabilityController,
);

export default doctorRouter;
