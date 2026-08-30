package com.hivearmor.service.mapper.compliance;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryDto;
import com.hivearmor.service.dto.compliance.UtmComplianceQueryEvaluationDto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
public class UtmComplianceControlEvaluationHistoryMapper {

    private UtmComplianceControlEvaluationHistoryMapper() {

    }

    public static UtmComplianceControlEvaluationHistoryDto mapToEvaluationDto(Map<String, Object> src) {
        if (src == null) {
            return null;
        }

        Long controlId = getLong(src.get("control_id") != null ? src.get("control_id") : src.get("controlId"));
        if (controlId == null) {
            return null;
        }

        UtmComplianceControlEvaluationHistoryDto dto = new UtmComplianceControlEvaluationHistoryDto();
        dto.setControlId(controlId);
        dto.setControlName(getString(src.get("control_name") != null ? src.get("control_name") : src.get("controlName")));
        dto.setStatus(getString(src.get("status")));

        Object ts = src.get("timestamp") != null ? src.get("timestamp") : src.get("@timestamp");
        if (ts != null) {
            try {
                dto.setTimestamp(Instant.parse(ts.toString()));
            } catch (Exception ignored) {
                // leave timestamp unset when source format is unexpected
            }
        }

        ObjectMapper mapper = new ObjectMapper();
        List<Map<String, Object>> q = mapper.convertValue(src.get("query_evaluations"), new TypeReference<>() {});
        if (q != null) {
            dto.setQueryEvaluations(q.stream()
                    .map(UtmComplianceControlEvaluationHistoryMapper::mapQueryEval)
                    .filter(java.util.Objects::nonNull)
                    .toList());
        }

        return dto;
    }

    private static UtmComplianceQueryEvaluationDto mapQueryEval(Map<String, Object> src) {
        if (src == null) {
            return null;
        }

        UtmComplianceQueryEvaluationDto dto = new UtmComplianceQueryEvaluationDto();

        Long queryConfigId = getLong(src.get("queryConfigId"));
        if (queryConfigId != null) {
            dto.setQueryConfigId(queryConfigId);
        }
        dto.setQueryName(getString(src.get("queryName")));
        dto.setEvaluationRule(getString(src.get("evaluationRule")));

        Object raw = src.get("ruleValue");
        dto.setRuleValue(raw instanceof Number ? ((Number) raw).intValue() : null);

        Number hits = getNumber(src.get("hits"));
        if (hits != null) {
            dto.setHits(hits.intValue());
        }
        dto.setStatus(getString(src.get("status")));

        ObjectMapper mapper = new ObjectMapper();
        List<Map<String, Object>> evidence = mapper.convertValue(src.get("evidence"), new TypeReference<>() {});
        dto.setEvidence(evidence);

        return dto;
    }

    private static String getString(Object o) {
        return o != null ? o.toString() : null;
    }

    private static Long getLong(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(o.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Number getNumber(Object o) {
        return o instanceof Number n ? n : null;
    }
}
