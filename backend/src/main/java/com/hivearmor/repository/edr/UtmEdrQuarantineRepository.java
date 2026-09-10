package com.hivearmor.repository.edr;

import com.hivearmor.domain.edr.UtmEdrQuarantine;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmEdrQuarantineRepository extends JpaRepository<UtmEdrQuarantine, Long> {
    Page<UtmEdrQuarantine> findByAgentId(String agentId, Pageable pageable);
    Page<UtmEdrQuarantine> findByStatus(String status, Pageable pageable);
    List<UtmEdrQuarantine> findByAgentIdAndStatus(String agentId, String status);
    long countByStatus(String status);

    // P0A1-T09 follow-on — tenant-scoped reads. Null-tenant (pre-backfill) rows are
    // excluded from tenant-scoped reads, so a read can never cross tenants.
    Page<UtmEdrQuarantine> findByTenantId(Long tenantId, Pageable pageable);
    Page<UtmEdrQuarantine> findByTenantIdAndAgentId(Long tenantId, String agentId, Pageable pageable);
    Page<UtmEdrQuarantine> findByTenantIdAndStatus(Long tenantId, String status, Pageable pageable);
}
