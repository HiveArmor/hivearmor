package com.hivearmor.repository.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UtmAgentGroupRepository extends JpaRepository<UtmAgentGroup, Long> {
    Optional<UtmAgentGroup> findByGroupName(String groupName);
    List<UtmAgentGroup> findByPlatform(String platform);
    List<UtmAgentGroup> findAllByOrderByGroupNameAsc();

    // SPEC-04 (W1b) — tenant-scoped reads. Null-tenant (pre-backfill) rows excluded.
    List<UtmAgentGroup> findByTenantIdOrderByGroupNameAsc(Long tenantId);
    Optional<UtmAgentGroup> findByIdAndTenantId(Long id, Long tenantId);
}
