package com.hivearmor.service.telemetry;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VulnRemediationCatalogTest {

    @Test
    void connectorsAreExplicitlyNotConfigured() {
        assertThat(VulnRemediationCatalog.connectors())
                .isNotEmpty()
                .allMatch(item -> "not_configured".equals(item.getState()))
                .allMatch(item -> item.getNote() != null && item.getNote().contains("will not invent"));
    }
}
