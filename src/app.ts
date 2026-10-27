import express from "express";
import cors from "cors";
import helmet from "helmet";
import { httpLogger } from "./observability/http-logger";
import { prisma } from "./config/database";
import { errorHandler } from "./common/middleware/error-handler";
import authRouter from "./modules/auth/auth.routes";
import { authenticate } from "./common/middleware/authenticate";
import doctorRouter from "./modules/doctors/doctor.routes";
import consultationRouter from "./modules/consultations/consultation.routes";
import prescriptionRouter from "./modules/prescriptions/prescription.routes";
import paymentRouter from "./modules/payments/payment.routes";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id"],
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(httpLogger);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/doctors", doctorRouter);
app.use("/api/v1/consultations", consultationRouter);
app.use("/api/v1/prescriptions", prescriptionRouter);
app.use("/api/v1/payments", paymentRouter);

app.get("/health/live", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "amrutam-telemedicine-backend",
  });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ready",
      database: "connected",
    });
  } catch {
    res.status(503).json({
      status: "not_ready",
      database: "unavailable",
    });
  }
});

app.get("/api/v1/auth/me", authenticate, (req, res) => {
  res.status(200).json({
    data: (req as import("./common/middleware/authenticate").AuthenticatedRequest).user,
  });
});

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    },
  });
});

app.use(errorHandler);

export default app;

