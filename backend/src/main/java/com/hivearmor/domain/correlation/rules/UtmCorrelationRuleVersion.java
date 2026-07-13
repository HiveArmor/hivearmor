package com.hivearmor.domain.correlation.rules;

import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.GenericGenerator;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_correlation_rule_version")
@Getter
@Setter
public class UtmCorrelationRuleVersion implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GenericGenerator(name = "CustomIdentityGenerator", type = com.hivearmor.util.CustomIdentityGenerator.class)
    @GeneratedValue(generator = "CustomIdentityGenerator")
    private Long id;

    @Column(name = "rule_id", nullable = false)
    private Long ruleId;

    @Column(name = "version_num", nullable = false)
    private Integer versionNum;

    @Column(name = "rule_snapshot", nullable = false, columnDefinition = "TEXT")
    private String ruleSnapshot;

    @Column(name = "changed_by", nullable = false, length = 100)
    private String changedBy;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;

    @Column(name = "change_note", length = 500)
    private String changeNote;
}
