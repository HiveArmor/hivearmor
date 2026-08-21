# Offline research — production SIEM foundation

Retrieved: **2026-08-14**  
Refresh triggers: material Kafka/Redpanda or OpenSearch major-version change; a new final NIST SP 800-92 revision; a revised joint event-logging guide; or a changed pilot threat/capacity model.

This note preserves the external rationale required by offline Bedrock sessions. It paraphrases primary or authoritative sources and does not replace the product-specific threat model or measured acceptance evidence.

## Joint cyber-authority event logging guidance

Source: Australian Signals Directorate's ACSC with CISA, FBI, NSA, NCSC-UK and other international partners, “Best practices for event logging and threat detection,” 22 August 2024.  
URL: https://www.cyber.gov.au/business-government/detecting-responding-to-threats/event-logging/best-practices-for-event-logging-and-threat-detection  
PDF: https://www.cyber.gov.au/sites/default/files/2024-08/best-practices-for-event-logging-and-threat-detection.pdf

Paraphrased conclusion:

- Effective logging needs an enterprise policy, centralized access/correlation, secure storage/integrity and a detection strategy tied to relevant threats.
- High-quality event selection matters; indiscriminate volume can increase cost and analyst noise without improving detection.
- Logs must remain usable and performant for analysts and support incident scope reconstruction.
- Time consistency, source coverage, retention, secure transport and protection against unauthorized access or tampering are operational requirements.

HiveArmor implication:

- The pilot must publish its supported source matrix, collection policy and retention envelope.
- Every alert preserves source-event lineage and collection/processing time.
- Coverage and freshness are health states, not inferred from a quiet alert queue.
- Raw/normalized integrity, authenticated source identity and backup/restore are release gates.

## NIST cybersecurity log management planning

Source: NIST SP 800-92 Rev. 1 Initial Public Draft, “Cybersecurity Log Management Planning Guide,” 11 October 2023; NIST Log Management project.  
URL: https://csrc.nist.gov/pubs/sp/800/92/r1/ipd  
Project: https://csrc.nist.gov/Projects/log-management

Paraphrased conclusion:

- Log management covers generation, transmission, storage, access and disposal rather than only indexing/search.
- Planning begins with the activities and decisions the logs need to support.
- Organizations should maintain a repeatable improvement playbook, ownership and policy rather than treating the logging platform as a one-time deployment.

HiveArmor implication:

- Agent collection, durable transmission, retention/disposal, protected access and restore must all be in the minimum product.
- The supported detection/response scenarios define required telemetry; unsupported sources are explicit gaps.
- Operator runbooks, capacity evidence and periodic reassessment are artifacts of the release.

## Apache Kafka delivery semantics

Sources: Apache Kafka design documentation and producer configuration reference.  
URLs: https://kafka.apache.org/28/design/design/#message-delivery-semantics and https://kafka.apache.org/25/configuration/producer-configs/

Paraphrased conclusion:

- Producer durability and consumer processing guarantees are separate problems.
- At-least-once consumption can redeliver records; downstream writes therefore need stable idempotency.
- Idempotent producer behavior prevents retry duplicates within its defined scope; transactions provide stronger atomicity between Kafka topics but do not automatically make external datastore writes exactly once.
- Strong transactional production is normally paired with a replicated broker cluster; a single-node pilot must not advertise the same failure tolerance.

HiveArmor implication:

- The pilot uses durable producer acknowledgements, manual consumer commits, deterministic event/alert IDs and an explicit processing ledger/outbox for external OpenSearch effects.
- Poison records go to a governed quarantine path; they are not committed and forgotten.
- The single-node broker is production-shaped for a pilot but not highly available. Multi-broker replication is a later production tier.

## OpenSearch TLS, security and recovery

Sources: OpenSearch documentation for TLS, security best practices, snapshots and restore.  
URLs:

- https://docs.opensearch.org/latest/security/configuration/tls/
- https://docs.opensearch.org/latest/security/configuration/best-practices/
- https://docs.opensearch.org/latest/tuning-your-cluster/availability-and-recovery/snapshots/snapshot-restore
- https://docs.opensearch.org/latest/api-reference/snapshots/restore-snapshot/

Paraphrased conclusion:

- Transport TLS is required by the security plugin; REST TLS should be enabled for protected client traffic.
- Demo certificates are not appropriate for active production deployments; a controlled PKI and hostname verification are required.
- Snapshots are incremental and repository-backed; restoration is an explicit operation with compatibility and index-conflict considerations.
- Security permissions apply to index-management and snapshot operations and should be separated from analyst access.

HiveArmor implication:

- Remove all production `InsecureSkipVerify` behavior and mount CA roots and service certificates.
- OpenSearch is internal-only and uses least-privilege service identities, not a shared admin credential for every service.
- Snapshot creation alone is insufficient; the pilot exit gate includes a clean restore drill and evidence.

## Secure bootstrap and verifier storage

Retrieved: **2026-08-14**  
Refresh triggers: a revised NIST SP 800-63B verifier requirement, a material OWASP password-storage update, adoption of BRSKI/EST or another device-certificate enrollment protocol, or removal of HiveArmor's compatibility API-secret path.

Sources:

- NIST SP 800-63B, current Digital Identity Guidelines: https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- IETF RFC 8995, Bootstrapping Remote Secure Key Infrastructure (BRSKI): https://www.rfc-editor.org/rfc/rfc8995.html

Paraphrased conclusion:

- NIST's centrally verified secret guidance requires offline-resistant salted, costed verifiers, protected channels and online attempt throttling. It is written for human authenticators, so HiveArmor uses it only as verifier-storage guidance—not as a complete machine-identity architecture.
- OWASP records bcrypt's 72-byte input limit, recommends cost 10 or higher when bcrypt is used, and warns that binary pre-hash input can create portability/null-byte hazards. It prefers Argon2id for new password systems. HiveArmor's generated 256-bit bootstrap value is not a user password; the compatibility verifier uses a versioned SHA-256 digest encoded as 43-byte URL-safe Base64, then bcrypt cost 12, so the complete token is represented without truncation or binary ambiguity.
- RFC 8995 treats secure device bootstrap as mutual authentication and authorization followed by installation of a domain-specific cryptographic identity. A bootstrap artifact alone is not the durable operational identity; the mature end state is a locally governed device certificate and authenticated protected channel.

HiveArmor implication:

- The current one-time token plus hash-only API credential is a bounded pilot compatibility step, not the final identity architecture.
- Enrollment tokens are tenant/policy/platform bound, expire within 24 hours, are consumed transactionally, are never stored recoverably and are rate/attempt governed before production release.
- At **2026-08-18 13:11:42 IST**, manager replay/rotation/revocation/authorized-replacement acceptance is complete; `PILOT-01` still cannot close until real Windows SCM/Linux systemd package lifecycle and the running HTTP authorization/bounds matrix pass. `PILOT-02`/`SIEM-007` must replace the unbounded plaintext authorization projection and move normal device streams toward locally issued, renewable and revocable mTLS identity.
- At **2026-08-18 16:16:32 IST**, inputs verify presented connector secrets against agent-manager instead of listing plaintext keys, bind tenant from that identity and fail closed without it. Device mTLS remains the durable operational identity under `SIEM-007`. `PILOT-01` packaged-host evidence remains open.
- Verifier format and cost are versioned so a future migration can reissue/rotate credentials without silently accepting incompatible hashes.

## Product synthesis

The minimum credible SIEM is a trustworthy evidence pipeline, not the largest feature list. HiveArmor must first prove:

1. authenticated and tenant-bound source identity;
2. bounded durable delivery and visible backpressure;
3. versioned normalization and detection;
4. idempotent event/alert lineage;
5. protected, retained and recoverable storage;
6. analyst-visible freshness, coverage and failure states;
7. repeatable installation, upgrades and operational diagnosis.

Advanced AI, SOAR, correlation and compliance features consume this foundation. They cannot compensate for an untrusted tenant assignment, lost telemetry, non-durable alert writer or unrecoverable storage.

## Security audit-log integrity and data minimization

Retrieved: **2026-08-18**  
Refresh triggers: a finalized NIST SP 800-92 revision, a material OWASP logging change, adoption of external immutable/WORM audit storage, or a HiveArmor audit-retention/export design change.

Sources:

- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- NIST SP 800-92, Guide to Computer Security Log Management: https://csrc.nist.gov/pubs/sp/800/92/final
- NIST SP 800-92 Rev. 1 initial public draft, Cybersecurity Log Management Planning Guide: https://csrc.nist.gov/pubs/sp/800/92/r1/ipd

Paraphrased conclusion:

- OWASP recommends tamper detection/read-only handling for retained security logs, restricted and monitored access, and deliberate exclusion or protection of access tokens, authentication secrets, encryption keys and sensitive personal data.
- NIST treats log management as an enterprise lifecycle covering generation, transmission, storage, access, use and disposal. A useful record must support investigation and accountability without making unmanaged copies of sensitive operational data.
- Application logs and an authoritative audit ledger serve different purposes. A credential-state audit needs structured actor, action, target reference, rationale and time, while secret values and unnecessary endpoint details remain outside the record.

HiveArmor implication:

- Enrollment audit records are allowlisted and written atomically with credential state changes. PostgreSQL rejects update/delete attempts; the Admin/SOC Manager projection is tenant-scoped and bounded.
- Token values, token/device verifiers, agent keys, IP, MAC and hostname are not audit columns or response fields. Safe token UUID, agent UUID/numeric ID and version references support investigation without exposing authentication material.
- The local database trigger establishes application/database immutability for the pilot. Release readiness still requires least-privilege audit-reader access, monitored privileged access, retention/backup/restore evidence and, where policy requires it, an external append-only or WORM destination under `PILOT-09`.
