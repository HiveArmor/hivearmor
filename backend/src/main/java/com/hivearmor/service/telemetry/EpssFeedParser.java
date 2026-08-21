package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Parses FIRST EPSS JSON. Missing probability/percentile/date are skipped, never synthesized.
 */
public final class EpssFeedParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private EpssFeedParser() {
    }

    public static List<EpssRow> parse(String body) throws Exception {
        JsonNode root = MAPPER.readTree(body);
        JsonNode data = root.path("data");
        List<EpssRow> rows = new ArrayList<>();
        if (!data.isArray()) {
            return rows;
        }
        for (JsonNode item : data) {
            String cve = text(item, "cve");
            BigDecimal score = decimal(item, "epss");
            BigDecimal percentile = decimal(item, "percentile");
            String asOf = text(item, "date");
            if (cve == null || score == null) {
                continue;
            }
            rows.add(new EpssRow(cve, score, percentile, asOf));
        }
        return rows;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String raw = value.asText();
        return raw == null || raw.isBlank() ? null : raw.trim();
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        String raw = text(node, field);
        if (raw == null) {
            return null;
        }
        try {
            return new BigDecimal(raw);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public record EpssRow(String cve, BigDecimal score, BigDecimal percentile, String asOf) {
    }
}
