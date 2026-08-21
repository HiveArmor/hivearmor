package com.hivearmor.service.telemetry;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class EpssFeedParserTest {

    @Test
    void parsesFirstOrgScoresAndSkipsRowsWithoutProbability() throws Exception {
        String body = "{\"status\":\"OK\",\"data\":["
                + "{\"cve\":\"CVE-2021-34527\",\"epss\":\"0.97345\",\"percentile\":\"0.99712\",\"date\":\"2026-08-18\"},"
                + "{\"cve\":\"CVE-1999-0001\",\"percentile\":\"0.1\",\"date\":\"2026-08-18\"}"
                + "]}";
        List<EpssFeedParser.EpssRow> rows = EpssFeedParser.parse(body);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).cve()).isEqualTo("CVE-2021-34527");
        assertThat(rows.get(0).score()).isEqualByComparingTo(new BigDecimal("0.97345"));
        assertThat(rows.get(0).percentile()).isEqualByComparingTo(new BigDecimal("0.99712"));
        assertThat(rows.get(0).asOf()).isEqualTo("2026-08-18");
    }

    @Test
    void emptyDataIsNotAZeroScore() throws Exception {
        assertThat(EpssFeedParser.parse("{\"status\":\"OK\",\"data\":[]}")).isEmpty();
    }
}
