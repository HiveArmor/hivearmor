package com.hivearmor.service.session;

import com.hivearmor.domain.UtmInvestigationSession;
import com.hivearmor.domain.UtmSessionTask;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.UtmInvestigationSessionRepository;
import com.hivearmor.repository.UtmSessionItemRepository;
import com.hivearmor.repository.UtmSessionTaskRepository;
import com.hivearmor.repository.incident.UtmIncidentRepository;
import com.hivearmor.service.dto.InvestigationSessionDTO;
import com.hivearmor.service.dto.SessionTaskDTO;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class InvestigationSessionServiceSecurityTest {

    private final UtmInvestigationSessionRepository sessions = mock(UtmInvestigationSessionRepository.class);
    private final UtmSessionItemRepository items = mock(UtmSessionItemRepository.class);
    private final UtmSessionTaskRepository tasks = mock(UtmSessionTaskRepository.class);
    private final UtmIncidentRepository incidents = mock(UtmIncidentRepository.class);
    private final InvestigationSessionService service = new InvestigationSessionService(sessions, items, tasks, incidents);

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

    @Test
    void tenantACannotListTasksOnTenantBSession() {
        TenantContext.set(17L, "finance");
        when(sessions.findByIdAndTenantId(99L, 17L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.listTasks(99L, "analyst", true))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404 NOT_FOUND");

        verify(tasks, never()).findBySessionIdOrderByCreatedAtAsc(anyLong());
        verify(sessions, never()).findById(99L);
    }

    @Test
    void tenantACannotCreateTaskOnTenantBSession() {
        TenantContext.set(17L, "finance");
        when(sessions.findByIdAndTenantId(99L, 17L)).thenReturn(Optional.empty());

        SessionTaskDTO dto = new SessionTaskDTO(
            null, 99L, "Collect evidence", "OPEN", null,
            "https://jira.example.com/browse/SEC-1", null, null, null
        );

        assertThatThrownBy(() -> service.createTask(99L, dto, "analyst", true))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404 NOT_FOUND");

        verify(tasks, never()).save(any(UtmSessionTask.class));
    }

    @Test
    void tenantACannotUpdateOrDeleteTasksOnTenantBSession() {
        TenantContext.set(17L, "finance");
        when(sessions.findByIdAndTenantId(99L, 17L)).thenReturn(Optional.empty());

        SessionTaskDTO dto = new SessionTaskDTO(
            5L, 99L, "Collect evidence", "DONE", null, null, null, null, null
        );

        assertThatThrownBy(() -> service.updateTask(99L, 5L, dto, "analyst", true))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404 NOT_FOUND");
        assertThatThrownBy(() -> service.deleteTask(99L, 5L, "analyst", true))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("404 NOT_FOUND");

        verify(tasks, never()).findByIdAndSessionId(anyLong(), anyLong());
        verify(tasks, never()).save(any(UtmSessionTask.class));
        verify(tasks, never()).delete(any(UtmSessionTask.class));
    }

    @Test
    void authorizedOwnerCanCreateAndListTasks() {
        TenantContext.set(17L, "finance");
        UtmInvestigationSession owned = session(42L, 17L, "analyst");
        when(sessions.findByIdAndTenantId(42L, 17L)).thenReturn(Optional.of(owned));
        when(sessions.save(any(UtmInvestigationSession.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tasks.save(any(UtmSessionTask.class))).thenAnswer(invocation -> {
            UtmSessionTask saved = invocation.getArgument(0);
            saved.setId(7L);
            return saved;
        });

        SessionTaskDTO created = service.createTask(
            42L,
            new SessionTaskDTO(null, 42L, "Review IOC hits", "OPEN", "analyst",
                "https://tickets.example.com/T-9", null, null, null),
            "analyst",
            false
        );

        assertThat(created.id()).isEqualTo(7L);
        assertThat(created.title()).isEqualTo("Review IOC hits");
        assertThat(created.externalTicketUrl()).isEqualTo("https://tickets.example.com/T-9");
        assertThat(created.createdBy()).isEqualTo("analyst");

        UtmSessionTask persisted = new UtmSessionTask();
        persisted.setId(7L);
        persisted.setSession(owned);
        persisted.setTitle("Review IOC hits");
        persisted.setStatus("OPEN");
        persisted.setExternalTicketUrl("https://tickets.example.com/T-9");
        persisted.setCreatedBy("analyst");
        persisted.setCreatedAt(Instant.parse("2026-08-24T10:00:00Z"));
        persisted.setUpdatedAt(Instant.parse("2026-08-24T10:00:00Z"));
        when(tasks.findBySessionIdOrderByCreatedAtAsc(42L)).thenReturn(List.of(persisted));

        assertThat(service.listTasks(42L, "analyst", false)).hasSize(1);
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
