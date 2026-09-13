package com.hivearmor.repository.connector;

import com.hivearmor.domain.connector.HaConnectorInstance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface HaConnectorInstanceRepository extends JpaRepository<HaConnectorInstance, Long> {

    List<HaConnectorInstance> findAllByOrderByNameAsc();

    Optional<HaConnectorInstance> findByNameIgnoreCase(String name);

    List<HaConnectorInstance> findByConnectorIdOrderByNameAsc(String connectorId);

    // SPEC-04 (W1b) — tenant-scoped reads. Null-tenant (pre-backfill) rows excluded.
    List<HaConnectorInstance> findByTenantIdOrderByNameAsc(Long tenantId);
    Optional<HaConnectorInstance> findByIdAndTenantId(Long id, Long tenantId);
}
