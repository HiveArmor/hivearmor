package com.hivearmor.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Type-safe binding for the {@code hivearmor.*} configuration namespace.
 * <p>
 * Currently only the {@code datasets} list and {@code datasources} list are bound
 * here. Additional sub-namespaces (e.g. {@code hivearmor.ai.*}) should be added
 * as inner classes.
 */
@Component
@ConfigurationProperties(prefix = "hivearmor")
@Getter
@Setter
public class HiveArmorProperties {

    private List<DatasetConfig> datasets = new ArrayList<>();

    /**
     * Seed data sources declared in {@code application.yml} under
     * {@code hivearmor.datasources}. A future sprint will migrate these to a
     * proper JPA-backed table; for now the config list serves as the initial
     * source of truth (Req 8.1, 8.2).
     */
    private List<DataSourceConfig> datasources = new ArrayList<>();

    @Getter
    @Setter
    public static class DatasetConfig {
        private String id;
        private String label;
        private String indexPattern;
        private String description;
    }

    @Getter
    @Setter
    public static class DataSourceConfig {
        /** Unique identifier (UUID or slug). */
        private String id;
        /** Human-readable label. */
        private String name;
        /** Data type token that maps to an OpenSearch index type (e.g. "log", "event"). */
        private String type;
        /** Whether this source is administratively active. */
        private boolean enabled = true;
    }
}
