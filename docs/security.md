# Amrutam Telemedicine Backend — Security Review and Threat Model

## 1. Purpose and Scope

This document records the security approach for the Amrutam Telemedicine Backend, including its threat model, data classification, existing application-level controls, OWASP risk mapping, and production security checklist.

The application uses Node.js, TypeScript, Express, PostgreSQL, and Prisma ORM. It exposes APIs for authentication, doctor discovery and availability, consultation booking and lifecycle management, prescriptions, payment records, and audit logging.

This document distinguishes between:

- **Implemented:** A control is present in the current application or development configuration.
- **Verified:** Evidence from an identified test or configuration check confirms the control works within the tested scope.
- **Required / not verified:** The control needs implementation, deployment-specific configuration, or additional verification.

A documented requirement is not proof of implementation. Production security approval must be based on the actual code, configuration, deployment environment, and test evidence.

## 2. Security Objectives

The security objectives are to:

1. Prevent unauthorized access to accounts and protected resources.
2. Protect patient, doctor, consultation, prescription, and payment information.
3. Validate untrusted input and handle errors safely.
4. Prevent duplicate or conflicting business operations.
5. Keep credentials and signing secrets out of source control and logs.
6. Maintain audit records for important business actions.
7. Detect vulnerable dependencies and unsafe deployment configuration.
8. Support recovery from security incidents and data loss.

## 3. Data Classification

The following classification identifies the types of information the application may handle and the protection they require. Exact fields must be confirmed against `prisma/schema.prisma` and the implemented API responses.

| Classification                         | Examples                                                                 | Required protection                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Authentication secrets                 | Passwords, JWT signing secrets, database credentials, access tokens      | Never log or commit secrets; restrict access; use secure storage and rotation procedures.                |
| Personal information                   | Names, contact details, user identifiers, profile information            | Enforce access control, minimize collection, and prevent unauthorized disclosure.                        |
| Health-related information             | Consultation details, prescription information, related clinical records | Restrict access to authorized users, protect data in transit and at rest, and minimize exposure in logs. |
| Financial and transaction information  | Payment records, payment states, transaction identifiers                 | Enforce ownership and role checks, preserve integrity, and avoid exposing sensitive payment information. |
| Operational and audit information      | Request metadata, event records, errors, security events                 | Restrict access, avoid unnecessary personal data, and establish retention and review policies.           |
| Public or non-sensitive reference data | Information intentionally approved for public doctor discovery           | Expose only approved fields and avoid returning internal or sensitive profile information.               |

Classification does not imply that every example is currently stored. The actual database schema and API contract are the source of truth for persisted and exposed fields.

## 4. Threat Model

### Assets to protect

- User accounts and authentication credentials.
- Doctor profiles and availability.
- Consultation bookings and lifecycle state.
- Prescription and health-related information.
- Payment records and their consistency.
- Database integrity and availability.
- JWT signing secrets and database credentials.
- Audit records and operational logs.

### Trust boundaries

1. **Client to API:** Requests are untrusted and must be authenticated where required, validated, and rate-limited appropriately.
2. **API to database:** Database access must use controlled application paths, validated values, appropriate privileges, and transaction boundaries.
3. **Application to environment configuration:** Secrets must be supplied securely and must not be exposed through logs, responses, or source control.
4. **Development and CI environment:** Build permissions, tokens, dependencies, and environment variables must be protected.
5. **Production infrastructure:** Network access, TLS, database storage, backups, monitoring, and administrative access require deployment-level controls.

### Threats and mitigations

| Threat                            | Potential impact                                   | Mitigation and verification                                                                             |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Broken access control             | Unauthorized access to another user's records      | Authentication, role checks, resource ownership checks, and cross-user authorization tests.             |
| Credential theft or brute force   | Account compromise                                 | Secure password handling, token validation, authentication rate limiting, and secure secret management. |
| Malicious or invalid input        | Data corruption, unexpected behavior, or injection | Zod validation, safe database access patterns, bounded request bodies, and negative tests.              |
| Duplicate booking requests        | Duplicate or inconsistent consultations            | Idempotency handling, unique constraints, transactions, and concurrent integration tests.               |
| Overlapping doctor availability   | Conflicting appointments or slots                  | Database-level exclusion constraint and concurrent integration tests.                                   |
| Multiple pending payments         | Inconsistent payment state                         | Database partial unique index and application-level conflict handling.                                  |
| Secret leakage                    | Account or database compromise                     | Environment-based configuration, `.env` exclusion from Git, secret redaction, and restricted access.    |
| Sensitive information in logs     | Privacy breach                                     | Log minimization, restricted log access, retention policies, and review of error/request logging.       |
| Vulnerable dependencies or images | Exploitation of known vulnerabilities              | Automated dependency and container scanning, patch management, and release checks.                      |
| Database or infrastructure outage | Service interruption or data loss                  | Backups, restore testing, health checks, monitoring, and documented incident response.                  |
| Misconfigured deployment          | Unintended public access or weakened security      | Restricted CORS, TLS, least privilege, network controls, and deployment configuration review.           |
| Abuse or resource exhaustion      | Increased latency or denial of service             | Rate limits, bounded pagination, request-size limits, timeouts, and capacity monitoring.                |

## 5. Implemented Controls and Verification Status

### 5.1 Application-level controls

The current application includes the following controls:

- JWT-based authentication with strict issuer, audience, and algorithm enforcement.
- Role-based access control (RBAC) supporting PATIENT, DOCTOR, and ADMIN roles.
- Resource ownership checks in protected consultation, prescription, and payment workflows.
- Administrator analytics isolation: returns aggregated statistics only, strictly preventing leakage of patient PII, diagnoses, or prescription notes.
- Zod-based request schema and query parameter validation.
- Helmet security headers and configured CORS restrictions.
- Authentication rate limiting on login/register endpoints.
- Bounded JSON request bodies (`100kb` limit).
- Database-backed integrity and concurrency safeguards (exclusion constraints for slots, partial unique index for pending payments, and transactions).
- Idempotency key replay protection for writes.
- Structured request/application logging with secret redaction and request correlation IDs (`X-Request-Id`).
- Prometheus-compatible runtime metrics (`/metrics`) with path normalization to prevent memory exhaustion from high-cardinality label explosion.
- Liveness and database-connected readiness health endpoints.

These statements describe the known application-level implementation. They do not establish that every endpoint, deployment environment, or threat scenario has been independently security-tested.

### 5.2 Verified development checks

The following checks were verified as passing:

- TypeScript type checking (`npm run typecheck`).
- Unit tests (`npm test`): 24 unit tests passed across 4 test suites.
- PostgreSQL-backed integration tests (`npm run test:integration`): 52 integration tests passed across 8 test suites.
- Production build (`npm run build`).
- Standalone load-testing benchmark (`npm run test:load`).
- Docker Compose configuration and container definitions.
- Local API liveness and readiness health checks.
- GitHub Actions CI workflow covering typecheck, migrations, tests, and build.

The integration tests include concurrency scenarios involving booking retries, overlapping availability, and pending-payment creation, as well as admin role enforcement and analytics aggregations.

The hosted CI result should be confirmed in GitHub before submission. Passing general tests is not equivalent to a dedicated security audit, penetration test, dependency scan, or container image scan.

### 5.3 Controls not verified as implemented

The following controls must not be claimed as completed without evidence:

- Multi-factor authentication (MFA) for privileged accounts.
- Production TLS configuration and certificate management.
- Encryption at rest for PostgreSQL storage, backups, snapshots, and logs.
- Managed production secret storage.
- A tested JWT signing-secret and database-credential rotation procedure.
- Automated dependency vulnerability scanning in CI.
- Automated container image vulnerability scanning.
- Production security monitoring and alerting.
- Backup restoration drills and documented recovery evidence.
- A formal penetration test or independent security assessment.

These are production requirements or outstanding verification items, not confirmed features of the current implementation.

## 6. Secret Management and Encryption

### 6.1 Secrets in development

- Keep `.env` files out of source control.
- Provide placeholder values only in `.env.example`.
- Never commit real passwords, database URLs containing credentials, JWT signing secrets, API keys, or access tokens.
- Never include secrets in error responses, logs, screenshots, or submitted documentation.
- Restrict access to development credentials and rotate them if exposure is suspected.

The actual `.gitignore`, environment files, and CI configuration should be checked before declaring these requirements satisfied.

### 6.2 Encryption in transit

Production clients must communicate with the API over HTTPS. TLS termination, certificate management, and secure internal connections must be configured and verified for the chosen hosting environment.

Local HTTP testing does not demonstrate that production TLS is configured.

### 6.3 Encryption at rest

Production database storage, backups, snapshots, and log storage should use encryption at rest provided by the hosting platform or an appropriate managed storage service.

Where application-level field encryption is necessary, the design must specify which fields are encrypted, how keys are protected, and how access and rotation are handled.

Encryption at rest is not verified merely because PostgreSQL runs in Docker or because the application uses environment variables.

### 6.4 Secret storage and key rotation

Production should use an appropriately secured secret-management mechanism. Access should be limited to the identities that require each secret.

A rotation procedure should cover:

- JWT signing-secret replacement and token compatibility.
- Database credential rotation and connection updates.
- Deployment rollout and rollback.
- Revocation or invalidation of compromised credentials.
- Verification that old credentials are no longer accepted where appropriate.

A rotation policy is not complete until the procedure has been tested in the target environment.

## 7. OWASP Risk Mapping

The following table maps major OWASP risk areas to application controls and outstanding work. It is a practical risk review, not a claim of OWASP certification or complete coverage.

| OWASP risk area                                               | Existing controls or design measures                                           | Outstanding verification or work                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Broken access control                                         | Role-aware authorization and ownership checks in protected workflows           | Test cross-user, cross-role, and direct-object-reference access across all protected endpoints.                                 |
| Cryptographic failures                                        | Token-based authentication and environment-based secret configuration          | Verify password hashing, production TLS, encryption at rest, secure key storage, and rotation.                                  |
| Injection                                                     | Zod validation and Prisma-based database access                                | Review all query construction and test malicious and boundary inputs.                                                           |
| Insecure design                                               | Idempotency, database constraints, transaction boundaries, and threat modeling | Review all business state transitions, abuse cases, and sensitive workflows.                                                    |
| Security misconfiguration                                     | Helmet, CORS configuration, bounded request bodies, and rate limiting          | Review production headers, CORS origins, network exposure, permissions, and environment configuration.                          |
| Vulnerable and outdated components                            | Dependency manifest and automated CI checks                                    | Add and verify dependency vulnerability scanning and container image scanning.                                                  |
| Identification and authentication failures                    | JWT authentication and authentication rate limiting                            | Verify password handling, token expiry/revocation behavior, privileged MFA, and authentication abuse cases.                     |
| Software and data integrity failures                          | Database constraints, transactions, and CI build/test checks                   | Verify dependency integrity, deployment permissions, migration controls, and artifact provenance as applicable.                 |
| Logging and monitoring failures                               | Structured logs, audit events, and health endpoints                            | Configure security alerting, log retention, restricted access, and incident review.                                             |
| Server-side request forgery and other endpoint-specific risks | No broad mitigation claim is made here                                         | Review actual outbound request functionality and other endpoint-specific attack surfaces; implement mitigations where relevant. |

OWASP risk labels evolve over time. This mapping is intended to guide review, not to replace a version-specific security assessment.

## 8. CI and Release Security Checklist

### 8.1 Existing CI validation

The repository's CI workflow is reported to run:

- TypeScript type checking.
- Unit tests.
- PostgreSQL-backed integration tests.
- Production build.

The workflow's latest hosted result must be confirmed in GitHub. The checks above do not establish that security scanners are configured.

### 8.2 Security checks to add or verify

- [ ] Add an automated dependency vulnerability scan to CI and define severity-based failure rules.
- [ ] Add container image vulnerability scanning before release.
- [ ] Confirm secrets are not committed or printed in CI logs.
- [ ] Review CI token permissions and use least privilege.
- [ ] Review deployment identities and environment protection rules.
- [ ] Define dependency update and vulnerability remediation procedures.
- [ ] Add a security-focused test pass for authorization, authentication, validation, and rate limits.
- [ ] Document incident response, credential revocation, and rotation.
- [ ] Confirm production TLS, encryption at rest, and secret storage configuration.
- [ ] Verify backup restoration and production monitoring before release.

Unchecked items are outstanding tasks or controls requiring evidence. Do not mark them complete merely because the application builds or the ordinary test suite passes.

## 9. Privacy, Audit Logging, and Retention

Audit events support investigation of important business actions. Logs and audit records should contain only the metadata required for operational troubleshooting, security review, and accountability.

The production policy should specify:

- Which events must be audited.
- Which fields may be recorded.
- Who can read audit records and operational logs.
- Retention and deletion requirements.
- How log integrity and unauthorized modification are addressed.
- How sensitive information is redacted from exceptions and request metadata.

Never log passwords, JWTs, database credentials, or other authentication secrets. Avoid placing unnecessary clinical or personal information in general application logs.

Applicable legal, regulatory, and organizational requirements should be reviewed before production processing of sensitive health-related information.

## 10. Incident Response and Recovery

A production incident-response procedure should identify responsibilities and cover:

1. Detection and initial triage.
2. Containment of compromised credentials, accounts, or services.
3. Preservation of relevant logs and audit evidence.
4. Credential revocation and rotation.
5. Assessment of affected data and systems.
6. Service restoration and integrity verification.
7. Required internal escalation and external notification.
8. Root-cause analysis and corrective actions.

Database backups should be protected from unauthorized access and tested through restoration drills. A successful backup job alone does not prove that data can be recovered.

Recovery objectives must be agreed with the business and validated through exercises.

## 11. Production Release Gates

The following gates must be satisfied or explicitly accepted by the responsible reviewer before production deployment.

### Gate 1 — Application security

- [ ] Review authentication and authorization across all protected endpoints.
- [ ] Test cross-user and cross-role resource access.
- [ ] Verify request validation, safe error handling, CORS, rate limits, and request-size limits.
- [ ] Verify token expiry, signing configuration, and relevant revocation behavior.
- [ ] Review sensitive-data exposure in API responses and logs.

### Gate 2 — Data and concurrency integrity

- [ ] Confirm database constraints and transaction boundaries for critical workflows.
- [ ] Verify idempotency behavior and concurrent booking protections.
- [ ] Verify the one-pending-payment-per-consultation safeguard.
- [ ] Confirm database access uses appropriate privileges.

### Gate 3 — Secrets and infrastructure

- [ ] Confirm no real secrets are committed to source control.
- [ ] Configure and verify production TLS.
- [ ] Configure and verify encryption at rest for required storage.
- [ ] Establish managed secret storage and a tested rotation procedure.
- [ ] Review network exposure and administrative access.
- [ ] Enable MFA for privileged users where required.

### Gate 4 — Supply chain and CI

- [ ] Confirm type checking, unit tests, integration tests, and production build pass.
- [ ] Confirm the latest hosted CI run is successful.
- [ ] Enable and verify dependency vulnerability scanning.
- [ ] Enable and verify container image scanning.
- [ ] Review CI and deployment permissions.

### Gate 5 — Operations and recovery

- [ ] Configure production metrics, monitoring, and actionable alerts.
- [ ] Define security-event review and incident-response ownership.
- [ ] Configure database backups and restricted backup access.
- [ ] Demonstrate restoration from backup.
- [ ] Document and validate recovery objectives.
- [ ] Record outstanding risks and obtain the appropriate release approval.

## 12. Residual Risks

The current backend is a tested application with production-oriented design measures, but the local development environment is not equivalent to a fully secured production deployment.

The principal outstanding risks requiring implementation or verification are:

- Privileged-account MFA.
- Production TLS and encryption at rest.
- Managed secret storage and tested key rotation.
- Automated dependency and container scanning.
- Comprehensive authorization testing across protected endpoints.
- Production metrics, security alerting, and operational monitoring.
- Tested backup restoration and incident-response procedures.
- Evidence that the required security controls are enabled in the actual deployment environment.

The absence of evidence should be recorded as **not verified**, rather than assumed secure or assumed insecure.

## 13. Security Review Conclusion

The current implementation provides application-level authentication, authorization and ownership checks in protected workflows, input validation, security middleware, rate limiting, database integrity controls, structured logging, audit events, and automated development checks.

Production approval requires a separate verification of infrastructure security, encryption, privileged MFA, secret management and rotation, supply-chain scanning, monitoring, and recovery controls. The release checklist should be updated only when implementation evidence or test results support each status.

**Sources of truth:** The application source defines actual runtime controls; `prisma/schema.prisma` defines database structure and constraints; the CI workflow defines automated checks; and deployment configuration defines infrastructure-level security. This document records the security review and outstanding requirements, not a certification of security.
