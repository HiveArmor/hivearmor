package com.hivearmor.service.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.UtmInvestigationSession;
import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.repository.UtmInvestigationSessionRepository;
import com.hivearmor.repository.UtmSessionItemRepository;
import com.hivearmor.repository.incident.UtmIncidentRepository;
import com.hivearmor.service.dto.InvestigationSessionDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InvestigationPromotionServiceTest {

    private final InvestigationSessionService sessionService = mock(InvestigationSessionService.class);
    private final UtmInvestigationSessionRepository sessions = mock(UtmInvestigationSessionRepository.class);
    private final UtmSessionItemRepository items = mock(UtmSessionItemRepository.class);
    private final UtmIncidentRepository incidents = mock(UtmIncidentRepository.class);
    private InvestigationPromotionService promotion;

    @BeforeEach
    void setUp() {
        promotion = new InvestigationPromotionService(
            sessionService, sessions, items, incidents, new ObjectMapper());
        ReflectionTestUtils.setField(promotion, "promotionSecret", "unit-test-promotion-secret");
    }

    @Test
    void previewThenPromoteCreatesIncident() {
        UtmInvestigationSession session = activeSession(42L, 3L);
        when(sessionService.getSession(42L, "analyst", false))
            .thenReturn(dto(session));
        when(sessions.findById(42L)).thenReturn(Optional.of(session));
        when(items.findBySessionIdOrderByAddedAtDesc(42L)).thenReturn(List.of());
        when(incidents.save(any(UtmIncident.class))).thenAnswer(invocation -> {
            UtmIncident incident = invocation.getArgument(0);
            incident.setId(9001L);
            return incident;
        });
        when(sessions.save(any(UtmInvestigationSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Map<String, Object> preview = promotion.previewPromotion(42L, "analyst", false);
        assertThat(preview.get("previewToken")).isInstanceOf(String.class);
        assertThat(preview.get("sessionVersion")).isEqualTo(3L);

        Map<String, Object> result = promotion.promote(
            42L,
            preview.get("previewToken").toString(),
            3L,
            "Confirmed privileged escalation",
            "idem-1",
            "analyst",
            false
        );

        assertThat(result.get("incidentId")).isEqualTo(9001L);
        assertThat(result.get("status")).isEqualTo("created");
        assertThat(session.getStatus()).isEqualTo("CONVERTED");
        assertThat(session.getIncidentId()).isEqualTo(9001L);
    }

    @Test
    void promoteRejectsMissingReason() {
        assertThatThrownBy(() -> promotion.promote(1L, "token", 1L, " ", null, "analyst", false))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("reason is required");
    }

    private static UtmInvestigationSession activeSession(Long id, Long version) {
        UtmInvestigationSession session = new UtmInvestigationSession();
        session.setId(id);
        session.setVersion(version);
        session.setTenantId(17L);
        session.setSessionName("Privilege abuse");
        session.setDescription("Scope privileged role assignment");
        session.setStatus("ACTIVE");
        session.setCreatedBy("analyst");
        session.setAssignedTo("analyst");
        session.setCreatedAt(Instant.now());
        session.setUpdatedAt(Instant.now());
        return session;
    }

    private static InvestigationSessionDTO dto(UtmInvestigationSession s) {
        return new InvestigationSessionDTO(
            s.getId(), s.getVersion(), s.getTenantId(), s.getSessionName(), s.getDescription(),
            s.getStatus(), s.getCreatedBy(), s.getAssignedTo(), s.getIncidentId(),
            s.getCreatedAt(), s.getUpdatedAt(), 0
        );
    }
}
