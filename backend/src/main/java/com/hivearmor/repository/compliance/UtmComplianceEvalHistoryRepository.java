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
}
