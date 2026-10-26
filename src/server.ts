import dotenv from "dotenv";
import app from "./app";
import { prisma } from "./config/database";
import { logger } from "./observability/logger";

dotenv.config();

const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, () => {
  logger.info({ port }, "Amrutam API started");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down server");

  server.close(async (error) => {
    try {
      await prisma.$disconnect();

      if (error) {
        logger.error({ err: error }, "HTTP server shutdown failed");
        process.exitCode = 1;
      }
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, "Database disconnect failed");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
