package com.hivearmor.repository.uba;

import com.hivearmor.domain.uba.UtmUbaAnomaly;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface UtmUbaAnomalyRepository extends JpaRepository<UtmUbaAnomaly, Long> {

    Page<UtmUbaAnomaly> findAllByOrderByDetectedAtDesc(Pageable pageable);

    List<UtmUbaAnomaly> findByEntityIdAndEntityTypeOrderByDetectedAtDesc(
        String entityId, String entityType);

    Page<UtmUbaAnomaly> findBySeverityOrderByDetectedAtDesc(String severity, Pageable pageable);

    long countBySeverity(String severity);

    long countByDetectedAtAfter(Instant since);

    long countByStatus(String status);

    boolean existsByDetailsJsonContaining(String fragment);

    /**
     * P0A2-3 — tenant-scoped dedup. The sync runs per tenant, so dedup must match
     * within the same tenant only (two tenants may legitimately carry the same alert id).
     */
    boolean existsByTenantIdAndDetailsJsonContaining(Long tenantId, String fragment);

    /**
     * P0A2 UBA legacy resolver — MSSP legacy anomaly rows that predate per-tenant sync and
     * were never agent-resolvable by the A2-B backfill (entity_id is user/ip/host, not an
     * agent id). Their owning tenant is recovered from the originating alert (id stored in
     * details_json) — see UbaSyncService.resolveLegacyUbaTenants.
     */
    List<UtmUbaAnomaly> findByTenantIdIsNull();

    /** Distinct (entity_id, entity_type) pairs among anomalies already stamped to a tenant. */
    List<UtmUbaAnomaly> findByEntityIdAndEntityTypeAndTenantIdIsNotNull(String entityId, String entityType);
}
