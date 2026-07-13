package com.hivearmor.domain.soar_playbook;

import com.hivearmor.service.dto.UtmPlaybookDTO;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.GenericGenerator;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_playbook")
@Getter
@Setter
@EntityListeners(AuditingEntityListener.class)
public class UtmPlaybook implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GenericGenerator(name = "CustomIdentityGenerator", type = com.hivearmor.util.CustomIdentityGenerator.class)
    @GeneratedValue(generator = "CustomIdentityGenerator")
    private Long id;

    @Column(name = "name", length = 200, nullable = false)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "definition_json", nullable = false, columnDefinition = "TEXT")
    private String definitionJson;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "system_owner", nullable = false)
    private Boolean systemOwner = false;

    @CreatedBy
    @Column(name = "created_by", nullable = false, length = 50, updatable = false)
    private String createdBy;

    @CreatedDate
    @Column(name = "created_date", updatable = false)
    private Instant createdDate;

    @LastModifiedBy
    @Column(name = "last_modified_by", length = 50)
    private String lastModifiedBy;

    @LastModifiedDate
    @Column(name = "last_modified_date")
    private Instant lastModifiedDate;

    public UtmPlaybook() {
    }

    public UtmPlaybook(UtmPlaybookDTO dto) {
        this.id = dto.getId();
        this.name = dto.getName();
        this.description = dto.getDescription();
        this.definitionJson = dto.getDefinitionJson();
        this.isActive = dto.getIsActive() != null ? dto.getIsActive() : true;
        this.systemOwner = dto.getSystemOwner() != null ? dto.getSystemOwner() : false;
    }
}
