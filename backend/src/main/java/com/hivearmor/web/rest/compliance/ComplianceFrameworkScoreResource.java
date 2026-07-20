package com.hivearmor.web.rest.compliance;

import com.hivearmor.domain.compliance.UtmComplianceEvalHistory;
import com.hivearmor.domain.compliance.UtmComplianceStandard;
import com.hivearmor.repository.compliance.UtmComplianceEvalHistoryRepository;
import com.hivearmor.repository.compliance.UtmComplianceStandardRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * GET /api/ha-compliance/frameworks — latest compliance score per framework.
 *
 * Returns one record per framework with its most recent eval history entry.
 * Used by the compliance dashboard and sprint validation tests.
 */
@RestController
@RequestMapping("/api/ha-compliance")
public class ComplianceFrameworkScoreResource {

    private final UtmComplianceStandardRepository standardRepository;
    private final UtmComplianceEvalHistoryRepository evalHistoryRepository;

    public ComplianceFrameworkScoreResource(
            UtmComplianceStandardRepository standardRepository,
            UtmComplianceEvalHistoryRepository evalHistoryRepository) {
        this.standardRepository = standardRepository;
        this.evalHistoryRepository = evalHistoryRepository;
    }

    @GetMapping("/frameworks")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> getFrameworks() {
        List<UtmComplianceStandard> standards = standardRepository.findAll();
        Instant since = Instant.now().minus(30, ChronoUnit.DAYS);
        List<Map<String, Object>> result = new ArrayList<>();

        for (UtmComplianceStandard std : standards) {
            List<UtmComplianceEvalHistory> history =
                evalHistoryRepository.findByFrameworkIdAndEvaluatedAtAfterOrderByEvaluatedAtAsc(std.getId(), since);

            BigDecimal score = BigDecimal.ZERO;
            Integer passed = 0, failed = 0, total = 0;
            Instant evaluatedAt = null;

            if (!history.isEmpty()) {
                UtmComplianceEvalHistory latest = history.get(history.size() - 1);
                score = latest.getOverallScore();
                passed = latest.getControlsPassed();
                failed = latest.getControlsFailed();
                total = latest.getControlsTotal();
                evaluatedAt = latest.getEvaluatedAt();
            }

            result.add(Map.of(
                "frameworkId", std.getId(),
                "frameworkName", std.getStandardName() != null ? std.getStandardName() : "",
                "overallScore", score,
                "controlsPassed", passed,
                "controlsFailed", failed,
                "controlsTotal", total,
                "evaluatedAt", evaluatedAt != null ? evaluatedAt.toString() : ""
            ));
        }

        return ResponseEntity.ok(result);
    }
}
