
import { Router } from "express";
import { authenticate, authorize } from "../../common/middleware/authenticate";
import {
  createAvailabilityController,
  getDoctorController,
  listDoctorAvailabilityController,
  searchDoctorsController,
} from "./doctor.controller";

const doctorRouter = Router();

doctorRouter.get("/", searchDoctorsController);
doctorRouter.get("/:doctorId/availability", listDoctorAvailabilityController);
doctorRouter.get("/:doctorId", getDoctorController);

doctorRouter.post(
  "/availability",
  authenticate,
  authorize("DOCTOR"),
  createAvailabilityController,
);

export default doctorRouter;
