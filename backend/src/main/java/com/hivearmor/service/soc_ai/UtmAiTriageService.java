package com.hivearmor.service.soc_ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soc_ai.UtmAiTriage;
import com.hivearmor.repository.soc_ai.UtmAiTriageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.Locale;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class UtmAiTriageService {

    private final UtmAiTriageRepository triageRepository;
    private final ObjectMapper objectMapper;

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

            // Agentic early-exit foundation: high-confidence false positive → AUTO_CLOSED_FP
            // (does not mutate the OpenSearch alert document in this path — triage ledger only).
            if (isHighConfidenceFalsePositive(triage.getClassification(), triage.getConfidenceScore())) {
                triage.setStatus("AUTO_CLOSED_FP");
                log.info("SOC-AI auto-closed FP triage for alert {} (confidence={})",
                    alertId, triage.getConfidenceScore());
            }
        } catch (Exception e) {
            log.warn("Could not parse SOC-AI response JSON for alert {}: {}", alertId, e.getMessage());
            triage.setClassification("UNKNOWN");
        }

        return triageRepository.save(triage);
    }

    /**
     * FP early-exit threshold — mirrors AiSOC-style auto-close at ≥0.85 confidence.
     */
    static boolean isHighConfidenceFalsePositive(String classification, BigDecimal confidence) {
        if (classification == null || confidence == null) {
            return false;
        }
        String c = classification.trim().toLowerCase(Locale.ROOT);
        boolean isFp = c.contains("false positive") || c.equals("fp") || c.equals("benign");
        return isFp && confidence.compareTo(new BigDecimal("0.85")) >= 0;
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
