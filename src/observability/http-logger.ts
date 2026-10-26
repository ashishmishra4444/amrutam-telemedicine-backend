import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

export const httpLogger = pinoHttp({
  logger,

  genReqId: (req) => {
    const suppliedId = req.headers["x-request-id"];

    return typeof suppliedId === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(suppliedId)
      ? suppliedId
      : randomUUID();
  },

  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },

    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});
