package com.hivearmor.service.hunt.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.hivearmor.domain.hunt.HaAiFeedback;
import com.hivearmor.repository.hunt.HaAiFeedbackRepository;
import com.hivearmor.web.rest.hunt.ai.dto.AiCalibrationDTO;
import com.hivearmor.web.rest.hunt.ai.dto.AiFeedbackRequestDTO;

/**
 * Unit tests for {@link HaAiCalibrationService} — feedback persistence + trust calibration.
 *
 * <p>Validates the contract's calibration rule: agreement rate = up/total over a scope window,
 * cold start returns an HONEST zero (never a fabricated rate), and the override trend reflects
 * recent-vs-prior movement (the trust-decay early-warning signal).
 */
@DisplayName("HaAiCalibrationService — feedback store + calibration math")
class HaAiCalibrationServiceTest {

    private HaAiFeedbackRepository repo;
    private HaAiCalibrationService service;

    @BeforeEach
    void setUp() {
        repo = mock(HaAiFeedbackRepository.class);
        service = new HaAiCalibrationService(repo);
    }

    @Test
    @DisplayName("record persists the feedback with scope defaulted and vote set")
    void recordPersists() {
        AiFeedbackRequestDTO req = new AiFeedbackRequestDTO(
            "verdict", "V-1", "up", "credential-access verdicts", null, null);

        service.record(req);

        ArgumentCaptor<HaAiFeedback> cap = ArgumentCaptor.forClass(HaAiFeedback.class);
        verify(repo).save(cap.capture());
        HaAiFeedback saved = cap.getValue();
        assertThat(saved.getTargetType()).isEqualTo("verdict");
        assertThat(saved.getTargetId()).isEqualTo("V-1");
        assertThat(saved.getVote()).isEqualTo("up");
        assertThat(saved.getVerdictScope()).isEqualTo("credential-access verdicts");
    }

    @Test
    @DisplayName("cold start: zero feedback → agreementRate 0.0, sampleSize 0, trend flat (honest, not fabricated)")
    void coldStart() {
        when(repo.countInScope(anyString(), anyString(), any(Instant.class))).thenReturn(0L);
        when(repo.countInScopeByVote(anyString(), anyString(), any(Instant.class), anyString())).thenReturn(0L);

        AiCalibrationDTO c = service.calibrationFor("credential-access verdicts");

        assertThat(c.sampleSize()).isZero();
        assertThat(c.agreementRate()).isEqualTo(0.0);
        assertThat(c.overrideTrend()).isEqualTo("flat");
        assertThat(c.window()).isEqualTo("90d");
        assertThat(c.scope()).isEqualTo("credential-access verdicts");
    }

    @Test
    @DisplayName("agreement rate = up / total, rounded to 2dp; steady state → trend flat")
    void agreementRateSteadyState() {
        // Order-independent stubbing: every window query returns the same totals/ups, so the
        // recent-half and prior-half rates are equal → trend flat, and rate = 168/200 = 0.84.
        when(repo.countInScope(anyString(), anyString(), any(Instant.class))).thenReturn(200L);
        when(repo.countInScopeByVote(anyString(), anyString(), any(Instant.class), eq("up"))).thenReturn(168L);

        AiCalibrationDTO c = service.calibrationFor("scope");

        assertThat(c.sampleSize()).isEqualTo(200L);
        assertThat(c.agreementRate()).isEqualTo(0.84);
        // recent total == prior total and recent up == prior up → equal rates → flat
        assertThat(c.overrideTrend()).isEqualTo("flat");
    }

    @Test
    @DisplayName("override trend 'down' when recent agreement < prior agreement")
    void trendDown() {
        // Distinguish the two windows by the 'since' Instant: the trend path passes halfAgo
        // (more recent, later Instant) for the recent window and fullAgo for the full window.
        // countInScope(total) for the rate also uses fullAgo (windowStart == fullAgo).
        Instant now = Instant.now();
        // full-window since ~ now-90d ; half-window since ~ now-45d. Use a cutoff to route.
        Instant cutoff = now.minusSeconds(60L * 60 * 24 * 60); // 60d ago: older than half (45d), newer than full (90d)

        when(repo.countInScope(anyString(), anyString(), any(Instant.class))).thenAnswer(inv -> {
            Instant since = inv.getArgument(2);
            return since.isAfter(cutoff) ? 40L : 100L; // recent half (45d, after cutoff)=40 ; full (90d)=100
        });
        when(repo.countInScopeByVote(anyString(), anyString(), any(Instant.class), eq("up"))).thenAnswer(inv -> {
            Instant since = inv.getArgument(2);
            return since.isAfter(cutoff) ? 8L : 60L; // recent up=8 (0.20) ; full up=60
        });
        // prior = 100-40=60 total, 60-8=52 up → 0.867 ; recent 0.20 ; delta < -0.05 → down

        AiCalibrationDTO c = service.calibrationFor("scope");

        assertThat(c.overrideTrend()).isEqualTo("down");
    }
}
