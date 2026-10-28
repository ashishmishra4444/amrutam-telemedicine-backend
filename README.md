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
- Administrator analytics providing consultation volumes, doctor utilization, and payment summaries without exposing patient PII.
- Observability metrics endpoint (`/metrics`) exposing Prometheus-compatible text and JSON metrics.
- Transactional audit logging for important operations.
- Structured request logging with request correlation IDs and centralized error handling.
- Unit and PostgreSQL integration tests.
- Standalone load-testing utility comparing measured p95 latency against SLA design targets.

**Payment scope:** The current payment module creates pending payment records. It does not itself process payments through an external payment gateway.

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

This runs `prisma migrate deploy` and applies existing database migrations. It does not create new development migrations.

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
| `npm run test:load` | Run the standalone load-test benchmark against target API |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Apply existing database migrations |
| `npm run db:seed` | Run the configured database seed |

## API Overview

All business routes use the `/api/v1` prefix. System health and observability endpoints are hosted at root paths.

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| GET | `/health/live` | Public | Liveness probe indicating service process is running |
| GET | `/health/ready` | Public | Readiness probe indicating PostgreSQL database connectivity |
| GET | `/metrics` | Public | Prometheus text exposition and structured JSON runtime metrics |
| POST | `/api/v1/auth/register` | Public | Register a patient account |
| POST | `/api/v1/auth/login` | Public | Authenticate a user and receive JWT |
| GET | `/api/v1/auth/me` | Authenticated | Get the authenticated user's information |
| GET | `/api/v1/doctors` | Public | Search and filter doctors |
| GET | `/api/v1/doctors/:doctorId` | Public | Retrieve a doctor profile |
| GET | `/api/v1/doctors/:doctorId/availability` | Public | List available slots for a doctor |
| POST | `/api/v1/doctors/availability` | DOCTOR | Create doctor availability |
| POST | `/api/v1/consultations` | PATIENT | Book a consultation (requires `Idempotency-Key`) |
| GET | `/api/v1/consultations` | PATIENT / DOCTOR | List consultations accessible to the user |
| PATCH | `/api/v1/consultations/:consultationId/status` | PATIENT / DOCTOR | Update consultation status |
| POST | `/api/v1/prescriptions` | DOCTOR | Create a prescription for completed consultation |
| GET | `/api/v1/prescriptions` | PATIENT / DOCTOR | List accessible prescriptions |
| GET | `/api/v1/prescriptions/:prescriptionId` | PATIENT / DOCTOR | Retrieve a prescription |
| POST | `/api/v1/payments` | PATIENT | Create a pending payment record |
| GET | `/api/v1/payments` | PATIENT / DOCTOR | List accessible payment records |
| GET | `/api/v1/payments/:paymentId` | PATIENT / DOCTOR | Retrieve a payment record |
| GET | `/api/v1/admin/analytics` | ADMIN | Retrieve aggregated platform metrics and utilization |

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

Integration tests require a correctly configured `TEST_DATABASE_URL` pointing to the dedicated test database.

### Load Testing

Run the reproducible benchmark runner against the target server:

```bash
# Ensure development server is running in another terminal (npm run dev:tsx)
npm run test:load
```

Custom configurations can be supplied via environment variables:

```bash
TARGET_URL="http://localhost:3000" \
ENDPOINT="/health/live" \
CONCURRENCY=20 \
TOTAL_REQUESTS=200 \
npm run test:load
```

The load test reports total throughput (RPS), success rate, and latency percentiles (min, avg, p50, p90, p95, p99), comparing measured p95 against the assignment design targets (<200ms reads, <500ms writes).

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

## Docker Setup

Docker Desktop and Docker Compose are required for the containerized setup.

1. Create `.env.docker` in the project root with these variables:

   - `POSTGRES_PASSWORD` — a strong, unique database password.
   - `JWT_SECRET` — a long, randomly generated secret.
   - `JWT_EXPIRES_IN=15m`
   - `CORS_ORIGINS=http://localhost:5173`

2. Start the application:

   ```powershell
   docker compose --env-file .env.docker up -d
   ```

3. Check container status:

   ```powershell
   docker compose --env-file .env.docker ps
   ```

4. Verify API health:

   - `http://localhost:3000/health/live`
   - `http://localhost:3000/health/ready`

5. View API logs:

   ```powershell
   docker compose --env-file .env.docker logs --tail 100 api
   ```

To stop the containers:

```powershell
docker compose --env-file .env.docker down
```

The database volume is retained when containers are stopped. Do not use `docker compose down -v` unless you intentionally want to delete the Docker database volume.

Never commit `.env.docker` or real credentials.

## API Documentation

The OpenAPI specification is available at `docs/openapi.yaml`. Architecture and security documentation are available at `docs/architecture.md` and `docs/security.md`.

## CI

The GitHub Actions workflow is located at `.github/workflows/ci.yml`. It runs automated checks, tests, and the build.

## Current Scope and Future Work

The current payment module creates pending payment records; it does not integrate with an external payment gateway. Core business workflows, administrator analytics, Prometheus metrics, database concurrency constraints, and audit logging are implemented.

Further improvements may include external payment gateway integration and settlement, asynchronous notification queues, distributed tracing exporters, and multi-region deployment automation.

## License

The project currently uses the license metadata configured in `package.json`. Add an explicit license file if the project is intended for public distribution.
