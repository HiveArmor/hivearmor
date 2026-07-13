package com.hivearmor.service.dto.incident;

import com.hivearmor.service.dto.auditable.AuditableDTO;
import lombok.Getter;
import lombok.Setter;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Setter
@Getter
public class NewIncidentDTO implements AuditableDTO {
    @NotNull
    @Pattern(regexp = "^[^\"]*$", message = "Double quotes are not allowed")
    public String incidentName;
    public String incidentDescription;
    public String incidentAssignedTo;
    public List<RelatedIncidentAlertsDTO> alertList = new ArrayList<>();

    public NewIncidentDTO() {
    }

    @Override
    public Map<String, Object> toAuditMap() {
        List<String> alertIds = alertList == null ? List.of() : alertList.stream()
                .map(RelatedIncidentAlertsDTO::getAlertId)
                .toList();

        return Map.of(
                "incidentName", incidentName,
                "alertIds", alertIds
        );
    }

    @Deprecated
    public String toString() {
        return "{" +
            "incidentName='" + incidentName + '\'' +
            ", incidentDescription='" + incidentDescription + '\'' +
            ", incidentAssignedTo='" + incidentAssignedTo + '\'' +
            ", alertList=" + alertList +
            '}';
    }
}
