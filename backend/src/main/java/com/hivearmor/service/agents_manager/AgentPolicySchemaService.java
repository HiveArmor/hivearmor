package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Normalizes and validates agent policy {@code policyConfig} as schema v1.
 *
 * <p>SoT for APPLY_POLICY is {@code /api/agent-policies} ({@code UtmAgentPolicy.policyConfig}).
 * Ha EDR policies ({@code /api/ha-edr/policies}) remain a separate UI plane; use
 * {@link #fromHaColumns} to project Ha {@code filePaths} into schema v1 when bridging.
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.
 */
@Service
public class AgentPolicySchemaService {

    private static final Logger log = LoggerFactory.getLogger(AgentPolicySchemaService.class);

    private final ObjectMapper objectMapper;

    public AgentPolicySchemaService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Ensures stored/served {@code policyConfig} is valid schema v1 JSON.
     * Empty / blank / {@code {}} yields a minimal defaults document (agent-safe).
     *
     * @throws IllegalArgumentException when JSON is malformed or violates schema v1 rules
     */
    public String normalizePolicyConfig(String raw) {
        try {
            AgentPolicySchemaV1 doc = parseOrDefault(raw);
            validate(doc);
            return objectMapper.writeValueAsString(doc);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("policyConfig must be valid JSON: " + e.getOriginalMessage());
        }
    }

    /**
     * Read path: never fail list/get on legacy opaque rows — fall back to defaults.
     * Does not log raw policy payloads (may contain sensitive paths).
     */
    public String normalizePolicyConfigForServe(String raw) {
        try {
            return normalizePolicyConfig(raw);
        } catch (IllegalArgumentException e) {
            log.warn("AgentPolicySchemaService: serving defaults for invalid legacy policyConfig ({})",
                e.getMessage());
            return normalizePolicyConfig("{}");
        }
    }

    /**
     * Projects legacy Ha EDR columns into schema v1 (FIM paths + collector hints).
     * Does not push APPLY_POLICY — caller must write into Utm agent-policies.
     * Registry paths are omitted (not in agent schema v1).
     */
    public String fromHaColumns(List<String> filePaths,
                                Boolean networkMonitor,
                                Boolean processMonitor) {
        AgentPolicySchemaV1 doc = emptyDefaults();
        List<AgentPolicySchemaV1.FimRule> rules = new ArrayList<>();
        if (filePaths != null) {
            for (String path : filePaths) {
                if (!StringUtils.hasText(path)) {
                    continue;
                }
                AgentPolicySchemaV1.FimRule rule = new AgentPolicySchemaV1.FimRule();
                rule.setPath(path.trim());
                rule.setRecursive(true);
                rules.add(rule);
            }
        }
        if (!rules.isEmpty()) {
            AgentPolicySchemaV1.FimSection fim = new AgentPolicySchemaV1.FimSection();
            fim.setMode(AgentPolicySchemaV1.FIM_MODE_MERGE);
            fim.setRules(rules);
            doc.setFim(fim);
        }
        Map<String, Boolean> collectors = AgentPolicySchemaV1.defaultCollectors();
        if (networkMonitor != null) {
            collectors.put("netconn", networkMonitor);
            collectors.put("dns", networkMonitor);
            collectors.put("netflow", networkMonitor);
        }
        if (processMonitor != null) {
            // Process monitor maps to no dedicated schema key; keep collectors as-is.
            // Documented Ha→Utm gap: processMonitor is Ha-only until schema v1.1.
        }
        doc.setCollectors(collectors);
        try {
            return objectMapper.writeValueAsString(doc);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize schema v1 from Ha columns", e);
        }
    }

    AgentPolicySchemaV1 parseOrDefault(String raw) throws JsonProcessingException {
        if (!StringUtils.hasText(raw) || "{}".equals(raw.trim())) {
            return emptyDefaults();
        }
        JsonNode tree = objectMapper.readTree(raw);
        if (tree == null || tree.isNull() || (tree.isObject() && tree.isEmpty())) {
            return emptyDefaults();
        }
        AgentPolicySchemaV1 doc = objectMapper.treeToValue(tree, AgentPolicySchemaV1.class);
        if (doc == null) {
            return emptyDefaults();
        }
        if (doc.getSchemaVersion() == 0) {
            doc.setSchemaVersion(AgentPolicySchemaV1.SCHEMA_VERSION);
        }
        if (doc.getFim() != null && !StringUtils.hasText(doc.getFim().getMode())) {
            doc.getFim().setMode(AgentPolicySchemaV1.FIM_MODE_MERGE);
        }
        if (doc.getCollectors() == null || doc.getCollectors().isEmpty()) {
            doc.setCollectors(AgentPolicySchemaV1.defaultCollectors());
        }
        if (doc.getResponse() == null) {
            AgentPolicySchemaV1.ResponseSection response = new AgentPolicySchemaV1.ResponseSection();
            response.setAllowShell(false);
            doc.setResponse(response);
        }
        return doc;
    }

    void validate(AgentPolicySchemaV1 doc) {
        if (doc.getSchemaVersion() != AgentPolicySchemaV1.SCHEMA_VERSION) {
            throw new IllegalArgumentException(
                "unsupported policy schema_version " + doc.getSchemaVersion()
                    + " (backend emits " + AgentPolicySchemaV1.SCHEMA_VERSION + ")");
        }
        if (doc.getFim() != null) {
            String mode = doc.getFim().getMode();
            if (mode != null) {
                mode = mode.trim().toLowerCase(Locale.ROOT);
                doc.getFim().setMode(mode);
                if (!AgentPolicySchemaV1.FIM_MODE_MERGE.equals(mode)
                    && !AgentPolicySchemaV1.FIM_MODE_REPLACE.equals(mode)) {
                    throw new IllegalArgumentException(
                        "fim.mode must be \"" + AgentPolicySchemaV1.FIM_MODE_MERGE
                            + "\" or \"" + AgentPolicySchemaV1.FIM_MODE_REPLACE + "\"");
                }
            }
            List<AgentPolicySchemaV1.FimRule> rules = doc.getFim().getRules();
            if (rules != null) {
                for (int i = 0; i < rules.size(); i++) {
                    AgentPolicySchemaV1.FimRule rule = rules.get(i);
                    if (rule == null || !StringUtils.hasText(rule.getPath())) {
                        throw new IllegalArgumentException("fim.rules[" + i + "]: path is required");
                    }
                }
            }
        }
    }

    static AgentPolicySchemaV1 emptyDefaults() {
        AgentPolicySchemaV1 doc = new AgentPolicySchemaV1();
        doc.setSchemaVersion(AgentPolicySchemaV1.SCHEMA_VERSION);
        AgentPolicySchemaV1.FimSection fim = new AgentPolicySchemaV1.FimSection();
        fim.setMode(AgentPolicySchemaV1.FIM_MODE_MERGE);
        fim.setRules(new ArrayList<>());
        doc.setFim(fim);
        doc.setCollectors(AgentPolicySchemaV1.defaultCollectors());
        AgentPolicySchemaV1.ResponseSection response = new AgentPolicySchemaV1.ResponseSection();
        response.setAllowShell(false);
        doc.setResponse(response);
        return doc;
    }
}
