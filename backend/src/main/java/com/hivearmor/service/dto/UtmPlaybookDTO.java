package com.hivearmor.service.dto;

import com.hivearmor.domain.soar_playbook.UtmPlaybook;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UtmPlaybookDTO {

    private Long id;

    @NotBlank
    @Size(max = 200)
    private String name;

    private String description;

    @NotBlank
    private String definitionJson;

    private Boolean isActive;

    private Boolean systemOwner;

    private String createdBy;

    private Instant createdDate;

    private Instant lastModifiedDate;

    public UtmPlaybookDTO(UtmPlaybook entity) {
        this.id = entity.getId();
        this.name = entity.getName();
        this.description = entity.getDescription();
        this.definitionJson = entity.getDefinitionJson();
        this.isActive = entity.getIsActive();
        this.systemOwner = entity.getSystemOwner();
        this.createdBy = entity.getCreatedBy();
        this.createdDate = entity.getCreatedDate();
        this.lastModifiedDate = entity.getLastModifiedDate();
    }
}
