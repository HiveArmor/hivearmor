package com.hivearmor.service.hunt.ai;

import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hivearmor.domain.hunt.HaAiFeedback;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.hunt.HaAiFeedbackRepository;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.web.rest.hunt.ai.dto.AiCalibrationDTO;
import com.hivearmor.web.rest.hunt.ai.dto.AiFeedbackRequestDTO;

/**
 * Hunt AI — feedback + trust-calibration store (HUNT-AI-BACKEND-SCOPE §1d, contract §2/§6).
 *
 * <p>Records analyst 👍/👎 (+ optional correction) and computes the {@link AiCalibrationDTO}
 * that the verdict endpoint attaches so a confidence score never stands alone. Agreement rate =
 * up-votes / total feedback, over a tenant+scope+time window. {@code overrideTrend} compares the
 * recent window's agreement rate to the preceding window (down = trust decaying → early warning).
 *
 * <p>Cold start is honest: with few/no rows the calibration returns the real low sample size
 * ("limited history"), never a fabricated agreement rate.
 */
@Service
public class HaAiCalibrationService {

    private static final Logger log = LoggerFactory.getLogger(HaAiCalibrationService.class);
    private static final String DEFAULT_TENANT = "default";
    private static final String WINDOW_LABEL = "90d";
    private static final Duration WINDOW = Duration.ofDays(90);

    private final HaAiFeedbackRepository repo;

    public HaAiCalibrationService(HaAiFeedbackRepository repo) {
        this.repo = repo;
    }

    /** Persist one feedback row. */
    @Transactional
    public void record(AiFeedbackRequestDTO req) {
        HaAiFeedback f = new HaAiFeedback();
        f.setTenant(tenant());
        f.setTargetType(req.targetType());
        f.setTargetId(req.targetId());
        f.setVerdictScope(req.scopeOrDefault());
        f.setVote(req.vote());
        f.setCorrectedVerdict(req.correctedVerdict());
        f.setNote(req.note());
        f.setUserLogin(SecurityUtils.getCurrentUserLogin().orElse(null));
        repo.save(f);
        log.debug("Hunt AI feedback recorded: scope={} vote={}", f.getVerdictScope(), f.getVote());
    }

    /**
     * Compute calibration for a scope over the trailing window. Used by the verdict endpoint.
     * With zero feedback, returns agreementRate 0.0 and sampleSize 0 so the UI shows
     * "no track record yet" honestly.
     */
    @Transactional(readOnly = true)
    public AiCalibrationDTO calibrationFor(String scope) {
        final String t = tenant();
        final String s = (scope == null || scope.isBlank()) ? "unscoped" : scope;
        final Instant now = Instant.now();
        final Instant windowStart = now.minus(WINDOW);

        final long total = repo.countInScope(t, s, windowStart);
        final double agreementRate = total == 0
            ? 0.0
            : (double) repo.countInScopeByVote(t, s, windowStart, HaAiFeedback.VOTE_UP) / total;

        return new AiCalibrationDTO(round(agreementRate), total, WINDOW_LABEL, s, overrideTrend(t, s, now));
    }

    /**
     * Trend of the recent half-window vs the preceding half-window. Fewer up-votes recently
     * → "down" (trust decaying). Insufficient data on either side → "flat".
     */
    private String overrideTrend(String tenant, String scope, Instant now) {
        final Instant halfAgo = now.minus(WINDOW.dividedBy(2));
        final Instant fullAgo = now.minus(WINDOW);

        final long recentTotal = repo.countInScope(tenant, scope, halfAgo);
        final long fullTotal = repo.countInScope(tenant, scope, fullAgo);
        final long priorTotal = fullTotal - recentTotal;
        if (recentTotal < 3 || priorTotal < 3) {
            return "flat";
        }
        final long recentUp = repo.countInScopeByVote(tenant, scope, halfAgo, HaAiFeedback.VOTE_UP);
        // prior-window up-votes = full-window ups minus recent ups
        final long fullUp = repo.countInScopeByVote(tenant, scope, fullAgo, HaAiFeedback.VOTE_UP);
        final long priorUp = fullUp - recentUp;

        final double recentRate = (double) recentUp / recentTotal;
        final double priorRate = (double) priorUp / priorTotal;
        final double delta = recentRate - priorRate;
        if (delta > 0.05) return "up";
        if (delta < -0.05) return "down";
        return "flat";
    }

    private static String tenant() {
        String t = TenantContext.get();
        return (t == null || t.isBlank()) ? DEFAULT_TENANT : t;
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
