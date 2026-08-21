package com.hivearmor.repository;

import com.hivearmor.domain.UtmEvidencePlacement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for UtmEvidencePlacement.
 * S-4A
 */
@Repository
public interface UtmEvidencePlacementRepository extends JpaRepository<UtmEvidencePlacement, Long> {

    List<UtmEvidencePlacement> findByBoardId(Long boardId);

    void deleteByBoardId(Long boardId);
}
