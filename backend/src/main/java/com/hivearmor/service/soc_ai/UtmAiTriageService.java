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
        } catch (Exception e) {
            log.warn("Could not parse SOC-AI response JSON for alert {}: {}", alertId, e.getMessage());
            triage.setClassification("UNKNOWN");
        }

        return triageRepository.save(triage);
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
