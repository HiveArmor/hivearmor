package com.hivearmor.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.ChatMessage;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.llm.LlmCascadeDecision;
import com.hivearmor.service.llm.LlmCascadeGate;
import com.hivearmor.service.llm.PromptRegistry;
import com.hivearmor.service.llm.PromptTemplate;
import com.hivearmor.web.rest.dto.NlToDslRequestDTO;
import com.hivearmor.web.rest.dto.NlToDslResponseDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Sprint 26 NL-to-DSL translation service.
 *
 * <p>Responsibilities:
 * <ul>
 *   <li>Sanitize natural-language input before embedding it in an LLM prompt
 *       ({@link #sanitizeNlQuery}) — strips control characters, collapses whitespace,
 *       truncates to {@value #QUERY_MAX_LENGTH} chars, neutralizes injection triggers.</li>
 *   <li>Parse the LLM's raw output by extracting the first balanced JSON object
 *       substring ({@link #parseLlmResponse}).</li>
 *   <li>Validate the extracted JSON node as a structurally legal OpenSearch query DSL
 *       ({@link #isValidQueryDsl}) — rejects {@code script} clauses, unconstrained
 *       {@code size}, and other malformed structures.</li>
 *   <li>Return a safe {@code {"query":{"match_all":{}}}} fallback at confidence 0.1
 *       whenever any step fails ({@link #safeFallback}).</li>
 * </ul>
 *
 * <h3>NlToDslNeverFiveHundredInvariant</h3>
 * <p>No {@code RuntimeException} other than {@link LlmNotConfiguredException} escapes
 * {@link #translateNlToDsl}. LlmNotConfiguredException propagates unchanged and is
 * mapped to HTTP 503 by the existing {@code HaAiExceptionHandler}.
 *
 * <h3>NoGetFirstInvariant</h3>
 * <p>All list indexing uses {@code .get(0)} — the Java 21+ {@code .getFirst()} API
 * is banned because HiveArmor targets Java 17.
 */
@Service
public class HaSearchService {

    private static final Logger log = LoggerFactory.getLogger(HaSearchService.class);

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /** Safe fallback DSL returned when LLM output cannot be parsed or validated. */
    static final String SAFE_FALLBACK_DSL = "{\"query\":{\"match_all\":{}}}";

    /** Confidence value used with the safe fallback DSL. */
    static final double SAFE_FALLBACK_CONFIDENCE = 0.1d;

    /** Explanation used with the safe fallback DSL. */
    static final String SAFE_FALLBACK_EXPLANATION =
        "Could not parse AI response \u2014 falling back to a match-all query.";

    /** Maximum character length accepted for an NL query after sanitization. */
    static final int QUERY_MAX_LENGTH = 500;

    /**
     * Default confidence used when the LLM output is valid but contains no
     * confidence value in [0.0, 1.0].
     */
    private static final double DEFAULT_CONFIDENCE = 0.75d;

    /**
     * Prompt-injection trigger phrases; each is replaced with {@code [filtered]}
     * (case-insensitive) during sanitization.
     */
    private static final String[] INJECTION_TRIGGERS = {
        "ignore previous instructions",
        "ignore all previous",
        "system:",
        "assistant:",
        "<|"
    };

    /**
     * Maximum recursion depth for the DslValidator's script-key walk.
     * Caps pathological trees to prevent stack overflow.
     */
    private static final int MAX_VALIDATOR_DEPTH = 100;

    // -------------------------------------------------------------------------
    // Dependencies
    // -------------------------------------------------------------------------

    private final HaLlmService haLlmService;
    private final ObjectMapper objectMapper;
    private final MsspIndexResolver msspIndexResolver;
    private final PromptRegistry promptRegistry;
    private final LlmCascadeGate cascadeGate;

    public HaSearchService(HaLlmService haLlmService,
                           ObjectMapper objectMapper,
                           MsspIndexResolver msspIndexResolver) {
        this(haLlmService, objectMapper, msspIndexResolver, new PromptRegistry(), new LlmCascadeGate());
    }

    @Autowired
    public HaSearchService(HaLlmService haLlmService,
                           ObjectMapper objectMapper,
                           MsspIndexResolver msspIndexResolver,
                           PromptRegistry promptRegistry,
                           LlmCascadeGate cascadeGate) {
        this.haLlmService      = haLlmService;
        this.objectMapper      = objectMapper;
        this.msspIndexResolver = msspIndexResolver;
        this.promptRegistry    = promptRegistry != null ? promptRegistry : new PromptRegistry();
        this.cascadeGate       = cascadeGate != null ? cascadeGate : new LlmCascadeGate();
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Translates a natural-language search request into an OpenSearch query DSL.
     *
     * <p>Pipeline:
     * <ol>
     *   <li>Sanitize the raw NL query.</li>
     *   <li>If sanitized string is empty, return {@link #safeFallback()}.</li>
     *   <li>Call {@link HaLlmService#chat} — let {@link LlmNotConfiguredException}
     *       propagate; catch any other {@link RuntimeException} and return
     *       {@link #safeFallback()}.</li>
     *   <li>Parse the LLM output via {@link #parseLlmResponse}.</li>
     *   <li>Validate via {@link #isValidQueryDsl}.</li>
     *   <li>Map to response DTO, or return {@link #safeFallback()} if any step fails.</li>
     * </ol>
     *
     * @param request the validated NL-to-DSL request DTO
     * @return a populated {@link NlToDslResponseDTO} — never null, never HTTP 500
     * @throws LlmNotConfiguredException when no AI provider is configured (→ HTTP 503)
     */
    public NlToDslResponseDTO translateNlToDsl(NlToDslRequestDTO request) {
        // Step 1: sanitize
        String sanitized = sanitizeNlQuery(request.query());
        PromptTemplate searchPrompt = promptRegistry.require(PromptRegistry.ID_SEARCH_NL_TO_DSL);
        LlmCascadeDecision cascade = cascadeGate.evaluateNlQuery(sanitized);
        if (cascade.skipLlm()) {
            haLlmService.recordCascadeSkip(
                cascade.reason(), searchPrompt.id(), searchPrompt.sha256(), null);
            log.debug("translateNlToDsl: cascade skip reason={}", cascade.reason());
            return safeFallback();
        }

        // Step 2: LLM call
        String rawLlmOutput;
        try {
            log.debug("translateNlToDsl: promptId={} promptSha256={}",
                searchPrompt.id(), searchPrompt.sha256());
            rawLlmOutput = haLlmService.chat(buildMessages(sanitized), searchPrompt.body());
        } catch (LlmNotConfiguredException ex) {
            // Propagate — mapped to HTTP 503 by HaAiExceptionHandler
            throw ex;
        } catch (RuntimeException ex) {
            log.warn("HaSearchService.translateNlToDsl: LLM call failed; returning safe fallback", ex);
            return safeFallback();
        }

        // Steps 3–5: parse → validate → respond
        return parseLlmResponse(rawLlmOutput)
            .filter(this::isValidQueryDsl)
            .map(this::toDslResponse)
            .orElseGet(this::safeFallback);
    }

    // =========================================================================
    // NlInputSanitizer (private)
    // =========================================================================

    /**
     * Sanitizes a raw natural-language query string for safe embedding in an LLM prompt.
     *
     * <p>Steps (applied in order):
     * <ol>
     *   <li>Null guard → return empty string.</li>
     *   <li>Strip ASCII control characters {@code [0x00–0x1F] ∪ {0x7F}} except
     *       tab ({@code 0x09}) and newline ({@code 0x0A}).</li>
     *   <li>Collapse consecutive whitespace runs to a single space.</li>
     *   <li>Trim leading and trailing whitespace.</li>
     *   <li>Truncate to {@value #QUERY_MAX_LENGTH} characters.</li>
     *   <li>Replace each case-insensitive occurrence of any {@link #INJECTION_TRIGGERS}
     *       element with the literal {@code [filtered]}.</li>
     * </ol>
     *
     * @param rawQuery the analyst-supplied string (may be null)
     * @return a sanitized string safe for LLM prompt embedding; never null
     */
    private String sanitizeNlQuery(String rawQuery) {
        // 1. Null guard
        if (rawQuery == null) {
            return "";
        }

        // 2. Strip control characters: [0x00–0x1F] except 0x09 (tab) and 0x0A (newline),
        //    and strip 0x7F (DEL).
        StringBuilder sb = new StringBuilder(rawQuery.length());
        for (int i = 0; i < rawQuery.length(); i++) {
            char c = rawQuery.charAt(i);
            int cp = (int) c;
            boolean isControlChar = (cp <= 0x1F && cp != 0x09 && cp != 0x0A) || cp == 0x7F;
            if (!isControlChar) {
                sb.append(c);
            }
        }
        String stripped = sb.toString();

        // 3. Collapse consecutive whitespace runs to a single space.
        String collapsed = stripped.replaceAll("\\s+", " ");

        // 4. Trim leading/trailing whitespace.
        String trimmed = collapsed.trim();

        // 5. Truncate to QUERY_MAX_LENGTH characters.
        String truncated = (trimmed.length() > QUERY_MAX_LENGTH)
            ? trimmed.substring(0, QUERY_MAX_LENGTH)
            : trimmed;

        // 6. Replace injection triggers (case-insensitive) with [filtered].
        String result = truncated;
        for (String trigger : INJECTION_TRIGGERS) {
            result = result.replaceAll("(?i)" + java.util.regex.Pattern.quote(trigger), "[filtered]");
        }

        return result;
    }

    // =========================================================================
    // Package-private test accessor
    // =========================================================================

    /**
     * Package-private accessor for property-based tests.
     *
     * <p>Delegates directly to {@link #parseLlmResponse(String)} so tests in
     * {@code com.hivearmor.service} can exercise the parser without reflection.
     *
     * @param input the raw string to parse
     * @return the same value returned by {@link #parseLlmResponse(String)}
     */
    Optional<JsonNode> parseLlmResponseForTesting(String input) {
        return parseLlmResponse(input);
    }

    // =========================================================================
    // LlmResponseParser (private)
    // =========================================================================

    /**
     * Extracts the first well-formed JSON object substring from the LLM's raw output
     * and parses it via the injected {@link ObjectMapper}.
     *
     * <p>The scan respects string literals (skipping {@code \"} and characters inside
     * {@code "..."}) to avoid false positives from brace characters embedded in strings.
     *
     * @param rawLlmOutput the raw string returned by the LLM (may be null or blank)
     * @return {@code Optional.of(node)} when a valid JSON object is found and parsed;
     *         {@code Optional.empty()} otherwise
     */
    private Optional<JsonNode> parseLlmResponse(String rawLlmOutput) {
        // 1. Guard: null or blank input
        if (rawLlmOutput == null || rawLlmOutput.isBlank()) {
            return Optional.empty();
        }

        // 2. Scan for the first balanced JSON object, respecting string literals.
        int n = rawLlmOutput.length();
        int startPos = -1;
        int depth = 0;
        boolean inString = false;

        for (int i = 0; i < n; i++) {
            char c = rawLlmOutput.charAt(i);

            if (depth > 0 && inString) {
                if (c == '\\') {
                    // Skip escaped character (handles \" etc.)
                    i++;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }

            switch (c) {
                case '"':
                    // Prose before a JSON object may contain unmatched quotes. Only
                    // enter JSON string mode after an object has actually started.
                    if (depth > 0) {
                        inString = true;
                    }
                    break;
                case '{':
                    if (depth == 0) {
                        startPos = i;
                    }
                    depth++;
                    break;
                case '}':
                    if (depth > 0) {
                        depth--;
                        if (depth == 0 && startPos >= 0) {
                            // Found a balanced JSON object substring
                            String candidate = rawLlmOutput.substring(startPos, i + 1);
                            try {
                                JsonNode node = objectMapper.readTree(candidate);
                                if (node != null && node.isObject()) {
                                    return Optional.of(node);
                                }
                            } catch (Exception ex) {
                                log.debug("parseLlmResponse: failed to parse candidate JSON: {}",
                                    ex.getMessage());
                            }
                            // Reset to look for the next candidate
                            startPos = -1;
                        }
                    }
                    break;
                default:
                    break;
            }
        }

        return Optional.empty();
    }

    // =========================================================================
    // DslValidator (private)
    // =========================================================================

    /**
     * Returns {@code true} when the candidate JSON node is a structurally valid
     * OpenSearch query DSL object, {@code false} otherwise.
     *
     * <p>Returns {@code false} when any of the following hold:
     * <ul>
     *   <li>{@code candidate} is null</li>
     *   <li>{@code candidate} is not a JSON object</li>
     *   <li>{@code candidate} is an empty JSON object</li>
     *   <li>{@code candidate} has a {@code query} field that is not a JSON object</li>
     *   <li>Any property key at any nesting depth equals {@code "script"}</li>
     *   <li>{@code candidate} has a {@code size} field that is not an integer or is
     *       outside the closed interval {@code [0, 10000]}</li>
     * </ul>
     *
     * @param candidate the JSON node to validate (may be null)
     * @return {@code true} if the DSL is structurally valid; {@code false} otherwise
     */
    private boolean isValidQueryDsl(JsonNode candidate) {
        if (candidate == null || !candidate.isObject() || candidate.size() == 0) {
            return false;
        }

        // Check that the 'query' field, if present, is a JSON object.
        if (candidate.has("query") && !candidate.get("query").isObject()) {
            return false;
        }

        // Check that the 'size' field, if present, is an integer in [0, 10000].
        if (candidate.has("size")) {
            JsonNode sizeNode = candidate.get("size");
            if (!sizeNode.isIntegralNumber()) {
                return false;
            }
            int sizeValue = sizeNode.asInt();
            if (sizeValue < 0 || sizeValue > 10000) {
                return false;
            }
        }

        // Walk the full tree recursively to detect any 'script' key at any depth.
        return !containsScriptKey(candidate, 0);
    }

    /**
     * Recursively walks the JSON tree and returns {@code true} if any property key
     * at any nesting level equals {@code "script"}.
     *
     * <p>The depth counter is capped at {@value #MAX_VALIDATOR_DEPTH} to defend
     * against pathologically deep trees that could cause stack overflow.
     *
     * @param node  the current node being inspected
     * @param depth current recursion depth
     * @return {@code true} if a {@code "script"} key is found; {@code false} otherwise
     */
    private boolean containsScriptKey(JsonNode node, int depth) {
        if (depth > MAX_VALIDATOR_DEPTH || node == null) {
            return false;
        }

        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                if ("script".equals(entry.getKey())) {
                    return true;
                }
                if (containsScriptKey(entry.getValue(), depth + 1)) {
                    return true;
                }
            }
        } else if (node.isArray()) {
            Iterator<JsonNode> elements = node.elements();
            while (elements.hasNext()) {
                if (containsScriptKey(elements.next(), depth + 1)) {
                    return true;
                }
            }
        }

        return false;
    }

    // =========================================================================
    // Package-private test accessor
    // =========================================================================

    /**
     * Package-private accessor for property-based tests.
     *
     * <p>Delegates directly to {@link #isValidQueryDsl(JsonNode)} so that
     * tests in {@code com.hivearmor.service} can invoke the validator without
     * reflection. This method is <em>not</em> part of the public API.
     *
     * @param node the candidate JSON node (may be null)
     * @return {@code true} if {@code node} is a structurally valid DSL
     */
    boolean isValidQueryDslForTesting(JsonNode node) {
        return isValidQueryDsl(node);
    }

    // =========================================================================
    // Response builders
    // =========================================================================

    /**
     * Converts a validated {@link JsonNode} into an {@link NlToDslResponseDTO}.
     *
     * <p>Confidence extraction: uses the top-level {@code confidence} field if it is
     * a numeric value in {@code [0.0, 1.0]}; otherwise defaults to
     * {@value #DEFAULT_CONFIDENCE}.
     *
     * <p>Explanation extraction: uses the top-level {@code explanation} string field
     * if present; otherwise defaults to an empty string.
     *
     * <p>DSL serialization: {@code objectMapper.writeValueAsString(node)} (compact form).
     *
     * @param node a validated DSL JSON object node
     * @return populated response DTO
     */
    private NlToDslResponseDTO toDslResponse(JsonNode node) {
        // Extract confidence — must be numeric and in [0.0, 1.0]
        double confidence = DEFAULT_CONFIDENCE;
        if (node.has("confidence")) {
            JsonNode confNode = node.get("confidence");
            if (confNode.isNumber()) {
                double val = confNode.asDouble();
                if (val >= 0.0 && val <= 1.0) {
                    confidence = val;
                }
            }
        }

        // Extract explanation — must be a string field
        String explanation = "";
        if (node.has("explanation")) {
            JsonNode explNode = node.get("explanation");
            if (explNode.isTextual()) {
                explanation = explNode.asText();
            }
        }

        // Serialize the validated node as compact JSON
        String dsl;
        try {
            dsl = objectMapper.writeValueAsString(node);
        } catch (Exception ex) {
            log.warn("HaSearchService.toDslResponse: failed to serialize DSL node", ex);
            return safeFallback();
        }

        return new NlToDslResponseDTO(dsl, explanation, confidence);
    }

    /**
     * Returns the safe match-all fallback response used whenever LLM output cannot
     * be parsed or validated, or when the sanitized query is empty.
     *
     * @return DTO with {@link #SAFE_FALLBACK_DSL}, {@link #SAFE_FALLBACK_EXPLANATION},
     *         and {@link #SAFE_FALLBACK_CONFIDENCE}
     */
    private NlToDslResponseDTO safeFallback() {
        return new NlToDslResponseDTO(
            SAFE_FALLBACK_DSL,
            SAFE_FALLBACK_EXPLANATION,
            SAFE_FALLBACK_CONFIDENCE);
    }

    // =========================================================================
    // Package-private test accessors
    // =========================================================================

    /**
     * Package-private accessor for {@link #sanitizeNlQuery} used by property-based
     * tests in the same package (Sprint 26 task 1.3 and 1.4).
     *
     * <p>Not part of the public API — tests call this to invoke the private
     * sanitizer without reflection.
     *
     * @param rawQuery the raw input to sanitize
     * @return the sanitized string
     */
    String sanitizeNlQueryForTesting(String rawQuery) {
        return sanitizeNlQuery(rawQuery);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds the LLM message list for an NL-to-DSL request.
     *
     * @param sanitizedQuery the sanitized NL query (never null or empty here)
     * @return a single-element list with a {@code user} role message
     */
    private List<ChatMessage> buildMessages(String sanitizedQuery) {
        return List.of(new ChatMessage("user", sanitizedQuery));
    }
}
