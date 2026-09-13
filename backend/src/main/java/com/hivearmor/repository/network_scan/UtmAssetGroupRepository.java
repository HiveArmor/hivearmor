package com.hivearmor.repository.network_scan;

import com.hivearmor.domain.network_scan.UtmAssetGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;


/**
 * Spring Data  repository for the UtmAssetGroup entity.
 */
@SuppressWarnings("unused")
@Repository
public interface UtmAssetGroupRepository extends JpaRepository<UtmAssetGroup, Long> {

    // SPEC-04 (W1b, FU-1) — tenant-scoped by-id load; null-tenant (pre-backfill)
    // rows excluded (fail-closed).
    Optional<UtmAssetGroup> findByIdAndTenantId(Long id, Long tenantId);
}
