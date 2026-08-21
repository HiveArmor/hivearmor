package com.hivearmor.service.session;

import com.hivearmor.domain.UtmInvestigationSession;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.UtmInvestigationSessionRepository;
import com.hivearmor.repository.UtmSessionItemRepository;
import com.hivearmor.repository.incident.UtmIncidentRepository;
import com.hivearmor.service.dto.InvestigationSessionDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class InvestigationSessionServiceSecurityTest {

    private final UtmInvestigationSessionRepository sessions = mock(UtmInvestigationSessionRepository.class);
    private final UtmSessionItemRepository items = mock(UtmSessionItemRepository.class);
    private final UtmIncidentRepository incidents = mock(UtmIncidentRepository.class);
    private final InvestigationSessionService service = new InvestigationSessionService(sessions, items, incidents);

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void tenantScopedReadDoesNotFallBackToGlobalIdLookup() {
        TenantContext.set(17L, "finance");
        when(sessions.findByIdAndTenantId(42L, 17L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getSession(42L, "analyst", false))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404 NOT_FOUND");

        verify(sessions, never()).findById(42L);
    }

    @Test
    void analystCannotReadAnotherOwnersSession() {
        TenantContext.set(17L, "finance");
        when(sessions.findByIdAndTenantId(42L, 17L)).thenReturn(Optional.of(session(42L, 17L, "owner")));

        assertThatThrownBy(() -> service.getSession(42L, "other-analyst", false))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("403 FORBIDDEN");
    }

    @Test
    void queueUsesAggregateCountsInsteadOfLoadingEveryItem() {
        TenantContext.set(17L, "finance");
        PageRequest pageRequest = PageRequest.of(0, 25);
        when(sessions.findByTenantIdAndCreatedByOrderByCreatedAtDesc(17L, "analyst", pageRequest))
            .thenReturn(new PageImpl<>(List.of(session(42L, 17L, "analyst")), pageRequest, 1));
        when(items.countBySessionIds(List.of(42L))).thenReturn(List.<Object[]>of(new Object[] {42L, 7L}));

        InvestigationSessionDTO result = service.listSessions("analyst", false, pageRequest).getContent().get(0);

        assertThat(result.itemCount()).isEqualTo(7);
        verify(items).countBySessionIds(List.of(42L));
        verify(items, never()).countBySessionId(anyLong());
        verify(items, never()).findBySessionIdOrderByAddedAtDesc(42L);
    }

    private UtmInvestigationSession session(Long id, Long tenantId, String owner) {
        UtmInvestigationSession session = new UtmInvestigationSession();
        session.setId(id);
        session.setVersion(2L);
        session.setTenantId(tenantId);
        session.setSessionName("Privileged access review");
        session.setStatus("ACTIVE");
        session.setCreatedBy(owner);
        session.setCreatedAt(Instant.parse("2026-08-13T08:00:00Z"));
        session.setUpdatedAt(Instant.parse("2026-08-13T08:30:00Z"));
        return session;
    }
}
