package com.hivearmor.service.rulegen;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.rulegen.HaRuleGenSession;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.rulegen.dto.GenerateRequest;
import com.hivearmor.service.rulegen.dto.RuleGenSessionDTO;
import com.hivearmor.service.rulegen.dto.SignalGroup;
import com.hivearmor.service.rulegen.dto.SignalSummaryDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Generates, reviews, and manages rule suggestion sessions.
 *
 * <p>The generation workflow calls {@link HaLlmService#chat(List, ChatOptions)}
 * (Sprint 27 — the sole LLM entry point) with a YAML-oriented system prompt,
 * validates the returned document using {@link YamlValidator}, and retries exactly
 * one additional time on validation failure before giving up.
 *
 * <p>On success, a {@link HaRuleGenSession} is persisted with status
 * {@code pending_review}. Administrators can then approve (writing a {@code .yaml}
 * file to {@code RuleGenOutputDir}), reject, or regenerate the session.
 *
 * <p>Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 6.3
 *
 * @see YamlValidator
 * @see YamlRulePromptBuilder
 * @see HaLlmService
 */
@Service
public class HaRuleGenerationService {

    private static final Logger log = LoggerFactory.getLogger(HaRuleGenerationService.class);

    /** Maximum number of LLM chat attempts: 1 initial + 1 retry. */
    private static final int MAX_ATTEMPTS = 2;

    /** Default minimum signal count threshold when not specified in the request. */
    private static final int DEFAULT_MIN_SIGNAL_COUNT = 3;

    private final HaAlertSignalRepository signalRepo;
    private final HaRuleGenSessionRepository sessionRepo;
    private final HaLlmService llmService;
    private final Clock clock;

    @Value("${hivearmor.rule-gen.output-dir}")
    private String outputDir;

    public HaRuleGenerationService(HaAlertSignalRepository signalRepo,
                                   HaRuleGenSessionRepository sessionRepo,
                                   HaLlmService llmService,
                                   Clock clock) {
        this.signalRepo = signalRepo;
        this.sessionRepo = sessionRepo;
        this.llmService = llmService;
        this.clock = clock;
    }

    /**
     * Generates a rule suggestion by calling the LLM with signal group context.
     *
     * <p>The method:
     * <ol>
     *   <li>Loads signal groups meeting the minimum count threshold.</li>
     *   <li>Builds a YAML-oriented system prompt via {@link YamlRulePromptBuilder}.</li>
     *   <li>Calls {@link HaLlmService#chat} and validates the response with
     *       {@link YamlValidator#parseAndValidate}.</li>
     *   <li>On validation failure, retries exactly once with the same prompt.</li>
     *   <li>If both attempts fail validation, throws {@link RuleGenerationException}.</li>
     *   <li>Persists a {@link HaRuleGenSession} with status {@code pending_review}.</li>
     * </ol>
     *
     * @param req the generation request containing signal key and optional min count
     * @return DTO representing the newly created session
     * @throws RuleGenerationException if the LLM produces invalid YAML after all attempts
     */
    @Transactional
    public RuleGenSessionDTO generateRuleSuggestion(GenerateRequest req) {
        List<SignalGroup> groups = signalRepo.findSignalGroupsWithMinCount(
            Optional.ofNullable(req.minCount()).orElse((long) DEFAULT_MIN_SIGNAL_COUNT));

        String prompt = YamlRulePromptBuilder.build(groups, req);

        ParsedRule parsed = null;
        RuntimeException lastFailure = null;

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            String yaml = llmService.chat(
                List.of(new ChatMessage("system", prompt)),
                new ChatOptions(null, 0.2, 2048));
            try {
                parsed = parseAndValidate(yaml);
                break;
            } catch (RuleGenerationException rge) {
                lastFailure = rge;
                log.debug("Rule generation attempt {} failed validation: {}",
                    attempt, rge.getMessage());
            }
        }

        if (parsed == null) {
            throw new RuleGenerationException(
                "LLM produced invalid YAML after " + MAX_ATTEMPTS + " attempts", lastFailure);
        }

        HaRuleGenSession session = HaRuleGenSession.builder()
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(parsed.name())
            .ruleYaml(parsed.rawText())
            .signalKey(req.signalKey())
            .requestedBy(currentPrincipal())
            .createdAt(clock.instant())
            .updatedAt(clock.instant())
            .build();
        sessionRepo.save(session);

        return RuleGenSessionDTO.from(session);
    }

    /**
     * Approves a pending session: writes the YAML to the output directory and
     * transitions the session status to {@code approved}.
     *
     * @param id the session ID to approve
     * @return DTO representing the updated session
     * @throws IllegalStateException if the session is not in {@code pending_review} status
     * @throws RuntimeException if the file write fails (propagated loudly)
     */
    @Transactional
    public RuleGenSessionDTO approveSession(Long id) {
        HaRuleGenSession session = loadPending(id);

        String filename = safeFilename(session.getRuleName()) + ".yaml";
        String writtenPath = writeApprovedYaml(filename, session.getRuleYaml());

        session.setStatus(HaRuleGenSession.SessionStatus.approved);
        session.setApprovedPath(writtenPath);
        session.setUpdatedAt(clock.instant());
        sessionRepo.save(session);
        return RuleGenSessionDTO.from(session);
    }

    /**
     * Writes a YAML file into the configured {@code RuleGenOutputDir}.
     *
     * <p>Before writing, the method performs a path-containment check: the resolved
     * absolute path must start with the output directory's absolute path. This is a
     * belt-and-braces guard on top of {@link #safeFilename} to prevent any directory
     * traversal that might slip through sanitization.
     *
     * <p>On any I/O failure the method throws a {@link RuntimeException} so the
     * error propagates to the caller and ultimately surfaces as an HTTP 500 to the
     * admin (Requirement 3.8).
     *
     * @param filename the sanitized filename (must already include the {@code .yaml} extension)
     * @param yaml     the YAML content to write
     * @return the absolute path where the file was written
     * @throws RuntimeException if the resolved path escapes the output directory
     *                          or if any I/O error occurs during writing
     */
    String writeApprovedYaml(String filename, String yaml) {
        Path target = Path.of(outputDir, filename).toAbsolutePath().normalize();
        Path base = Path.of(outputDir).toAbsolutePath().normalize();

        // Path-containment guard — ensure the resolved path stays inside outputDir.
        if (!target.startsWith(base)) {
            throw new RuntimeException(
                "resolved rule path escapes RuleGenOutputDir: " + target);
        }

        try {
            Files.createDirectories(base);
            Files.writeString(target, yaml, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException ioe) {
            // FILE-WRITE FAILURE — raise loudly so the caller sees it.
            throw new RuntimeException("failed to write rule YAML to " + target, ioe);
        }

        return target.toString();
    }

    /**
     * Rejects a pending session without writing any file.
     *
     * @param id the session ID to reject
     * @return DTO representing the updated session
     * @throws IllegalStateException if the session is not in {@code pending_review} status
     */
    @Transactional
    public RuleGenSessionDTO rejectSession(Long id) {
        HaRuleGenSession session = loadPending(id);
        session.setStatus(HaRuleGenSession.SessionStatus.rejected);
        session.setUpdatedAt(clock.instant());
        sessionRepo.save(session);
        return RuleGenSessionDTO.from(session);
    }

    /**
     * Rejects the current session and generates a fresh rule suggestion.
     *
     * @param id  the session ID to reject
     * @param req the generation request for the new session
     * @return DTO representing the newly generated session
     */
    @Transactional
    public RuleGenSessionDTO regenerateSession(Long id, GenerateRequest req) {
        rejectSession(id);
        return generateRuleSuggestion(req);
    }

    /**
     * Returns the aggregated signal summary for groups meeting the given threshold.
     *
     * @param minCount minimum signal count threshold
     * @return the signal summary DTO
     */
    @Transactional(readOnly = true)
    public SignalSummaryDTO getSignalSummary(long minCount) {
        return SignalSummaryDTO.from(signalRepo.findSignalGroupsWithMinCount(minCount));
    }

    /**
     * Returns all sessions with {@code pending_review} status, ordered newest first.
     *
     * @return list of pending session DTOs
     */
    @Transactional(readOnly = true)
    public List<RuleGenSessionDTO> getPendingSessions() {
        return sessionRepo.findAllByStatusOrderByCreatedAtDesc(HaRuleGenSession.SessionStatus.pending_review)
            .stream()
            .map(RuleGenSessionDTO::from)
            .toList();
    }

    // -- internals --

    private HaRuleGenSession loadPending(Long id) {
        HaRuleGenSession s = sessionRepo.findById(id)
            .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException("session " + id));
        if (s.getStatus() != HaRuleGenSession.SessionStatus.pending_review) {
            throw new IllegalStateException("session " + id + " is not pending_review");
        }
        return s;
    }

    /**
     * Parses and validates a YAML string using {@link YamlValidator}, extracting
     * the {@code name} key to build a {@link ParsedRule}.
     *
     * @param yaml the raw YAML text from the LLM
     * @return a parsed rule containing the name and raw YAML text
     * @throws RuleGenerationException if validation fails
     */
    private ParsedRule parseAndValidate(String yaml) {
        try {
            Map<String, Object> tree = YamlValidator.parseAndValidate(yaml);
            return new ParsedRule(String.valueOf(tree.get("name")), yaml);
        } catch (YamlValidationException yve) {
            throw new RuleGenerationException("YAML validation failed: " + yve.getMessage(), yve);
        }
    }

    /**
     * Produces a filename-safe string from a raw rule name.
     *
     * <p>Strips path separators, control characters, reserved characters,
     * collapses whitespace to underscores, and clips to 128 characters.
     *
     * @param rawName the raw rule name from the YAML document
     * @return a safe filename (without the {@code .yaml} extension)
     */
    static String safeFilename(String rawName) {
        String base = Optional.ofNullable(rawName).orElse("rule");
        // Strip anything that could escape the directory or introduce control chars
        String cleaned = base
            .replace('\u0000', '_')
            .replaceAll("[\\p{Cntrl}]", "_")
            .replaceAll("[/\\\\:*?\"<>|]", "_")
            .replaceAll("\\.{2,}", "_")
            .replaceAll("\\s+", "_")
            .replaceAll("^[.\\-_]+", "")
            .trim();
        if (cleaned.isEmpty()) cleaned = "rule";
        if (cleaned.length() > 128) cleaned = cleaned.substring(0, 128);
        return cleaned;
    }

    /**
     * Resolves the current security principal name, or {@code null} if no
     * authentication is present in the security context.
     */
    private static String currentPrincipal() {
        return Optional.ofNullable(SecurityContextHolder.getContext().getAuthentication())
            .map(Authentication::getName)
            .orElse(null);
    }
}
