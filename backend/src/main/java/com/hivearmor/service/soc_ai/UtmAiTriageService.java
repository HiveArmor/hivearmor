package com.hivearmor.service.soc_ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soc_ai.UtmAiTriage;
import com.hivearmor.repository.soc_ai.UtmAiTriageRepository;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.util.enums.AlertStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.Locale;

@Service
@Transactional
@Slf4j
public class UtmAiTriageService {

    private static final BigDecimal DEFAULT_AUTO_CLOSE_THRESHOLD = new BigDecimal("0.85");

    private final UtmAiTriageRepository triageRepository;
    private final ObjectMapper objectMapper;
    private final UtmAlertService utmAlertService;
    private final BigDecimal autoCloseThreshold;

    public UtmAiTriageService(
            UtmAiTriageRepository triageRepository,
            ObjectMapper objectMapper,
            UtmAlertService utmAlertService,
            @Value("${hivearmor.soc-ai.auto-close-threshold:0.85}") BigDecimal autoCloseThreshold) {
        this.triageRepository = triageRepository;
        this.objectMapper = objectMapper;
        this.utmAlertService = utmAlertService;
        this.autoCloseThreshold = autoCloseThreshold != null
            ? autoCloseThreshold
            : DEFAULT_AUTO_CLOSE_THRESHOLD;
    }

    public Optional<UtmAiTriage> getLatest(String alertId) {
        return triageRepository.findTopByAlertIdOrderByAnalyzedAtDesc(alertId);
    }

    public List<UtmAiTriage> getHistory(String alertId) {
        return triageRepository.findByAlertIdOrderByAnalyzedAtDesc(alertId);
    }

    /**
     * Parse and persist the raw JSON response returned by the SOC-AI plugin.
     * Expected keys: classification, confidence, reasoning (String[]), nextSteps (list of {action, details}).
     */
    public UtmAiTriage saveResult(String alertId, String rawJson) {
        UtmAiTriage triage = new UtmAiTriage();
        triage.setAlertId(alertId);
        triage.setRawResponse(rawJson);
        triage.setAnalyzedAt(Instant.now());
        triage.setStatus("COMPLETED");
        triage.setRequestedBy(currentUser());

        try {
            Map<String, Object> parsed = objectMapper.readValue(rawJson,
                new TypeReference<Map<String, Object>>() {});

            triage.setClassification(stringVal(parsed, "classification"));
            triage.setModelVersion(stringVal(parsed, "modelVersion"));

            Object conf = parsed.get("confidence");
            if (conf instanceof Number) {
                triage.setConfidenceScore(BigDecimal.valueOf(((Number) conf).doubleValue()));
            }

            Object reasoning = parsed.get("reasoning");
            if (reasoning instanceof List) {
                triage.setReasoning(objectMapper.writeValueAsString(reasoning));
            } else if (reasoning instanceof String) {
                triage.setReasoning((String) reasoning);
            }

            Object nextSteps = parsed.get("nextSteps");
            if (nextSteps != null) {
                triage.setNextSteps(objectMapper.writeValueAsString(nextSteps));
            }

            // STAGING CANDIDATE — agentic FP early-exit (not PRODUCTION READY).
            // High-confidence false positive → triage ledger AUTO_CLOSED_FP and OpenSearch
            // alert status via UtmAlertService.updateStatus (same path as POST /api/ha-alerts/status).
            // Enrich → investigate FSM and attack-path are deferred.
            if (isHighConfidenceFalsePositive(
                    triage.getClassification(), triage.getConfidenceScore(), autoCloseThreshold)) {
                triage.setStatus("AUTO_CLOSED_FP");
                closeAlertAsFalsePositive(alertId, triage.getConfidenceScore());
                log.info("SOC-AI auto-closed FP for alert {} (confidence={}, threshold={})",
                    alertId, triage.getConfidenceScore(), autoCloseThreshold);
            }
        } catch (Exception e) {
            log.warn("Could not parse SOC-AI response JSON for alert {}: {}", alertId, e.getMessage());
            triage.setClassification("UNKNOWN");
        }

        return triageRepository.save(triage);
    }

    /**
     * Mutate OpenSearch alert status through the existing alert service path (system actor).
     * Failures are logged only — ledger AUTO_CLOSED_FP is still persisted (STAGING CANDIDATE).
     */
    private void closeAlertAsFalsePositive(String alertId, BigDecimal confidence) {
        String observation = String.format(
            "SOC-AI system actor auto-closed as false positive (confidence=%s, threshold=%s)",
            confidence, autoCloseThreshold);
        try {
            utmAlertService.updateStatus(
                List.of(alertId),
                AlertStatus.FALSE_POSITIVE.getCode(),
                observation);
        } catch (Exception e) {
            log.warn("SOC-AI could not mutate OpenSearch alert status for {}: {}",
                alertId, e.getMessage());
        }
    }

    /**
     * FP early-exit when classification is FP/benign and confidence ≥ configured threshold
     * ({@code hivearmor.soc-ai.auto-close-threshold} / {@code HA_SOC_AI_AUTO_CLOSE_THRESHOLD}, default 0.85).
     */
    static boolean isHighConfidenceFalsePositive(
            String classification, BigDecimal confidence, BigDecimal threshold) {
        if (classification == null || confidence == null || threshold == null) {
            return false;
        }
        String c = classification.trim().toLowerCase(Locale.ROOT);
        boolean isFp = c.contains("false positive") || c.equals("fp") || c.equals("benign");
        return isFp && confidence.compareTo(threshold) >= 0;
    }

    public UtmAiTriage savePending(String alertId) {
        UtmAiTriage triage = new UtmAiTriage();
        triage.setAlertId(alertId);
        triage.setAnalyzedAt(Instant.now());
        triage.setStatus("PENDING");
        triage.setRequestedBy(currentUser());
        return triageRepository.save(triage);
    }

    private String stringVal(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString() : null;
    }

    private String currentUser() {
        try {
            return SecurityContextHolder.getContext().getAuthentication().getName();
        } catch (Exception e) {
            return "system";
        }
    }
}
