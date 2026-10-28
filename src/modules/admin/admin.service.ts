import type { Prisma, ConsultationStatus, PaymentStatus, SlotStatus, UserRole, UserStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import { writeAuditEvent } from "../../observability/audit.service";
import type { AdminAnalyticsQuery } from "./admin.schema";

export interface ConsultationAnalytics {
  total: number;
  byStatus: Record<ConsultationStatus, number>;
  completionRatePercent: number;
  cancellationRatePercent: number;
}

export interface DoctorUtilizationAnalytics {
  totalDoctors: number;
  verifiedDoctors: number;
  activeConsultingDoctors: number;
  slots: {
    total: number;
    byStatus: Record<SlotStatus, number>;
    utilizationRatePercent: number;
  };
}

export interface PaymentStatusSummary {
  count: number;
  totalAmount: number;
}

export interface PaymentAnalytics {
  totalCount: number;
  currency: string;
  byStatus: Record<PaymentStatus, PaymentStatusSummary>;
  totalCollectedRevenue: number;
  totalPendingAmount: number;
}

export interface UserAnalytics {
  total: number;
  byRole: Record<UserRole, number>;
  byStatus: Record<UserStatus, number>;
}

export interface AdminAnalyticsReport {
  timeRange: {
    from: string | null;
    to: string | null;
  };
  generatedAt: string;
  consultations: ConsultationAnalytics;
  doctors: DoctorUtilizationAnalytics;
  payments: PaymentAnalytics;
  users: UserAnalytics;
}

export async function getAdminAnalytics(
  query: AdminAnalyticsQuery,
  adminUserId?: string,
  requestId?: string,
): Promise<AdminAnalyticsReport> {
  const fromDate = query.from ? new Date(query.from) : undefined;
  const toDate = query.to ? new Date(query.to) : undefined;

  const consultationWhere: Prisma.ConsultationWhereInput = {};
  if (fromDate || toDate) {
    consultationWhere.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const paymentWhere: Prisma.PaymentWhereInput = {};
  if (fromDate || toDate) {
    paymentWhere.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const slotWhere: Prisma.AvailabilitySlotWhereInput = {};
  if (fromDate || toDate) {
    slotWhere.startsAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  // Execute aggregations concurrently
  const [
    consultationStatusGroups,
    totalConsultations,
    activeDoctorConsultations,
    totalDoctors,
    verifiedDoctors,
    slotStatusGroups,
    totalSlots,
    paymentStatusGroups,
    totalPayments,
    userRoleGroups,
    userStatusGroups,
    totalUsers,
  ] = await Promise.all([
    prisma.consultation.groupBy({
      by: ["status"],
      where: consultationWhere,
      _count: { id: true },
    }),
    prisma.consultation.count({ where: consultationWhere }),
    prisma.consultation.findMany({
      where: consultationWhere,
      distinct: ["doctorId"],
      select: { doctorId: true },
    }),
    prisma.doctor.count(),
    prisma.doctor.count({ where: { verified: true } }),
    prisma.availabilitySlot.groupBy({
      by: ["status"],
      where: slotWhere,
      _count: { id: true },
    }),
    prisma.availabilitySlot.count({ where: slotWhere }),
    prisma.payment.groupBy({
      by: ["status"],
      where: paymentWhere,
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.payment.count({ where: paymentWhere }),
    prisma.user.groupBy({
      by: ["role"],
      _count: { id: true },
    }),
    prisma.user.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.user.count(),
  ]);

  // Build consultation breakdown
  const consultationsByStatus: Record<ConsultationStatus, number> = {
    BOOKED: 0,
    CONFIRMED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    NO_SHOW: 0,
  };
  for (const group of consultationStatusGroups) {
    consultationsByStatus[group.status] = group._count.id;
  }

  const completed = consultationsByStatus.COMPLETED;
  const cancelled = consultationsByStatus.CANCELLED;
  const nonCancelled = totalConsultations - cancelled;
  const completionRatePercent =
    nonCancelled > 0 ? Number(((completed / nonCancelled) * 100).toFixed(2)) : 0;
  const cancellationRatePercent =
    totalConsultations > 0 ? Number(((cancelled / totalConsultations) * 100).toFixed(2)) : 0;

  // Build slot breakdown & doctor utilization
  const slotsByStatus: Record<SlotStatus, number> = {
    AVAILABLE: 0,
    BOOKED: 0,
    BLOCKED: 0,
  };
  for (const group of slotStatusGroups) {
    slotsByStatus[group.status] = group._count.id;
  }

  const bookableSlots = slotsByStatus.AVAILABLE + slotsByStatus.BOOKED;
  const utilizationRatePercent =
    bookableSlots > 0 ? Number(((slotsByStatus.BOOKED / bookableSlots) * 100).toFixed(2)) : 0;

  // Build payment breakdown
  const paymentsByStatus: Record<PaymentStatus, PaymentStatusSummary> = {
    PENDING: { count: 0, totalAmount: 0 },
    SUCCESS: { count: 0, totalAmount: 0 },
    FAILED: { count: 0, totalAmount: 0 },
    REFUNDED: { count: 0, totalAmount: 0 },
  };
  for (const group of paymentStatusGroups) {
    paymentsByStatus[group.status] = {
      count: group._count.id,
      totalAmount: group._sum.amount ? Number(group._sum.amount) : 0,
    };
  }

  // Build user breakdown
  const usersByRole: Record<UserRole, number> = {
    PATIENT: 0,
    DOCTOR: 0,
    ADMIN: 0,
  };
  for (const group of userRoleGroups) {
    usersByRole[group.role] = group._count.id;
  }

  const usersByStatus: Record<UserStatus, number> = {
    ACTIVE: 0,
    INACTIVE: 0,
    SUSPENDED: 0,
  };
  for (const group of userStatusGroups) {
    usersByStatus[group.status] = group._count.id;
  }

  // Write audit trail for administrator analytics access
  if (adminUserId) {
    await writeAuditEvent({
      actorId: adminUserId,
      action: "ADMIN_ANALYTICS_ACCESSED",
      resourceType: "SYSTEM",
      resourceId: null,
      requestId,
      metadata: {
        from: fromDate?.toISOString() ?? null,
        to: toDate?.toISOString() ?? null,
      },
    });
  }

  return {
    timeRange: {
      from: fromDate?.toISOString() ?? null,
      to: toDate?.toISOString() ?? null,
    },
    generatedAt: new Date().toISOString(),
    consultations: {
      total: totalConsultations,
      byStatus: consultationsByStatus,
      completionRatePercent,
      cancellationRatePercent,
    },
    doctors: {
      totalDoctors,
      verifiedDoctors,
      activeConsultingDoctors: activeDoctorConsultations.length,
      slots: {
        total: totalSlots,
        byStatus: slotsByStatus,
        utilizationRatePercent,
      },
    },
    payments: {
      totalCount: totalPayments,
      currency: "INR",
      byStatus: paymentsByStatus,
      totalCollectedRevenue: paymentsByStatus.SUCCESS.totalAmount,
      totalPendingAmount: paymentsByStatus.PENDING.totalAmount,
    },
    users: {
      total: totalUsers,
      byRole: usersByRole,
      byStatus: usersByStatus,
    },
  };
}
