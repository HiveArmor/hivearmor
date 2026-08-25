package com.hivearmor.service.soc_ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.Constants;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import com.hivearmor.domain.soc_ai.UtmAiTriage;
import com.hivearmor.repository.soc_ai.UtmAiTriageRepository;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.service.dto.InvestigationSessionDTO;
import com.hivearmor.service.dto.SessionItemDTO;
import com.hivearmor.service.session.InvestigationSessionService;
import com.hivearmor.util.enums.AlertStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
@Transactional
@Slf4j
public class UtmAiTriageService {

    private static final BigDecimal DEFAULT_AUTO_CLOSE_THRESHOLD = new BigDecimal("0.85");

    private final UtmAiTriageRepository triageRepository;
    private final ObjectMapper objectMapper;
    private final UtmAlertService utmAlertService;
    private final ObjectProvider<InvestigationSessionService> investigationSessionService;
    private final BigDecimal autoCloseThreshold;

    public UtmAiTriageService(
            UtmAiTriageRepository triageRepository,
            ObjectMapper objectMapper,
            UtmAlertService utmAlertService,
            ObjectProvider<InvestigationSessionService> investigationSessionService,
            @Value("${hivearmor.ai.triage.auto-close-confidence:${hivearmor.soc-ai.auto-close-threshold:0.85}}")
                BigDecimal autoCloseThreshold) {
        this.triageRepository = triageRepository;
        this.objectMapper = objectMapper;
        this.utmAlertService = utmAlertService;
        this.investigationSessionService = investigationSessionService;
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
     *
     * <p>STAGING CANDIDATE — runs a minimal agentic FSM after parse:
     * {@code AUTO_TRIAGE → END} on high-confidence FP (also mutates OpenSearch status/tag),
     * otherwise {@code AUTO_TRIAGE → ENRICH (thin stub) → INVESTIGATE (thin stub + optional
     * soft investigation-session link) → END}. FSM steps are prepended onto {@code nextSteps}
     * for ledger observability. Not PRODUCTION READY. Never claims Neo4j / attack-path.
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

            boolean highConfidenceFp = isHighConfidenceFalsePositive(
                triage.getClassification(), triage.getConfidenceScore(), autoCloseThreshold);

            // STAGING CANDIDATE — minimal agentic FSM (not PRODUCTION READY).
            List<AgenticTriageState> fsmPath = AgenticTriageFsm.run(highConfidenceFp);
            Map<String, Object> enrichment = null;
            Map<String, Object> investigate = null;
            if (fsmPath.contains(AgenticTriageState.ENRICH)
                || fsmPath.contains(AgenticTriageState.INVESTIGATE)) {
                UtmAlert alertDoc = loadAlertSoft(alertId);
                if (fsmPath.contains(AgenticTriageState.ENRICH)) {
                    enrichment = TriageEnrichmentStub.build(parsed, alertDoc);
                }
                if (fsmPath.contains(AgenticTriageState.INVESTIGATE)) {
                    // Soft OS resolvability + optional soft session link (STAGING CANDIDATE).
                    // No related-alert query, Neo4j, attack-path, or incident conversion.
                    InvestigationSessionService sessions = investigationSessionService != null
                        ? investigationSessionService.getIfAvailable()
                        : null;
                    final String pinAlertId = resolvePinAlertId(alertDoc, alertId);
                    investigate = TriageInvestigateStub.build(
                        alertDoc,
                        alertId,
                        sessions != null
                            ? (name, desc) -> softLinkInvestigationSession(name, desc, pinAlertId)
                            : null);
                }
            }
            persistFsmLedger(triage, fsmPath, highConfidenceFp, enrichment, investigate);

            if (highConfidenceFp) {
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
     * Log each FSM transition and prepend step records onto {@code nextSteps}
     * so the ledger is observable without a schema change.
     * ENRICH / INVESTIGATE steps include structured stub metadata when provided.
     */
    private void persistFsmLedger(
            UtmAiTriage triage,
            List<AgenticTriageState> path,
            boolean highConfidenceFp,
            Map<String, Object> enrichment,
            Map<String, Object> investigate) {
        List<Map<String, Object>> ledger = new ArrayList<>(path.size());
        for (AgenticTriageState state : path) {
            String detail;
            if (state == AgenticTriageState.ENRICH && enrichment != null) {
                detail = TriageEnrichmentStub.summarize(enrichment);
            } else if (state == AgenticTriageState.INVESTIGATE && investigate != null) {
                detail = TriageInvestigateStub.summarize(investigate);
            } else {
                detail = AgenticTriageFsm.detailFor(state, highConfidenceFp);
            }
            log.info("SOC-AI agentic FSM alert={} state={} detail={}",
                triage.getAlertId(), state.name(), detail);
            Map<String, Object> step = new LinkedHashMap<>(4);
            step.put("action", state.name());
            step.put("details", detail);
            if (state == AgenticTriageState.ENRICH && enrichment != null) {
                step.put("enrichment", enrichment);
            }
            if (state == AgenticTriageState.INVESTIGATE && investigate != null) {
                step.put("investigate", investigate);
            }
            ledger.add(step);
        }

        try {
            List<Object> merged = new ArrayList<>(ledger);
            String existing = triage.getNextSteps();
            if (existing != null && !existing.isBlank()) {
                List<Object> fromModel = objectMapper.readValue(
                    existing, new TypeReference<List<Object>>() {});
                merged.addAll(fromModel);
            }
            triage.setNextSteps(objectMapper.writeValueAsString(merged));
        } catch (Exception e) {
            log.warn("SOC-AI could not persist FSM ledger for alert {}: {}",
                triage.getAlertId(), e.getMessage());
            try {
                triage.setNextSteps(objectMapper.writeValueAsString(ledger));
            } catch (Exception ignored) {
                // leave nextSteps as previously set from model
            }
        }
    }

    /**
     * Extract ordered FSM state names from a persisted {@code nextSteps} JSON array.
     * Recognizes ledger entries whose {@code action} matches an {@link AgenticTriageState}.
     */
    static List<String> extractFsmPath(String nextStepsJson) {
        if (nextStepsJson == null || nextStepsJson.isBlank()) {
            return List.of();
        }
        try {
            ObjectMapper mapper = new ObjectMapper();
            List<Map<String, Object>> steps = mapper.readValue(
                nextStepsJson, new TypeReference<List<Map<String, Object>>>() {});
            List<String> path = new ArrayList<>();
            Set<String> known = new HashSet<>();
            for (AgenticTriageState s : AgenticTriageState.values()) {
                known.add(s.name());
            }
            for (Map<String, Object> step : steps) {
                Object action = step.get("action");
                if (action != null && known.contains(action.toString())) {
                    path.add(action.toString());
                }
            }
            return path;
        } catch (Exception e) {
            return List.of();
        }
    }

    /**
     * Extract structured ENRICH metadata from a persisted {@code nextSteps} JSON array.
     */
    static Optional<Map<String, Object>> extractEnrichment(String nextStepsJson) {
        return extractStepMetadata(nextStepsJson, "ENRICH", "enrichment");
    }

    /**
     * Extract structured INVESTIGATE metadata from a persisted {@code nextSteps} JSON array.
     */
    static Optional<Map<String, Object>> extractInvestigate(String nextStepsJson) {
        return extractStepMetadata(nextStepsJson, "INVESTIGATE", "investigate");
    }

    private static Optional<Map<String, Object>> extractStepMetadata(
            String nextStepsJson, String actionName, String metadataKey) {
        if (nextStepsJson == null || nextStepsJson.isBlank()) {
            return Optional.empty();
        }
        try {
            ObjectMapper mapper = new ObjectMapper();
            List<Map<String, Object>> steps = mapper.readValue(
                nextStepsJson, new TypeReference<List<Map<String, Object>>>() {});
            for (Map<String, Object> step : steps) {
                if (actionName.equals(String.valueOf(step.get("action")))
                    && step.get(metadataKey) instanceof Map<?, ?> raw) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> meta = (Map<String, Object>) raw;
                    return Optional.of(meta);
                }
            }
            return Optional.empty();
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    /**
     * Mutate OpenSearch alert status (and soft-fail append FP tag) via existing alert service paths.
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

        // Soft-fail tag so overview filters that exclude "False positive" also drop the alert.
        try {
            UtmAlert existing = loadAlertSoft(alertId);
            List<String> tags = new ArrayList<>();
            if (existing != null && existing.getTags() != null) {
                tags.addAll(existing.getTags());
            }
            if (!tags.contains(Constants.FALSE_POSITIVE_TAG)) {
                tags.add(Constants.FALSE_POSITIVE_TAG);
            }
            utmAlertService.updateTags(List.of(alertId), tags, false);
        } catch (Exception e) {
            log.warn("SOC-AI could not append OpenSearch FP tag for {}: {}",
                alertId, e.getMessage());
        }
    }

    /** Best-effort OpenSearch alert fetch — never throws to callers. */
    private UtmAlert loadAlertSoft(String alertId) {
        try {
            List<UtmAlert> alerts = utmAlertService.getAlertsByIds(List.of(alertId));
            if (alerts != null && !alerts.isEmpty()) {
                return alerts.get(0);
            }
        } catch (Exception e) {
            log.debug("SOC-AI could not load alert {} for enrich/investigate/tag: {}",
                alertId, e.getMessage());
        }
        return null;
    }

    /** Prefer OpenSearch alert id; fall back to triage alertId. Null-safe. */
    private static String resolvePinAlertId(UtmAlert alertDoc, String alertId) {
        if (alertDoc != null && alertDoc.getId() != null && !alertDoc.getId().isBlank()) {
            return alertDoc.getId();
        }
        return alertId;
    }

    /**
     * Soft-create an investigation session and soft-pin the alert as an ALERT item
     * (STAGING CANDIDATE). Returns null when the session service bean is unavailable so the
     * stub stays honest. Pin failures soft-fail with a sanitized error on the returned
     * {@link TriageInvestigateStub.LinkedSession} without undoing the session link.
     * Does not convert to incident. Create-session exceptions propagate to
     * {@link TriageInvestigateStub} which records {@code sessionLinked=false} without PII.
     */
    private TriageInvestigateStub.LinkedSession softLinkInvestigationSession(
            String sessionName, String description, String alertId) {
        InvestigationSessionService sessions = investigationSessionService != null
            ? investigationSessionService.getIfAvailable()
            : null;
        if (sessions == null) {
            return null;
        }
        String user = currentUser();
        InvestigationSessionDTO request = new InvestigationSessionDTO(
            null,
            null,
            null,
            sessionName,
            description,
            "ACTIVE",
            null,
            null,
            null,
            null,
            null,
            null);
        InvestigationSessionDTO created = sessions.createSession(request, user);
        if (created == null || created.id() == null) {
            return null;
        }
        String status = created.status() != null ? created.status() : "ACTIVE";
        log.info("SOC-AI INVESTIGATE soft-linked sessionId={} status={} (stub; no Neo4j)",
            created.id(), status);

        return softPinAlertItem(sessions, created.id(), status, alertId, user);
    }

    /**
     * Soft-pin the resolvable alert as a session item (type ALERT + itemRef = alert id).
     * Pin failure keeps the session link and returns a sanitized pin error (class name only).
     */
    private TriageInvestigateStub.LinkedSession softPinAlertItem(
            InvestigationSessionService sessions,
            long sessionId,
            String status,
            String alertId,
            String user) {
        if (alertId == null || alertId.isBlank()) {
            return new TriageInvestigateStub.LinkedSession(
                sessionId, status, false, null, null, "pin_skipped:missing_alert_id");
        }
        try {
            SessionItemDTO pinRequest = new SessionItemDTO(
                null,
                null,
                "ALERT",
                alertId.trim(),
                null,
                "Soft-pinned from agentic INVESTIGATE stub (STAGING CANDIDATE). "
                    + "No Neo4j / attack-path. Not auto-converted to incident.",
                null,
                null);
            // Owner of the just-created session — admin override not required.
            SessionItemDTO pinned = sessions.pinItem(sessionId, pinRequest, user, false);
            if (pinned == null || pinned.id() == null) {
                return new TriageInvestigateStub.LinkedSession(
                    sessionId, status, false, null, null, "pin_failed:no_item");
            }
            log.info(
                "SOC-AI INVESTIGATE soft-pinned sessionItemId={} type=ALERT sessionId={} (stub)",
                pinned.id(),
                sessionId);
            return new TriageInvestigateStub.LinkedSession(
                sessionId, status, true, pinned.id(), "ALERT", null);
        } catch (Exception e) {
            // Soft-fail pin only — session link remains; never include exception message (PII).
            return new TriageInvestigateStub.LinkedSession(
                sessionId,
                status,
                false,
                null,
                null,
                TriageInvestigateStub.sanitizeError(e, "pin_failed"));
        }
    }

    /**
     * FP early-exit when classification is FP/benign and confidence ≥ configured threshold
     * ({@code hivearmor.ai.triage.auto-close-confidence}, default 0.85;
     * falls back to {@code hivearmor.soc-ai.auto-close-threshold}).
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
