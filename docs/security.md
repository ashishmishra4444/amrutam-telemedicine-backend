# Amrutam Telemedicine Backend — Security Checklist and Threat Model

## 1. Purpose and Scope

This document identifies security threats, sensitive data, mitigations, and verification tasks for the Amrutam Telemedicine Backend.

The system manages user accounts, doctor profiles, availability, consultations, prescriptions, payment records, and audit events. Unauthorized access or modification could expose sensitive health information or disrupt medical appointments.

This document distinguishes existing application controls from production hardening requirements that still need verification or implementation.

## 2. Data Classification

| Classification | Examples | Required protection |
|---|---|---|
| Highly sensitive | Prescription notes and consultation details | Strict access control, encryption, minimal logging, controlled retention |
| Sensitive personal data | Names, email addresses, account identifiers | Authentication, ownership checks, encryption in transit and at rest |
| Financial records | Consultation fees and payment references | Access restrictions, integrity controls, protected logs |
| Security records | Audit events, authentication outcomes | Restricted access, integrity protection, retention policy |
| Operational data | Health status, latency, error counts | Avoid exposing secrets or personal information in telemetry |
| Configuration secrets | Database credentials, JWT signing secret | Environment-based configuration, restricted access, rotation |

Data classification should be reviewed against applicable Indian data-protection, healthcare, and contractual requirements before production deployment.

## 3. Threat Model

### Assets

- Patient accounts and personal information.
- Consultation bookings and lifecycle state.
- Prescription content.
- Doctor availability and profile information.
- Payment records.
- JWT signing secrets and database credentials.
- Audit records and application availability.

### Trust boundaries

1. Client applications communicating with the REST API.
2. The API authenticating and authorizing requests.
3. Application services accessing PostgreSQL.
4. Application logs and audit storage.
5. Deployment environments and secret-management systems.
6. Future integrations with payment providers and background workers.

### Threats and mitigations

| Threat | Potential impact | Mitigation and verification |
|---|---|---|
| Broken authentication | Account takeover | Password hashing, token validation, expiry, login rate limits, authentication tests |
| Broken object-level authorization | Access to another patient's consultations or prescriptions | Enforce ownership and role checks in every resource operation; test cross-user access |
| Privilege escalation | Patient performs doctor-only actions | Centralized role checks and negative authorization tests |
| SQL injection | Data exposure or modification | Prisma parameterized queries, safe raw SQL practices, input validation |
| Brute-force login | Account compromise or service load | Rate limiting, monitoring, safe authentication errors |
| Booking race conditions | Double booking or inconsistent records | Database constraints, transactions, idempotency, concurrency tests |
| Idempotency-key abuse | Duplicate or conflicting writes | Scope keys to the authenticated user, validate request consistency, enforce database uniqueness |
| Sensitive data in logs | Exposure of health or personal information | Structured logging, field minimization, redaction, restricted log access |
| Secret leakage | Unauthorized database or token access | Ignore local environment files, never commit credentials, use a secret manager in production |
| Denial of service | API unavailability | Request rate limits, payload limits, timeouts, resource limits, monitoring |
| Dependency compromise | Vulnerable code execution or data exposure | Lockfile review, automated dependency scanning, prompt patching |
| Database or infrastructure failure | Data loss or prolonged outage | Automated backups, restore testing, recovery procedures, health monitoring |
| Audit-log tampering | Loss of accountability | Restrict write/read permissions, monitor access, and use immutable storage where required |

## 4. Security Controls and Verification Checklist

### Authentication and authorization

- [x] Registration and login endpoints exist.
- [x] JWT-based authentication exists.
- [x] Role-aware authorization is used by protected workflows.
- [ ] Verify token expiry, signing algorithm restrictions, and secret strength.
- [ ] Verify every endpoint against patient, doctor, and unauthorized-user scenarios.
- [ ] Implement and test MFA for privileged accounts before production use.
- [ ] Define token revocation and account-recovery procedures.

### Input and API security

- [x] Request validation using Zod.
- [x] Helmet security middleware and rate-limiting middleware are part of the application stack.
- [ ] Verify production CORS origins and allowed methods.
- [ ] Verify request-body size limits and request timeouts.
- [ ] Confirm safe handling of malformed JSON and unexpected database errors.
- [ ] Review all raw SQL and external input usage.
- [ ] Verify error responses never reveal stack traces, SQL details, or secrets.

### Data protection

- [ ] Enforce HTTPS/TLS at the deployment boundary.
- [ ] Enable database and backup encryption at rest.
- [ ] Restrict database credentials using least privilege.
- [ ] Define retention and deletion policies for prescriptions and audit records.
- [ ] Verify logs never include passwords, tokens, prescription notes, or unnecessary personal data.
- [ ] Define and test key rotation procedures.
- [ ] Verify backups are encrypted and restoration is tested.

### Audit and monitoring

- [x] Audit events exist for important business operations.
- [x] Structured application logging exists.
- [ ] Verify audit events contain sufficient actor, action, resource, and timestamp information.
- [ ] Restrict audit-log access and establish retention policies.
- [ ] Add alerts for authentication abuse, elevated error rates, and unusual booking conflicts.
- [ ] Add metrics and distributed tracing where appropriate.

### Delivery and dependencies

- [ ] Add automated dependency vulnerability scanning to CI.
- [ ] Add CI checks for type checking, unit tests, integration tests, and production builds.
- [ ] Scan container images before release.
- [ ] Keep secrets out of source control and build logs.
- [ ] Review permissions for CI tokens and deployment identities.
- [ ] Document security incident response and credential rotation.

Checkboxes marked as incomplete are verification or implementation tasks, not claims that the control is already present.

## 5. Encryption and Key Management

### Encryption in transit

Production clients must communicate over HTTPS. Internal service-to-service connections should use authenticated TLS where supported by the deployment architecture.

### Encryption at rest

Enable encryption for PostgreSQL storage, backups, snapshots, and log storage through the selected hosting platform. Application-level field encryption may be appropriate for selected sensitive fields depending on access patterns and key-management requirements.

### Secret management and rotation

- Use a managed secret store in production.
- Keep local `.env` files out of Git.
- Use a high-entropy JWT signing secret and rotate it through a planned procedure.
- Rotate database credentials periodically and after suspected exposure.
- Restrict secret access to authorized runtime identities.
- Never log secret values or expose them through health endpoints.

Key rotation must account for token expiry, credential rollout, rollback, and any data encrypted with older keys.

## 6. OWASP Risk Coverage

| Risk area | Planned or existing mitigation |
|---|---|
| Broken access control | Role checks, ownership enforcement, authorization tests |
| Cryptographic failures | TLS, encrypted storage, secret management, key rotation |
| Injection | Zod validation and parameterized database operations |
| Insecure design | Threat modeling, booking invariants, idempotency |
| Security misconfiguration | Helmet, restricted CORS, hardened deployment configuration |
| Vulnerable components | Dependency scanning and patch management |
| Authentication failures | Password hashing, JWT validation, rate limits, planned MFA |
| Logging and monitoring failures | Structured logs, audit events, planned metrics and alerting |
| Resource exhaustion | Rate limits, bounded pagination, request limits, database capacity controls |

This mapping is a practical risk review, not a claim of formal OWASP certification or complete coverage of every OWASP risk.

## 7. Residual Risks and Release Gates

The current application is a tested backend implementation, but production readiness also depends on infrastructure and operational controls.

Before production deployment:

1. Complete authorization tests for cross-user and cross-role access.
2. Verify JWT configuration, CORS, rate limits, payload limits, and error handling.
3. Implement or verify MFA for privileged users.
4. Configure TLS, encryption at rest, secret management, and key rotation.
5. Add dependency and container scanning to CI.
6. Verify backup restoration and incident-response procedures.
7. Implement monitoring, alerting, and security-event review.
8. Conduct a final security review and document outstanding risks.

No system can be declared secure solely from a checklist. Each control must be verified against the actual code and deployment environment.