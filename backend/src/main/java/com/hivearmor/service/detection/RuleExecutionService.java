package com.hivearmor.service.detection;

import com.hivearmor.domain.DetectionRule;
import com.hivearmor.domain.RuleExecution;
import com.hivearmor.repository.DetectionRuleRepository;
import com.hivearmor.repository.RuleExecutionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for detection rule execution monitoring (DET-009).
 *
 * <p>Provides execution history listing with cursor pagination,
 * manual run triggering, and gap-fill detection.
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class RuleExecutionService {

    private static final Logger log = LoggerFactory.getLogger(RuleExecutionService.class);
    private static final String CLASSNAME = "RuleExecutionService";

    /** Maximum time range for manual runs: 7 days. */
    private static final long MAX_MANUAL_RUN_DAYS = 7;

    /** Default page size. */
    private static final int DEFAULT_LIMIT = 50;

    /** Maximum page size. */
    private static final int MAX_LIMIT = 200;

    private final RuleExecutionRepository executionRepository;
    private final DetectionRuleRepository ruleRepository;

    public RuleExecutionService(RuleExecutionRepository executionRepository,
                                DetectionRuleRepository ruleRepository) {
        this.executionRepository = executionRepository;
        this.ruleRepository = ruleRepository;
    }

    /**
     * Lists execution history with optional filters and cursor pagination.
     *
     * @param ruleId   filter by rule ID (optional)
     * @param status   filter by execution status (optional)
     * @param from     filter from timestamp (optional)
     * @param to       filter to timestamp (optional)
     * @param cursor   Base64 encoded pagination cursor (optional)
     * @param limit    page size (optional)
     * @param tenantId tenant ID for scoping
     * @return map containing items, cursor, total
     */
    public Map<String, Object> listExecutions(String ruleId, String status,
                                              Instant from, Instant to,
                                              String cursor, Integer limit, Long tenantId) {
        int effectiveLimit = resolveLimit(limit);
        int offset = decodeCursor(cursor);

        List<RuleExecution> allExecutions;

        if (ruleId != null && !ruleId.isBlank()) {
            // Filter by specific rule
            if (from != null && to != null) {
                allExecutions = executionRepository.findByRuleIdAndStartedAtBetween(ruleId, from, to);
            } else {
                allExecutions = executionRepository.findTop10ByRuleIdOrderByStartedAtDesc(ruleId);
                // For larger results, use pageable
                if (effectiveLimit > 10) {
                    Page<RuleExecution> page = executionRepository.findByRuleIdOrderByStartedAtDesc(
                        ruleId, PageRequest.of(0, effectiveLimit));
                    allExecutions = new ArrayList<>(page.getContent());
                }
            }
        } else {
            // All executions for tenant (admin/tenantId=0 gets recent from all tenants)
            if (tenantId == null || tenantId == 0L) {
                allExecutions = new ArrayList<>(executionRepository.findAll(
                    PageRequest.of(0, Math.min(effectiveLimit * 2, 200),
                        org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "startedAt")))
                    .getContent());
            } else {
                Page<RuleExecution> page = executionRepository.findByTenantIdOrderByStartedAtDesc(
                    tenantId, PageRequest.of(0, effectiveLimit * 2));
                allExecutions = new ArrayList<>(page.getContent());
            }
        }

        // Apply status filter
        if (status != null && !status.isBlank()) {
            allExecutions = allExecutions.stream()
                .filter(e -> status.equalsIgnoreCase(e.getStatus()))
                .collect(Collectors.toList());
        }

        // Apply time range filter if not already done at query level
        if (ruleId == null && from != null) {
            allExecutions = allExecutions.stream()
                .filter(e -> e.getStartedAt() != null && !e.getStartedAt().isBefore(from))
                .collect(Collectors.toList());
        }
        if (ruleId == null && to != null) {
            allExecutions = allExecutions.stream()
                .filter(e -> e.getStartedAt() != null && !e.getStartedAt().isAfter(to))
                .collect(Collectors.toList());
        }

        // Sort by started_at DESC
        allExecutions.sort((a, b) -> {
            if (b.getStartedAt() == null && a.getStartedAt() == null) return 0;
            if (b.getStartedAt() == null) return -1;
            if (a.getStartedAt() == null) return 1;
            return b.getStartedAt().compareTo(a.getStartedAt());
        });

        int total = allExecutions.size();
        int endIndex = Math.min(offset + effectiveLimit, total);
        List<RuleExecution> pageItems = offset < total
            ? allExecutions.subList(offset, endIndex)
            : Collections.emptyList();

        List<Map<String, Object>> items = pageItems.stream()
            .map(this::buildExecutionItem)
            .collect(Collectors.toList());

        String nextCursor = endIndex < total ? encodeCursor(endIndex) : null;

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("items", items);
        response.put("cursor", nextCursor);
        response.put("total", total);
        return response;
    }

    /**
     * Triggers a manual run for a detection rule.
     *
     * @param ruleId   the rule to execute
     * @param fromTime start of the time range
     * @param toTime   end of the time range
     * @param reason   reason for manual execution
     * @param userId   user triggering the run
     * @param tenantId tenant ID
     * @return the created execution record
     * @throws IllegalArgumentException if validation fails
     * @throws NoSuchElementException   if rule not found
     */
    public Map<String, Object> triggerManualRun(String ruleId, Instant fromTime, Instant toTime,
                                                String reason, String userId, Long tenantId) {
        // Validate rule exists
        Optional<DetectionRule> ruleOpt = ruleRepository.findById(ruleId);
        if (ruleOpt.isEmpty()) {
            throw new NoSuchElementException("Rule not found: " + ruleId);
        }

        DetectionRule rule = ruleOpt.get();

        // Validate rule is active or published
        String ruleStatus = rule.getStatus();
        if (!"active".equals(ruleStatus) && !"published".equals(ruleStatus)) {
            throw new IllegalArgumentException("Rule must be active or published for manual execution. Current status: " + ruleStatus);
        }

        // Validate time range max 7 days
        if (fromTime != null && toTime != null) {
            long daysBetween = Duration.between(fromTime, toTime).toDays();
            if (daysBetween > MAX_MANUAL_RUN_DAYS) {
                throw new IllegalArgumentException("Time range cannot exceed 7 days. Requested: " + daysBetween + " days");
            }
            if (toTime.isBefore(fromTime)) {
                throw new IllegalArgumentException("End time must be after start time");
            }
        }

        // Create execution record
        RuleExecution execution = new RuleExecution();
        execution.setId(UUID.randomUUID().toString());
        execution.setRuleId(ruleId);
        execution.setStartedAt(Instant.now());
        execution.setStatus("queued");
        execution.setTriggeredBy("manual");
        execution.setTenantId(tenantId);
        execution.setAlertsGenerated(0);
        execution.setEventsScanned(0L);

        executionRepository.save(execution);

        log.info("{}.triggerManualRun: created execution {} for rule {} by user {} reason='{}'",
            CLASSNAME, execution.getId(), ruleId, userId, reason);

        return buildExecutionItem(execution);
    }

    /**
     * Triggers a gap-fill operation for a detection rule.
     *
     * <p>Identifies missing execution windows based on the rule's schedule
     * and creates gap-fill execution records for each missing window.
     *
     * @param ruleId   the rule to gap-fill
     * @param from     start of the gap-fill range
     * @param to       end of the gap-fill range
     * @param userId   user triggering the gap-fill
     * @param tenantId tenant ID
     * @return map with gaps detected and executions created
     * @throws NoSuchElementException   if rule not found
     * @throws IllegalArgumentException if validation fails
     */
    public Map<String, Object> triggerGapFill(String ruleId, Instant from, Instant to,
                                              String userId, Long tenantId) {
        // Validate rule exists
        Optional<DetectionRule> ruleOpt = ruleRepository.findById(ruleId);
        if (ruleOpt.isEmpty()) {
            throw new NoSuchElementException("Rule not found: " + ruleId);
        }

        DetectionRule rule = ruleOpt.get();

        // Validate time range
        if (from == null || to == null) {
            throw new IllegalArgumentException("Both 'from' and 'to' timestamps are required for gap-fill");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("End time must be after start time");
        }

        long daysBetween = Duration.between(from, to).toDays();
        if (daysBetween > MAX_MANUAL_RUN_DAYS) {
            throw new IllegalArgumentException("Gap-fill range cannot exceed 7 days. Requested: " + daysBetween + " days");
        }

        // Get actual executions in the range
        List<RuleExecution> actualExecutions = executionRepository.findByRuleIdAndStartedAtBetween(ruleId, from, to);

        // Calculate expected intervals based on schedule
        long intervalMinutes = parseScheduleIntervalMinutes(rule.getSchedule());

        // Find gaps: expected execution times vs actual
        List<Instant> expectedTimes = buildExpectedTimes(from, to, intervalMinutes);
        Set<Instant> actualTimes = actualExecutions.stream()
            .map(RuleExecution::getStartedAt)
            .filter(Objects::nonNull)
            .map(t -> t.truncatedTo(ChronoUnit.MINUTES))
            .collect(Collectors.toSet());

        List<Instant> missingWindows = expectedTimes.stream()
            .filter(expected -> actualTimes.stream()
                .noneMatch(actual -> Math.abs(Duration.between(expected, actual).toMinutes()) < intervalMinutes / 2))
            .collect(Collectors.toList());

        // Create gap-fill execution records
        List<Map<String, Object>> createdExecutions = new ArrayList<>();
        for (Instant missingTime : missingWindows) {
            RuleExecution gapFill = new RuleExecution();
            gapFill.setId(UUID.randomUUID().toString());
            gapFill.setRuleId(ruleId);
            gapFill.setStartedAt(missingTime);
            gapFill.setStatus("queued");
            gapFill.setTriggeredBy("gap-fill");
            gapFill.setTenantId(tenantId);
            gapFill.setAlertsGenerated(0);
            gapFill.setEventsScanned(0L);

            executionRepository.save(gapFill);
            createdExecutions.add(buildExecutionItem(gapFill));
        }

        log.info("{}.triggerGapFill: rule={} range={} to {} gaps={} created={} user={}",
            CLASSNAME, ruleId, from, to, missingWindows.size(), createdExecutions.size(), userId);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ruleId", ruleId);
        response.put("from", from.toString());
        response.put("to", to.toString());
        response.put("expectedExecutions", expectedTimes.size());
        response.put("actualExecutions", actualExecutions.size());
        response.put("gapsDetected", missingWindows.size());
        response.put("executionsCreated", createdExecutions);
        return response;
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private Map<String, Object> buildExecutionItem(RuleExecution exec) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", exec.getId());
        item.put("ruleId", exec.getRuleId());
        item.put("startedAt", exec.getStartedAt() != null ? exec.getStartedAt().toString() : null);
        item.put("completedAt", exec.getCompletedAt() != null ? exec.getCompletedAt().toString() : null);
        item.put("duration", exec.getDuration());
        item.put("status", exec.getStatus());
        item.put("alertsGenerated", exec.getAlertsGenerated());
        item.put("eventsScanned", exec.getEventsScanned());
        item.put("errors", exec.getErrors());
        item.put("triggeredBy", exec.getTriggeredBy());
        item.put("tenantId", exec.getTenantId());
        return item;
    }

    /**
     * Parses a cron-like schedule string to determine interval in minutes.
     * Supports: *\/5 (every 5 min), *\/15 (every 15 min), *\/30 (every 30 min), hourly, etc.
     */
    private long parseScheduleIntervalMinutes(String schedule) {
        if (schedule == null || schedule.isBlank()) {
            return 5; // default 5-minute intervals
        }

        String[] parts = schedule.trim().split("\\s+");
        if (parts.length >= 1) {
            String minutePart = parts[0];
            if (minutePart.startsWith("*/")) {
                try {
                    return Long.parseLong(minutePart.substring(2));
                } catch (NumberFormatException e) {
                    // fall through to default
                }
            }
            if ("0".equals(minutePart)) {
                // Hourly
                return 60;
            }
        }
        return 5; // default
    }

    /**
     * Builds expected execution times within a range given an interval.
     */
    private List<Instant> buildExpectedTimes(Instant from, Instant to, long intervalMinutes) {
        List<Instant> times = new ArrayList<>();
        Instant current = from.truncatedTo(ChronoUnit.MINUTES);
        while (current.isBefore(to)) {
            times.add(current);
            current = current.plus(intervalMinutes, ChronoUnit.MINUTES);
        }
        return times;
    }

    private int decodeCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return 0;
        try {
            String decoded = new String(Base64.getDecoder().decode(cursor), StandardCharsets.UTF_8);
            return Integer.parseInt(decoded);
        } catch (Exception e) {
            return 0;
        }
    }

    private String encodeCursor(int offset) {
        return Base64.getEncoder().encodeToString(
            String.valueOf(offset).getBytes(StandardCharsets.UTF_8));
    }

    private int resolveLimit(Integer limit) {
        if (limit == null) return DEFAULT_LIMIT;
        if (limit < 1) return DEFAULT_LIMIT;
        return Math.min(limit, MAX_LIMIT);
    }
}
