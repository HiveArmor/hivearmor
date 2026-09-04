package com.hivearmor.service.hunt.ai;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.web.rest.hunt.ai.dto.AiCalibrationDTO;
import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseResponseDTO.AiProvenanceDTO;
import com.hivearmor.web.rest.hunt.ai.dto.HuntEventSample;
import com.hivearmor.web.rest.hunt.ai.dto.VerdictResponseDTO;

/**
 * Hunt AI — verdict keystone (HUNT-AI-CONTRACT §3, BACKEND-SCOPE §1a).
 *
 * <p>Given a bounded sample of a completed hunt's events, this: (1) deterministically clusters
 * them by {@code [user, sourceIp, category]} so the LLM reasons over a cluster (not thousands of
 * raw rows — the AI-SOC cost-control funnel: no raw log hits the model unnecessarily), (2) prompts
 * the active LLM (Foundation-Sec-8B on Ollama) for a STRUCTURED JSON verdict, (3) parses it into
 * {@link VerdictResponseDTO} with reasoning row-citations and evidence, and (4) attaches the real
 * {@link AiCalibrationDTO} from {@link HaAiCalibrationService} so confidence never stands alone.
 *
 * <p>Honest states throughout: LLM unconfigured / provider failure → {@code state="unavailable"};
 * too few events → {@code state="insufficient_data"}. Never a fabricated verdict, never a 5xx.
 * The event sample is passed in by the caller (from the completed search) — this service does not
 * itself re-query OpenSearch.
 */
@Service
public class HaHuntVerdictService {

    private static final Logger log = LoggerFactory.getLogger(HaHuntVerdictService.class);
    private static final String AGENT_VERSION = "hunt-verdict@1.0-mockable";
    private static final String CAVEAT = "AI-derived — verify before acting";
    private static final String VERDICT_SCOPE = "credential-access verdicts";
    /** Minimum events before a verdict is meaningful. */
    private static final int MIN_EVENTS = 3;

    private static final String SYSTEM_PROMPT =
        "You are a senior SOC triage analyst for HiveArmor. You are given a CLUSTER of normalized "
        + "security events already grouped by actor. Decide a single verdict for the cluster and "
        + "return ONLY a JSON object with this exact shape and nothing else:\n"
        + "{\"verdict\":\"malicious|suspicious|benign|inconclusive\",\"confidence\":0.0-1.0,"
        + "\"title\":string,\"summary\":string,\"conclusion\":string,"
        + "\"mitre\":[{\"tactic\":string,\"technique\":string,\"subtechnique\":string?}],"
        + "\"reasoning\":[{\"label\":string,\"detail\":string,\"rowRefs\":[eventId,...]}],"
        + "\"evidence\":[{\"label\":string,\"value\":string,\"rowRef\":eventId,\"kind\":\"field|event|enrichment|correlation\"}]}\n"
        + "Cite the exact event ids you rely on in rowRefs/rowRef. Do not invent fields or events. "
        + "If the signal is weak, use verdict \"inconclusive\" with low confidence. Output JSON only.";

    private final HaLlmService llm;
    private final HaAiCalibrationService calibration;
    private final ObjectMapper mapper;

    @Value("${hunt.ai.verdict.max-events:120}")
    private int maxEvents;

    public HaHuntVerdictService(HaLlmService llm, HaAiCalibrationService calibration, ObjectMapper mapper) {
        this.llm = llm;
        this.calibration = calibration;
        this.mapper = mapper;
    }

    /**
     * Produce a verdict over the given event sample. Returns an honest non-ready response when
     * there are too few events or the LLM is unavailable.
     */
    public VerdictResponseDTO verdict(String searchId, List<HuntEventSample> events) {
        if (events == null || events.size() < MIN_EVENTS) {
            return VerdictResponseDTO.nonReady("insufficient_data");
        }
        final List<HuntEventSample> sample = events.size() > maxEvents ? events.subList(0, maxEvents) : events;
        final List<Cluster> clusters = cluster(sample);
        final String userPrompt = renderPrompt(clusters, sample.size());

        final String raw;
        try {
            raw = llm.chat(
                List.of(new ChatMessage("system", SYSTEM_PROMPT), new ChatMessage("user", userPrompt)),
                new ChatOptions(null, 0.1, 700));
        } catch (LlmNotConfiguredException e) {
            log.debug("Hunt AI verdict: LLM not configured — unavailable");
            return VerdictResponseDTO.nonReady("unavailable");
        } catch (RuntimeException e) {
            log.warn("Hunt AI verdict: provider call failed — unavailable", e);
            return VerdictResponseDTO.nonReady("unavailable");
        }

        final JsonNode json = parseJson(raw);
        if (json == null || !json.hasNonNull("verdict")) {
            log.warn("Hunt AI verdict: could not parse structured response — unavailable");
            return VerdictResponseDTO.nonReady("unavailable");
        }
        return assemble(searchId, json, sample.size(), largestClusterSize(clusters));
    }

    // ---- clustering (deterministic, pre-LLM) --------------------------------------------------

    private record Cluster(String key, List<HuntEventSample> events) {}

    private List<Cluster> cluster(List<HuntEventSample> events) {
        Map<String, List<HuntEventSample>> byKey = new LinkedHashMap<>();
        for (HuntEventSample e : events) {
            String key = safe(e.user()) + "|" + safe(e.sourceIp()) + "|" + safe(e.category());
            byKey.computeIfAbsent(key, k -> new ArrayList<>()).add(e);
        }
        return byKey.entrySet().stream()
            .map(en -> new Cluster(en.getKey(), en.getValue()))
            .sorted((a, b) -> Integer.compare(b.events().size(), a.events().size()))
            .collect(Collectors.toList());
    }

    private int largestClusterSize(List<Cluster> clusters) {
        return clusters.isEmpty() ? 0 : clusters.get(0).events().size();
    }

    private String renderPrompt(List<Cluster> clusters, int total) {
        StringBuilder sb = new StringBuilder();
        sb.append("Total events considered: ").append(total).append('\n');
        sb.append("Clusters (grouped by user|sourceIp|category), largest first:\n");
        int shown = 0;
        for (Cluster c : clusters) {
            if (shown++ >= 8) { sb.append("... (").append(clusters.size() - 8).append(" more clusters)\n"); break; }
            sb.append("\nCLUSTER ").append(c.key()).append(" (").append(c.events().size()).append(" events):\n");
            for (HuntEventSample e : c.events()) {
                sb.append("  id=").append(e.id())
                  .append(" ts=").append(safe(e.timestamp()))
                  .append(" sev=").append(safe(e.severity()))
                  .append(" action=").append(safe(e.action()))
                  .append(" user=").append(safe(e.user()))
                  .append(" src=").append(safe(e.sourceIp()))
                  .append(" msg=").append(truncate(e.message(), 140))
                  .append('\n');
            }
        }
        return sb.toString();
    }

    // ---- structured-output parsing (with a light repair for fenced JSON) ----------------------

    private JsonNode parseJson(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();
        // strip ```json fences if the model added them
        if (s.startsWith("```")) {
            int nl = s.indexOf('\n');
            if (nl > 0) s = s.substring(nl + 1);
            if (s.endsWith("```")) s = s.substring(0, s.length() - 3);
        }
        // narrow to the outermost JSON object if there's stray prose
        int lb = s.indexOf('{'), rb = s.lastIndexOf('}');
        if (lb >= 0 && rb > lb) s = s.substring(lb, rb + 1);
        try {
            return mapper.readTree(s);
        } catch (Exception e) {
            return null;
        }
    }

    private VerdictResponseDTO assemble(String searchId, JsonNode j, int totalConsidered, int clusterSize) {
        String verdict = normalizeVerdict(j.path("verdict").asText("inconclusive"));
        double confidence = clamp01(j.path("confidence").asDouble(0.0));
        AiCalibrationDTO calib = calibration.calibrationFor(VERDICT_SCOPE);

        List<VerdictResponseDTO.MitreRefDTO> mitre = new ArrayList<>();
        for (JsonNode m : j.path("mitre")) {
            mitre.add(new VerdictResponseDTO.MitreRefDTO(
                text(m, "tactic"), text(m, "technique"), text(m, "subtechnique")));
        }
        List<VerdictResponseDTO.ReasoningStepDTO> reasoning = new ArrayList<>();
        int ri = 0;
        for (JsonNode r : j.path("reasoning")) {
            reasoning.add(new VerdictResponseDTO.ReasoningStepDTO(
                "r" + (++ri), text(r, "label"), text(r, "detail"), "done", strList(r.path("rowRefs"))));
        }
        List<VerdictResponseDTO.EvidenceItemDTO> evidence = new ArrayList<>();
        int ei = 0;
        for (JsonNode ev : j.path("evidence")) {
            String kind = text(ev, "kind");
            boolean lensed = "enrichment".equals(kind) || "correlation".equals(kind);
            evidence.add(new VerdictResponseDTO.EvidenceItemDTO(
                "e" + (++ei), text(ev, "label"), text(ev, "value"), text(ev, "rowRef"),
                kind == null ? "field" : kind, lensed));
        }

        return new VerdictResponseDTO(
            "1", "ready",
            "VERDICT-" + searchId,
            verdict, confidence, calib,
            text(j, "title"), text(j, "summary"), text(j, "conclusion"),
            clusterSize, totalConsidered,
            mitre.isEmpty() ? null : mitre, reasoning, evidence,
            new AiProvenanceDTO(llm.activeProviderName(), Instant.now().toString(), AGENT_VERSION, CAVEAT));
    }

    // ---- helpers ------------------------------------------------------------------------------

    private static String normalizeVerdict(String v) {
        String s = v == null ? "" : v.trim().toLowerCase();
        return switch (s) {
            case "malicious", "suspicious", "benign", "inconclusive" -> s;
            default -> "inconclusive";
        };
    }

    private static double clamp01(double v) {
        double x = v > 1.0 ? v / 100.0 : v; // tolerate 0-100 too
        return Math.max(0.0, Math.min(1.0, x));
    }

    private static String text(JsonNode n, String field) {
        JsonNode f = n.get(field);
        return (f == null || f.isNull()) ? null : f.asText();
    }

    private static List<String> strList(JsonNode arr) {
        if (arr == null || !arr.isArray() || arr.isEmpty()) return null;
        List<String> out = new ArrayList<>();
        arr.forEach(n -> out.add(n.asText()));
        return out;
    }

    private static String safe(String s) { return s == null ? "" : s; }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
