import express from "express";
import cors from "cors";
import helmet from "helmet";
import { httpLogger } from "./observability/http-logger";
import { prisma } from "./config/database";
import { errorHandler } from "./common/middleware/error-handler";
import authRouter from "./modules/auth/auth.routes";
import { authenticate } from "./common/middleware/authenticate";

const app = express();

app.disable("x-powered-by");

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(httpLogger);

app.use("/api/v1/auth", authRouter);

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

app.get(
  "/api/v1/auth/me",
  authenticate,
  (req, res) => {
    res.status(200).json({
      data: (req as import("./common/middleware/authenticate").AuthenticatedRequest).user,
    });
  },
);

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
