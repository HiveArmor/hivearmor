package com.hivearmor.repository;

import com.hivearmor.domain.UtmEvidenceItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for UtmEvidenceItem.
 * S-4A
 */
@Repository
public interface UtmEvidenceItemRepository extends JpaRepository<UtmEvidenceItem, Long> {

    List<UtmEvidenceItem> findByIncidentId(Long incidentId);
}
