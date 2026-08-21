package com.hivearmor.web.rest;

import com.hivearmor.domain.compliance.UtmComplianceEvalHistory;
import com.hivearmor.domain.compliance.UtmComplianceStandard;
import com.hivearmor.repository.compliance.UtmComplianceControlConfigRepository;
import com.hivearmor.repository.compliance.UtmComplianceEvalHistoryRepository;
import com.hivearmor.repository.compliance.UtmComplianceStandardRepository;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.dto.HiveFrameworkScoreDTO;
import com.hivearmor.service.dto.HivePostureScoreDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * REST controller — Security Posture (P4).
 *
 * GET /api/ha-posture/score       — overall posture score (aggregated from all frameworks)
 * GET /api/ha-posture/frameworks  — per-framework breakdown (matches ComplianceFrameworkDTO)
 *
 * Data source: hive_compliance_eval_history + hive_compliance_standard
 * Scores are populated by the scheduled ComplianceEvidenceScoringService (every 30s).
 */
@RestController
@RequestMapping("/api/ha-posture")
@PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
              "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
public class HaPostureResource {

    private static final Logger log = LoggerFactory.getLogger(HaPostureResource.class);

    private final UtmComplianceEvalHistoryRepository evalHistoryRepo;
    private final UtmComplianceStandardRepository standardRepo;
    private final UtmComplianceControlConfigRepository controlConfigRepo;

    public HaPostureResource(UtmComplianceEvalHistoryRepository evalHistoryRepo,
                              UtmComplianceStandardRepository standardRepo,
                              UtmComplianceControlConfigRepository controlConfigRepo) {
        this.evalHistoryRepo = evalHistoryRepo;
        this.standardRepo = standardRepo;
        this.controlConfigRepo = controlConfigRepo;
    }

    // ------------------------------------------------------------------
    // GET /api/ha-posture/score
    // ------------------------------------------------------------------

    @GetMapping("/score")
    public ResponseEntity<HivePostureScoreDTO> getPostureScore() {
        log.debug("GET /api/ha-posture/score");

        List<UtmComplianceEvalHistory> latestPerFramework = evalHistoryRepo.findLatestPerFramework();

        if (latestPerFramework.isEmpty()) {
            // No evaluations yet — return zeroed placeholder so the frontend doesn't break
            HivePostureScoreDTO empty = new HivePostureScoreDTO();
            empty.setOverallScore(0.0);
            empty.setTotalFrameworks(0);
            empty.setControlsPassed(0);
            empty.setControlsFailed(0);
            empty.setControlsTotal(0);
            empty.setTrend("stable");
            return ResponseEntity.ok(empty);
        }

        // Aggregate across all frameworks
        double scoreSum = 0.0;
        int totalPassed = 0;
        int totalFailed = 0;
        int totalControls = 0;
        Instant mostRecent = Instant.EPOCH;

        for (UtmComplianceEvalHistory h : latestPerFramework) {
            if (h.getOverallScore() != null) scoreSum += h.getOverallScore().doubleValue();
            if (h.getControlsPassed() != null)  totalPassed   += h.getControlsPassed();
            if (h.getControlsFailed() != null)  totalFailed   += h.getControlsFailed();
            if (h.getControlsTotal()  != null)  totalControls += h.getControlsTotal();
            if (h.getEvaluatedAt() != null && h.getEvaluatedAt().isAfter(mostRecent)) {
                mostRecent = h.getEvaluatedAt();
            }
        }

        double overallScore = BigDecimal.valueOf(scoreSum / latestPerFramework.size())
            .setScale(2, RoundingMode.HALF_UP).doubleValue();

        HivePostureScoreDTO dto = new HivePostureScoreDTO();
        dto.setOverallScore(overallScore);
        dto.setTotalFrameworks(latestPerFramework.size());
        dto.setControlsPassed(totalPassed);
        dto.setControlsFailed(totalFailed);
        dto.setControlsTotal(totalControls);
        dto.setLastAssessed(mostRecent.equals(Instant.EPOCH) ? null : mostRecent.toString());
        dto.setTrend(computeTrend(latestPerFramework));

        return ResponseEntity.ok(dto);
    }

    // ------------------------------------------------------------------
    // GET /api/ha-posture/frameworks
    // ------------------------------------------------------------------

    @GetMapping("/frameworks")
    public ResponseEntity<List<HiveFrameworkScoreDTO>> getFrameworks() {
        log.debug("GET /api/ha-posture/frameworks");

        List<UtmComplianceStandard> standards = standardRepo.findAll();
        List<HiveFrameworkScoreDTO> result = new ArrayList<>();

        for (UtmComplianceStandard standard : standards) {
            HiveFrameworkScoreDTO dto = new HiveFrameworkScoreDTO();
            dto.setId(String.valueOf(standard.getId()));
            dto.setName(standard.getStandardName());
            dto.setDescription(standard.getStandardDescription());
            dto.setVersion(null);  // version not stored on standard entity

            // control count from config repository
            int controlCount = controlConfigRepo.findControlIdsByStandardId(standard.getId()).size();
            dto.setControlCount(controlCount);

            // latest eval score
            evalHistoryRepo.findFirstByFrameworkIdOrderByEvaluatedAtDesc(standard.getId())
                .ifPresentOrElse(
                    h -> {
                        dto.setOverallScore(h.getOverallScore() != null
                            ? h.getOverallScore().doubleValue() : 0.0);
                        dto.setLastAssessed(h.getEvaluatedAt() != null
                            ? h.getEvaluatedAt().toString() : null);
                    },
                    () -> {
                        dto.setOverallScore(0.0);
                        dto.setLastAssessed(null);
                    }
                );

            result.add(dto);
        }

        return ResponseEntity.ok(result);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Trend: compare the average of the latest evaluations to evaluations from 24h ago.
     * "improving" if current avg > prior avg + 1, "declining" if current avg < prior avg - 1,
     * "stable" otherwise.
     */
    private String computeTrend(List<UtmComplianceEvalHistory> latest) {
        if (latest.isEmpty()) return "stable";

        double currentAvg = latest.stream()
            .filter(h -> h.getOverallScore() != null)
            .mapToDouble(h -> h.getOverallScore().doubleValue())
            .average().orElse(0.0);

        Instant yesterday = Instant.now().minus(24, ChronoUnit.HOURS);
        List<Double> priorScores = new ArrayList<>();
        for (UtmComplianceEvalHistory h : latest) {
            evalHistoryRepo.findByFrameworkIdAndEvaluatedAtAfterOrderByEvaluatedAtAsc(
                h.getFrameworkId(), yesterday)
                .stream()
                .findFirst()
                .ifPresent(prior -> {
                    if (prior.getOverallScore() != null) {
                        priorScores.add(prior.getOverallScore().doubleValue());
                    }
                });
        }

        if (priorScores.isEmpty()) return "stable";

        double priorAvg = priorScores.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);

        if (currentAvg > priorAvg + 1.0) return "improving";
        if (currentAvg < priorAvg - 1.0) return "declining";
        return "stable";
    }
}
