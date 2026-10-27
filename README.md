# Amrutam Telemedicine Backend

A REST API backend for a telemedicine platform, built with Node.js, TypeScript, Express, Prisma ORM, and PostgreSQL. The application supports authentication, doctor discovery, appointment booking, consultation lifecycle management, prescriptions, payment records, and audit logging.

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express 5
- **Database:** PostgreSQL
- **ORM:** Prisma 6
- **Validation:** Zod
- **Authentication:** JWT and bcrypt
- **Security:** Helmet, CORS, and express-rate-limit
- **Logging:** Pino and pino-http
- **Testing:** Vitest, Supertest, and PostgreSQL integration tests

## Features

- Patient registration, login, and authenticated user information.
- Role-based access control for patients, doctors, and administrators.
- Doctor search, profile discovery, and availability listing.
- Doctor availability creation with database-enforced overlap prevention.
- Consultation booking with transactional updates and idempotency protection.
- Consultation status transitions, ownership checks, and cancellation handling.
- Prescription creation and retrieval with role and ownership validation.
- Payment record creation using the doctor's consultation fee.
- Transactional audit logging for important successful operations.
- Structured request logging and centralized error handling.
- Unit and PostgreSQL integration tests.

**Payment scope:** The current payment module creates pending payment records. It does not itself process payments through a payment gateway.

## Prerequisites

Install the following:

- Node.js and npm.
- PostgreSQL.
- Git.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/ashishmishra4444/amrutam-telemedicine-backend.git
cd amrutam-telemedicine-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root using `.env.example` as a reference.

```env
PORT=3000

DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/amrutam_telemedicine?schema=public"

JWT_SECRET="replace_me"
JWT_EXPIRES_IN="15m"

SEED_DOCTOR_EMAIL=doctor_email
SEED_DOCTOR_PASSWORD=doctor_password
SEED_DOCTOR_NAME=doctor_name
SEED_DOCTOR_SPECIALIZATION=doctor_specialization

TEST_DATABASE_URL="postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/amrutam_telemedicine_test?schema=public"
```

Replace the placeholders with your local PostgreSQL credentials and appropriate development values. The seed variables are for configuring the development seed data.

Generate a strong JWT secret and never commit `.env` or real credentials to Git.

### 4. Create the databases

Create the development database `amrutam_telemedicine` in PostgreSQL.

Create a separate database named `amrutam_telemedicine_test` for integration testing.

The test database must be separate from the development database because integration tests create and delete test records.

### 5. Generate the Prisma client

```bash
npm run db:generate
```

### 6. Apply database migrations

For local development:

```bash
npm run db:migrate
```

This runs `prisma migrate dev`.

To seed the database, if the configured seed data is required:

```bash
npm run db:seed
```

### 7. Start the development server

```bash
npm run dev:tsx
```

The default configured port is `3000`. Check your environment configuration if you use a different port.

## Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev:tsx` | Run the server in development mode with `tsx` watch |
| `npm run dev` | Run the configured Nodemon command |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Start the compiled server |
| `npm run typecheck` | Check TypeScript types without emitting files |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:integration` | Run PostgreSQL integration tests |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Run development migrations |
| `npm run db:seed` | Run the configured database seed |

## API Overview

All application routes use the `/api/v1` prefix.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Register a patient |
| POST | `/api/v1/auth/login` | Authenticate a user |
| GET | `/api/v1/auth/me` | Get the authenticated user's information |
| GET | `/api/v1/doctors` | Search and filter doctors |
| GET | `/api/v1/doctors/:doctorId` | Retrieve a doctor profile |
| GET | `/api/v1/doctors/:doctorId/availability` | List available slots for a doctor |
| POST | `/api/v1/doctors/availability` | Create doctor availability |
| POST | `/api/v1/consultations` | Book a consultation |
| GET | `/api/v1/consultations` | List consultations accessible to the user |
| PATCH | `/api/v1/consultations/:consultationId/status` | Update consultation status |
| POST | `/api/v1/prescriptions` | Create a prescription |
| GET | `/api/v1/prescriptions` | List accessible prescriptions |
| GET | `/api/v1/prescriptions/:prescriptionId` | Retrieve a prescription |
| POST | `/api/v1/payments` | Create a pending payment record |
| GET | `/api/v1/payments` | List accessible payment records |
| GET | `/api/v1/payments/:paymentId` | Retrieve a payment record |

Protected endpoints require a valid bearer token:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

Consultation booking also requires an `Idempotency-Key` header. Reusing the same key with the same request allows a retry to return the original result; reusing it with a different request is rejected.

Role permissions and ownership restrictions are enforced by the backend.

## Testing

Run the unit tests:

```bash
npm test
```

Run the PostgreSQL integration tests:

```bash
npm run test:integration
```

Check types and build the project:

```bash
npm run typecheck
npm run build
```

Integration tests require a correctly configured `TEST_DATABASE_URL` pointing to the dedicated test database.

## Security Considerations

- Store secrets in environment variables rather than source code.
- Use strong JWT secrets and appropriate token lifetimes.
- Hash passwords before storing them.
- Validate incoming request data.
- Enforce authentication, role permissions, and resource ownership.
- Use database transactions and constraints to protect booking consistency.
- Use idempotency keys to protect retryable booking requests.
- Avoid logging passwords, tokens, prescription notes, or other sensitive information.
- Keep dependencies updated and run security checks as part of CI.

## Current Scope and Future Work

Potential extensions include payment gateway integration, asynchronous notification jobs, administrator analytics, a formal OpenAPI specification, automated CI/CD, deployment infrastructure, and production monitoring.

These should be considered separate implementation tasks unless they are already configured in the repository.

## License

The project currently uses the license metadata configured in `package.json`. Add an explicit license file if the project is intended for public distribution.
