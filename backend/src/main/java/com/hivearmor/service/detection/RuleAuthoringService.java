package com.hivearmor.service.detection;

import com.hivearmor.domain.DetectionRule;
import com.hivearmor.domain.RuleApproval;
import com.hivearmor.domain.RuleVersion;
import com.hivearmor.repository.DetectionRuleRepository;
import com.hivearmor.repository.RuleApprovalRepository;
import com.hivearmor.repository.RuleVersionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for detection rule authoring lifecycle (DET-016).
 *
 * <p>Provides rule creation, editing, versioning, review submission,
 * approval/rejection, and version revert operations.
 *
 * <p>Lifecycle: draft → review → active (published)
 * <ul>
 *   <li>Create: status=draft, version=1</li>
 *   <li>Update: only in draft status, increments version</li>
 *   <li>Submit for review: draft → review (locks editing)</li>
 *   <li>Approve: review → active (SOC_MANAGER only)</li>
 *   <li>Reject: review → draft (unlocks editing)</li>
 *   <li>Revert: copy target version, increment, set draft</li>
 * </ul>
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class RuleAuthoringService {

    private static final Logger log = LoggerFactory.getLogger(RuleAuthoringService.class);
    private static final String CLASSNAME = "RuleAuthoringService";

    private final DetectionRuleRepository ruleRepository;
    private final RuleVersionRepository versionRepository;
    private final RuleApprovalRepository approvalRepository;
    private final DetectionSseService sseService;

    public RuleAuthoringService(DetectionRuleRepository ruleRepository,
                                RuleVersionRepository versionRepository,
                                RuleApprovalRepository approvalRepository,
                                DetectionSseService sseService) {
        this.ruleRepository = ruleRepository;
        this.versionRepository = versionRepository;
        this.approvalRepository = approvalRepository;
        this.sseService = sseService;
    }

    /**
     * Creates a new detection rule as draft.
     *
     * @param body     rule definition fields
     * @param userId   creating user
     * @param tenantId tenant ID
     * @return the created rule with initial version
     */
    @Transactional
    public Map<String, Object> createRule(Map<String, Object> body, String userId, Long tenantId) {
        // Validate required fields
        String name = getStr(body, "name");
        String expression = getStr(body, "expression");
        String severity = getStr(body, "severity");

        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Rule name is required");
        }
        if (expression == null || expression.isBlank()) {
            throw new IllegalArgumentException("CEL expression is required");
        }
        if (severity == null || severity.isBlank()) {
            severity = "medium";
        }

        // Create detection rule
        DetectionRule rule = new DetectionRule();
        rule.setId(UUID.randomUUID().toString());
        rule.setName(name);
        rule.setDescription(getStr(body, "description"));
        rule.setExpression(expression);
        rule.setFilters(getStr(body, "filters"));
        rule.setSchedule(getStr(body, "schedule"));
        rule.setScope("custom");
        rule.setStatus("draft");
        rule.setSeverity(severity);
        rule.setMitreTactics(getStr(body, "mitreTactics"));
        rule.setMitreTechniques(getStr(body, "mitreTechniques"));
        rule.setTags(getStr(body, "tags"));
        rule.setAuthor(userId);
        rule.setTenantId(tenantId);
        rule.setVersion(1);

        ruleRepository.save(rule);

        // Create initial version
        RuleVersion version = new RuleVersion();
        version.setId(UUID.randomUUID().toString());
        version.setRuleId(rule.getId());
        version.setVersion(1);
        version.setExpression(rule.getExpression());
        version.setFilters(rule.getFilters());
        version.setChanges("Initial creation");
        version.setAuthor(userId);
        version.setStatus("draft");
        versionRepository.save(version);

        log.info("{}.createRule: id={} name='{}' user={} tenant={}",
            CLASSNAME, rule.getId(), name, userId, tenantId);

        return buildFullRuleResponse(rule);
    }

    /**
     * Updates an existing detection rule (draft status only).
     *
     * @param ruleId   rule to update
     * @param body     updated fields
     * @param userId   editing user
     * @param tenantId tenant ID
     * @return updated rule
     * @throws NoSuchElementException   if rule not found
     * @throws IllegalArgumentException if rule is not in draft status
     */
    @Transactional
    public Map<String, Object> updateRule(String ruleId, Map<String, Object> body,
                                          String userId, Long tenantId) {
        DetectionRule rule = ruleRepository.findById(ruleId)
            .orElseThrow(() -> new NoSuchElementException("Rule not found: " + ruleId));

        // Validate status — only drafts can be edited
        if (!"draft".equals(rule.getStatus())) {
            throw new IllegalArgumentException("Rule can only be edited in draft status. Current status: " + rule.getStatus());
        }

        // Apply updates
        String changes = buildChangeSummary(rule, body);

        if (body.containsKey("name")) rule.setName(getStr(body, "name"));
        if (body.containsKey("description")) rule.setDescription(getStr(body, "description"));
        if (body.containsKey("expression")) rule.setExpression(getStr(body, "expression"));
        if (body.containsKey("filters")) rule.setFilters(getStr(body, "filters"));
        if (body.containsKey("schedule")) rule.setSchedule(getStr(body, "schedule"));
        if (body.containsKey("severity")) rule.setSeverity(getStr(body, "severity"));
        if (body.containsKey("mitreTactics")) rule.setMitreTactics(getStr(body, "mitreTactics"));
        if (body.containsKey("mitreTechniques")) rule.setMitreTechniques(getStr(body, "mitreTechniques"));
        if (body.containsKey("tags")) rule.setTags(getStr(body, "tags"));

        // Increment version
        rule.setVersion(rule.getVersion() + 1);
        ruleRepository.save(rule);

        // Create version entry
        RuleVersion version = new RuleVersion();
        version.setId(UUID.randomUUID().toString());
        version.setRuleId(ruleId);
        version.setVersion(rule.getVersion());
        version.setExpression(rule.getExpression());
        version.setFilters(rule.getFilters());
        version.setChanges(changes);
        version.setAuthor(userId);
        version.setStatus("draft");
        versionRepository.save(version);

        log.info("{}.updateRule: id={} version={} user={} changes='{}'",
            CLASSNAME, ruleId, rule.getVersion(), userId, changes);

        return buildFullRuleResponse(rule);
    }

    /**
     * Gets full rule details including versions and approvals.
     *
     * @param ruleId   rule ID
     * @param tenantId tenant ID
     * @return full rule with versions and approvals
     * @throws NoSuchElementException if rule not found
     */
    public Map<String, Object> getFullRule(String ruleId, Long tenantId) {
        DetectionRule rule = ruleRepository.findById(ruleId)
            .orElseThrow(() -> new NoSuchElementException("Rule not found: " + ruleId));

        return buildFullRuleResponse(rule);
    }

    /**
     * Submits a rule for review (draft → review).
     *
     * @param ruleId   rule to submit
     * @param userId   submitting user
     * @param tenantId tenant ID
     * @return updated rule
     * @throws NoSuchElementException   if rule not found
     * @throws IllegalArgumentException if rule is not in draft status
     */
    @Transactional
    public Map<String, Object> submitForReview(String ruleId, String userId, Long tenantId) {
        DetectionRule rule = ruleRepository.findById(ruleId)
            .orElseThrow(() -> new NoSuchElementException("Rule not found: " + ruleId));

        if (!"draft".equals(rule.getStatus())) {
            throw new IllegalArgumentException("Only draft rules can be submitted for review. Current status: " + rule.getStatus());
        }

        String previousStatus = rule.getStatus();
        rule.setStatus("review");
        ruleRepository.save(rule);

        // Broadcast status change via SSE
        sseService.broadcastStatusChanged(tenantId, ruleId, rule.getName(), previousStatus, "review");

        log.info("{}.submitForReview: id={} user={}", CLASSNAME, ruleId, userId);

        return buildFullRuleResponse(rule);
    }

    /**
     * Approves a rule (review → active). Requires SOC_MANAGER role.
     *
     * @param ruleId   rule to approve
     * @param comment  approval comment
     * @param userId   approving user (SOC_MANAGER)
     * @param tenantId tenant ID
     * @return updated rule with approval record
     * @throws NoSuchElementException   if rule not found
     * @throws IllegalArgumentException if rule is not in review status
     */
    @Transactional
    public Map<String, Object> approveRule(String ruleId, String comment, String userId, Long tenantId) {
        DetectionRule rule = ruleRepository.findById(ruleId)
            .orElseThrow(() -> new NoSuchElementException("Rule not found: " + ruleId));

        if (!"review".equals(rule.getStatus())) {
            throw new IllegalArgumentException("Only rules in review status can be approved. Current status: " + rule.getStatus());
        }

        String previousStatus = rule.getStatus();
        rule.setStatus("active");
        ruleRepository.save(rule);

        // Create approval record
        RuleApproval approval = new RuleApproval();
        approval.setId(UUID.randomUUID().toString());
        approval.setRuleId(ruleId);
        approval.setVersion(rule.getVersion());
        approval.setReviewer(userId);
        approval.setStatus("approved");
        approval.setComment(comment);
        approval.setTenantId(tenantId);
        approvalRepository.save(approval);

        // Broadcast via SSE
        sseService.broadcastStatusChanged(tenantId, ruleId, rule.getName(), previousStatus, "active");

        log.info("{}.approveRule: id={} version={} reviewer={}", CLASSNAME, ruleId, rule.getVersion(), userId);

        return buildFullRuleResponse(rule);
    }

    /**
     * Rejects a rule (review → draft). Requires SOC_MANAGER role.
     *
     * @param ruleId   rule to reject
     * @param comment  rejection reason
     * @param userId   rejecting user (SOC_MANAGER)
     * @param tenantId tenant ID
     * @return updated rule with rejection record
     * @throws NoSuchElementException   if rule not found
     * @throws IllegalArgumentException if rule is not in review status
     */
    @Transactional
    public Map<String, Object> rejectRule(String ruleId, String comment, String userId, Long tenantId) {
        DetectionRule rule = ruleRepository.findById(ruleId)
            .orElseThrow(() -> new NoSuchElementException("Rule not found: " + ruleId));

        if (!"review".equals(rule.getStatus())) {
            throw new IllegalArgumentException("Only rules in review status can be rejected. Current status: " + rule.getStatus());
        }

        String previousStatus = rule.getStatus();
        rule.setStatus("draft");
        ruleRepository.save(rule);

        // Create rejection record
        RuleApproval rejection = new RuleApproval();
        rejection.setId(UUID.randomUUID().toString());
        rejection.setRuleId(ruleId);
        rejection.setVersion(rule.getVersion());
        rejection.setReviewer(userId);
        rejection.setStatus("rejected");
        rejection.setComment(comment);
        rejection.setTenantId(tenantId);
        approvalRepository.save(rejection);

        // Broadcast via SSE
        sseService.broadcastStatusChanged(tenantId, ruleId, rule.getName(), previousStatus, "draft");

        log.info("{}.rejectRule: id={} version={} reviewer={} reason='{}'",
            CLASSNAME, ruleId, rule.getVersion(), userId, comment);

        return buildFullRuleResponse(rule);
    }

    /**
     * Reverts a rule to a previous version.
     *
     * @param ruleId        rule to revert
     * @param targetVersion version number to revert to
     * @param userId        user performing revert
     * @param tenantId      tenant ID
     * @return updated rule at new version
     * @throws NoSuchElementException   if rule or target version not found
     * @throws IllegalArgumentException if target version is current or invalid
     */
    @Transactional
    public Map<String, Object> revertRule(String ruleId, Integer targetVersion,
                                          String userId, Long tenantId) {
        DetectionRule rule = ruleRepository.findById(ruleId)
            .orElseThrow(() -> new NoSuchElementException("Rule not found: " + ruleId));

        if (targetVersion == null || targetVersion < 1) {
            throw new IllegalArgumentException("Target version must be a positive integer");
        }

        if (targetVersion.equals(rule.getVersion())) {
            throw new IllegalArgumentException("Cannot revert to current version");
        }

        // Find the target version
        RuleVersion target = versionRepository.findByRuleIdAndVersion(ruleId, targetVersion)
            .orElseThrow(() -> new NoSuchElementException(
                "Version " + targetVersion + " not found for rule " + ruleId));

        // Copy target version's expression and filters
        rule.setExpression(target.getExpression());
        rule.setFilters(target.getFilters());
        rule.setVersion(rule.getVersion() + 1);
        rule.setStatus("draft");
        ruleRepository.save(rule);

        // Create new version entry documenting the revert
        RuleVersion newVersion = new RuleVersion();
        newVersion.setId(UUID.randomUUID().toString());
        newVersion.setRuleId(ruleId);
        newVersion.setVersion(rule.getVersion());
        newVersion.setExpression(rule.getExpression());
        newVersion.setFilters(rule.getFilters());
        newVersion.setChanges("Reverted to version " + targetVersion);
        newVersion.setAuthor(userId);
        newVersion.setStatus("draft");
        versionRepository.save(newVersion);

        log.info("{}.revertRule: id={} revertedTo={} newVersion={} user={}",
            CLASSNAME, ruleId, targetVersion, rule.getVersion(), userId);

        return buildFullRuleResponse(rule);
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private Map<String, Object> buildFullRuleResponse(DetectionRule rule) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", rule.getId());
        response.put("name", rule.getName());
        response.put("description", rule.getDescription());
        response.put("expression", rule.getExpression());
        response.put("filters", rule.getFilters());
        response.put("schedule", rule.getSchedule());
        response.put("scope", rule.getScope());
        response.put("status", rule.getStatus());
        response.put("severity", rule.getSeverity());
        response.put("mitreTactics", rule.getMitreTactics());
        response.put("mitreTechniques", rule.getMitreTechniques());
        response.put("tags", rule.getTags());
        response.put("author", rule.getAuthor());
        response.put("tenantId", rule.getTenantId());
        response.put("version", rule.getVersion());
        response.put("createdAt", rule.getCreatedAt() != null ? rule.getCreatedAt().toString() : null);
        response.put("updatedAt", rule.getUpdatedAt() != null ? rule.getUpdatedAt().toString() : null);

        // Include versions
        List<RuleVersion> versions = versionRepository.findByRuleIdOrderByVersionDesc(rule.getId());
        List<Map<String, Object>> versionList = versions.stream()
            .map(this::buildVersionItem)
            .collect(Collectors.toList());
        response.put("versions", versionList);

        // Include approvals
        List<RuleApproval> approvals = approvalRepository.findByRuleIdOrderByCreatedAtDesc(rule.getId());
        List<Map<String, Object>> approvalList = approvals.stream()
            .map(this::buildApprovalItem)
            .collect(Collectors.toList());
        response.put("approvals", approvalList);

        return response;
    }

    private Map<String, Object> buildVersionItem(RuleVersion version) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", version.getId());
        item.put("version", version.getVersion());
        item.put("expression", version.getExpression());
        item.put("filters", version.getFilters());
        item.put("changes", version.getChanges());
        item.put("author", version.getAuthor());
        item.put("status", version.getStatus());
        item.put("createdAt", version.getCreatedAt() != null ? version.getCreatedAt().toString() : null);
        return item;
    }

    private Map<String, Object> buildApprovalItem(RuleApproval approval) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", approval.getId());
        item.put("version", approval.getVersion());
        item.put("reviewer", approval.getReviewer());
        item.put("status", approval.getStatus());
        item.put("comment", approval.getComment());
        item.put("createdAt", approval.getCreatedAt() != null ? approval.getCreatedAt().toString() : null);
        return item;
    }

    private String buildChangeSummary(DetectionRule original, Map<String, Object> body) {
        List<String> changed = new ArrayList<>();
        if (body.containsKey("expression") && !Objects.equals(original.getExpression(), getStr(body, "expression"))) {
            changed.add("expression");
        }
        if (body.containsKey("filters") && !Objects.equals(original.getFilters(), getStr(body, "filters"))) {
            changed.add("filters");
        }
        if (body.containsKey("name") && !Objects.equals(original.getName(), getStr(body, "name"))) {
            changed.add("name");
        }
        if (body.containsKey("severity") && !Objects.equals(original.getSeverity(), getStr(body, "severity"))) {
            changed.add("severity");
        }
        if (body.containsKey("schedule") && !Objects.equals(original.getSchedule(), getStr(body, "schedule"))) {
            changed.add("schedule");
        }
        return changed.isEmpty() ? "No changes detected" : "Updated: " + String.join(", ", changed);
    }

    private String getStr(Map<String, Object> map, String key) {
        if (map == null) return null;
        Object val = map.get(key);
        return val != null ? val.toString() : null;
    }
}
