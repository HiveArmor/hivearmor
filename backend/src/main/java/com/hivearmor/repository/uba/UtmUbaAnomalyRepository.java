package com.hivearmor.repository.uba;

import com.hivearmor.domain.uba.UtmUbaAnomaly;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface UtmUbaAnomalyRepository extends JpaRepository<UtmUbaAnomaly, Long> {

    Page<UtmUbaAnomaly> findAllByOrderByDetectedAtDesc(Pageable pageable);

    List<UtmUbaAnomaly> findByEntityIdAndEntityTypeOrderByDetectedAtDesc(
        String entityId, String entityType);

    Page<UtmUbaAnomaly> findBySeverityOrderByDetectedAtDesc(String severity, Pageable pageable);

    long countBySeverity(String severity);

    long countByDetectedAtAfter(Instant since);

    long countByStatus(String status);
}
