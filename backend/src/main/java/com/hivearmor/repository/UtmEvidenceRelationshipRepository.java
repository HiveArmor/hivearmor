package com.hivearmor.repository;

import com.hivearmor.domain.UtmEvidenceRelationship;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for UtmEvidenceRelationship.
 * S-4A
 */
@Repository
public interface UtmEvidenceRelationshipRepository extends JpaRepository<UtmEvidenceRelationship, Long> {

    List<UtmEvidenceRelationship> findByIncidentId(Long incidentId);
}
