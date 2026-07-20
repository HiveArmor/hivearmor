package com.hivearmor.domain.compliance;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.*;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;

@Getter
@Setter
@Entity
@Table(name = "hive_compliance_control_mapping")
public class UtmComplianceControlMapping implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "control_id", nullable = false)
    @NotNull
    private Long controlId;

    @ManyToOne
    @JoinColumn(name = "control_id", referencedColumnName = "id", insertable = false, updatable = false)
    private UtmComplianceControlConfig control;

    @Column(name = "mapping_type", length = 20, nullable = false)
    @NotBlank
    private String mappingType;

    @Column(name = "data_types", length = 500)
    private String dataTypes;

    @Column(name = "cel_condition", columnDefinition = "TEXT", nullable = false)
    @NotBlank
    private String celCondition;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "weight", precision = 3, scale = 2)
    @DecimalMin("0.0")
    @DecimalMax("1.0")
    private BigDecimal weight = BigDecimal.ONE;

    @Column(name = "evidence_retention_days")
    private Integer evidenceRetentionDays = 90;
}
