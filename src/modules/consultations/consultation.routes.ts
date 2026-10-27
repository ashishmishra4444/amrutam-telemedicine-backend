import { Router } from "express";
import { authenticate, authorize } from "../../common/middleware/authenticate";
import { createConsultationController } from "./consultation.controller";

const consultationRouter = Router();

consultationRouter.post(
  "/",
  authenticate,
  authorize("PATIENT"),
  createConsultationController,
);

export default consultationRouter;
