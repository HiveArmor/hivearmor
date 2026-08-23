package com.hivearmor.service.hunt;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HuntFieldRegistrySourceIncludesTest {

    private final HuntFieldRegistry registry = new HuntFieldRegistry();

    @Test
    void sourceIncludesAddsHiveArmorPhysicalFields() {
        List<String> includes = registry.sourceIncludes(registry.boundedProjection(List.of()));

        assertThat(includes).contains(
            "@timestamp",
            "dataSource",
            "event.action",
            "host.name",
            "action",
            "severity",
            "dataType",
            "log",
            "origin",
            "origin.host",
            "origin.user",
            "raw",
            "tenantId"
        );
    }
}
