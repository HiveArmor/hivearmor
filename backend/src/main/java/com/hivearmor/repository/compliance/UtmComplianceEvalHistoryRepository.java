package com.hivearmor.repository.compliance;

import com.hivearmor.domain.compliance.UtmComplianceEvalHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface UtmComplianceEvalHistoryRepository extends JpaRepository<UtmComplianceEvalHistory, Long> {

    List<UtmComplianceEvalHistory> findByFrameworkIdAndEvaluatedAtAfterOrderByEvaluatedAtAsc(
        Long frameworkId, Instant after);

    java.util.Optional<UtmComplianceEvalHistory> findFirstByFrameworkIdOrderByEvaluatedAtDesc(Long frameworkId);

    @org.springframework.data.jpa.repository.Query(
        "SELECT h FROM UtmComplianceEvalHistory h WHERE h.evaluatedAt = " +
        "(SELECT MAX(h2.evaluatedAt) FROM UtmComplianceEvalHistory h2 WHERE h2.frameworkId = h.frameworkId)")
    List<UtmComplianceEvalHistory> findLatestPerFramework();
}
