package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import com.hivearmor.repository.soar_playbook.UtmPlaybookExecutionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PlaybookExecutionInventoryServiceTest {

    private final UtmPlaybookExecutionRepository repository = mock(UtmPlaybookExecutionRepository.class);
    private PlaybookExecutionInventoryService service;

    @BeforeEach
    void setUp() {
        service = new PlaybookExecutionInventoryService(repository, new ObjectMapper());
    }

    @Test
    void inventoryMapsExecutionAndPaginates() {
        UtmPlaybookExecution row = execution(11L, "exec-11", "Isolate Host", "SUCCESS", "MANUAL");
        when(repository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(row), Pageable.ofSize(50), 1));

        Map<String, Object> page = service.inventory(null, null, null, null, null, null, null, null, 50);

        assertThat(page.get("total")).isEqualTo(1L);
        assertThat(page.get("hasMore")).isEqualTo(false);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) page.get("items");
        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("id")).isEqualTo("exec-11");
        assertThat(items.get(0).get("status")).isEqualTo("SUCCESS");
        assertThat(items.get(0).get("trigger")).isEqualTo("MANUAL");
        assertThat(items.get(0).get("playbookName")).isEqualTo("Isolate Host");
    }

    @Test
    void summaryCountsStatuses() {
        UtmPlaybookExecution ok = execution(1L, "a", "A", "SUCCESS", "AUTOMATIC");
        UtmPlaybookExecution fail = execution(2L, "b", "B", "FAILED", "AUTOMATIC");
        when(repository.findAll(any(Specification.class), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(ok, fail)));
        when(repository.count(any(Specification.class))).thenReturn(2L);

        Map<String, Object> summary = service.summary(null, null, null, null, null, null, null);

        assertThat(summary.get("total")).isEqualTo(2L);
        assertThat(summary.get("successRate")).isEqualTo(50);
        assertThat(summary.get("failed")).isEqualTo(1);
        assertThat(summary.get("totalIsExact")).isEqualTo(true);
    }

    @Test
    void traceParsesJsonStepsLog() {
        UtmPlaybookExecution row = execution(5L, "trace-5", "Notify", "SUCCESS", "MANUAL");
        row.setStepsLog("[{\"id\":\"s1\",\"actionName\":\"Email\",\"status\":\"success\"}]");
        when(repository.findByExecutionUuid("trace-5")).thenReturn(Optional.of(row));

        Map<String, Object> trace = service.trace("trace-5", null, 50);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) trace.get("items");
        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("actionName")).isEqualTo("Email");
        @SuppressWarnings("unchecked")
        List<String> partial = (List<String>) trace.get("partialFailures");
        assertThat(partial).isEmpty();
    }

    private static UtmPlaybookExecution execution(
        Long id, String uuid, String name, String status, String trigger
    ) {
        UtmPlaybookExecution row = new UtmPlaybookExecution();
        row.setId(id);
        row.setExecutionUuid(uuid);
        row.setPlaybookId(99L);
        row.setPlaybookName(name);
        row.setStatus(status);
        row.setTriggerType(trigger);
        row.setTriggeredBy("admin");
        row.setStartedAt(Instant.parse("2026-08-25T10:00:00Z"));
        row.setEndedAt(Instant.parse("2026-08-25T10:01:00Z"));
        row.setTotalSteps(1);
        row.setCompletedSteps(1);
        return row;
    }
}
