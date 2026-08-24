package com.hivearmor.service.llm;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * In-memory registry of versioned LLM system prompts (P1 LLMOps — STAGING CANDIDATE).
 *
 * <p>Prompts previously lived as private constants in {@code HaAiChatService} /
 * {@code HaSearchService}. Callers resolve by stable id and MUST log only
 * {@link PromptTemplate#id()} + {@link PromptTemplate#sha256()} — never the body.
 */
@Component
public class PromptRegistry {

    /** Base chat system prompt (prepended to every AI chat request). */
    public static final String ID_CHAT_BASE = "ha.ai.chat.base";

    /** Alert triage system prompt. */
    public static final String ID_CHAT_TRIAGE = "ha.ai.chat.triage";

    /** Incident summary system prompt (JSON schema). */
    public static final String ID_CHAT_INCIDENT_SUMMARY = "ha.ai.chat.incident_summary";

    /** Natural-language → OpenSearch DSL system prompt. */
    public static final String ID_SEARCH_NL_TO_DSL = "ha.ai.search.nl_to_dsl";

    private static final String BODY_CHAT_BASE =
        "You are a cybersecurity analyst assistant for the HiveArmor SIEM/XDR platform. " +
        "Answer questions concisely and accurately based on the provided context. " +
        "Focus on security-relevant information and actionable insights. " +
        "Do not include personally identifiable information in your responses.";

    private static final String BODY_CHAT_TRIAGE =
        "You are a SOC analyst. Given the following alert context, provide a concise triage summary " +
        "that covers: (1) what the alert indicates, (2) likely severity reasoning, " +
        "(3) suggested immediate investigation steps. Keep the response under 300 words.";

    private static final String BODY_CHAT_INCIDENT_SUMMARY =
        "You are a senior security analyst. Given the incident context, respond with a valid JSON object " +
        "matching this exact schema: " +
        "{\"narrative\": \"<string>\", \"threatActorType\": \"<string>\", " +
        "\"recommendedSteps\": [\"<string>\", ...], \"riskLevel\": \"<low|medium|high|critical>\"}. " +
        "Respond ONLY with the JSON object — no markdown, no code fences, no extra text.";

    private static final String BODY_SEARCH_NL_TO_DSL =
        "You are a cybersecurity analyst assistant for the HiveArmor SIEM/XDR platform. " +
        "Translate the user's natural-language search request into a valid OpenSearch query DSL " +
        "JSON object. Respond ONLY with a JSON object — no markdown fences, no explanations outside " +
        "the JSON, no prose. " +
        "The JSON object MUST include a top-level \"query\" field (an object) with a valid OpenSearch " +
        "query clause. Optionally include a top-level \"confidence\" number in [0.0, 1.0] and a " +
        "top-level \"explanation\" string (one sentence describing what the query does). " +
        "Do NOT include a \"script\" clause at any nesting level.";

    private final Map<String, PromptTemplate> byId;

    public PromptRegistry() {
        Map<String, PromptTemplate> map = new LinkedHashMap<>();
        register(map, ID_CHAT_BASE, BODY_CHAT_BASE);
        register(map, ID_CHAT_TRIAGE, BODY_CHAT_TRIAGE);
        register(map, ID_CHAT_INCIDENT_SUMMARY, BODY_CHAT_INCIDENT_SUMMARY);
        register(map, ID_SEARCH_NL_TO_DSL, BODY_SEARCH_NL_TO_DSL);
        this.byId = Collections.unmodifiableMap(map);
    }

    /**
     * Resolves a prompt by stable id.
     *
     * @param id prompt id (see {@code ID_*} constants)
     * @return the registered template
     * @throws IllegalArgumentException if {@code id} is unknown
     */
    public PromptTemplate require(String id) {
        PromptTemplate t = byId.get(id);
        if (t == null) {
            throw new IllegalArgumentException("Unknown prompt id: " + id);
        }
        return t;
    }

    /**
     * Looks up a prompt by id without throwing.
     */
    public Optional<PromptTemplate> find(String id) {
        return Optional.ofNullable(byId.get(id));
    }

    /**
     * Returns an unmodifiable view of all registered prompts keyed by id.
     */
    public Map<String, PromptTemplate> all() {
        return byId;
    }

    /**
     * Computes lowercase hex SHA-256 of {@code body} encoded as UTF-8.
     * Exposed for tests that assert hash stability independently of registration.
     */
    public static String sha256Hex(String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(body.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private static void register(Map<String, PromptTemplate> map, String id, String body) {
        map.put(id, new PromptTemplate(id, body, sha256Hex(body)));
    }
}
