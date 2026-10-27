import { Router } from "express";
import { authenticate, authorize } from "../../common/middleware/authenticate";
import { createConsultationController } from "./consultation.controller";
import {
  listConsultationsController,
  updateConsultationStatusController,
} from "./consultation-lifecycle.controller";

const consultationRouter = Router();

consultationRouter.post(
  "/",
  authenticate,
  authorize("PATIENT"),
  createConsultationController,
);

consultationRouter.get(
  "/",
  authenticate,
  authorize("PATIENT", "DOCTOR"),
  listConsultationsController,
);

consultationRouter.patch(
  "/:consultationId/status",
  authenticate,
  authorize("PATIENT", "DOCTOR"),
  updateConsultationStatusController,
);

export default consultationRouter;
