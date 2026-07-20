package com.hivearmor.service.mapper.compliance;

import com.hivearmor.service.dto.compliance.UtmComplianceControlConfigDto;
import com.hivearmor.service.dto.compliance.UtmComplianceControlLatestEvaluationDto;
import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryDto;

import java.time.Instant;
import java.util.Map;

public class UtmComplianceControlLatestEvaluationMapper {

    public static UtmComplianceControlLatestEvaluationDto toDto(
            UtmComplianceControlConfigDto control,
            UtmComplianceControlEvaluationHistoryDto controlEvaluationHistory
    ) {
        UtmComplianceControlLatestEvaluationDto dto = new UtmComplianceControlLatestEvaluationDto();

        dto.setId(control.getId());
        dto.setStandardSectionId(control.getStandardSectionId());
        dto.setSection(control.getSection());
        dto.setControlName(control.getControlName());
        dto.setControlSolution(control.getControlSolution());
        dto.setControlRemediation(control.getControlRemediation());
        dto.setControlStrategy(control.getControlStrategy());
        dto.setQueriesConfigs(control.getQueriesConfigs());

        if (controlEvaluationHistory != null) {
            dto.setLastEvaluationStatus(controlEvaluationHistory.getStatus());
            dto.setLastEvaluationTimestamp(
                    controlEvaluationHistory.getTimestamp() != null ? controlEvaluationHistory.getTimestamp().toString() : null
            );
        }

        return dto;
    }

    public static UtmComplianceControlEvaluationHistoryDto mapToEvaluationDto(Map<String, Object> source) {
        if (source == null) {
            return null;
        }

        UtmComplianceControlEvaluationHistoryDto dto = new UtmComplianceControlEvaluationHistoryDto();
        // Evidence docs use camelCase field names written by the Go compliance writer.
        dto.setControlId(getLong(source.get("controlId") != null ? source.get("controlId") : source.get("control_id")));
        dto.setControlName(getString(source.get("controlName") != null ? source.get("controlName") : source.get("control_name")));

        // Derive PASS/FAIL status from mappingType: EVIDENCE → PASS, VIOLATION → FAIL.
        String rawStatus = getString(source.get("status"));
        String mappingType = getString(source.get("mappingType"));
        if (rawStatus == null && mappingType != null) {
            rawStatus = mappingType.equalsIgnoreCase("EVIDENCE") ? "PASS"
                      : mappingType.equalsIgnoreCase("VIOLATION") ? "FAIL"
                      : "PARTIAL";
        }
        dto.setStatus(rawStatus);

        Object ts = source.get("@timestamp") != null ? source.get("@timestamp") : source.get("timestamp");
        if (ts != null) {
            try { dto.setTimestamp(Instant.parse(ts.toString())); } catch (Exception ignored) {}
        }

        return dto;
    }

    private static String getString(Object o) {
        return o != null ? o.toString() : null;
    }

    private static Long getLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        return Long.parseLong(o.toString());
    }
}
