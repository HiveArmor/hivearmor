package com.hivearmor.userauditor.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.hivearmor.userauditor.model.audit.Auditable;
import lombok.*;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "hive_source_scan")
@Getter
@Setter
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class SourceScan extends Base implements Auditable {

    @Column(name = "next_execution_date")
    private LocalDateTime executionDate;

    @ManyToOne
    @JoinColumn(name = "user_sources_id")
    @JsonIgnore
    UserSource source;

    @Embedded
    Audit audit;
}
