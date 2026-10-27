import type { Request } from "express";

export function getRequestId(req: Request): string | undefined {
  const requestId = req.id;

  return requestId === undefined || requestId === null
    ? undefined
    : String(requestId);
}
