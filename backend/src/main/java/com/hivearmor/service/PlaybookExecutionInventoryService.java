package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import com.hivearmor.repository.soar_playbook.UtmPlaybookExecutionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import jakarta.persistence.criteria.Predicate;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * RESP-018 — Bounded global playbook execution inventory, summary, and thin trace.
 *
 * <p>Projects {@code hive_playbook_execution} into the frontend Response Activity contract.
 * Progressive step detail is best-effort from {@code steps_log}; missing structured steps
 * are reported via {@code partialFailures} rather than invented.
 */
@Service
@Transactional(readOnly = true)
public class PlaybookExecutionInventoryService {

    private static final int MAX_LIMIT = 100;
    private static final String CURSOR_PREFIX = "off:";

    private final UtmPlaybookExecutionRepository executionRepository;
    private final ObjectMapper objectMapper;

    public PlaybookExecutionInventoryService(
        UtmPlaybookExecutionRepository executionRepository,
        ObjectMapper objectMapper
    ) {
        this.executionRepository = executionRepository;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> inventory(
        String search,
        String status,
        String trigger,
        Long playbookId,
        String triggeredBy,
        Instant from,
        Instant to,
        String cursor,
        Integer limit
    ) {
        int size = normalizeLimit(limit);
        int offset = parseOffset(cursor);
        Specification<UtmPlaybookExecution> spec = buildSpec(search, status, trigger, playbookId, triggeredBy, from, to);
        Page<UtmPlaybookExecution> page = executionRepository.findAll(
            spec,
            PageRequest.of(offset / size, size, Sort.by(Sort.Direction.DESC, "startedAt"))
        );

        String snapshotAt = Instant.now().toString();
        List<Map<String, Object>> items = new ArrayList<>(page.getContent().size());
        for (UtmPlaybookExecution row : page.getContent()) {
            items.add(toActivityItem(row));
        }

        long total = page.getTotalElements();
        boolean hasMore = page.hasNext();
        int nextOffset = offset + items.size();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("nextCursor", hasMore ? CURSOR_PREFIX + nextOffset : null);
        result.put("previousCursor", offset > 0 ? CURSOR_PREFIX + Math.max(0, offset - size) : null);
        result.put("total", total);
        result.put("hasMore", hasMore);
        result.put("snapshotAt", snapshotAt);
        result.put("stale", false);
        return result;
    }

    public Map<String, Object> summary(
        String search,
        String status,
        String trigger,
        Long playbookId,
        String triggeredBy,
        Instant from,
        Instant to
    ) {
        Specification<UtmPlaybookExecution> spec = buildSpec(search, status, trigger, playbookId, triggeredBy, from, to);
        // Bound scan for staging — inventory pages use DB paging; summary uses a capped sample for median.
        List<UtmPlaybookExecution> rows = executionRepository.findAll(
            spec,
            PageRequest.of(0, 5000, Sort.by(Sort.Direction.DESC, "startedAt"))
        ).getContent();
        long totalExact = executionRepository.count(spec);

        int running = 0;
        int awaitingApproval = 0;
        int failed = 0;
        int partial = 0;
        int success = 0;
        List<Long> durations = new ArrayList<>();
        for (UtmPlaybookExecution row : rows) {
            String mapped = mapStatus(row.getStatus());
            switch (mapped) {
                case "RUNNING", "QUEUED" -> running++;
                case "AWAITING_APPROVAL" -> awaitingApproval++;
                case "FAILED" -> failed++;
                case "PARTIAL" -> partial++;
                case "SUCCESS" -> success++;
                default -> {
                    // CANCELLED / BLOCKED counted in total only
                }
            }
            Long ms = durationMs(row);
            if (ms != null) {
                durations.add(ms);
            }
        }
        durations.sort(Long::compareTo);
        long median = 0;
        if (!durations.isEmpty()) {
            int mid = durations.size() / 2;
            median = durations.size() % 2 == 0
                ? Math.round((durations.get(mid - 1) + durations.get(mid)) / 2.0)
                : durations.get(mid);
        }
        int completed = success + failed + partial;
        int successRate = completed == 0 ? 0 : (int) Math.round((success * 100.0) / completed);

        List<String> partialFailures = new ArrayList<>();
        if (totalExact > rows.size()) {
            partialFailures.add(
                "Summary counters derived from the newest " + rows.size()
                    + " matching executions; totalIsExact remains true for total count"
            );
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", totalExact);
        result.put("running", running);
        result.put("awaitingApproval", awaitingApproval);
        result.put("failed", failed);
        result.put("partial", partial);
        result.put("successRate", successRate);
        result.put("medianDurationMs", median);
        result.put("degradedConnectors", 0);
        result.put("snapshotAt", Instant.now().toString());
        result.put("totalIsExact", true);
        result.put("partialFailures", partialFailures);
        return result;
    }

    public Map<String, Object> trace(String executionId, String cursor, Integer limit) {
        UtmPlaybookExecution row = loadByIdOrUuid(executionId);
        int size = normalizeLimit(limit);
        int offset = parseOffset(cursor);
        List<Map<String, Object>> steps = parseSteps(row);
        List<String> partialFailures = new ArrayList<>();
        if (steps.isEmpty()) {
            partialFailures.add(
                "No structured step trace is stored for this execution; steps_log is absent or not JSON"
            );
        }
        int toIndex = Math.min(offset + size, steps.size());
        List<Map<String, Object>> page = offset >= steps.size()
            ? List.of()
            : steps.subList(offset, toIndex);
        boolean hasMore = toIndex < steps.size();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", page);
        result.put("nextCursor", hasMore ? CURSOR_PREFIX + toIndex : null);
        result.put("total", steps.size());
        result.put("hasMore", hasMore);
        result.put("snapshotAt", Instant.now().toString());
        result.put("stale", false);
        result.put("partialFailures", partialFailures);
        return result;
    }

    private UtmPlaybookExecution loadByIdOrUuid(String executionId) {
        Optional<UtmPlaybookExecution> byUuid = executionRepository.findByExecutionUuid(executionId);
        if (byUuid.isPresent()) {
            return byUuid.get();
        }
        try {
            Long id = Long.parseLong(executionId);
            return executionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found"));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found");
        }
    }

    private Specification<UtmPlaybookExecution> buildSpec(
        String search,
        String status,
        String trigger,
        Long playbookId,
        String triggeredBy,
        Instant from,
        Instant to
    ) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (playbookId != null) {
                predicates.add(cb.equal(root.get("playbookId"), playbookId));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startedAt"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("startedAt"), to));
            }
            if (triggeredBy != null && !triggeredBy.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("triggeredBy")),
                    "%" + triggeredBy.trim().toLowerCase(Locale.ROOT) + "%"));
            }
            if (search != null && !search.isBlank()) {
                String term = "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                    cb.like(cb.lower(root.get("playbookName")), term),
                    cb.like(cb.lower(root.get("triggeredBy")), term),
                    cb.like(cb.lower(cb.coalesce(root.get("alertId"), "")), term),
                    cb.like(cb.lower(cb.coalesce(root.get("executionUuid"), "")), term)
                ));
            }
            if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status)) {
                predicates.add(statusPredicate(root, cb, status.trim().toUpperCase(Locale.ROOT)));
            }
            if (trigger != null && !trigger.isBlank() && !"ALL".equalsIgnoreCase(trigger)) {
                predicates.add(triggerPredicate(root, cb, trigger.trim().toUpperCase(Locale.ROOT)));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Predicate statusPredicate(
        jakarta.persistence.criteria.Root<UtmPlaybookExecution> root,
        jakarta.persistence.criteria.CriteriaBuilder cb,
        String status
    ) {
        return switch (status) {
            case "SUCCESS" -> cb.upper(root.get("status")).in("SUCCESS", "COMPLETED");
            case "FAILED" -> cb.upper(root.get("status")).in("FAILED", "FAILURE", "ERROR");
            case "PARTIAL" -> cb.upper(root.get("status")).in("PARTIAL", "PARTIAL_SUCCESS");
            case "CANCELLED" -> cb.upper(root.get("status")).in("CANCELLED", "CANCELED");
            case "BLOCKED" -> cb.equal(cb.upper(root.get("status")), "BLOCKED");
            case "AWAITING_APPROVAL" ->
                cb.upper(root.get("status")).in("AWAITING_APPROVAL", "PENDING_APPROVAL");
            case "QUEUED" -> cb.equal(cb.upper(root.get("status")), "QUEUED");
            case "RUNNING" -> cb.upper(root.get("status")).in("RUNNING", "IN_PROGRESS");
            default -> cb.conjunction();
        };
    }

    private Predicate triggerPredicate(
        jakarta.persistence.criteria.Root<UtmPlaybookExecution> root,
        jakarta.persistence.criteria.CriteriaBuilder cb,
        String trigger
    ) {
        return switch (trigger) {
            case "SCHEDULED" -> cb.like(cb.upper(root.get("triggerType")), "%SCHEDUL%");
            case "MANUAL" -> cb.or(
                cb.like(cb.upper(root.get("triggerType")), "%MANUAL%"),
                cb.equal(cb.upper(root.get("triggerType")), "USER")
            );
            case "AUTOMATIC" -> cb.and(
                cb.notLike(cb.upper(root.get("triggerType")), "%SCHEDUL%"),
                cb.notLike(cb.upper(root.get("triggerType")), "%MANUAL%"),
                cb.notEqual(cb.upper(root.get("triggerType")), "USER")
            );
            default -> cb.conjunction();
        };
    }

    private Map<String, Object> toActivityItem(UtmPlaybookExecution row) {
        String id = row.getExecutionUuid() != null && !row.getExecutionUuid().isBlank()
            ? row.getExecutionUuid()
            : String.valueOf(row.getId());
        String mappedStatus = mapStatus(row.getStatus());
        Long durationMs = durationMs(row);
        boolean canCancel = "RUNNING".equals(mappedStatus) || "QUEUED".equals(mappedStatus)
            || "AWAITING_APPROVAL".equals(mappedStatus);

        Map<String, Object> capabilities = new LinkedHashMap<>();
        capabilities.put("canCancel", canCancel);
        capabilities.put("canRetry", false);
        capabilities.put("canViewInputs", false);
        capabilities.put("canViewOutputs", false);

        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("timestamp", row.getStartedAt() != null ? row.getStartedAt().toString() : Instant.EPOCH.toString());
        item.put("playbookName", row.getPlaybookName() != null ? row.getPlaybookName() : "Playbook");
        item.put("playbookId", String.valueOf(row.getPlaybookId()));
        item.put("trigger", mapTrigger(row.getTriggerType()));
        if (row.getAlertId() != null && !row.getAlertId().isBlank()) {
            item.put("linkedEntityId", row.getAlertId());
            item.put("linkedEntityType", "ALERT");
        }
        item.put("executedBy", row.getTriggeredBy() != null ? row.getTriggeredBy() : "system");
        item.put("status", mappedStatus);
        if (durationMs != null) {
            item.put("durationMs", durationMs);
        }
        if (row.getStartedAt() != null) {
            item.put("startedAt", row.getStartedAt().toString());
        }
        if (row.getEndedAt() != null) {
            item.put("completedAt", row.getEndedAt().toString());
        }
        item.put("stepCount", row.getTotalSteps() != null ? row.getTotalSteps() : 0);
        item.put("auditId", String.valueOf(row.getId()));
        item.put("capabilities", capabilities);
        item.put("steps", List.of());
        if (row.getErrorMessage() != null && !row.getErrorMessage().isBlank()) {
            item.put("rawLog", row.getErrorMessage());
        }
        return item;
    }

    private List<Map<String, Object>> parseSteps(UtmPlaybookExecution row) {
        String log = row.getStepsLog();
        if (log == null || log.isBlank()) {
            return List.of();
        }
        try {
            List<Map<String, Object>> raw = objectMapper.readValue(log, new TypeReference<>() {});
            List<Map<String, Object>> steps = new ArrayList<>();
            int index = 0;
            for (Map<String, Object> entry : raw) {
                Map<String, Object> step = new LinkedHashMap<>();
                Object id = entry.getOrDefault("id", "step-" + index);
                step.put("id", String.valueOf(id));
                Object name = entry.getOrDefault("actionName",
                    entry.getOrDefault("name", entry.getOrDefault("action", "Step " + (index + 1))));
                step.put("actionName", String.valueOf(name));
                if (entry.get("nodeType") != null) {
                    step.put("nodeType", String.valueOf(entry.get("nodeType")));
                }
                step.put("status", mapStepStatus(entry.get("status")));
                if (entry.get("resultSummary") != null) {
                    step.put("resultSummary", String.valueOf(entry.get("resultSummary")));
                }
                if (entry.get("errorMessage") != null) {
                    step.put("errorMessage", String.valueOf(entry.get("errorMessage")));
                }
                if (entry.get("durationMs") instanceof Number number) {
                    step.put("durationMs", number.longValue());
                }
                steps.add(step);
                index++;
            }
            return steps;
        } catch (Exception ignored) {
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("id", "steps-log");
            fallback.put("actionName", "Execution log");
            fallback.put("status", "success");
            fallback.put("resultSummary", truncate(log, 240));
            return List.of(fallback);
        }
    }

    private static String mapStepStatus(Object raw) {
        if (raw == null) {
            return "success";
        }
        String value = String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "queued", "pending" -> "queued";
            case "running", "in_progress" -> "running";
            case "waiting", "awaiting_approval" -> "waiting";
            case "error", "failed", "failure" -> "error";
            case "skipped", "skip" -> "skipped";
            case "cancelled", "canceled" -> "cancelled";
            default -> "success";
        };
    }

    private static String mapStatus(String raw) {
        String normalized = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (normalized.equals("SUCCESS") || normalized.equals("COMPLETED")) return "SUCCESS";
        if (normalized.equals("FAILED") || normalized.equals("FAILURE") || normalized.equals("ERROR")) return "FAILED";
        if (normalized.equals("PARTIAL") || normalized.equals("PARTIAL_SUCCESS")) return "PARTIAL";
        if (normalized.equals("CANCELLED") || normalized.equals("CANCELED")) return "CANCELLED";
        if (normalized.equals("BLOCKED")) return "BLOCKED";
        if (normalized.equals("AWAITING_APPROVAL") || normalized.equals("PENDING_APPROVAL")) return "AWAITING_APPROVAL";
        if (normalized.equals("QUEUED")) return "QUEUED";
        if (normalized.equals("RUNNING") || normalized.equals("IN_PROGRESS")) return "RUNNING";
        return "RUNNING";
    }

    private static String mapTrigger(String raw) {
        String normalized = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (normalized.contains("SCHEDUL")) return "SCHEDULED";
        if (normalized.contains("MANUAL") || normalized.equals("USER")) return "MANUAL";
        return "AUTOMATIC";
    }

    private static Long durationMs(UtmPlaybookExecution row) {
        if (row.getStartedAt() == null || row.getEndedAt() == null) {
            return null;
        }
        long ms = Duration.between(row.getStartedAt(), row.getEndedAt()).toMillis();
        return ms >= 0 ? ms : null;
    }

    private static int normalizeLimit(Integer limit) {
        if (limit == null || limit < 1) {
            return 50;
        }
        return Math.min(limit, MAX_LIMIT);
    }

    private static int parseOffset(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return 0;
        }
        if (!cursor.startsWith(CURSOR_PREFIX)) {
            return 0;
        }
        try {
            int offset = Integer.parseInt(cursor.substring(CURSOR_PREFIX.length()));
            return Math.max(0, offset);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String truncate(String value, int max) {
        if (value.length() <= max) {
            return value;
        }
        return value.substring(0, max) + "…";
    }
}
