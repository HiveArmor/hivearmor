package com.hivearmor.repository;

import com.hivearmor.domain.HaEdrQuarantine;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for {@link HaEdrQuarantine}.
 *
 * Provides paginated query access to the ha_edr_quarantine table,
 * filtered by agent ID and/or status, plus bulk lookup by ID list.
 *
 * Backs GET /api/ha-edr/quarantine, PATCH /api/ha-edr/quarantine/{id},
 * and POST /api/ha-edr/quarantine/bulk.
 */
@Repository
public interface HaEdrQuarantineRepository extends JpaRepository<HaEdrQuarantine, Long> {

    /**
     * Returns a page of quarantined files for a specific agent filtered by status.
     */
    Page<HaEdrQuarantine> findByAgentIdAndStatus(String agentId, String status, Pageable pageable);

    /**
     * Returns a page of quarantined files filtered by status across all agents.
     */
    Page<HaEdrQuarantine> findByStatus(String status, Pageable pageable);

    /**
     * Returns a page of quarantined files for a specific agent across all statuses.
     */
    Page<HaEdrQuarantine> findByAgentId(String agentId, Pageable pageable);

    /**
     * Returns all quarantined file records whose IDs are in the given list.
     * Used by bulk restore/delete operations.
     */
    List<HaEdrQuarantine> findAllByIdIn(List<Long> ids);
}
