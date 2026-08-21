package com.hivearmor.repository;

import com.hivearmor.domain.EvidenceCustody;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for the {@link EvidenceCustody} entity.
 *
 * <p>Provides lookup methods for evidence chain of custody events,
 * ordered chronologically for provenance display.
 *
 * <p>Sprint 43 — Evidence provenance and custody chain (INC-007).
 */
@Repository
public interface EvidenceCustodyRepository extends JpaRepository<EvidenceCustody, String> {

    /**
     * Finds all custody events for a given evidence item ordered by creation time
     * ascending (earliest first), forming the complete chain of custody.
     *
     * @param evidenceId the evidence item identifier
     * @return custody events in chronological order
     */
    List<EvidenceCustody> findByEvidenceIdOrderByCreatedAtAsc(String evidenceId);
}
