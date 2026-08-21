package com.hivearmor.service.telemetry;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OsvFindingMapperTest {

    @Test
    void keepsCveFromIdAndSkipsGhsaOnly() throws Exception {
        String json = "{\"results\":[{\"vulns\":["
                + "{\"id\":\"GHSA-aaaa\",\"aliases\":[\"CVE-2024-0001\"],\"summary\":\"real\","
                + "\"severity\":[{\"type\":\"CVSS_V3\",\"score\":\"7.5\"}],"
                + "\"database_specific\":{\"severity\":\"HIGH\"}},"
                + "{\"id\":\"GHSA-bbbb\",\"summary\":\"no cve\"}"
                + "]}]}";
        List<OsvFindingMapper.ComponentQuery> queries = List.of(
                new OsvFindingMapper.ComponentQuery("curl", "1.0", "pkg:deb/debian/curl@1.0"));
        List<OsvFindingMapper.FindingRow> rows = OsvFindingMapper.mapQueryBatch(queries, json);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).cveId).isEqualTo("CVE-2024-0001");
        assertThat(rows.get(0).cvssV3).isEqualTo(7.5);
        assertThat(rows.get(0).severity).isEqualTo("HIGH");
        assertThat(rows.get(0).purl).isEqualTo("pkg:deb/debian/curl@1.0");
    }

    @Test
    void doesNotInventNumericCvssFromVector() throws Exception {
        String json = "{\"results\":[{\"vulns\":["
                + "{\"id\":\"CVE-2024-9999\",\"severity\":[{\"type\":\"CVSS_V3\","
                + "\"score\":\"CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H\"}]}"
                + "]}]}";
        List<OsvFindingMapper.ComponentQuery> queries = List.of(
                new OsvFindingMapper.ComponentQuery("openssl", "3.0.2", "pkg:deb/ubuntu/openssl@3.0.2"));
        List<OsvFindingMapper.FindingRow> rows = OsvFindingMapper.mapQueryBatch(queries, json);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).cvssV3).isNull();
    }
}
