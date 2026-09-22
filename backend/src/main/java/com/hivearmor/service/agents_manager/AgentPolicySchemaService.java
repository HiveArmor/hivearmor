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
 * Normalizes and validates agent policy {@code policyConfig} as schema v1 / v1.1.
 *
 * <p>SoT for APPLY_POLICY is {@code /api/agent-policies} ({@code UtmAgentPolicy.policyConfig}).
 * Ha EDR policies ({@code /api/ha-edr/policies}) remain a separate UI plane; use
 * {@link #fromHaColumns} to project Ha {@code filePaths} into schema v1 when bridging.
 *
 * <p>Schema v1.1 adds optional {@code telemetry.sca_interval_hours} /
 * {@code telemetry.sbom_interval_hours} while keeping wire {@code schema_version: 1}.
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
     * Ensures stored/served {@code policyConfig} is valid schema v1(+telemetry) JSON.
     * Empty / blank / {@code {}} yields a minimal defaults document (agent-safe).
     *
     * @throws IllegalArgumentException when JSON is malformed or violates schema rules
     */
    public String normalizePolicyConfig(String raw) {
        try {
            AgentPolicySchemaV1 doc = parseOrDefault(raw);
            validate(doc);
            normalizeTelemetry(doc);
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
     * PT-1 — library-metadata keys carried by a PT-0 template <em>envelope</em> that are NOT part
     * of the agent wire {@code policyConfig}. They live in dedicated columns
     * ({@code policy_name}, {@code description}, {@code scope}, {@code org_id}, {@code version_num},
     * {@code platform}), so they are stripped before the remaining schema-v1 sections are stored.
     */
    private static final java.util.Set<String> TEMPLATE_ENVELOPE_KEYS =
        java.util.Set.of("name", "description", "scope", "orgId", "org_id", "version", "platform");

    /**
     * PT-1 — accept a full PT-0 template <em>envelope</em> (metadata keys + schema-v1 sections in
     * one JSON object) and return the normalized wire {@code policyConfig}: the schema-v1 sections
     * only, with the library-metadata keys removed. A document that is already a bare wire policy
     * (no envelope keys) is normalized unchanged. This is what lets every PT-0 example template
     * round-trip: the caller maps the metadata keys into columns, this maps the rest into
     * {@code policyConfig}.
     *
     * @throws IllegalArgumentException when JSON is malformed or the sections violate schema rules
     */
    public String policyConfigFromTemplateEnvelope(String rawEnvelope) {
        if (!StringUtils.hasText(rawEnvelope) || "{}".equals(rawEnvelope.trim())) {
            return normalizePolicyConfig("{}");
        }
        try {
            JsonNode tree = objectMapper.readTree(rawEnvelope);
            if (tree == null || tree.isNull() || !tree.isObject()) {
                return normalizePolicyConfig("{}");
            }
            com.fasterxml.jackson.databind.node.ObjectNode obj =
                ((com.fasterxml.jackson.databind.node.ObjectNode) tree).deepCopy();
            obj.remove(TEMPLATE_ENVELOPE_KEYS);
            return normalizePolicyConfig(objectMapper.writeValueAsString(obj));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("policyConfig must be valid JSON: " + e.getOriginalMessage());
        }
    }

    /**
     * PT-1 — pull the library-metadata keys out of a PT-0 template envelope so the caller can map
     * them into columns. Missing keys are left absent (null); {@code org_id} is accepted under
     * either the camelCase ({@code orgId}) or snake_case ({@code org_id}) spelling. Never throws —
     * a non-envelope document simply yields empty metadata. Values are read as text/int only.
     */
    public TemplateEnvelopeMeta extractTemplateMeta(String rawEnvelope) {
        TemplateEnvelopeMeta meta = new TemplateEnvelopeMeta();
        if (!StringUtils.hasText(rawEnvelope)) {
            return meta;
        }
        try {
            JsonNode t = objectMapper.readTree(rawEnvelope);
            if (t == null || !t.isObject()) {
                return meta;
            }
            if (t.hasNonNull("name")) meta.name = t.get("name").asText();
            if (t.hasNonNull("description")) meta.description = t.get("description").asText();
            if (t.hasNonNull("scope")) meta.scope = t.get("scope").asText();
            if (t.hasNonNull("orgId")) meta.orgId = t.get("orgId").asText();
            else if (t.hasNonNull("org_id")) meta.orgId = t.get("org_id").asText();
            if (t.hasNonNull("platform")) meta.platform = t.get("platform").asText();
            if (t.hasNonNull("version") && t.get("version").isInt()) meta.version = t.get("version").asInt();
        } catch (JsonProcessingException e) {
            log.warn("AgentPolicySchemaService: could not parse template envelope metadata ({})", e.getMessage());
        }
        return meta;
    }

    /** PT-1 — library-metadata carried by a PT-0 template envelope (see {@link #extractTemplateMeta}). */
    public static final class TemplateEnvelopeMeta {
        public String name;
        public String description;
        public String scope;
        public String orgId;
        public String platform;
        public Integer version;
    }

    /**
     * Projects legacy Ha EDR columns into schema v1 (FIM paths + optional registry + collector hints).
     * Does not push APPLY_POLICY — caller must write into Utm agent-policies.
     */
    public String fromHaColumns(List<String> filePaths,
                                Boolean networkMonitor,
                                Boolean processMonitor) {
        return fromHaColumns(filePaths, null, networkMonitor, processMonitor);
    }

    /**
     * Projects Ha {@code filePaths} / {@code registryPaths} into schema v1(+registry).
     */
    public String fromHaColumns(List<String> filePaths,
                                List<String> registryPaths,
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
        AgentPolicySchemaV1.FimSection fim = new AgentPolicySchemaV1.FimSection();
        fim.setMode(AgentPolicySchemaV1.FIM_MODE_MERGE);
        fim.setRules(rules);
        if (registryPaths != null) {
            List<String> keys = new ArrayList<>();
            for (String key : registryPaths) {
                if (StringUtils.hasText(key)) {
                    keys.add(key.trim());
                }
            }
            if (!keys.isEmpty()) {
                AgentPolicySchemaV1.FimRegistrySection registry = new AgentPolicySchemaV1.FimRegistrySection();
                registry.setMode(AgentPolicySchemaV1.FIM_MODE_MERGE);
                registry.setKeys(keys);
                fim.setRegistry(registry);
            }
        }
        if (!rules.isEmpty() || fim.getRegistry() != null) {
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
            // Documented Ha→Utm gap: processMonitor is Ha-only until a future schema key.
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
                    + " (backend emits " + AgentPolicySchemaV1.SCHEMA_VERSION
                    + "; feature level " + AgentPolicySchemaV1.SCHEMA_FEATURE + ")");
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
            AgentPolicySchemaV1.FimRegistrySection registry = doc.getFim().getRegistry();
            if (registry != null) {
                String rmode = registry.getMode();
                if (rmode != null) {
                    rmode = rmode.trim().toLowerCase(Locale.ROOT);
                    registry.setMode(rmode);
                    if (!AgentPolicySchemaV1.FIM_MODE_MERGE.equals(rmode)
                        && !AgentPolicySchemaV1.FIM_MODE_REPLACE.equals(rmode)) {
                        throw new IllegalArgumentException(
                            "fim.registry.mode must be \"" + AgentPolicySchemaV1.FIM_MODE_MERGE
                                + "\" or \"" + AgentPolicySchemaV1.FIM_MODE_REPLACE + "\"");
                    }
                }
                List<String> keys = registry.getKeys();
                if (keys != null) {
                    for (int i = 0; i < keys.size(); i++) {
                        if (!StringUtils.hasText(keys.get(i))) {
                            throw new IllegalArgumentException("fim.registry.keys[" + i + "]: key is required");
                        }
                    }
                }
            }
        }
        if (doc.getTelemetry() != null) {
            validateInterval("telemetry.sca_interval_hours", doc.getTelemetry().getScaIntervalHours());
            validateInterval("telemetry.sbom_interval_hours", doc.getTelemetry().getSbomIntervalHours());
        }
    }

    /**
     * When telemetry is present, fill missing interval fields with the 6h default.
     * Absent telemetry stays omitted (agent keeps local hardcoded cadence).
     */
    void normalizeTelemetry(AgentPolicySchemaV1 doc) {
        AgentPolicySchemaV1.TelemetrySection telemetry = doc.getTelemetry();
        if (telemetry == null) {
            return;
        }
        if (telemetry.getScaIntervalHours() == null) {
            telemetry.setScaIntervalHours(AgentPolicySchemaV1.DEFAULT_TELEMETRY_INTERVAL_HOURS);
        }
        if (telemetry.getSbomIntervalHours() == null) {
            telemetry.setSbomIntervalHours(AgentPolicySchemaV1.DEFAULT_TELEMETRY_INTERVAL_HOURS);
        }
        telemetry.setScaIntervalHours(clampInterval(telemetry.getScaIntervalHours()));
        telemetry.setSbomIntervalHours(clampInterval(telemetry.getSbomIntervalHours()));
    }

    private static void validateInterval(String field, Integer hours) {
        if (hours == null) {
            return;
        }
        if (hours < AgentPolicySchemaV1.MIN_TELEMETRY_INTERVAL_HOURS
            || hours > AgentPolicySchemaV1.MAX_TELEMETRY_INTERVAL_HOURS) {
            throw new IllegalArgumentException(
                field + " must be between " + AgentPolicySchemaV1.MIN_TELEMETRY_INTERVAL_HOURS
                    + " and " + AgentPolicySchemaV1.MAX_TELEMETRY_INTERVAL_HOURS);
        }
    }

    private static int clampInterval(int hours) {
        if (hours < AgentPolicySchemaV1.MIN_TELEMETRY_INTERVAL_HOURS) {
            return AgentPolicySchemaV1.MIN_TELEMETRY_INTERVAL_HOURS;
        }
        if (hours > AgentPolicySchemaV1.MAX_TELEMETRY_INTERVAL_HOURS) {
            return AgentPolicySchemaV1.MAX_TELEMETRY_INTERVAL_HOURS;
        }
        return hours;
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
