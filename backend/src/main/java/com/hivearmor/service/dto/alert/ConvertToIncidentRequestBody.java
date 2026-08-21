package com.hivearmor.service.dto.alert;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.hivearmor.service.dto.auditable.AuditableDTO;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
public class ConvertToIncidentRequestBody implements AuditableDTO {
    @JsonAlias({"alertIds"})
    private List<String> eventIds;

    @JsonAlias({"title"})
    @Pattern(regexp = "^[^\"]*$", message = "Double quotes are not allowed")
    private String incidentName;

    private Integer incidentId;

    private String incidentSource;

    public List<String> resolvedAlertIds() {
        return eventIds;
    }

    public Integer resolvedIncidentId() {
        return incidentId == null ? 0 : incidentId;
    }

    public String resolvedIncidentSource() {
        return incidentSource == null || incidentSource.isBlank() ? "alert" : incidentSource;
    }

    @Override
    public Map<String, Object> toAuditMap() {
        return Map.of(
                "eventIds", eventIds == null ? List.of() : eventIds,
                "incidentName", incidentName == null ? "" : incidentName,
                "incidentId", resolvedIncidentId(),
                "incidentSource", resolvedIncidentSource()
        );
    }
}
