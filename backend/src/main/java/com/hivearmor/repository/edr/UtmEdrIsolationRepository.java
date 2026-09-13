package com.hivearmor.repository.edr;

import com.hivearmor.domain.edr.UtmEdrIsolation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UtmEdrIsolationRepository extends JpaRepository<UtmEdrIsolation, Long> {
    Optional<UtmEdrIsolation> findByAgentIdAndStatus(String agentId, String status);
    List<UtmEdrIsolation> findByAgentId(String agentId);
    Page<UtmEdrIsolation> findByStatus(String status, Pageable pageable);
    boolean existsByAgentIdAndStatus(String agentId, String status);

    // SPEC-04 (W1b) — tenant-scoped list reads. Null-tenant (pre-backfill) rows are
    // excluded, so a tenant-scoped read can never cross tenants (fail-closed).
    Page<UtmEdrIsolation> findByTenantId(Long tenantId, Pageable pageable);
    Page<UtmEdrIsolation> findByTenantIdAndStatus(Long tenantId, String status, Pageable pageable);
}
