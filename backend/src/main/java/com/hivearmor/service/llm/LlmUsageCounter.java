package com.hivearmor.service.llm;

import com.hivearmor.domain.HaLlmUsage;
import com.hivearmor.repository.HaLlmUsageRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Minimal LLM usage counters + durable ledger writer at the {@code HaLlmService} facade
 * (P1 LLMOps — STAGING CANDIDATE).
 *
 * <p>Tracks request count plus prompt / completion / total tokens when callers supply them.
 * Uses Micrometer when a {@link MeterRegistry} bean is present; otherwise falls back to
 * in-memory {@link AtomicLong}s. When a {@link HaLlmUsageRepository} is present, writes
 * durable {@code ha_llm_usage} rows for token events and cascade skip decisions.
 */
@Component
public class LlmUsageCounter {

    private static final Logger log = LoggerFactory.getLogger(LlmUsageCounter.class);

    static final String METRIC_REQUESTS = "hivearmor.llm.requests";
    static final String METRIC_PROMPT_TOKENS = "hivearmor.llm.tokens.prompt";
    static final String METRIC_COMPLETION_TOKENS = "hivearmor.llm.tokens.completion";
    static final String METRIC_TOTAL_TOKENS = "hivearmor.llm.tokens.total";
    static final String METRIC_CASCADE_SKIP = "hivearmor.llm.cascade.skip";

    private final AtomicLong requests = new AtomicLong();
    private final AtomicLong promptTokens = new AtomicLong();
    private final AtomicLong completionTokens = new AtomicLong();
    private final AtomicLong totalTokens = new AtomicLong();
    private final AtomicLong cascadeSkips = new AtomicLong();

    @Nullable
    private final Counter micrometerRequests;
    @Nullable
    private final Counter micrometerPromptTokens;
    @Nullable
    private final Counter micrometerCompletionTokens;
    @Nullable
    private final Counter micrometerTotalTokens;
    @Nullable
    private final Counter micrometerCascadeSkip;

    @Nullable
    private final HaLlmUsageRepository usageRepository;

    /** In-memory-only counter (tests / no MeterRegistry / no ledger). */
    public LlmUsageCounter() {
        this(null, null);
    }

    public LlmUsageCounter(@Nullable MeterRegistry meterRegistry) {
        this(meterRegistry, null);
    }

    @Autowired
    public LlmUsageCounter(@Nullable MeterRegistry meterRegistry,
                           @Nullable HaLlmUsageRepository usageRepository) {
        this.usageRepository = usageRepository;
        if (meterRegistry != null) {
            this.micrometerRequests = Counter.builder(METRIC_REQUESTS)
                .description("LLM chat/stream request count")
                .register(meterRegistry);
            this.micrometerPromptTokens = Counter.builder(METRIC_PROMPT_TOKENS)
                .description("LLM prompt tokens (when reported)")
                .register(meterRegistry);
            this.micrometerCompletionTokens = Counter.builder(METRIC_COMPLETION_TOKENS)
                .description("LLM completion tokens (when reported)")
                .register(meterRegistry);
            this.micrometerTotalTokens = Counter.builder(METRIC_TOTAL_TOKENS)
                .description("LLM total tokens (when reported)")
                .register(meterRegistry);
            this.micrometerCascadeSkip = Counter.builder(METRIC_CASCADE_SKIP)
                .description("Deterministic cascade skips (LLM not called)")
                .register(meterRegistry);
        } else {
            this.micrometerRequests = null;
            this.micrometerPromptTokens = null;
            this.micrometerCompletionTokens = null;
            this.micrometerTotalTokens = null;
            this.micrometerCascadeSkip = null;
        }
    }

    /** Increments the LLM request counter by one. */
    public void recordRequest() {
        requests.incrementAndGet();
        if (micrometerRequests != null) {
            micrometerRequests.increment();
        }
    }

    /**
     * Records a deterministic cascade skip (LLM not invoked).
     *
     * @param reason    stable reason from {@link LlmCascadeDecision}
     * @param promptId  optional prompt id (may be null)
     * @param promptHash optional prompt hash (may be null)
     * @param userLogin optional authenticated login (may be null)
     */
    public void recordCascadeSkip(@Nullable String reason,
                                  @Nullable String promptId,
                                  @Nullable String promptHash,
                                  @Nullable String userLogin) {
        cascadeSkips.incrementAndGet();
        if (micrometerCascadeSkip != null) {
            micrometerCascadeSkip.increment();
        }
        log.debug("llm cascade skip reason={} promptId={}", reason, promptId);
        persistLedger(
            promptId,
            promptHash,
            null,
            null,
            null,
            HaLlmUsage.DECISION_SKIP_LLM,
            reason,
            userLogin);
    }

    /**
     * Records token usage when the provider reports it, and writes a durable ledger
     * row when any token count is known.
     *
     * <p>Negative values are ignored for metrics. Total is {@code prompt + completion}
     * when both are non-negative; if only one side is known, total equals that side.
     *
     * @param promptTokenCount     prompt tokens, or a negative value if unknown
     * @param completionTokenCount completion tokens, or a negative value if unknown
     */
    public void recordTokens(long promptTokenCount, long completionTokenCount) {
        recordTokens(promptTokenCount, completionTokenCount, null, null, null);
    }

    /**
     * Records token usage with optional prompt identity + user for the durable ledger.
     */
    public void recordTokens(long promptTokenCount,
                             long completionTokenCount,
                             @Nullable String promptId,
                             @Nullable String promptHash,
                             @Nullable String userLogin) {
        long prompt = Math.max(promptTokenCount, 0L);
        long completion = Math.max(completionTokenCount, 0L);
        if (promptTokenCount < 0 && completionTokenCount < 0) {
            return;
        }
        if (promptTokenCount >= 0) {
            promptTokens.addAndGet(prompt);
            if (micrometerPromptTokens != null) {
                micrometerPromptTokens.increment(prompt);
            }
        }
        if (completionTokenCount >= 0) {
            completionTokens.addAndGet(completion);
            if (micrometerCompletionTokens != null) {
                micrometerCompletionTokens.increment(completion);
            }
        }
        long total = (promptTokenCount >= 0 ? prompt : 0L) + (completionTokenCount >= 0 ? completion : 0L);
        if (total > 0) {
            totalTokens.addAndGet(total);
            if (micrometerTotalTokens != null) {
                micrometerTotalTokens.increment(total);
            }
        }

        Long promptTok = promptTokenCount >= 0 ? prompt : null;
        Long completionTok = completionTokenCount >= 0 ? completion : null;
        Long totalTok = total > 0 ? total : null;
        persistLedger(
            promptId,
            promptHash,
            promptTok,
            completionTok,
            totalTok,
            HaLlmUsage.DECISION_CALL_LLM,
            LlmCascadeDecision.REASON_CALL_LLM,
            userLogin);
    }

    private void persistLedger(@Nullable String promptId,
                               @Nullable String promptHash,
                               @Nullable Long promptTok,
                               @Nullable Long completionTok,
                               @Nullable Long totalTok,
                               String decision,
                               @Nullable String reason,
                               @Nullable String userLogin) {
        if (usageRepository == null) {
            return;
        }
        try {
            HaLlmUsage row = new HaLlmUsage();
            row.setPromptId(promptId);
            row.setPromptHash(promptHash);
            row.setPromptTokens(promptTok);
            row.setCompletionTokens(completionTok);
            row.setTotalTokens(totalTok);
            row.setCascadeDecision(decision);
            row.setCascadeReason(reason);
            row.setUserLogin(userLogin);
            usageRepository.save(row);
        } catch (Exception e) {
            // Ledger must never break the chat path.
            log.warn("Failed to persist ha_llm_usage row decision={}", decision, e);
        }
    }

    public long getRequestCount() {
        return requests.get();
    }

    public long getPromptTokenCount() {
        return promptTokens.get();
    }

    public long getCompletionTokenCount() {
        return completionTokens.get();
    }

    public long getTotalTokenCount() {
        return totalTokens.get();
    }

    public long getCascadeSkipCount() {
        return cascadeSkips.get();
    }
}
