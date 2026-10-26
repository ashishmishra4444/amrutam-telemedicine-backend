-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PATIENT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20),
    "date_of_birth" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "specialization" VARCHAR(120) NOT NULL,
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "consultation_fee" DECIMAL(10,2) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'BOOKED',
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "notes" TEXT,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_reference" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(255),
    "outcome" VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    "request_id" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_phone_key" ON "profiles"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");

-- CreateIndex
CREATE INDEX "doctors_specialization_verified_idx" ON "doctors"("specialization", "verified");

-- CreateIndex
CREATE INDEX "availability_slots_doctor_id_status_starts_at_idx" ON "availability_slots"("doctor_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "availability_slots_starts_at_ends_at_idx" ON "availability_slots"("starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "consultations_slot_id_key" ON "consultations"("slot_id");

-- CreateIndex
CREATE INDEX "consultations_patient_id_status_created_at_idx" ON "consultations"("patient_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "consultations_doctor_id_status_created_at_idx" ON "consultations"("doctor_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_consultation_id_key" ON "prescriptions"("consultation_id");

-- CreateIndex
CREATE INDEX "prescriptions_patient_id_issued_at_idx" ON "prescriptions"("patient_id", "issued_at");

-- CreateIndex
CREATE INDEX "prescriptions_doctor_id_issued_at_idx" ON "prescriptions"("doctor_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments"("provider_reference");

-- CreateIndex
CREATE INDEX "payments_consultation_id_status_idx" ON "payments"("consultation_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_key_key" ON "idempotency_keys"("user_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "availability_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
