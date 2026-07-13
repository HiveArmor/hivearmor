package com.hivearmor.domain.correlation.rules;

import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.GenericGenerator;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_rule_push_log")
@Getter
@Setter
public class UtmRulePushLog implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GenericGenerator(name = "CustomIdentityGenerator", type = com.hivearmor.util.CustomIdentityGenerator.class)
    @GeneratedValue(generator = "CustomIdentityGenerator")
    private Long id;

    @Column(name = "rule_id", nullable = false)
    private Long ruleId;

    @Column(name = "rule_name", nullable = false, length = 200)
    private String ruleName;

    @Column(name = "agent_id", nullable = false, length = 150)
    private String agentId;

    @Column(name = "pushed_at", nullable = false)
    private Instant pushedAt;

    @Column(name = "push_status", nullable = false, length = 20)
    private String pushStatus;

    @Column(name = "error_msg", columnDefinition = "TEXT")
    private String errorMsg;

    @Column(name = "ack_at")
    private Instant ackAt;
}
