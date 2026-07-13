package com.hivearmor.domain.logstash_pipeline;

import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.service.logstash_pipeline.enums.PipelineStatus;
import lombok.*;

import jakarta.persistence.*;
import jakarta.validation.constraints.Size;
import java.io.Serializable;

@Entity
@Table(name = "hive_logstash_pipeline")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UtmLogstashPipeline implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false)
    private Long id;

    @Column(name = "pipeline_id")
    private String pipelineId;

    @Size(max = 200)
    @Column(name = "pipeline_name")
    private String pipelineName;

    @Column(name = "pipeline_status")
    private String pipelineStatus;

    @Column(name = "module_name")
    private String moduleName;

    @Column(name = "system_owner")
    private Boolean systemOwner;

    @Size(max = 2000)
    @Column(name = "pipeline_description")
    private String pipelineDescription;

    @Column(name = "pipeline_internal", columnDefinition = "boolean default false")
    private Boolean pipelineInternal = false;

    @Column(name = "events_out")
    private Long eventsOut;

    @OneToOne
    @JoinColumn(name = "module_name", referencedColumnName = "module_name", insertable = false, updatable = false)
    private UtmModule utmModule;

    public void setDefaults() {
        this.systemOwner = false;
        this.pipelineInternal = this.pipelineInternal == null ? false : this.pipelineInternal;
        this.eventsOut = this.eventsOut == null ? 0L : this.eventsOut;
        this.pipelineStatus = PipelineStatus.PIPELINE_STATUS_DOWN.get();
    }
}
