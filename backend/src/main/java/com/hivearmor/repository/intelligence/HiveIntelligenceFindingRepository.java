package com.hivearmor.repository.intelligence;

import com.hivearmor.domain.intelligence.HiveIntelligenceFinding;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface HiveIntelligenceFindingRepository extends JpaRepository<HiveIntelligenceFinding, Long> {

    @EntityGraph(attributePaths = {"facts", "inferences", "evidenceGaps"})
    Optional<HiveIntelligenceFinding> findWithDetailsById(Long id);

    Page<HiveIntelligenceFinding> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
