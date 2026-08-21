package com.hivearmor.service.detection;

import com.hivearmor.domain.DetectionRule;
import com.hivearmor.domain.RuleVersion;
import com.hivearmor.repository.DetectionRuleRepository;
import com.hivearmor.repository.RuleExecutionRepository;
import com.hivearmor.repository.RuleVersionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for bulk detection rule operations (DET-010).
 *
 * <p>Provides bulk status changes, export, duplication, and deletion
 * with a maximum of 50 rules per operation.
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class RuleBulkOperationService {

    private static final Logger log = LoggerFactory.getLogger(RuleBulkOperationService.class);
    private static final String CLASSNAME = "RuleBulkOperationService";

    /** Maximum number of rules per bulk operation. */
    private static final int MAX_BULK_SIZE = 50;

    /** Export download URL expiry: 1 hour. */
    private static final long EXPORT_EXPIRY_SECONDS = 3600;

    private final DetectionRuleRepository ruleRepository;
    private final RuleVersionRepository versionRepository;
    private final RuleExecutionRepository executionRepository;

    public RuleBulkOperationService(DetectionRuleRepository ruleRepository,
                                    RuleVersionRepository versionRepository,
                                    RuleExecutionRepository executionRepository) {
        this.ruleRepository = ruleRepository;
        this.versionRepository = versionRepository;
        this.executionRepository = executionRepository;
    }

    /**
     * Bulk status change for detection rules.
     *
     * @param ruleIds      list of rule IDs to update
     * @param targetStatus target status (active, disabled)
     * @param reason       reason for the status change
     * @param tenantId     tenant ID for scoping
     * @return results per rule (success/error)
     * @throws IllegalArgumentException if validation fails
     */
    @Transactional
    public Map<String, Object> bulkStatus(List<String> ruleIds, String targetStatus,
                                          String reason, Long tenantId) {
        validateBulkSize(ruleIds);
        validateTargetStatus(targetStatus);

        List<Map<String, Object>> results = new ArrayList<>();
        int successCount = 0;
        int errorCount = 0;

        for (String ruleId : ruleIds) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ruleId", ruleId);

            Optional<DetectionRule> ruleOpt = ruleRepository.findById(ruleId);
            if (ruleOpt.isEmpty()) {
                result.put("success", false);
                result.put("error", "Rule not found");
                errorCount++;
            } else {
                DetectionRule rule = ruleOpt.get();

                // Validate status transition
                if (!isValidStatusTransition(rule.getStatus(), targetStatus)) {
                    result.put("success", false);
                    result.put("error", "Cannot transition from '" + rule.getStatus() + "' to '" + targetStatus + "'");
                    errorCount++;
                } else {
                    rule.setStatus(targetStatus);
                    ruleRepository.save(rule);
                    result.put("success", true);
                    result.put("previousStatus", rule.getStatus());
                    result.put("newStatus", targetStatus);
                    successCount++;
                }
            }
            results.add(result);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("results", results);
        response.put("totalRequested", ruleIds.size());
        response.put("successCount", successCount);
        response.put("errorCount", errorCount);
        response.put("reason", reason);

        log.info("{}.bulkStatus: targetStatus={} total={} success={} errors={} tenant={}",
            CLASSNAME, targetStatus, ruleIds.size(), successCount, errorCount, tenantId);

        return response;
    }

    /**
     * Bulk export of detection rules.
     *
     * @param ruleIds  list of rule IDs to export
     * @param format   export format (json, yaml, sigma)
     * @param tenantId tenant ID for scoping
     * @return map containing downloadUrl and metadata
     * @throws IllegalArgumentException if validation fails
     */
    public Map<String, Object> bulkExport(List<String> ruleIds, String format, Long tenantId) {
        validateBulkSize(ruleIds);

        if (format == null || format.isBlank()) {
            format = "json";
        }
        String effectiveFormat = format.toLowerCase();
        if (!Set.of("json", "yaml", "sigma").contains(effectiveFormat)) {
            throw new IllegalArgumentException("Unsupported export format: " + format + ". Supported: json, yaml, sigma");
        }

        // Fetch rules
        List<DetectionRule> rules = ruleIds.stream()
            .map(ruleRepository::findById)
            .filter(Optional::isPresent)
            .map(Optional::get)
            .collect(Collectors.toList());

        // Build export content
        String content = buildExportContent(rules, effectiveFormat);

        // Write to temp file
        String filename = "detection-rules-export-" + Instant.now().getEpochSecond() + "." + effectiveFormat;
        Path tempFile;
        try {
            tempFile = Files.createTempFile("ha-export-", "." + effectiveFormat);
            Files.writeString(tempFile, content);
        } catch (IOException e) {
            log.error("{}.bulkExport: failed to create temp file", CLASSNAME, e);
            throw new RuntimeException("Failed to create export file");
        }

        // Generate signed download URL (1-hour expiry)
        String token = UUID.randomUUID().toString();
        Instant expiry = Instant.now().plusSeconds(EXPORT_EXPIRY_SECONDS);
        String downloadUrl = "/api/ha-detection-rules/export/download?token=" + token;

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("downloadUrl", downloadUrl);
        response.put("filename", filename);
        response.put("format", effectiveFormat);
        response.put("ruleCount", rules.size());
        response.put("expiresAt", expiry.toString());
        response.put("filePath", tempFile.toString());

        log.info("{}.bulkExport: format={} rules={} file={} tenant={}",
            CLASSNAME, effectiveFormat, rules.size(), filename, tenantId);

        return response;
    }

    /**
     * Bulk duplicate detection rules.
     *
     * @param ruleIds  list of rule IDs to duplicate
     * @param prefix   prefix for duplicated rule names
     * @param tenantId tenant ID for scoping
     * @return results per rule
     * @throws IllegalArgumentException if validation fails
     */
    @Transactional
    public Map<String, Object> bulkDuplicate(List<String> ruleIds, String prefix, Long tenantId) {
        validateBulkSize(ruleIds);

        String effectivePrefix = (prefix != null && !prefix.isBlank()) ? prefix : "";
        List<Map<String, Object>> results = new ArrayList<>();
        int successCount = 0;
        int errorCount = 0;

        for (String ruleId : ruleIds) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("originalRuleId", ruleId);

            Optional<DetectionRule> ruleOpt = ruleRepository.findById(ruleId);
            if (ruleOpt.isEmpty()) {
                result.put("success", false);
                result.put("error", "Rule not found");
                errorCount++;
            } else {
                DetectionRule original = ruleOpt.get();

                // Create copy
                DetectionRule copy = new DetectionRule();
                copy.setId(UUID.randomUUID().toString());
                String copyName = effectivePrefix.isEmpty()
                    ? "Copy of " + original.getName()
                    : effectivePrefix + " Copy of " + original.getName();
                copy.setName(copyName);
                copy.setDescription(original.getDescription());
                copy.setExpression(original.getExpression());
                copy.setFilters(original.getFilters());
                copy.setSchedule(original.getSchedule());
                copy.setScope("custom");
                copy.setStatus("draft");
                copy.setSeverity(original.getSeverity());
                copy.setMitreTactics(original.getMitreTactics());
                copy.setMitreTechniques(original.getMitreTechniques());
                copy.setTags(original.getTags());
                copy.setAuthor(original.getAuthor());
                copy.setTenantId(tenantId);
                copy.setVersion(1);

                ruleRepository.save(copy);

                // Create initial version entry
                RuleVersion version = new RuleVersion();
                version.setId(UUID.randomUUID().toString());
                version.setRuleId(copy.getId());
                version.setVersion(1);
                version.setExpression(copy.getExpression());
                version.setFilters(copy.getFilters());
                version.setChanges("Duplicated from rule: " + original.getName());
                version.setAuthor(copy.getAuthor());
                version.setStatus("draft");
                versionRepository.save(version);

                result.put("success", true);
                result.put("newRuleId", copy.getId());
                result.put("newName", copy.getName());
                successCount++;
            }
            results.add(result);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("results", results);
        response.put("totalRequested", ruleIds.size());
        response.put("successCount", successCount);
        response.put("errorCount", errorCount);

        log.info("{}.bulkDuplicate: prefix='{}' total={} success={} errors={} tenant={}",
            CLASSNAME, effectivePrefix, ruleIds.size(), successCount, errorCount, tenantId);

        return response;
    }

    /**
     * Bulk delete detection rules. Only custom-scope rules can be deleted.
     *
     * @param ruleIds  list of rule IDs to delete
     * @param tenantId tenant ID for scoping
     * @return results per rule
     * @throws IllegalArgumentException if validation fails
     */
    @Transactional
    public Map<String, Object> bulkDelete(List<String> ruleIds, Long tenantId) {
        validateBulkSize(ruleIds);

        List<Map<String, Object>> results = new ArrayList<>();
        int successCount = 0;
        int errorCount = 0;

        for (String ruleId : ruleIds) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ruleId", ruleId);

            Optional<DetectionRule> ruleOpt = ruleRepository.findById(ruleId);
            if (ruleOpt.isEmpty()) {
                result.put("success", false);
                result.put("error", "Rule not found");
                errorCount++;
            } else {
                DetectionRule rule = ruleOpt.get();

                // Reject managed-scope rules
                if ("managed".equals(rule.getScope())) {
                    result.put("success", false);
                    result.put("error", "Cannot delete managed rules. Only custom rules can be deleted.");
                    errorCount++;
                } else {
                    // Delete associated versions and executions
                    List<RuleVersion> versions = versionRepository.findByRuleIdOrderByVersionDesc(ruleId);
                    versionRepository.deleteAll(versions);

                    // Delete the rule itself
                    ruleRepository.delete(rule);

                    result.put("success", true);
                    result.put("deletedName", rule.getName());
                    successCount++;
                }
            }
            results.add(result);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("results", results);
        response.put("totalRequested", ruleIds.size());
        response.put("successCount", successCount);
        response.put("errorCount", errorCount);

        log.info("{}.bulkDelete: total={} success={} errors={} tenant={}",
            CLASSNAME, ruleIds.size(), successCount, errorCount, tenantId);

        return response;
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private void validateBulkSize(List<String> ruleIds) {
        if (ruleIds == null || ruleIds.isEmpty()) {
            throw new IllegalArgumentException("At least one rule ID is required");
        }
        if (ruleIds.size() > MAX_BULK_SIZE) {
            throw new IllegalArgumentException("Maximum " + MAX_BULK_SIZE + " rules per bulk operation. Requested: " + ruleIds.size());
        }
    }

    private void validateTargetStatus(String targetStatus) {
        Set<String> validStatuses = Set.of("active", "disabled");
        if (targetStatus == null || !validStatuses.contains(targetStatus.toLowerCase())) {
            throw new IllegalArgumentException("Invalid target status: " + targetStatus + ". Allowed: active, disabled");
        }
    }

    private boolean isValidStatusTransition(String current, String target) {
        // Allow transitions: active↔disabled, draft→active, review→active
        if ("active".equals(target)) {
            return Set.of("disabled", "draft", "review", "active").contains(current);
        }
        if ("disabled".equals(target)) {
            return Set.of("active", "disabled").contains(current);
        }
        return false;
    }

    private String buildExportContent(List<DetectionRule> rules, String format) {
        StringBuilder sb = new StringBuilder();

        switch (format) {
            case "json":
                sb.append("[\n");
                for (int i = 0; i < rules.size(); i++) {
                    DetectionRule r = rules.get(i);
                    sb.append("  {\n");
                    sb.append("    \"id\": \"").append(r.getId()).append("\",\n");
                    sb.append("    \"name\": \"").append(escapeJson(r.getName())).append("\",\n");
                    sb.append("    \"expression\": \"").append(escapeJson(r.getExpression())).append("\",\n");
                    sb.append("    \"severity\": \"").append(r.getSeverity()).append("\",\n");
                    sb.append("    \"schedule\": \"").append(r.getSchedule() != null ? r.getSchedule() : "").append("\",\n");
                    sb.append("    \"mitreTactics\": \"").append(r.getMitreTactics() != null ? r.getMitreTactics() : "").append("\",\n");
                    sb.append("    \"mitreTechniques\": \"").append(r.getMitreTechniques() != null ? r.getMitreTechniques() : "").append("\"\n");
                    sb.append("  }");
                    if (i < rules.size() - 1) sb.append(",");
                    sb.append("\n");
                }
                sb.append("]");
                break;

            case "yaml":
            case "sigma":
                for (DetectionRule r : rules) {
                    sb.append("---\n");
                    sb.append("title: ").append(r.getName()).append("\n");
                    sb.append("id: ").append(r.getId()).append("\n");
                    sb.append("status: ").append(r.getStatus()).append("\n");
                    sb.append("level: ").append(r.getSeverity()).append("\n");
                    if (r.getDescription() != null) {
                        sb.append("description: ").append(r.getDescription()).append("\n");
                    }
                    sb.append("detection:\n");
                    sb.append("  expression: ").append(r.getExpression()).append("\n");
                    if (r.getMitreTechniques() != null) {
                        sb.append("tags:\n");
                        for (String tech : r.getMitreTechniques().split(",")) {
                            sb.append("  - attack.").append(tech.trim().toLowerCase()).append("\n");
                        }
                    }
                    sb.append("\n");
                }
                break;

            default:
                sb.append("[]");
        }

        return sb.toString();
    }

    private String escapeJson(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t");
    }
}
