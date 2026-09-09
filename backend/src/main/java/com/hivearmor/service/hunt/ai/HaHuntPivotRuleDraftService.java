package com.hivearmor.service.hunt.ai;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.detection.RuleAuthoringService;
import com.hivearmor.service.hunt.HuntFieldRegistry;
import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.web.rest.hunt.ai.dto.PivotDetectionDraftRequestDTO;
import com.hivearmor.web.rest.hunt.ai.dto.PivotDetectionDraftResponseDTO;
import com.hivearmor.web.rest.hunt.ai.dto.PivotDetectionDraftResponseDTO.AiProvenance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * P5 step 5b — AI-assisted Pivot → Detection drafting.
 *
 * <p>Turns a selected pivot combination into a DRAFT detection rule whose CEL is written by the LLM. The
 * governing rule (§29) is unchanged from 5a: the result is persisted ONLY as {@code status=draft} via the
 * existing {@link RuleAuthoringService#createRule}, and a SOC manager must approve it in the Detection UI —
 * this service never approves, activates, or deploys anything.
 *
 * <p><b>Model output is UNTRUSTED.</b> The prompt constrains the LLM to the two real axis fields; both are
 * validated against {@link HuntFieldRegistry} before anything is persisted, and the drafted CEL is
 * sanity-checked (non-blank, references the fields). A hallucinated field or unusable CEL yields
 * {@code state=unavailable} — nothing is written, nothing is auto-fixed into a silently-wrong rule. No
 * provider / provider failure degrades the same way (mirrors Ask Hive + explain). Never a 5xx.
 */
@Service
public class HaHuntPivotRuleDraftService {

    private static final Logger log = LoggerFactory.getLogger(HaHuntPivotRuleDraftService.class);
    private static final String AGENT_VERSION = "hunt-pivot-detection-draft@1.0";
    private static final String CAVEAT = "AI-drafted — a SOC manager must review and approve before it detects";

    private final HaLlmService llm;
    private final HuntFieldRegistry fieldRegistry;
    private final RuleAuthoringService authoringService;

    public HaHuntPivotRuleDraftService(HaLlmService llm, HuntFieldRegistry fieldRegistry,
                                       RuleAuthoringService authoringService) {
        this.llm = llm;
        this.fieldRegistry = fieldRegistry;
        this.authoringService = authoringService;
    }

    /**
     * Draft a detection rule from a pivot combination. Persists a status=draft rule on success; returns
     * unavailable (persisting nothing) on any provider/validation failure.
     */
    public PivotDetectionDraftResponseDTO draft(PivotDetectionDraftRequestDTO req, String userId, Long tenantId) {
        final List<String> warnings = new ArrayList<>();

        // Untrusted-output backstop #1: the axes must be real, eligible fields BEFORE we prompt/persist.
        if (!fieldKnown(req.rowField()) || !fieldKnown(req.colField())) {
            warnings.add("The pivot fields are not recognised, so no rule could be drafted.");
            return PivotDetectionDraftResponseDTO.unavailable(warnings);
        }

        final String system =
            "You are a HiveArmor detection engineer. Write a SINGLE CEL boolean expression that matches events "
            + "for the given field combination. Use ONLY the two fields named. Return STRICT JSON and nothing "
            + "else: {\"expression\":\"<CEL>\",\"explanation\":\"one short sentence\"}. Prefer the equals(field, "
            + "value) form. Never invent fields, never add commentary.";
        final String user = "Fields: " + req.rowField() + ", " + req.colField() + "\n"
            + "Match when " + req.rowField() + " = " + req.rowValue()
            + " AND " + req.colField() + " = " + req.colValue() + "\n"
            + (req.significance() != null && !req.significance().isBlank()
                ? "Context: this combination was flagged as " + req.significance() + ".\n" : "");

        final String raw;
        try {
            raw = llm.chat(List.of(new ChatMessage("system", system), new ChatMessage("user", user)),
                new ChatOptions(null, 0.1, 400));
        } catch (LlmNotConfiguredException e) {
            log.debug("Pivot detection draft: LLM not configured — unavailable");
            return PivotDetectionDraftResponseDTO.unavailable(warnings);
        } catch (RuntimeException e) {
            log.warn("Pivot detection draft: provider call failed — unavailable", e);
            return PivotDetectionDraftResponseDTO.unavailable(warnings);
        }
        if (raw == null || raw.isBlank()) return PivotDetectionDraftResponseDTO.unavailable(warnings);

        final String expression = extractJsonString(raw, "expression");
        final String explanation = extractJsonString(raw, "explanation");

        // Untrusted-output backstop #2: the CEL must be usable and must reference BOTH named fields.
        if (expression == null || expression.isBlank()
            || !expression.contains(req.rowField()) || !expression.contains(req.colField())) {
            log.debug("Pivot detection draft: model CEL unusable or off-field — unavailable, nothing persisted");
            warnings.add("The AI draft could not be validated, so nothing was created. Use the manual draft instead.");
            return PivotDetectionDraftResponseDTO.unavailable(warnings);
        }

        // Persist ONLY as a draft, via the existing governed create path. Never approve/activate here.
        final Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "Pivot AI draft — " + req.rowField() + "=" + req.rowValue()
            + " × " + req.colField() + "=" + req.colValue());
        body.put("expression", expression);
        body.put("severity", "medium");
        body.put("description", buildProvenanceDescription(req, explanation));

        final Map<String, Object> created;
        try {
            created = authoringService.createRule(body, userId, tenantId);
        } catch (RuntimeException e) {
            log.warn("Pivot detection draft: createRule failed — unavailable", e);
            warnings.add("The draft could not be saved. Nothing was changed.");
            return PivotDetectionDraftResponseDTO.unavailable(warnings);
        }

        final String ruleId = String.valueOf(created.get("id"));
        return PivotDetectionDraftResponseDTO.ready(
            ruleId, expression, explanation, warnings,
            new AiProvenance(llm.activeProviderName(), Instant.now().toString(), AGENT_VERSION, CAVEAT));
    }

    private boolean fieldKnown(String name) {
        try {
            fieldRegistry.require(name);
            return true;
        } catch (HuntQueryException e) {
            return false;
        }
    }

    private String buildProvenanceDescription(PivotDetectionDraftRequestDTO req, String explanation) {
        StringBuilder sb = new StringBuilder("AI-drafted from Investigation Pivot. ");
        sb.append("Combination ").append(req.rowField()).append('=').append(req.rowValue())
          .append(" × ").append(req.colField()).append('=').append(req.colValue())
          .append(" (").append(req.value()).append(" events). ");
        if (req.significance() != null && !req.significance().isBlank()) {
            sb.append("Flagged ").append(req.significance()).append(". ");
        }
        if (explanation != null && !explanation.isBlank()) sb.append(explanation).append(' ');
        if (req.searchId() != null) sb.append("Source search ").append(req.searchId()).append(". ");
        sb.append("DRAFT — requires SOC manager review and approval before it detects anything.");
        return sb.toString();
    }

    /** Minimal, dependency-free extraction of a JSON string field, tolerant of prose around the object. */
    private String extractJsonString(String raw, String key) {
        String needle = "\"" + key + "\"";
        int k = raw.indexOf(needle);
        if (k < 0) return null;
        int colon = raw.indexOf(':', k + needle.length());
        if (colon < 0) return null;
        int i = colon + 1;
        while (i < raw.length() && Character.isWhitespace(raw.charAt(i))) i++;
        if (i >= raw.length() || raw.charAt(i) != '"') return null;
        StringBuilder sb = new StringBuilder();
        for (i++; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '\\' && i + 1 < raw.length()) { sb.append(raw.charAt(++i)); continue; }
            if (c == '"') break;
            sb.append(c);
        }
        return sb.toString();
    }
}
