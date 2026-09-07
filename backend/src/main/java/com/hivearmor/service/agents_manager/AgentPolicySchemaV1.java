package com.hivearmor.service.agents_manager;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Agent policy document schema v1 / v1.1 — must match {@code agent/agent/policy_schema.go}.
 *
 * <p>Wire {@code schema_version} remains {@code 1} for agent compatibility.
 * Optional {@link TelemetrySection} is the additive <strong>v1.1</strong> extension
 * ({@code sca_interval_hours}, {@code sbom_interval_hours}). Unknown fields ignored by the agent.
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AgentPolicySchemaV1 {

    /** Wire major version emitted in {@code schema_version} (agent accepts 0 or 1). */
    public static final int SCHEMA_VERSION = 1;
    /** Feature level documenting additive telemetry + optional fim.registry. */
    public static final String SCHEMA_FEATURE = "1.2";
    public static final String FIM_MODE_MERGE = "merge";
    public static final String FIM_MODE_REPLACE = "replace";
    public static final int DEFAULT_TELEMETRY_INTERVAL_HOURS = 6;
    public static final int MIN_TELEMETRY_INTERVAL_HOURS = 1;
    public static final int MAX_TELEMETRY_INTERVAL_HOURS = 168;

    @JsonProperty("schema_version")
    private int schemaVersion = SCHEMA_VERSION;

    private FimSection fim;

    private Map<String, Boolean> collectors;

    private ResponseSection response;

    /** Optional v1.1 SCA/SBOM schedule (hours). Omitted when unset. */
    private TelemetrySection telemetry;

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public FimSection getFim() {
        return fim;
    }

    public void setFim(FimSection fim) {
        this.fim = fim;
    }

    public Map<String, Boolean> getCollectors() {
        return collectors;
    }

    public void setCollectors(Map<String, Boolean> collectors) {
        this.collectors = collectors;
    }

    public ResponseSection getResponse() {
        return response;
    }

    public void setResponse(ResponseSection response) {
        this.response = response;
    }

    public TelemetrySection getTelemetry() {
        return telemetry;
    }

    public void setTelemetry(TelemetrySection telemetry) {
        this.telemetry = telemetry;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FimSection {
        private String mode;
        private List<FimRule> rules = new ArrayList<>();
        /** Optional Windows registry FIM (agent ignores on non-Windows). */
        private FimRegistrySection registry;

        public String getMode() {
            return mode;
        }

        public void setMode(String mode) {
            this.mode = mode;
        }

        public List<FimRule> getRules() {
            return rules;
        }

        public void setRules(List<FimRule> rules) {
            this.rules = rules;
        }

        public FimRegistrySection getRegistry() {
            return registry;
        }

        public void setRegistry(FimRegistrySection registry) {
            this.registry = registry;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FimRegistrySection {
        private String mode;
        private List<String> keys = new ArrayList<>();

        public String getMode() {
            return mode;
        }

        public void setMode(String mode) {
            this.mode = mode;
        }

        public List<String> getKeys() {
            return keys;
        }

        public void setKeys(List<String> keys) {
            this.keys = keys;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FimRule {
        private String path;
        private boolean recursive;
        private List<String> exclude;

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public boolean isRecursive() {
            return recursive;
        }

        public void setRecursive(boolean recursive) {
            this.recursive = recursive;
        }

        public List<String> getExclude() {
            return exclude;
        }

        public void setExclude(List<String> exclude) {
            this.exclude = exclude;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ResponseSection {
        @JsonProperty("allow_shell")
        private boolean allowShell;

        public boolean isAllowShell() {
            return allowShell;
        }

        public void setAllowShell(boolean allowShell) {
            this.allowShell = allowShell;
        }
    }

    /**
     * Host telemetry schedule (schema v1.1 additive). Agent may ignore until it
     * reads these fields; defaults match today's hardcoded 6h loop.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class TelemetrySection {
        @JsonProperty("sca_interval_hours")
        private Integer scaIntervalHours;

        @JsonProperty("sbom_interval_hours")
        private Integer sbomIntervalHours;

        public Integer getScaIntervalHours() {
            return scaIntervalHours;
        }

        public void setScaIntervalHours(Integer scaIntervalHours) {
            this.scaIntervalHours = scaIntervalHours;
        }

        public Integer getSbomIntervalHours() {
            return sbomIntervalHours;
        }

        public void setSbomIntervalHours(Integer sbomIntervalHours) {
            this.sbomIntervalHours = sbomIntervalHours;
        }
    }

    /**
     * Default collector enablement map (agent treats missing keys as enabled).
     */
    public static Map<String, Boolean> defaultCollectors() {
        Map<String, Boolean> map = new LinkedHashMap<>();
        map.put("fim", true);
        map.put("dns", true);
        map.put("netconn", true);
        map.put("usb", true);
        map.put("netflow", true);
        map.put("syslog", true);
        map.put("file", true);
        return map;
    }
}
