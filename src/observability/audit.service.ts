import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export type AuditEvent = {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  outcome?: string;
  metadata?: Prisma.InputJsonValue;
};

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export async function writeAuditEvent(
  event: AuditEvent,
  client: AuditClient = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId ?? null,
      requestId: event.requestId ?? null,
      outcome: event.outcome ?? "SUCCESS",
      ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
    },
  });
}
