package com.hivearmor.service.hunt.ai;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseResponseDTO;
import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseResponseDTO.AiProvenanceDTO;

/**
 * Hunt AI — clause explanation (frozen contract §6, move 5).
 *
 * <p>Produces a plain-language gloss of a KQL/DSL clause by prompting the active LLM via
 * {@link HaLlmService}. This is the first, smallest increment of the Hunt AI backend
 * (.plan/HUNT-AI-BACKEND-SCOPE-2026-09-04.md §1b) — it reuses the existing LLM plumbing and
 * introduces no new schema.
 *
 * <p><b>Never throws to the caller for provider state:</b> if the LLM is not configured the
 * method returns a {@code state = "unavailable"} response (HTTP 200), mirroring the NL-to-DSL
 * contract, so the UI shows its unavailable card rather than an error.
 */
@Service
public class HaHuntAiExplainService {

    private static final Logger log = LoggerFactory.getLogger(HaHuntAiExplainService.class);
    private static final String AGENT_VERSION = "hunt-explain@1.0";
    private static final String CAVEAT = "AI-derived — verify before acting";

    private static final String SYSTEM_PROMPT =
        "You are a SIEM query assistant for HiveArmor. Explain the given detection query clause "
        + "in one or two plain-language sentences for a SOC analyst. Describe precisely what events "
        + "the clause matches and excludes. Do not invent fields, do not add caveats, do not restate "
        + "the clause verbatim. Return only the explanation text.";

    private final HaLlmService llm;

    public HaHuntAiExplainService(HaLlmService llm) {
        this.llm = llm;
    }

    /**
     * Explain a single query clause. Returns a ready response with provenance, or an
     * unavailable response when the LLM is not configured / the provider fails.
     */
    public ExplainClauseResponseDTO explain(String clause, String language) {
        final String userPrompt = "Language: " + language + "\nClause:\n" + clause;
        final List<ChatMessage> messages = List.of(
            new ChatMessage("system", SYSTEM_PROMPT),
            new ChatMessage("user", userPrompt));
        // Small, deterministic-ish generation — short gloss only.
        final ChatOptions options = new ChatOptions(null, 0.1, 220);

        try {
            final String explanation = llm.chat(messages, options);
            if (explanation == null || explanation.isBlank()) {
                return ExplainClauseResponseDTO.unavailable(clause);
            }
            return ExplainClauseResponseDTO.ready(
                clause,
                explanation.trim(),
                new AiProvenanceDTO(llm.activeProviderName(), Instant.now().toString(), AGENT_VERSION, CAVEAT));
        } catch (LlmNotConfiguredException e) {
            log.debug("Hunt AI explain: LLM not configured — returning unavailable");
            return ExplainClauseResponseDTO.unavailable(clause);
        } catch (RuntimeException e) {
            // Provider error / timeout — degrade honestly, never surface a 5xx.
            log.warn("Hunt AI explain: provider call failed — returning unavailable", e);
            return ExplainClauseResponseDTO.unavailable(clause);
        }
    }
}
