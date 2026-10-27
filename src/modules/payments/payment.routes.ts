import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authenticate";
import {
  createPaymentController,
  getPaymentController,
  listPaymentsController,
} from "./payment.controller";

const paymentRouter = Router();

paymentRouter.use(authenticate);

paymentRouter.post("/", authorize("PATIENT"), createPaymentController);

paymentRouter.get("/", authorize("PATIENT", "DOCTOR"), listPaymentsController);

paymentRouter.get(
  "/:paymentId",
  authorize("PATIENT", "DOCTOR"),
  getPaymentController,
);

export default paymentRouter;
