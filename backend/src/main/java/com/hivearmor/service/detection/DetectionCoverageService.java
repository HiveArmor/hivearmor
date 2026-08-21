package com.hivearmor.service.detection;

import com.hivearmor.domain.DetectionRule;
import com.hivearmor.domain.RuleExecution;
import com.hivearmor.repository.DetectionRuleRepository;
import com.hivearmor.repository.RuleExecutionRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for ATT&amp;CK coverage matrix (DET-015).
 *
 * <p>Calculates detection coverage against the MITRE ATT&amp;CK Enterprise
 * technique list, identifies gaps, and provides import recommendations.
 *
 * <p>Uses a static resource file with 14 tactics and ~200 techniques
 * (updated quarterly).
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class DetectionCoverageService {

    private static final Logger log = LoggerFactory.getLogger(DetectionCoverageService.class);
    private static final String CLASSNAME = "DetectionCoverageService";

    /** Path to ATT&CK technique list resource. */
    private static final String ATTACK_RESOURCE = "detection/attack-techniques.json";

    private final DetectionRuleRepository ruleRepository;
    private final RuleExecutionRepository executionRepository;
    private final ObjectMapper objectMapper;

    /** Loaded ATT&CK matrix data. */
    private List<Map<String, Object>> attackTactics = new ArrayList<>();

    public DetectionCoverageService(DetectionRuleRepository ruleRepository,
                                    RuleExecutionRepository executionRepository,
                                    ObjectMapper objectMapper) {
        this.ruleRepository = ruleRepository;
        this.executionRepository = executionRepository;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void loadAttackMatrix() {
        try {
            ClassPathResource resource = new ClassPathResource(ATTACK_RESOURCE);
            if (resource.exists()) {
                InputStream is = resource.getInputStream();
                attackTactics = objectMapper.readValue(is, new TypeReference<List<Map<String, Object>>>() {});
                log.info("{}.loadAttackMatrix: loaded {} tactics", CLASSNAME, attackTactics.size());
            } else {
                log.warn("{}.loadAttackMatrix: resource not found at {}, using built-in defaults", CLASSNAME, ATTACK_RESOURCE);
                attackTactics = buildDefaultAttackMatrix();
            }
        } catch (Exception e) {
            log.error("{}.loadAttackMatrix: failed to load, using defaults", CLASSNAME, e);
            attackTactics = buildDefaultAttackMatrix();
        }
    }

    /**
     * Gets the ATT&amp;CK coverage matrix for a tenant.
     *
     * @param scope    optional scope filter (managed, custom, or null for all)
     * @param tenantId tenant ID
     * @return coverage matrix with overall score, gaps, and recommendations
     */
    public Map<String, Object> getCoverage(String scope, Long tenantId) {
        // Fetch all rules for tenant (admin/tenantId=0 sees all)
        List<DetectionRule> rules;
        if (tenantId == null || tenantId == 0L) {
            // Admin: fetch all rules across all tenants
            if (scope != null && !scope.isBlank()) {
                rules = ruleRepository.findAll().stream()
                    .filter(r -> scope.equalsIgnoreCase(r.getScope()))
                    .collect(java.util.stream.Collectors.toList());
            } else {
                rules = ruleRepository.findAll();
            }
        } else if (scope != null && !scope.isBlank()) {
            rules = ruleRepository.findByTenantIdAndScope(tenantId, scope);
        } else {
            rules = ruleRepository.findByTenantId(tenantId, org.springframework.data.domain.Pageable.unpaged()).getContent();
        }

        // Build technique→rules mapping
        Map<String, List<DetectionRule>> techniqueRuleMap = buildTechniqueRuleMap(rules);

        // Get recent alerts (last 30 days) per rule
        Instant thirtyDaysAgo = Instant.now().minus(30, ChronoUnit.DAYS);
        Map<String, Integer> ruleAlertCounts = new HashMap<>();
        for (DetectionRule rule : rules) {
            List<RuleExecution> recentExecs = executionRepository.findByRuleIdAndStartedAtBetween(
                rule.getId(), thirtyDaysAgo, Instant.now());
            int alertCount = recentExecs.stream()
                .filter(e -> e.getAlertsGenerated() != null)
                .mapToInt(RuleExecution::getAlertsGenerated)
                .sum();
            ruleAlertCounts.put(rule.getId(), alertCount);
        }

        // Build coverage matrix
        List<Map<String, Object>> matrix = new ArrayList<>();
        List<Map<String, Object>> gaps = new ArrayList<>();
        int totalTechniques = 0;
        int coveredTechniques = 0;

        for (Map<String, Object> tactic : attackTactics) {
            String tacticId = (String) tactic.get("tacticId");
            String tacticName = (String) tactic.get("tacticName");

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> techniques = (List<Map<String, Object>>) tactic.get("techniques");
            if (techniques == null) techniques = Collections.emptyList();

            List<Map<String, Object>> techniqueResults = new ArrayList<>();
            int tacticTotal = techniques.size();
            int tacticCovered = 0;

            for (Map<String, Object> technique : techniques) {
                String techId = (String) technique.get("techniqueId");
                String techName = (String) technique.get("techniqueName");
                String priority = technique.get("priority") != null ? (String) technique.get("priority") : "medium";

                totalTechniques++;

                List<DetectionRule> matchingRules = techniqueRuleMap.getOrDefault(techId, Collections.emptyList());
                int ruleCount = matchingRules.size();

                // Calculate alert count for this technique
                int alertCount30d = matchingRules.stream()
                    .mapToInt(r -> ruleAlertCounts.getOrDefault(r.getId(), 0))
                    .sum();

                // Determine coverage status
                String coverageStatus;
                if (ruleCount > 0 && alertCount30d > 0) {
                    coverageStatus = "covered";
                    coveredTechniques++;
                    tacticCovered++;
                } else if (ruleCount > 0) {
                    coverageStatus = "partial";
                    tacticCovered++;
                    coveredTechniques++;
                } else {
                    coverageStatus = "uncovered";
                    // Add to gaps
                    Map<String, Object> gap = new LinkedHashMap<>();
                    gap.put("techniqueId", techId);
                    gap.put("techniqueName", techName);
                    gap.put("tacticId", tacticId);
                    gap.put("priority", priority);
                    gap.put("reason", "No detection rules mapped to this technique");
                    gaps.add(gap);
                }

                Map<String, Object> techResult = new LinkedHashMap<>();
                techResult.put("techniqueId", techId);
                techResult.put("techniqueName", techName);
                techResult.put("ruleCount", ruleCount);
                techResult.put("alertCount30d", alertCount30d);
                techResult.put("status", coverageStatus);
                techniqueResults.add(techResult);
            }

            double coveragePercent = tacticTotal > 0
                ? Math.round((double) tacticCovered / tacticTotal * 100.0) : 0.0;

            Map<String, Object> tacticResult = new LinkedHashMap<>();
            tacticResult.put("tacticId", tacticId);
            tacticResult.put("tacticName", tacticName);
            tacticResult.put("techniques", techniqueResults);
            tacticResult.put("coveragePercent", coveragePercent);
            matrix.add(tacticResult);
        }

        // Overall score
        double overallScore = totalTechniques > 0
            ? Math.round((double) coveredTechniques / totalTechniques * 100.0) : 0.0;

        // Sort gaps by priority
        gaps.sort((a, b) -> {
            int pa = priorityRank((String) a.get("priority"));
            int pb = priorityRank((String) b.get("priority"));
            return Integer.compare(pb, pa);
        });

        // Build recommendations
        List<Map<String, Object>> recommendations = buildRecommendations(gaps);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("matrix", matrix);
        response.put("overallScore", overallScore);
        response.put("gaps", gaps);
        response.put("recommendations", recommendations);

        log.info("{}.getCoverage: totalTechniques={} covered={} overallScore={}% gaps={} tenant={}",
            CLASSNAME, totalTechniques, coveredTechniques, overallScore, gaps.size(), tenantId);

        return response;
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private Map<String, List<DetectionRule>> buildTechniqueRuleMap(List<DetectionRule> rules) {
        Map<String, List<DetectionRule>> map = new HashMap<>();
        for (DetectionRule rule : rules) {
            if (rule.getMitreTechniques() == null || rule.getMitreTechniques().isBlank()) continue;
            String[] techniques = rule.getMitreTechniques().split(",");
            for (String tech : techniques) {
                String t = tech.trim();
                if (!t.isEmpty()) {
                    map.computeIfAbsent(t, k -> new ArrayList<>()).add(rule);
                }
            }
        }
        return map;
    }

    private List<Map<String, Object>> buildRecommendations(List<Map<String, Object>> gaps) {
        List<Map<String, Object>> recommendations = new ArrayList<>();

        // Known Sigma rules that can address common gaps
        Map<String, Map<String, String>> sigmaRecommendations = Map.of(
            "T1190", Map.of("recommendation", "Import Sigma rule 'Web Application Exploit Detection'",
                "sigmaRuleId", "sigma-web-exploit-001", "effort", "low"),
            "T1055", Map.of("recommendation", "Create custom rule monitoring CreateRemoteThread and WriteProcessMemory calls",
                "sigmaRuleId", "", "effort", "medium"),
            "T1497", Map.of("recommendation", "Import Sigma rule 'Virtualization/Sandbox Evasion Detection'",
                "sigmaRuleId", "sigma-sandbox-evasion-001", "effort", "low"),
            "T1078", Map.of("recommendation", "Import Sigma rule 'Valid Account Usage Detection'",
                "sigmaRuleId", "sigma-valid-accounts-001", "effort", "low"),
            "T1566.001", Map.of("recommendation", "Create email attachment analysis rule using file hash correlation",
                "sigmaRuleId", "", "effort", "high")
        );

        for (Map<String, Object> gap : gaps) {
            String techId = (String) gap.get("techniqueId");
            Map<String, String> sigmaRec = sigmaRecommendations.get(techId);

            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("techniqueId", techId);

            if (sigmaRec != null) {
                rec.put("recommendation", sigmaRec.get("recommendation"));
                String sigmaId = sigmaRec.get("sigmaRuleId");
                rec.put("sigmaRuleId", sigmaId.isEmpty() ? null : sigmaId);
                rec.put("effort", sigmaRec.get("effort"));
            } else {
                rec.put("recommendation", "Create custom detection rule for " + gap.get("techniqueName"));
                rec.put("sigmaRuleId", null);
                rec.put("effort", "medium");
            }

            recommendations.add(rec);
            if (recommendations.size() >= 10) break; // Limit to top 10
        }

        return recommendations;
    }

    private int priorityRank(String priority) {
        if (priority == null) return 0;
        switch (priority) {
            case "critical": return 4;
            case "high": return 3;
            case "medium": return 2;
            case "low": return 1;
            default: return 0;
        }
    }

    /**
     * Builds a default ATT&CK matrix with 14 tactics and representative techniques.
     */
    private List<Map<String, Object>> buildDefaultAttackMatrix() {
        List<Map<String, Object>> tactics = new ArrayList<>();

        tactics.add(buildTactic("TA0001", "Initial Access", List.of(
            tech("T1078", "Valid Accounts", "high"),
            tech("T1566.001", "Spearphishing Attachment", "high"),
            tech("T1190", "Exploit Public-Facing Application", "critical"),
            tech("T1133", "External Remote Services", "medium"),
            tech("T1195", "Supply Chain Compromise", "high")
        )));

        tactics.add(buildTactic("TA0002", "Execution", List.of(
            tech("T1059.001", "PowerShell", "high"),
            tech("T1059.003", "Windows Command Shell", "medium"),
            tech("T1059.005", "Visual Basic", "medium"),
            tech("T1053.005", "Scheduled Task/Job", "medium"),
            tech("T1204.002", "User Execution: Malicious File", "high")
        )));

        tactics.add(buildTactic("TA0003", "Persistence", List.of(
            tech("T1547.001", "Registry Run Keys", "high"),
            tech("T1053.005", "Scheduled Task", "medium"),
            tech("T1136", "Create Account", "medium"),
            tech("T1543.003", "Windows Service", "high"),
            tech("T1546.001", "Change Default File Association", "low")
        )));

        tactics.add(buildTactic("TA0004", "Privilege Escalation", List.of(
            tech("T1548.002", "Bypass UAC", "high"),
            tech("T1134", "Access Token Manipulation", "high"),
            tech("T1068", "Exploitation for Privilege Escalation", "critical"),
            tech("T1055", "Process Injection", "critical")
        )));

        tactics.add(buildTactic("TA0005", "Defense Evasion", List.of(
            tech("T1055", "Process Injection", "critical"),
            tech("T1070.004", "File Deletion", "medium"),
            tech("T1112", "Modify Registry", "medium"),
            tech("T1497", "Virtualization/Sandbox Evasion", "high"),
            tech("T1036", "Masquerading", "high")
        )));

        tactics.add(buildTactic("TA0006", "Credential Access", List.of(
            tech("T1003.001", "LSASS Memory", "critical"),
            tech("T1003", "OS Credential Dumping", "critical"),
            tech("T1558.003", "Kerberoasting", "high"),
            tech("T1110", "Brute Force", "high"),
            tech("T1552", "Unsecured Credentials", "medium")
        )));

        tactics.add(buildTactic("TA0007", "Discovery", List.of(
            tech("T1087", "Account Discovery", "low"),
            tech("T1083", "File and Directory Discovery", "low"),
            tech("T1057", "Process Discovery", "low"),
            tech("T1018", "Remote System Discovery", "medium")
        )));

        tactics.add(buildTactic("TA0008", "Lateral Movement", List.of(
            tech("T1021.002", "SMB/Windows Admin Shares", "high"),
            tech("T1021.001", "Remote Desktop Protocol", "medium"),
            tech("T1570", "Lateral Tool Transfer", "high"),
            tech("T1021.006", "Windows Remote Management", "medium")
        )));

        tactics.add(buildTactic("TA0009", "Collection", List.of(
            tech("T1560", "Archive Collected Data", "medium"),
            tech("T1005", "Data from Local System", "low"),
            tech("T1114", "Email Collection", "medium")
        )));

        tactics.add(buildTactic("TA0010", "Exfiltration", List.of(
            tech("T1048.003", "Exfiltration Over Unencrypted Non-C2 Protocol", "high"),
            tech("T1041", "Exfiltration Over C2 Channel", "high"),
            tech("T1567", "Exfiltration Over Web Service", "medium")
        )));

        tactics.add(buildTactic("TA0011", "Command and Control", List.of(
            tech("T1071.004", "DNS", "high"),
            tech("T1071.001", "Web Protocols", "medium"),
            tech("T1573", "Encrypted Channel", "medium"),
            tech("T1105", "Ingress Tool Transfer", "high")
        )));

        tactics.add(buildTactic("TA0040", "Impact", List.of(
            tech("T1486", "Data Encrypted for Impact", "critical"),
            tech("T1489", "Service Stop", "high"),
            tech("T1529", "System Shutdown/Reboot", "medium"),
            tech("T1490", "Inhibit System Recovery", "critical")
        )));

        tactics.add(buildTactic("TA0042", "Resource Development", List.of(
            tech("T1583", "Acquire Infrastructure", "low"),
            tech("T1588", "Obtain Capabilities", "low"),
            tech("T1585", "Establish Accounts", "low")
        )));

        tactics.add(buildTactic("TA0043", "Reconnaissance", List.of(
            tech("T1595", "Active Scanning", "medium"),
            tech("T1589", "Gather Victim Identity Information", "low"),
            tech("T1590", "Gather Victim Network Information", "medium")
        )));

        return tactics;
    }

    private Map<String, Object> buildTactic(String tacticId, String tacticName,
                                            List<Map<String, Object>> techniques) {
        Map<String, Object> tactic = new LinkedHashMap<>();
        tactic.put("tacticId", tacticId);
        tactic.put("tacticName", tacticName);
        tactic.put("techniques", techniques);
        return tactic;
    }

    private Map<String, Object> tech(String id, String name, String priority) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("techniqueId", id);
        t.put("techniqueName", name);
        t.put("priority", priority);
        return t;
    }
}
