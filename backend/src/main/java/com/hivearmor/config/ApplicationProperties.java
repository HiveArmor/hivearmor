package com.hivearmor.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Properties specific to Utmstack.
 * <p>
 * Properties are configured in the application.yml file. See {@link tech.jhipster.config.JHipsterProperties} for a good
 * example.
 */
@ConfigurationProperties(prefix = "application", ignoreUnknownFields = false)
public class ApplicationProperties {
    private final ApplicationProperties.ChartBuilder chartBuilder = new ApplicationProperties.ChartBuilder();
    private final ApplicationProperties.IncidentResponse incidentResponse = new ApplicationProperties.IncidentResponse();
    private final ApplicationProperties.BrandingProperties branding = new ApplicationProperties.BrandingProperties();

    public ChartBuilder getChartBuilder() {
        return chartBuilder;
    }

    public IncidentResponse getIncidentResponse() {
        return incidentResponse;
    }

    public BrandingProperties getBranding() {
        return branding;
    }

    /**
     * HiveArmor brand configuration.
     * Override via APPLICATION_BRANDING_NAME environment variable.
     */
    public static class BrandingProperties {
        private String name = "HiveArmor";
        private String nameShort = "HA";
        private String supportUrl = "https://support.hivearmor.io";
        private String docsUrl = "https://docs.hivearmor.io";

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getNameShort() { return nameShort; }
        public void setNameShort(String nameShort) { this.nameShort = nameShort; }

        public String getSupportUrl() { return supportUrl; }
        public void setSupportUrl(String supportUrl) { this.supportUrl = supportUrl; }

        public String getDocsUrl() { return docsUrl; }
        public void setDocsUrl(String docsUrl) { this.docsUrl = docsUrl; }
    }

    public static class ChartBuilder {
        private String ipInfoIndexName;

        public ChartBuilder() {
        }

        public String getIpInfoIndexName() {
            return ipInfoIndexName;
        }

        public void setIpInfoIndexName(String ipInfoIndexName) {
            this.ipInfoIndexName = ipInfoIndexName;
        }
    }

    public static class IncidentResponse {
        private Long assetVerificationInterval;

        public Long getAssetVerificationInterval() {
            return assetVerificationInterval;
        }

        public void setAssetVerificationInterval(Long assetVerificationInterval) {
            this.assetVerificationInterval = assetVerificationInterval;
        }
    }
}
