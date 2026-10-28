import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../src/app";
import { prisma } from "../../src/config/database";
import { authConfig } from "../../src/config/auth";
import { getAdminAnalytics } from "../../src/modules/admin/admin.service";

const createdUserIds: string[] = [];
let adminUserId: string;
let doctorUserId: string;
let doctorId: string;
let patientUserId: string;
let consultationId: string;
let slotId: string;
let paymentId: string;

function createTestToken(userId: string, role: "ADMIN" | "DOCTOR" | "PATIENT"): string {
  return jwt.sign({ role }, authConfig.JWT_SECRET, {
    subject: userId,
    expiresIn: "15m",
    issuer: "amrutam-telemedicine-backend",
    audience: "amrutam-api",
  });
}

async function prepareRecords() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Create Admin
  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}@example.test`,
      passwordHash: "test-hash",
      role: "ADMIN",
      status: "ACTIVE",
      profile: { create: { fullName: "Test Administrator" } },
    },
  });
  adminUserId = admin.id;
  createdUserIds.push(admin.id);

  // Create Patient
  const patient = await prisma.user.create({
    data: {
      email: `patient-${suffix}@example.test`,
      passwordHash: "test-hash",
      role: "PATIENT",
      status: "ACTIVE",
      profile: { create: { fullName: "Test Patient" } },
    },
  });
  patientUserId = patient.id;
  createdUserIds.push(patient.id);

  // Create Doctor
  const doctor = await prisma.user.create({
    data: {
      email: `doctor-${suffix}@example.test`,
      passwordHash: "test-hash",
      role: "DOCTOR",
      status: "ACTIVE",
      profile: { create: { fullName: "Dr. Analytics Test" } },
      doctorProfile: {
        create: {
          specialization: "General Medicine",
          consultationFee: 750,
          experienceYears: 5,
          verified: true,
        },
      },
    },
    include: { doctorProfile: true },
  });
  doctorUserId = doctor.id;
  doctorId = doctor.doctorProfile!.id;
  createdUserIds.push(doctor.id);

  // Create Slot
  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const slot = await prisma.availabilitySlot.create({
    data: {
      doctorId,
      startsAt,
      endsAt,
      status: "BOOKED",
    },
  });
  slotId = slot.id;

  // Create Consultation
  const consultation = await prisma.consultation.create({
    data: {
      patientId: patientUserId,
      doctorId,
      slotId,
      status: "COMPLETED",
      reason: "Confidential reason that should not leak to analytics",
    },
  });
  consultationId = consultation.id;

  // Create Payment
  const payment = await prisma.payment.create({
    data: {
      consultationId,
      amount: 750,
      currency: "INR",
      status: "PENDING",
    },
  });
  paymentId = payment.id;
}

async function cleanupRecords() {
  if (createdUserIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({
      where: { actorId: { in: createdUserIds } },
    });
    await tx.payment.deleteMany({
      where: { consultation: { patientId: { in: createdUserIds } } },
    });
    await tx.consultation.deleteMany({
      where: { patientId: { in: createdUserIds } },
    });
    await tx.availabilitySlot.deleteMany({
      where: { doctor: { userId: { in: createdUserIds } } },
    });
    await tx.doctor.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await tx.profile.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await tx.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
  });

  createdUserIds.length = 0;
}

describe("Admin Analytics Integration", () => {
  beforeEach(async () => {
    await prepareRecords();
  });

  afterEach(async () => {
    await cleanupRecords();
  });

  describe("Authorization & Security", () => {
    it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
      const res = await request(app).get("/api/v1/admin/analytics");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects PATIENT requests with 403 FORBIDDEN", async () => {
      const patientToken = createTestToken(patientUserId, "PATIENT");

      const res = await request(app)
        .get("/api/v1/admin/analytics")
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects DOCTOR requests with 403 FORBIDDEN", async () => {
      const doctorToken = createTestToken(doctorUserId, "DOCTOR");

      const res = await request(app)
        .get("/api/v1/admin/analytics")
        .set("Authorization", `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("allows ADMIN requests with 200 OK and logs an audit trail event", async () => {
      const adminToken = createTestToken(adminUserId, "ADMIN");

      const res = await request(app)
        .get("/api/v1/admin/analytics")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body.data).toHaveProperty("consultations");
      expect(res.body.data).toHaveProperty("doctors");
      expect(res.body.data).toHaveProperty("payments");
      expect(res.body.data).toHaveProperty("users");

      // Verify audit event was written
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          actorId: adminUserId,
          action: "ADMIN_ANALYTICS_ACCESSED",
        },
      });
      expect(auditLog).not.toBeNull();
    });
  });

  describe("Query Parameter Validation", () => {
    it("rejects invalid date formats with 400 VALIDATION_ERROR", async () => {
      const adminToken = createTestToken(adminUserId, "ADMIN");

      const res = await request(app)
        .get("/api/v1/admin/analytics?from=invalid-date")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects requests where from > to with 400 VALIDATION_ERROR", async () => {
      const adminToken = createTestToken(adminUserId, "ADMIN");

      const res = await request(app)
        .get(
          "/api/v1/admin/analytics?from=2026-10-28T12:00:00.000Z&to=2026-10-27T12:00:00.000Z",
        )
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Analytics Aggregation Logic", () => {
    it("correctly aggregates consultation, doctor, payment, and user counts", async () => {
      const report = await getAdminAnalytics({}, adminUserId);

      // Verify consultations
      expect(report.consultations.total).toBeGreaterThanOrEqual(1);
      expect(report.consultations.byStatus.COMPLETED).toBeGreaterThanOrEqual(1);
      expect(typeof report.consultations.completionRatePercent).toBe("number");
      expect(typeof report.consultations.cancellationRatePercent).toBe("number");

      // Verify doctors
      expect(report.doctors.totalDoctors).toBeGreaterThanOrEqual(1);
      expect(report.doctors.verifiedDoctors).toBeGreaterThanOrEqual(1);
      expect(report.doctors.activeConsultingDoctors).toBeGreaterThanOrEqual(1);
      expect(report.doctors.slots.byStatus.BOOKED).toBeGreaterThanOrEqual(1);
      expect(typeof report.doctors.slots.utilizationRatePercent).toBe("number");

      // Verify payments
      expect(report.payments.totalCount).toBeGreaterThanOrEqual(1);
      expect(report.payments.currency).toBe("INR");
      expect(report.payments.byStatus.PENDING.count).toBeGreaterThanOrEqual(1);
      expect(report.payments.totalPendingAmount).toBeGreaterThanOrEqual(750);

      // Verify users
      expect(report.users.total).toBeGreaterThanOrEqual(3);
      expect(report.users.byRole.ADMIN).toBeGreaterThanOrEqual(1);
      expect(report.users.byRole.DOCTOR).toBeGreaterThanOrEqual(1);
      expect(report.users.byRole.PATIENT).toBeGreaterThanOrEqual(1);
    });

    it("does not expose confidential medical notes or patient details", async () => {
      const adminToken = createTestToken(adminUserId, "ADMIN");

      const res = await request(app)
        .get("/api/v1/admin/analytics")
        .set("Authorization", `Bearer ${adminToken}`);

      const bodyString = JSON.stringify(res.body);
      expect(bodyString).not.toContain("Confidential reason");
      expect(bodyString).not.toContain("Test Patient");
      expect(bodyString).not.toContain(patientUserId);
    });
  });
});
