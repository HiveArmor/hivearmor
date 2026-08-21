package com.hivearmor.config;

import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * SpringDoc OpenAPI configuration for HiveArmor API.
 *
 * Groups APIs by module and filters to include only /api/ha-* endpoints.
 * Excludes legacy /api/utm-* endpoints and JHipster management endpoints.
 *
 * The global OpenAPI metadata (title, version, security schemes) is provided by
 * {@link OpenApiConfiguration}. This class adds module-level API grouping.
 */
@Configuration
public class SpringDocConfiguration {

    @Bean
    public GroupedOpenApi alertsApi() {
        return GroupedOpenApi.builder()
            .group("alerts")
            .pathsToMatch("/api/ha-alerts/**")
            .pathsToExclude("/api/utm-*/**", "/management/**", "/api/account/**", "/api/admin/**")
            .build();
    }

    @Bean
    public GroupedOpenApi incidentsApi() {
        return GroupedOpenApi.builder()
            .group("incidents")
            .pathsToMatch("/api/ha-incidents/**")
            .pathsToExclude("/api/utm-*/**", "/management/**", "/api/account/**", "/api/admin/**")
            .build();
    }

    @Bean
    public GroupedOpenApi findingsApi() {
        return GroupedOpenApi.builder()
            .group("findings")
            .pathsToMatch("/api/ha-findings/**")
            .pathsToExclude("/api/utm-*/**", "/management/**", "/api/account/**", "/api/admin/**")
            .build();
    }

    @Bean
    public GroupedOpenApi entitiesApi() {
        return GroupedOpenApi.builder()
            .group("entities")
            .pathsToMatch("/api/ha-entities/**")
            .pathsToExclude("/api/utm-*/**", "/management/**", "/api/account/**", "/api/admin/**")
            .build();
    }

    @Bean
    public GroupedOpenApi detectionRulesApi() {
        return GroupedOpenApi.builder()
            .group("detection-rules")
            .pathsToMatch("/api/ha-detection-rules/**")
            .pathsToExclude("/api/utm-*/**", "/management/**", "/api/account/**", "/api/admin/**")
            .build();
    }

    @Bean
    public GroupedOpenApi constellationApi() {
        return GroupedOpenApi.builder()
            .group("constellation")
            .pathsToMatch("/api/ha-graph/**")
            .pathsToExclude("/api/utm-*/**", "/management/**", "/api/account/**", "/api/admin/**")
            .build();
    }

    @Bean
    public GroupedOpenApi severityBoardApi() {
        return GroupedOpenApi.builder()
            .group("severity-board")
            .pathsToMatch("/api/ha-alerts/severity-board/**")
            .pathsToExclude("/api/utm-*/**", "/management/**", "/api/account/**", "/api/admin/**")
            .build();
    }

    @Bean
    public GroupedOpenApi investigationsApi() {
        return GroupedOpenApi.builder()
            .group("investigations")
            .pathsToMatch("/api/ha-investigations/**")
            .pathsToExclude("/api/utm-*/**", "/management/**", "/api/account/**", "/api/admin/**")
            .build();
    }

}
