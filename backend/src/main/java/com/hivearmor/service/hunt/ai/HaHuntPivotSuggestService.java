package com.hivearmor.service.hunt.ai;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.hunt.HuntFieldRegistry;
import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.web.rest.hunt.dto.HuntFieldDefinitionDTO;
import com.hivearmor.web.rest.hunt.ai.dto.PivotSuggestResponseDTO;
import com.hivearmor.web.rest.hunt.ai.dto.PivotSuggestResponseDTO.AiProvenance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Ask Hive Intelligence (P3 PR 3) — turn a natural-language question into a candidate pivot definition.
 *
 * <p>The governing rule (parent plan §22): the AI PROPOSES an editable {@code CrosstabDefinition}; it never
 * runs a query and never returns a black-box result. Here the LLM emits a STRUCTURED JSON pivot spec, and
 * every field it names is validated against {@link HuntFieldRegistry} before it reaches the analyst — a
 * hallucinated / ineligible field is DROPPED (never applied broken) and reported in {@code warnings}. The
 * analyst then edits the shelves and runs it through the same deterministic engine as any other pivot.
 *
 * <p>Never throws for provider state: an unconfigured or failing LLM yields {@code state = "unavailable"}
 * (HTTP 200), mirroring the explain + NL-to-DSL contracts, so the UI shows its unavailable card.
 */
@Service
public class HaHuntPivotSuggestService {

    private static final Logger log = LoggerFactory.getLogger(HaHuntPivotSuggestService.class);
    private static final String AGENT_VERSION = "hunt-pivot-suggest@1.0";
    private static final String CAVEAT = "AI-proposed — inspect and edit before running";

    private final HaLlmService llm;
    private final HuntFieldRegistry fieldRegistry;
    private final Gson gson = new Gson();

    public HaHuntPivotSuggestService(HaLlmService llm, HuntFieldRegistry fieldRegistry) {
        this.llm = llm;
        this.fieldRegistry = fieldRegistry;
    }

    /** Suggest a pivot from a question. Always returns a response — ready (validated) or unavailable. */
    public PivotSuggestResponseDTO suggest(String question) {
        final String schema = fieldRegistry.definitions().stream()
            .map(HuntFieldDefinitionDTO::getName)
            .collect(Collectors.joining(", "));

        final String system =
            "You are a SIEM pivot assistant for HiveArmor. Given an analyst's question, choose the best "
            + "two-field crosstab (pivot) to answer it, using ONLY fields from the provided list. Respond "
            + "with STRICT JSON and nothing else: {\"rowField\":\"<field>\",\"colField\":\"<field>\","
            + "\"valueFn\":\"count|distinct\",\"distinctField\":\"<field or null>\",\"explanation\":\"one short sentence\"}. "
            + "Use count unless the question is about how many distinct somethings, in which case use distinct "
            + "with distinctField set. Never invent a field name.";
        final String user = "Available fields: " + schema + "\n\nQuestion: " + question;

        final List<ChatMessage> messages = List.of(
            new ChatMessage("system", system),
            new ChatMessage("user", user));
        final ChatOptions options = new ChatOptions(null, 0.1, 200);

        final String raw;
        try {
            raw = llm.chat(messages, options);
        } catch (LlmNotConfiguredException e) {
            log.debug("Ask Hive pivot-suggest: LLM not configured — unavailable");
            return PivotSuggestResponseDTO.unavailable();
        } catch (RuntimeException e) {
            log.warn("Ask Hive pivot-suggest: provider call failed — unavailable", e);
            return PivotSuggestResponseDTO.unavailable();
        }
        if (raw == null || raw.isBlank()) return PivotSuggestResponseDTO.unavailable();

        final JsonObject json;
        try {
            json = gson.fromJson(extractJson(raw), JsonObject.class);
        } catch (JsonSyntaxException | IllegalStateException e) {
            log.debug("Ask Hive pivot-suggest: model output was not parseable JSON — unavailable");
            return PivotSuggestResponseDTO.unavailable();
        }
        if (json == null) return PivotSuggestResponseDTO.unavailable();

        final List<String> warnings = new ArrayList<>();
        final String rowField = validateAxis(str(json, "rowField"), "Rows", warnings);
        final String colField = validateAxis(str(json, "colField"), "Columns", warnings);

        String valueFn = "distinct".equalsIgnoreCase(str(json, "valueFn")) ? "distinct" : "count";
        String distinctField = str(json, "distinctField");
        if ("distinct".equals(valueFn)) {
            distinctField = validateAxis(distinctField, "Distinct", warnings);
            if (distinctField == null) {  // distinct field invalid → fall back to count
                valueFn = "count";
                warnings.add("The distinct field wasn't available — using a count instead.");
            }
        } else {
            distinctField = null;
        }

        final String explanation = str(json, "explanation");
        return PivotSuggestResponseDTO.ready(
            rowField, colField, valueFn, distinctField, explanation, warnings,
            new AiProvenance(llm.activeProviderName(), Instant.now().toString(), AGENT_VERSION, CAVEAT));
    }

    /** Return the field name only if it exists and is aggregatable; otherwise null + a warning. */
    private String validateAxis(String name, String axisLabel, List<String> warnings) {
        if (name == null || name.isBlank()) return null;
        try {
            fieldRegistry.requireAggregatable(name);
            return name;
        } catch (HuntQueryException e) {
            warnings.add(name + " isn't an eligible field, so the " + axisLabel + " axis was left for you to set.");
            return null;
        }
    }

    private String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : null;
    }

    /** Pull the first {...} block out of the model output, tolerating stray prose around it. */
    private String extractJson(String raw) {
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        return (start >= 0 && end > start) ? raw.substring(start, end + 1) : raw;
    }
}
