package com.hivearmor.service.dto.alert;

import com.hivearmor.service.dto.auditable.AuditableDTO;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class UpdateAlertNotesRequestBody implements AuditableDTO {

    @NotEmpty
    private List<String> alertIds;

    @NotNull
    private String note;

    @Override
    public Map<String, Object> toAuditMap() {
        return Map.of(
                "alertIds", alertIds,
                "note", note == null ? "" : note
        );
    }
}
