import { Router } from "express";
import { authenticate, authorize } from "../../common/middleware/authenticate";
import {
  createPrescriptionController,
  getPrescriptionByIdController,
  listPrescriptionsController,
} from "./prescription.controller";

const prescriptionRouter = Router();

prescriptionRouter.post(
  "/",
  authenticate,
  authorize("DOCTOR"),
  createPrescriptionController,
);

prescriptionRouter.get(
  "/",
  authenticate,
  authorize("PATIENT", "DOCTOR"),
  listPrescriptionsController,
);

prescriptionRouter.get(
  "/:prescriptionId",
  authenticate,
  authorize("PATIENT", "DOCTOR"),
  getPrescriptionByIdController,
);

export default prescriptionRouter;
