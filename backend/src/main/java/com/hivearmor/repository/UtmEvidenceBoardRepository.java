package com.hivearmor.repository;

import com.hivearmor.domain.UtmEvidenceBoard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Spring Data JPA repository for UtmEvidenceBoard.
 * S-4A
 */
@Repository
public interface UtmEvidenceBoardRepository extends JpaRepository<UtmEvidenceBoard, Long> {

    Optional<UtmEvidenceBoard> findFirstByIncidentId(Long incidentId);
}
