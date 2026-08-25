package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import com.hivearmor.repository.soar_playbook.UtmPlaybookExecutionRepository;
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
 * RESP-020 STAGING CANDIDATE — compatibility projection for the Response Governance
 * approval queue.
 *
 * <p>Projects {@code hive_playbook_execution} rows awaiting approval (and optionally
 * recently decided approval steps) into the frontend {@code ResponseApprovalRequest}
 * shape. Policies and delegations are <strong>not</strong> implemented — empty arrays
 * with honest {@code partialFailures}.
 *
 * <p>Not PRODUCTION READY. Does not invent HaResponseGovernance policy/delegation CRUD.
 */
@Service
@Transactional(readOnly = true)
public class ResponseGovernanceProjectionService {

    private static final int MAX_LIMIT = 100;
    private static final int SCAN_CAP = 500;
    private static final Duration DEFAULT_SLA = Duration.ofHours(24);
    private static final Duration HISTORY_WINDOW = Duration.ofHours(48);

    private static final String PARTIAL_POLICIES =
        "Policies are not implemented — empty list (STAGING CANDIDATE projection)";
    private static final String PARTIAL_DELEGATIONS =
        "Delegations are not implemented — empty list (STAGING CANDIDATE projection)";
    private static final String PARTIAL_DEFAULTS =
        "Risk, blast-radius, connector, confidence, and policy-tier fields are projection "
            + "defaults — not authoritative governance metadata";
    private static final String PARTIAL_SOURCE =
        "Approvals projected from hive_playbook_execution awaiting_approval (+ recent "
            + "approval decisions in steps_log); not a full HaResponseGovernance ledger";

    private final UtmPlaybookExecutionRepository executionRepository;
    private final PlaybookService playbookService;
    private final ObjectMapper objectMapper;

    public ResponseGovernanceProjectionService(
        UtmPlaybookExecutionRepository executionRepository,
        PlaybookService playbookService,
        ObjectMapper objectMapper
    ) {
        this.executionRepository = executionRepository;
        this.playbookService = playbookService;
        this.objectMapper = objectMapper;
    }

    /**
     * GET projection matching frontend {@code ResponseGovernanceResult}.
     */
    public Map<String, Object> listApprovals(
        String state,
        String risk,
        String tenantScope,
        String search,
        Integer limit
    ) {
        int size = normalizeLimit(limit);
        Instant snapshot = Instant.now();
        Instant historyFloor = snapshot.minus(HISTORY_WINDOW);

        Specification<UtmPlaybookExecution> awaitingSpec = awaitingApprovalSpec(search);
        List<UtmPlaybookExecution> awaiting = executionRepository.findAll(
            awaitingSpec,
            PageRequest.of(0, SCAN_CAP, Sort.by(Sort.Direction.DESC, "startedAt"))
        ).getContent();

        Specification<UtmPlaybookExecution> recentSpec = recentNonAwaitingSpec(search, historyFloor);
        List<UtmPlaybookExecution> recent = executionRepository.findAll(
            recentSpec,
            PageRequest.of(0, SCAN_CAP, Sort.by(Sort.Direction.DESC, "startedAt"))
        ).getContent();

        List<Map<String, Object>> approvals = new ArrayList<>();
        int pending = 0;
        int dueSoon = 0;
        int approved24h = 0;
        int rejected24h = 0;
        Instant dayAgo = snapshot.minus(Duration.ofHours(24));
        Instant dueSoonCutoff = snapshot.plus(Duration.ofMinutes(30));
        List<Long> decisionDurations = new ArrayList<>();

        for (UtmPlaybookExecution row : awaiting) {
            Map<String, Object> item = toApproval(row, snapshot, "PENDING");
            if (!matchesState(state, "PENDING") || !matchesRisk(risk, item) || !matchesTenant(tenantScope, item)) {
                continue;
            }
            approvals.add(item);
            pending++;
            Instant expires = Instant.parse(String.valueOf(item.get("expiresAt")));
            if (!expires.isAfter(dueSoonCutoff)) {
                dueSoon++;
            }
        }

        for (UtmPlaybookExecution row : recent) {
            Optional<DecisionMeta> decision = extractDecision(row);
            if (decision.isEmpty()) {
                continue;
            }
            DecisionMeta meta = decision.get();
            String mappedState = meta.approved() ? "APPROVED" : "REJECTED";
            Map<String, Object> item = toApproval(row, snapshot, mappedState);
            item.put("decisionBy", meta.actor());
            item.put("decisionAt", meta.at() != null ? meta.at().toString() : (
                row.getEndedAt() != null ? row.getEndedAt().toString() : snapshot.toString()
            ));
            item.put("decisionComment", meta.reason());
            item.put("approvalsReceived", meta.approved() ? 1 : 0);

            Instant decidedAt = meta.at() != null
                ? meta.at()
                : (row.getEndedAt() != null ? row.getEndedAt() : row.getStartedAt());
            if (decidedAt != null && !decidedAt.isBefore(dayAgo)) {
                if (meta.approved()) {
                    approved24h++;
                } else {
                    rejected24h++;
                }
            }
            if (row.getStartedAt() != null && decidedAt != null) {
                long ms = Duration.between(row.getStartedAt(), decidedAt).toMillis();
                if (ms >= 0) {
                    decisionDurations.add(ms);
                }
            }

            if (!matchesState(state, mappedState) || !matchesRisk(risk, item) || !matchesTenant(tenantScope, item)) {
                continue;
            }
            // History only when not strictly pending queue
            if (state == null || state.isBlank() || "ALL".equalsIgnoreCase(state)
                || "APPROVED".equalsIgnoreCase(state) || "REJECTED".equalsIgnoreCase(state)
                || "EXPIRED".equalsIgnoreCase(state) || "CANCELLED".equalsIgnoreCase(state)) {
                approvals.add(item);
            }
        }

        if (approvals.size() > size) {
            approvals = new ArrayList<>(approvals.subList(0, size));
        }

        decisionDurations.sort(Long::compareTo);
        long median = 0;
        if (!decisionDurations.isEmpty()) {
            int mid = decisionDurations.size() / 2;
            median = decisionDurations.size() % 2 == 0
                ? Math.round((decisionDurations.get(mid - 1) + decisionDurations.get(mid)) / 2.0)
                : decisionDurations.get(mid);
        }

        List<String> partialFailures = new ArrayList<>();
        partialFailures.add(PARTIAL_SOURCE);
        partialFailures.add(PARTIAL_POLICIES);
        partialFailures.add(PARTIAL_DELEGATIONS);
        partialFailures.add(PARTIAL_DEFAULTS);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("pending", pending);
        summary.put("dueSoon", dueSoon);
        summary.put("critical", 0);
        summary.put("restrictedWindow", 0);
        summary.put("approved24h", approved24h);
        summary.put("rejected24h", rejected24h);
        summary.put("medianDecisionMs", median);
        summary.put("connectorWarnings", 0);
        summary.put("snapshotAt", snapshot.toString());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("approvals", approvals);
        result.put("policies", List.of());
        result.put("delegates", List.of());
        result.put("summary", summary);
        result.put("snapshotAt", snapshot.toString());
        result.put("stale", false);
        result.put("partialFailures", partialFailures);
        return result;
    }

    /**
     * POST decision bridge → {@link PlaybookService#approveExecution} /
     * {@link PlaybookService#rejectExecution}. Admin-only at REST.
     */
    @Transactional
    public Map<String, Object> decide(String approvalId, Map<String, Object> body) {
        if (approvalId == null || approvalId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "approvalId required");
        }
        String decision = body != null && body.get("decision") != null
            ? String.valueOf(body.get("decision")).trim().toUpperCase(Locale.ROOT)
            : "";
        String comment = body != null && body.get("comment") != null
            ? String.valueOf(body.get("comment")).trim()
            : "";

        String executionId = resolveExecutionId(approvalId);
        if ("APPROVED".equals(decision)) {
            playbookService.approveExecution(executionId);
        } else if ("REJECTED".equals(decision)) {
            playbookService.rejectExecution(executionId, comment.isEmpty() ? null : comment);
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "decision must be APPROVED or REJECTED");
        }

        UtmPlaybookExecution row = executionRepository.findByExecutionUuid(executionId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Execution not found"));
        Instant snapshot = Instant.now();
        String state = "APPROVED".equals(decision) ? "APPROVED" : "REJECTED";
        Map<String, Object> item = toApproval(row, snapshot, state);
        Optional<DecisionMeta> meta = extractDecision(row);
        if (meta.isPresent()) {
            item.put("decisionBy", meta.get().actor());
            String decidedComment = meta.get().reason() != null
                ? meta.get().reason()
                : (comment.isEmpty() ? null : comment);
            item.put("decisionComment", decidedComment);
            if (meta.get().at() != null) {
                item.put("decisionAt", meta.get().at().toString());
            } else {
                item.put("decisionAt", snapshot.toString());
            }
        } else {
            item.put("decisionBy", "operator");
            item.put("decisionComment", comment.isEmpty() ? null : comment);
            item.put("decisionAt", snapshot.toString());
        }
        if ("APPROVED".equals(decision)) {
            item.put("approvalsReceived", 1);
        }
        return item;
    }

    private String resolveExecutionId(String approvalId) {
        Optional<UtmPlaybookExecution> byUuid = executionRepository.findByExecutionUuid(approvalId);
        if (byUuid.isPresent()) {
            return approvalId;
        }
        try {
            Long id = Long.parseLong(approvalId);
            return executionRepository.findById(id)
                .map(row -> row.getExecutionUuid() != null && !row.getExecutionUuid().isBlank()
                    ? row.getExecutionUuid()
                    : String.valueOf(row.getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Approval not found"));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Approval not found");
        }
    }

    private Map<String, Object> toApproval(UtmPlaybookExecution row, Instant snapshot, String state) {
        String executionId = row.getExecutionUuid() != null && !row.getExecutionUuid().isBlank()
            ? row.getExecutionUuid()
            : String.valueOf(row.getId());
        Instant requestedAt = row.getStartedAt() != null ? row.getStartedAt() : snapshot;
        Instant expiresAt = requestedAt.plus(DEFAULT_SLA);
        String actionName = extractPendingActionName(row).orElse(
            row.getPlaybookName() != null ? row.getPlaybookName() : "Playbook approval"
        );

        boolean pending = "PENDING".equals(state);
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", executionId);
        item.put("executionId", executionId);
        item.put("playbookId", String.valueOf(row.getPlaybookId()));
        item.put("playbookName", row.getPlaybookName() != null ? row.getPlaybookName() : "Playbook");
        item.put("playbookVersion", 1);
        item.put("actionName", actionName);
        item.put("actionCategory", "CASE");
        item.put("state", state);
        item.put("riskLevel", "MEDIUM");
        item.put("requestedBy", row.getTriggeredBy() != null ? row.getTriggeredBy() : "system");
        item.put("requesterRole", "Operator");
        item.put("requestedAt", requestedAt.toString());
        item.put("expiresAt", expiresAt.toString());
        item.put("tenantId", "default");
        item.put("tenantLabel", "Default tenant");
        if (row.getAlertId() != null && !row.getAlertId().isBlank()) {
            item.put("linkedEntityType", "ALERT");
            item.put("linkedEntityId", row.getAlertId());
        } else {
            item.put("linkedEntityType", "MANUAL");
            item.put("linkedEntityId", null);
        }
        item.put("targetType", "Playbook execution");
        item.put("targets", List.of(executionId));
        item.put("affectedUserCount", 0);
        item.put("estimatedDowntime", "Unknown — not stored on execution");
        item.put("reversible", true);
        item.put("rollbackGuidance",
            "Cancel or compensate via playbook activity controls; no governance rollback policy is stored.");
        item.put("requiredPermission", "ROLE_ADMIN");
        item.put("approvalPolicy", "Playbook approval gate (compatibility projection)");
        item.put("approvalTier", 1);
        item.put("approvalsRequired", 1);
        item.put("approvalsReceived", pending ? 0 : ("APPROVED".equals(state) ? 1 : 0));
        item.put("eligibleApproverGroups", List.of("Platform Administrators"));
        item.put("connectorName", "Playbook engine");
        item.put("connectorState", "HEALTHY");
        item.put("confidence", 0);
        item.put("evidenceSummary",
            "Projected from hive_playbook_execution status "
                + (row.getStatus() != null ? row.getStatus() : "unknown")
                + ". Full governance evidence is not available in this STAGING CANDIDATE slice.");
        item.put("changeWindowState", "OPEN");
        item.put("separationOfDutiesSatisfied", true);
        item.put("decisionBy", null);
        item.put("decisionAt", null);
        item.put("decisionComment", null);
        item.put("auditId", String.valueOf(row.getId()));
        item.put("correlationId", executionId);
        return item;
    }

    private Specification<UtmPlaybookExecution> awaitingApprovalSpec(String search) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.upper(root.get("status")).in("AWAITING_APPROVAL", "PENDING_APPROVAL"));
            addSearch(predicates, root, cb, search);
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Specification<UtmPlaybookExecution> recentNonAwaitingSpec(String search, Instant historyFloor) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.not(cb.upper(root.get("status")).in("AWAITING_APPROVAL", "PENDING_APPROVAL")));
            predicates.add(cb.greaterThanOrEqualTo(root.get("startedAt"), historyFloor));
            addSearch(predicates, root, cb, search);
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static void addSearch(
        List<Predicate> predicates,
        jakarta.persistence.criteria.Root<UtmPlaybookExecution> root,
        jakarta.persistence.criteria.CriteriaBuilder cb,
        String search
    ) {
        if (search == null || search.isBlank()) {
            return;
        }
        String like = "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
        predicates.add(cb.or(
            cb.like(cb.lower(root.get("playbookName")), like),
            cb.like(cb.lower(root.get("triggeredBy")), like),
            cb.like(cb.lower(cb.coalesce(root.get("executionUuid"), "")), like),
            cb.like(cb.lower(cb.coalesce(root.get("alertId"), "")), like)
        ));
    }

    private static boolean matchesState(String filter, String state) {
        if (filter == null || filter.isBlank() || "ALL".equalsIgnoreCase(filter)) {
            return true;
        }
        return filter.trim().equalsIgnoreCase(state);
    }

    private static boolean matchesRisk(String filter, Map<String, Object> item) {
        if (filter == null || filter.isBlank() || "ALL".equalsIgnoreCase(filter)) {
            return true;
        }
        return filter.trim().equalsIgnoreCase(String.valueOf(item.get("riskLevel")));
    }

    private static boolean matchesTenant(String tenantScope, Map<String, Object> item) {
        if (tenantScope == null || tenantScope.isBlank() || "authorized".equalsIgnoreCase(tenantScope)) {
            return true;
        }
        return tenantScope.equalsIgnoreCase(String.valueOf(item.get("tenantId")))
            || tenantScope.equalsIgnoreCase(String.valueOf(item.get("tenantLabel")));
    }

    private Optional<String> extractPendingActionName(UtmPlaybookExecution row) {
        List<Map<String, Object>> steps = readSteps(row.getStepsLog());
        for (int i = steps.size() - 1; i >= 0; i--) {
            Map<String, Object> step = steps.get(i);
            String type = stringVal(step.get("stepType"));
            String status = stringVal(step.get("status"));
            if ("approval".equalsIgnoreCase(type)
                || "awaiting_approval".equalsIgnoreCase(status)
                || "pending".equalsIgnoreCase(status)) {
                String label = firstNonBlank(
                    stringVal(step.get("stepLabel")),
                    stringVal(step.get("actionName")),
                    stringVal(step.get("name")),
                    "Approval gate"
                );
                return Optional.of(label);
            }
        }
        return Optional.empty();
    }

    private Optional<DecisionMeta> extractDecision(UtmPlaybookExecution row) {
        List<Map<String, Object>> steps = readSteps(row.getStepsLog());
        for (int i = steps.size() - 1; i >= 0; i--) {
            Map<String, Object> step = steps.get(i);
            String type = stringVal(step.get("stepType"));
            String status = stringVal(step.get("status"));
            if (!"approval".equalsIgnoreCase(type)
                && !"approved".equalsIgnoreCase(status)
                && !"rejected".equalsIgnoreCase(status)) {
                continue;
            }
            boolean approved = "approved".equalsIgnoreCase(status)
                || (step.get("output") instanceof Map<?, ?> out && Boolean.TRUE.equals(out.get("approved")));
            boolean rejected = "rejected".equalsIgnoreCase(status)
                || (step.get("output") instanceof Map<?, ?> out && Boolean.FALSE.equals(out.get("approved")));
            if (!approved && !rejected) {
                continue;
            }
            String actor = "operator";
            String reason = null;
            Instant at = null;
            if (step.get("output") instanceof Map<?, ?> output) {
                if (output.get("actor") != null) {
                    actor = String.valueOf(output.get("actor"));
                }
                if (output.get("reason") != null) {
                    reason = String.valueOf(output.get("reason"));
                }
            }
            if (step.get("timestamp") != null) {
                try {
                    at = Instant.parse(String.valueOf(step.get("timestamp")));
                } catch (Exception ignored) {
                    // leave null
                }
            }
            if (at == null && row.getEndedAt() != null && rejected) {
                at = row.getEndedAt();
            }
            return Optional.of(new DecisionMeta(approved, actor, reason, at));
        }
        return Optional.empty();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readSteps(String stepsLogJson) {
        if (stepsLogJson == null || stepsLogJson.isBlank()) {
            return List.of();
        }
        try {
            Map<String, Object> meta = objectMapper.readValue(
                stepsLogJson, new TypeReference<Map<String, Object>>() {});
            Object steps = meta.get("steps");
            if (steps instanceof List<?> list) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) {
                        out.add(new LinkedHashMap<>((Map<String, Object>) m));
                    }
                }
                return out;
            }
            return List.of();
        } catch (Exception mapParseFailed) {
            try {
                List<Map<String, Object>> asArray = objectMapper.readValue(
                    stepsLogJson, new TypeReference<>() {});
                return asArray != null ? asArray : List.of();
            } catch (Exception ignored) {
                return List.of();
            }
        }
    }

    private static String stringVal(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private static int normalizeLimit(Integer limit) {
        if (limit == null || limit < 1) {
            return 100;
        }
        return Math.min(limit, MAX_LIMIT);
    }

    private record DecisionMeta(boolean approved, String actor, String reason, Instant at) {}
}
