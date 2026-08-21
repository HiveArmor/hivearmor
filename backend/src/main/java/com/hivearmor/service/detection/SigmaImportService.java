package com.hivearmor.service.detection;

import com.hivearmor.domain.DetectionRule;
import com.hivearmor.domain.RuleVersion;
import com.hivearmor.repository.DetectionRuleRepository;
import com.hivearmor.repository.RuleVersionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for Sigma rule import pipeline (DET-012).
 *
 * <p>Provides 3-step import: validate → preview conversion → execute import.
 * Also handles managed rule update checking.
 *
 * <p>Sigma→CEL conversion:
 * <ul>
 *   <li>selection keywords → celExists + equals</li>
 *   <li>condition logic → &amp;&amp; / ||</li>
 *   <li>modifiers (contains, startswith, endswith, re) → SDK CEL functions</li>
 * </ul>
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class SigmaImportService {

    private static final Logger log = LoggerFactory.getLogger(SigmaImportService.class);
    private static final String CLASSNAME = "SigmaImportService";

    /** Sigma field → ECS field mapping. */
    private static final Map<String, String> SIGMA_TO_ECS_FIELDS = Map.ofEntries(
        Map.entry("CommandLine", "process.command_line"),
        Map.entry("Image", "process.executable"),
        Map.entry("ParentImage", "process.parent.executable"),
        Map.entry("ParentCommandLine", "process.parent.command_line"),
        Map.entry("TargetFilename", "file.path"),
        Map.entry("SourceIp", "source.ip"),
        Map.entry("DestinationIp", "destination.ip"),
        Map.entry("DestinationPort", "destination.port"),
        Map.entry("User", "user.name"),
        Map.entry("ComputerName", "host.name"),
        Map.entry("EventType", "event.type"),
        Map.entry("EventID", "event.action"),
        Map.entry("TargetObject", "registry.path"),
        Map.entry("Details", "registry.value"),
        Map.entry("QueryName", "dns.question.name"),
        Map.entry("DestinationHostname", "url.domain"),
        Map.entry("Hashes", "file.hash.sha256"),
        Map.entry("md5", "file.hash.md5"),
        Map.entry("sha256", "file.hash.sha256"),
        Map.entry("ProcessId", "process.pid"),
        Map.entry("LogonType", "event.action"),
        Map.entry("ServiceName", "service.name")
    );

    /** Sigma logsource → HiveArmor data category mapping. */
    private static final Map<String, String> LOGSOURCE_MAPPING = Map.of(
        "windows/sysmon", "process,network,file",
        "windows/security", "auth,process",
        "windows/powershell", "process",
        "linux/auditd", "process,auth",
        "linux/syslog", "log",
        "generic", "log"
    );

    /** Supported Sigma modifiers. */
    private static final Set<String> SUPPORTED_MODIFIERS = Set.of(
        "contains", "startswith", "endswith", "re", "all", "base64", "cidr"
    );

    private final DetectionRuleRepository ruleRepository;
    private final RuleVersionRepository versionRepository;

    public SigmaImportService(DetectionRuleRepository ruleRepository,
                              RuleVersionRepository versionRepository) {
        this.ruleRepository = ruleRepository;
        this.versionRepository = versionRepository;
    }

    /**
     * Step 1: Validate Sigma rule files.
     *
     * @param sigmaFiles list of Sigma rule definitions (parsed from YAML)
     * @return validation results with candidates, errors, and warnings
     */
    public Map<String, Object> validateImport(List<Map<String, Object>> sigmaFiles) {
        List<Map<String, Object>> candidates = new ArrayList<>();
        List<Map<String, Object>> errors = new ArrayList<>();
        List<Map<String, Object>> warnings = new ArrayList<>();

        for (int i = 0; i < sigmaFiles.size(); i++) {
            Map<String, Object> sigma = sigmaFiles.get(i);
            String sigmaId = getStr(sigma, "id");
            if (sigmaId == null) sigmaId = "file-" + (i + 1);

            // Check required fields
            String title = getStr(sigma, "title");
            if (title == null || title.isBlank()) {
                errors.add(createIssue(sigmaId, "MISSING_TITLE", "Sigma rule must have a 'title' field"));
                continue;
            }

            Object detection = sigma.get("detection");
            if (detection == null) {
                errors.add(createIssue(sigmaId, "MISSING_DETECTION", "Sigma rule must have a 'detection' section"));
                continue;
            }

            // Check logsource compatibility
            Object logsource = sigma.get("logsource");
            if (logsource == null) {
                warnings.add(createIssue(sigmaId, "MISSING_LOGSOURCE", "No logsource defined — will use generic mapping"));
            } else if (logsource instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> ls = (Map<String, Object>) logsource;
                String product = getStr(ls, "product");
                String category = getStr(ls, "category");
                String logsourceKey = (product != null ? product : "generic") + "/" + (category != null ? category : "generic");
                if (!LOGSOURCE_MAPPING.containsKey(logsourceKey) && !LOGSOURCE_MAPPING.containsKey(product + "/" + category)) {
                    warnings.add(createIssue(sigmaId, "UNKNOWN_LOGSOURCE",
                        "Logsource '" + logsourceKey + "' not in known mappings. Will use generic."));
                }
            }

            // Check modifier support
            if (detection instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> det = (Map<String, Object>) detection;
                checkModifierSupport(sigmaId, det, warnings);
            }

            // Build candidate
            Map<String, Object> candidate = new LinkedHashMap<>();
            candidate.put("id", sigmaId);
            candidate.put("title", title);
            candidate.put("description", getStr(sigma, "description"));
            candidate.put("level", getStr(sigma, "level"));
            candidate.put("status", getStr(sigma, "status"));
            candidate.put("logsource", logsource);
            candidate.put("tags", sigma.get("tags"));
            String candidateId = sigmaId;
            candidate.put("compatible", errors.stream().noneMatch(e -> candidateId.equals(e.get("sigmaId"))));
            candidates.add(candidate);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("candidates", candidates);
        response.put("errors", errors);
        response.put("warnings", warnings);
        response.put("totalFiles", sigmaFiles.size());
        response.put("validCount", candidates.stream().filter(c -> Boolean.TRUE.equals(c.get("compatible"))).count());

        log.info("{}.validateImport: files={} valid={} errors={} warnings={}",
            CLASSNAME, sigmaFiles.size(), response.get("validCount"), errors.size(), warnings.size());

        return response;
    }

    /**
     * Step 2: Preview conversion of Sigma rules to CEL.
     *
     * @param candidateIds list of Sigma rule IDs to convert
     * @param sigmaRules   the full Sigma rule data (from step 1)
     * @return converted rules with CEL expressions and field mappings
     */
    public Map<String, Object> previewConversion(List<String> candidateIds,
                                                 List<Map<String, Object>> sigmaRules) {
        List<Map<String, Object>> convertedRules = new ArrayList<>();
        List<Map<String, Object>> mappings = new ArrayList<>();
        List<String> unmapped = new ArrayList<>();

        for (Map<String, Object> sigma : sigmaRules) {
            String sigmaId = getStr(sigma, "id");
            if (sigmaId == null || !candidateIds.contains(sigmaId)) continue;

            // Convert Sigma detection to CEL
            Object detection = sigma.get("detection");
            ConversionResult conversion = convertSigmaToCel(detection);

            // Map fields
            Map<String, String> fieldMap = new LinkedHashMap<>();
            for (String sigmaField : conversion.usedFields) {
                String ecsField = SIGMA_TO_ECS_FIELDS.get(sigmaField);
                if (ecsField != null) {
                    fieldMap.put(sigmaField, ecsField);
                } else {
                    unmapped.add(sigmaField);
                    fieldMap.put(sigmaField, sigmaField.toLowerCase());
                }
            }

            // Extract MITRE from tags
            List<String> mitreTechniques = extractMitreTechniques(sigma.get("tags"));
            List<String> mitreTactics = extractMitreTactics(sigma.get("tags"));

            // Build converted rule
            Map<String, Object> converted = new LinkedHashMap<>();
            converted.put("id", sigmaId);
            converted.put("name", getStr(sigma, "title"));
            converted.put("description", getStr(sigma, "description"));
            converted.put("expression", conversion.celExpression);
            converted.put("severity", mapSigmaLevel(getStr(sigma, "level")));
            converted.put("mitreTactics", String.join(",", mitreTactics));
            converted.put("mitreTechniques", String.join(",", mitreTechniques));
            converted.put("fieldMappings", fieldMap);
            converted.put("schedule", "*/5 * * * *");
            convertedRules.add(converted);

            // Track mappings
            Map<String, Object> mappingEntry = new LinkedHashMap<>();
            mappingEntry.put("sigmaId", sigmaId);
            mappingEntry.put("fieldMap", fieldMap);
            mappings.add(mappingEntry);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("rules", convertedRules);
        response.put("mappings", mappings);
        response.put("unmappedFields", unmapped.stream().distinct().collect(Collectors.toList()));

        log.info("{}.previewConversion: candidates={} converted={} unmapped={}",
            CLASSNAME, candidateIds.size(), convertedRules.size(), unmapped.size());

        return response;
    }

    /**
     * Step 3: Execute import — create detection rules from converted definitions.
     *
     * @param selectedRuleIds IDs of rules to import
     * @param convertedRules  the converted rule definitions (from step 2)
     * @param importAsStatus  status to assign (draft or active)
     * @param userId          user performing the import
     * @param tenantId        tenant ID
     * @return import results
     */
    @Transactional
    public Map<String, Object> executeImport(List<String> selectedRuleIds,
                                             List<Map<String, Object>> convertedRules,
                                             String importAsStatus, String userId, Long tenantId) {
        String effectiveStatus = (importAsStatus != null && Set.of("draft", "active").contains(importAsStatus))
            ? importAsStatus : "draft";

        List<Map<String, Object>> imported = new ArrayList<>();
        List<Map<String, Object>> failed = new ArrayList<>();

        for (Map<String, Object> converted : convertedRules) {
            String sigmaId = getStr(converted, "id");
            if (!selectedRuleIds.contains(sigmaId)) continue;

            try {
                // Create detection rule
                DetectionRule rule = new DetectionRule();
                rule.setId(UUID.randomUUID().toString());
                rule.setName(getStr(converted, "name"));
                rule.setDescription(getStr(converted, "description"));
                rule.setExpression(getStr(converted, "expression"));
                rule.setSchedule(getStr(converted, "schedule"));
                rule.setScope("custom");
                rule.setStatus(effectiveStatus);
                rule.setSeverity(getStr(converted, "severity") != null ? getStr(converted, "severity") : "medium");
                rule.setMitreTactics(getStr(converted, "mitreTactics"));
                rule.setMitreTechniques(getStr(converted, "mitreTechniques"));
                rule.setAuthor(userId);
                rule.setTenantId(tenantId);
                rule.setVersion(1);
                rule.setSigmaSource(sigmaId);

                ruleRepository.save(rule);

                // Create initial version
                RuleVersion version = new RuleVersion();
                version.setId(UUID.randomUUID().toString());
                version.setRuleId(rule.getId());
                version.setVersion(1);
                version.setExpression(rule.getExpression());
                version.setFilters(rule.getFilters());
                version.setChanges("Imported from Sigma rule: " + sigmaId);
                version.setAuthor(userId);
                version.setStatus(effectiveStatus);
                versionRepository.save(version);

                Map<String, Object> importedItem = new LinkedHashMap<>();
                importedItem.put("sigmaId", sigmaId);
                importedItem.put("ruleId", rule.getId());
                importedItem.put("name", rule.getName());
                importedItem.put("status", rule.getStatus());
                imported.add(importedItem);

            } catch (Exception e) {
                Map<String, Object> failedItem = new LinkedHashMap<>();
                failedItem.put("sigmaId", sigmaId);
                failedItem.put("error", e.getMessage());
                failed.add(failedItem);
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalSelected", selectedRuleIds.size());
        summary.put("imported", imported.size());
        summary.put("failed", failed.size());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("imported", imported);
        response.put("failed", failed);
        response.put("summary", summary);

        log.info("{}.executeImport: selected={} imported={} failed={} status={} tenant={}",
            CLASSNAME, selectedRuleIds.size(), imported.size(), failed.size(), effectiveStatus, tenantId);

        return response;
    }

    /**
     * Check for available updates to managed rules.
     *
     * @param tenantId tenant ID
     * @return list of rules with available updates
     */
    public Map<String, Object> checkManagedUpdates(Long tenantId) {
        // Fetch managed rules for tenant
        List<DetectionRule> managedRules = ruleRepository.findByTenantIdAndScope(tenantId, "managed");

        // In production: compare against a known latest version registry
        // For compilation phase, return empty updates (no registry connected)
        List<Map<String, Object>> availableUpdates = new ArrayList<>();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("managedRuleCount", managedRules.size());
        response.put("updatesAvailable", availableUpdates.size());
        response.put("updates", availableUpdates);
        response.put("lastChecked", Instant.now().toString());

        log.info("{}.checkManagedUpdates: managedRules={} updates={} tenant={}",
            CLASSNAME, managedRules.size(), availableUpdates.size(), tenantId);

        return response;
    }

    /**
     * Apply updates to managed rules.
     *
     * @param ruleIds  managed rule IDs to update
     * @param tenantId tenant ID
     * @return update results
     */
    @Transactional
    public Map<String, Object> applyManagedUpdates(List<String> ruleIds, Long tenantId) {
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
                if (!"managed".equals(rule.getScope())) {
                    result.put("success", false);
                    result.put("error", "Only managed rules can receive managed updates");
                    errorCount++;
                } else {
                    // In production: fetch new expression/filters from update registry
                    // and apply them. For now, just increment version.
                    rule.setVersion(rule.getVersion() + 1);
                    ruleRepository.save(rule);

                    RuleVersion version = new RuleVersion();
                    version.setId(UUID.randomUUID().toString());
                    version.setRuleId(ruleId);
                    version.setVersion(rule.getVersion());
                    version.setExpression(rule.getExpression());
                    version.setFilters(rule.getFilters());
                    version.setChanges("Managed update applied");
                    version.setAuthor("system");
                    version.setStatus(rule.getStatus());
                    versionRepository.save(version);

                    result.put("success", true);
                    result.put("newVersion", rule.getVersion());
                    successCount++;
                }
            }
            results.add(result);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("results", results);
        response.put("successCount", successCount);
        response.put("errorCount", errorCount);

        log.info("{}.applyManagedUpdates: requested={} success={} errors={} tenant={}",
            CLASSNAME, ruleIds.size(), successCount, errorCount, tenantId);

        return response;
    }

    // =========================================================================
    // Internal: Sigma→CEL conversion
    // =========================================================================

    private static class ConversionResult {
        String celExpression;
        Set<String> usedFields = new HashSet<>();
    }

    /**
     * Converts Sigma detection logic to a CEL expression.
     */
    private ConversionResult convertSigmaToCel(Object detection) {
        ConversionResult result = new ConversionResult();

        if (detection == null) {
            result.celExpression = "true";
            return result;
        }

        if (detection instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> det = (Map<String, Object>) detection;

            String condition = getStr(det, "condition");
            List<String> celParts = new ArrayList<>();

            for (Map.Entry<String, Object> entry : det.entrySet()) {
                String key = entry.getKey();
                if ("condition".equals(key)) continue;

                Object value = entry.getValue();
                String celClause = convertSelection(key, value, result.usedFields);
                if (celClause != null && !celClause.isBlank()) {
                    celParts.add(celClause);
                }
            }

            if (celParts.isEmpty()) {
                result.celExpression = "true";
            } else if (condition != null && condition.contains(" or ")) {
                result.celExpression = String.join(" || ", celParts);
            } else {
                result.celExpression = String.join(" && ", celParts);
            }

            // Handle 'not' in condition
            if (condition != null && condition.startsWith("not ")) {
                result.celExpression = "!(" + result.celExpression + ")";
            }
        } else {
            result.celExpression = "true";
        }

        return result;
    }

    /**
     * Converts a single Sigma selection block to CEL.
     */
    private String convertSelection(String selectionName, Object selectionValue, Set<String> usedFields) {
        if (selectionValue == null) return null;

        if (selectionValue instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> fields = (Map<String, Object>) selectionValue;
            List<String> fieldClauses = new ArrayList<>();

            for (Map.Entry<String, Object> entry : fields.entrySet()) {
                String fieldSpec = entry.getKey();
                Object fieldValue = entry.getValue();

                // Parse field name and modifier
                String[] parts = fieldSpec.split("\\|");
                String sigmaField = parts[0];
                String modifier = parts.length > 1 ? parts[1] : null;

                // Map to ECS
                String ecsField = SIGMA_TO_ECS_FIELDS.getOrDefault(sigmaField, sigmaField.toLowerCase());
                usedFields.add(sigmaField);

                // Convert based on modifier
                String clause = convertFieldClause(ecsField, modifier, fieldValue);
                if (clause != null) {
                    fieldClauses.add(clause);
                }
            }

            return fieldClauses.isEmpty() ? null : "(" + String.join(" && ", fieldClauses) + ")";
        }

        return null;
    }

    /**
     * Converts a single field comparison to a CEL clause.
     */
    private String convertFieldClause(String ecsField, String modifier, Object value) {
        if (value == null) return "celExists(" + ecsField + ")";

        if (value instanceof List) {
            @SuppressWarnings("unchecked")
            List<Object> values = (List<Object>) value;
            if (modifier != null && "all".equals(modifier)) {
                // All values must match
                List<String> clauses = values.stream()
                    .map(v -> convertSingleValue(ecsField, modifier, v.toString()))
                    .collect(Collectors.toList());
                return "(" + String.join(" && ", clauses) + ")";
            } else {
                // Any value can match (oneOf)
                String valuesStr = values.stream()
                    .map(v -> "\"" + v.toString() + "\"")
                    .collect(Collectors.joining(", "));
                return "oneOf(" + ecsField + ", " + valuesStr + ")";
            }
        }

        return convertSingleValue(ecsField, modifier, value.toString());
    }

    private String convertSingleValue(String ecsField, String modifier, String value) {
        if (modifier == null) {
            return "equals(" + ecsField + ", \"" + value + "\")";
        }

        switch (modifier) {
            case "contains":
                return "contains(" + ecsField + ", \"" + value + "\")";
            case "startswith":
                return "startsWith(" + ecsField + ", \"" + value + "\")";
            case "endswith":
                return "endsWith(" + ecsField + ", \"" + value + "\")";
            case "re":
                return "regexMatch(" + ecsField + ", \"" + value + "\")";
            case "cidr":
                return "inCIDR(" + ecsField + ", \"" + value + "\")";
            default:
                return "equals(" + ecsField + ", \"" + value + "\")";
        }
    }

    // =========================================================================
    // Internal: Helpers
    // =========================================================================

    private void checkModifierSupport(String sigmaId, Map<String, Object> detection,
                                      List<Map<String, Object>> warnings) {
        for (Map.Entry<String, Object> entry : detection.entrySet()) {
            if ("condition".equals(entry.getKey())) continue;
            if (entry.getValue() instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> fields = (Map<String, Object>) entry.getValue();
                for (String fieldSpec : fields.keySet()) {
                    if (fieldSpec.contains("|")) {
                        String modifier = fieldSpec.split("\\|")[1];
                        if (!SUPPORTED_MODIFIERS.contains(modifier)) {
                            warnings.add(createIssue(sigmaId, "UNSUPPORTED_MODIFIER",
                                "Modifier '" + modifier + "' is not supported. Field: " + fieldSpec));
                        }
                    }
                }
            }
        }
    }

    private List<String> extractMitreTechniques(Object tags) {
        if (tags == null) return Collections.emptyList();
        if (tags instanceof List) {
            @SuppressWarnings("unchecked")
            List<String> tagList = (List<String>) tags;
            return tagList.stream()
                .filter(t -> t.startsWith("attack.t") || t.startsWith("attack.T"))
                .map(t -> t.replace("attack.", "").toUpperCase())
                .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }

    private List<String> extractMitreTactics(Object tags) {
        if (tags == null) return Collections.emptyList();
        if (tags instanceof List) {
            @SuppressWarnings("unchecked")
            List<String> tagList = (List<String>) tags;
            return tagList.stream()
                .filter(t -> t.startsWith("attack.") && !t.startsWith("attack.t") && !t.startsWith("attack.T"))
                .map(t -> t.replace("attack.", ""))
                .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }

    private String mapSigmaLevel(String level) {
        if (level == null) return "medium";
        switch (level.toLowerCase()) {
            case "critical": return "critical";
            case "high": return "high";
            case "medium": return "medium";
            case "low": return "low";
            case "informational": return "low";
            default: return "medium";
        }
    }

    private Map<String, Object> createIssue(String sigmaId, String code, String message) {
        Map<String, Object> issue = new LinkedHashMap<>();
        issue.put("sigmaId", sigmaId);
        issue.put("code", code);
        issue.put("message", message);
        return issue;
    }

    private String getStr(Map<String, Object> map, String key) {
        if (map == null) return null;
        Object val = map.get(key);
        return val != null ? val.toString() : null;
    }
}
