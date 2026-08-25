package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import com.hivearmor.repository.soar_playbook.UtmPlaybookExecutionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for RESP-020 STAGING CANDIDATE approval projection.
 */
class ResponseGovernanceProjectionServiceTest {

    private final UtmPlaybookExecutionRepository repository = mock(UtmPlaybookExecutionRepository.class);
    private final PlaybookService playbookService = mock(PlaybookService.class);
    private ResponseGovernanceProjectionService service;

    @BeforeEach
    void setUp() {
        service = new ResponseGovernanceProjectionService(
            repository, playbookService, new ObjectMapper());
    }

    @Test
    void listApprovalsProjectsAwaitingAsPending() {
        UtmPlaybookExecution awaiting = execution(
            1L, "exec-await-1", "Isolate Host", "AWAITING_APPROVAL");
        awaiting.setStepsLog("""
            {"executionUuid":"exec-await-1","pendingApprovalStepIndex":1,\
            "steps":[{"stepIndex":1,"stepType":"approval","status":"awaiting_approval",\
            "stepLabel":"Isolate endpoint"}]}
            """);

        when(repository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(awaiting)))
            .thenReturn(new PageImpl<>(List.of()));

        Map<String, Object> result = service.listApprovals("PENDING", "ALL", null, null, 50);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> approvals = (List<Map<String, Object>>) result.get("approvals");
        assertThat(approvals).hasSize(1);
        Map<String, Object> item = approvals.get(0);
        assertThat(item.get("id")).isEqualTo("exec-await-1");
        assertThat(item.get("executionId")).isEqualTo("exec-await-1");
        assertThat(item.get("state")).isEqualTo("PENDING");
        assertThat(item.get("playbookName")).isEqualTo("Isolate Host");
        assertThat(item.get("actionName")).isEqualTo("Isolate endpoint");
        assertThat(item.get("requiredPermission")).isEqualTo("ROLE_ADMIN");

        @SuppressWarnings("unchecked")
        List<?> policies = (List<?>) result.get("policies");
        @SuppressWarnings("unchecked")
        List<?> delegates = (List<?>) result.get("delegates");
        assertThat(policies).isEmpty();
        assertThat(delegates).isEmpty();

        @SuppressWarnings("unchecked")
        List<String> partial = (List<String>) result.get("partialFailures");
        assertThat(partial).anyMatch(s -> s.contains("Policies"));
        assertThat(partial).anyMatch(s -> s.contains("Delegations"));
        assertThat(partial).anyMatch(s -> s.contains("STAGING CANDIDATE"));

        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) result.get("summary");
        assertThat(summary.get("pending")).isEqualTo(1);
    }

    @Test
    void listApprovalsIncludesRecentRejectedDecision() {
        UtmPlaybookExecution rejected = execution(
            2L, "exec-rej-2", "Block IOC", "FAILURE");
        rejected.setEndedAt(Instant.parse("2026-08-25T11:00:00Z"));
        rejected.setStepsLog("""
            {"executionUuid":"exec-rej-2","steps":[\
            {"stepIndex":0,"stepType":"approval","status":"rejected",\
            "output":{"approved":false,"actor":"admin","reason":"Out of policy"}}]}
            """);

        when(repository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of()))
            .thenReturn(new PageImpl<>(List.of(rejected)));

        Map<String, Object> result = service.listApprovals("ALL", null, null, null, 50);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> approvals = (List<Map<String, Object>>) result.get("approvals");
        assertThat(approvals).hasSize(1);
        assertThat(approvals.get(0).get("state")).isEqualTo("REJECTED");
        assertThat(approvals.get(0).get("decisionBy")).isEqualTo("admin");
        assertThat(approvals.get(0).get("decisionComment")).isEqualTo("Out of policy");
    }

    @Test
    void listApprovalsFiltersByRiskWhenDefaultsDoNotMatch() {
        UtmPlaybookExecution awaiting = execution(
            3L, "exec-3", "Notify", "AWAITING_APPROVAL");
        when(repository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(awaiting)))
            .thenReturn(new PageImpl<>(List.of()));

        Map<String, Object> result = service.listApprovals("PENDING", "CRITICAL", null, null, 50);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> approvals = (List<Map<String, Object>>) result.get("approvals");
        // Projection defaults risk to MEDIUM — CRITICAL filter yields empty (honest).
        assertThat(approvals).isEmpty();
    }

    @Test
    void decideApprovesViaPlaybookService() {
        UtmPlaybookExecution row = execution(4L, "exec-dec-4", "Isolate", "running");
        row.setStepsLog("""
            {"executionUuid":"exec-dec-4","steps":[\
            {"stepIndex":0,"stepType":"approval","status":"approved",\
            "output":{"approved":true,"actor":"admin"}}]}
            """);
        when(repository.findByExecutionUuid("exec-dec-4")).thenReturn(Optional.of(row));
        when(playbookService.approveExecution("exec-dec-4"))
            .thenReturn(Map.of("executionId", "exec-dec-4", "status", "running", "approved", true));

        Map<String, Object> item = service.decide(
            "exec-dec-4",
            Map.of("decision", "APPROVED", "comment", "Evidence reviewed and rollback path confirmed.")
        );

        verify(playbookService).approveExecution("exec-dec-4");
        assertThat(item.get("state")).isEqualTo("APPROVED");
        assertThat(item.get("id")).isEqualTo("exec-dec-4");
        assertThat(item.get("approvalsReceived")).isEqualTo(1);
    }

    @Test
    void decideRejectsWithComment() {
        UtmPlaybookExecution row = execution(5L, "exec-dec-5", "Isolate", "failure");
        row.setStepsLog("""
            {"executionUuid":"exec-dec-5","steps":[\
            {"stepIndex":0,"stepType":"approval","status":"rejected",\
            "output":{"approved":false,"actor":"admin","reason":"Need more evidence"}}]}
            """);
        when(repository.findByExecutionUuid("exec-dec-5")).thenReturn(Optional.of(row));
        when(playbookService.rejectExecution(eq("exec-dec-5"), eq("Need more evidence")))
            .thenReturn(Map.of("executionId", "exec-dec-5", "status", "failure", "approved", false));

        Map<String, Object> item = service.decide(
            "exec-dec-5",
            Map.of("decision", "REJECTED", "comment", "Need more evidence")
        );

        verify(playbookService).rejectExecution("exec-dec-5", "Need more evidence");
        assertThat(item.get("state")).isEqualTo("REJECTED");
        assertThat(item.get("decisionComment")).isEqualTo("Need more evidence");
    }

    @Test
    void decideRejectsUnknownDecision() {
        when(repository.findByExecutionUuid("exec-x")).thenReturn(Optional.of(
            execution(9L, "exec-x", "X", "AWAITING_APPROVAL")));

        assertThatThrownBy(() -> service.decide("exec-x", Map.of("decision", "MAYBE")))
            .isInstanceOf(ResponseStatusException.class);
    }

    private static UtmPlaybookExecution execution(
        Long id, String uuid, String name, String status
    ) {
        UtmPlaybookExecution row = new UtmPlaybookExecution();
        row.setId(id);
        row.setExecutionUuid(uuid);
        row.setPlaybookId(42L);
        row.setPlaybookName(name);
        row.setStatus(status);
        row.setTriggerType("MANUAL");
        row.setTriggeredBy("analyst1");
        row.setStartedAt(Instant.parse("2026-08-25T10:00:00Z"));
        row.setTotalSteps(2);
        row.setCompletedSteps(1);
        return row;
    }
}
