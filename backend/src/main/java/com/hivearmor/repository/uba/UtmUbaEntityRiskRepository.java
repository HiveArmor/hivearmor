package com.hivearmor.repository.uba;

import com.hivearmor.domain.uba.UtmUbaEntityRisk;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UtmUbaEntityRiskRepository extends JpaRepository<UtmUbaEntityRisk, Long> {

    Optional<UtmUbaEntityRisk> findByEntityIdAndEntityType(String entityId, String entityType);

    Page<UtmUbaEntityRisk> findAllByOrderByRiskScoreDesc(Pageable pageable);

    Page<UtmUbaEntityRisk> findByEntityTypeOrderByRiskScoreDesc(String entityType, Pageable pageable);

    Page<UtmUbaEntityRisk> findByRiskLevelOrderByRiskScoreDesc(String riskLevel, Pageable pageable);

    List<UtmUbaEntityRisk> findByWatchlistedTrueOrderByRiskScoreDesc();

    @Query("SELECT COUNT(e) FROM UtmUbaEntityRisk e WHERE e.riskLevel = :level")
    long countByRiskLevel(String level);

    @Query("SELECT AVG(e.riskScore) FROM UtmUbaEntityRisk e")
    Double avgRiskScore();
}
