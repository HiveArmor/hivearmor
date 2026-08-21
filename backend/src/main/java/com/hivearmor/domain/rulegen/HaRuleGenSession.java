package com.hivearmor.domain.rulegen;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * JPA entity for the {@code ha_rule_gen_session} table.
 *
 * <p>Stores one row per rule generation session. Each session goes through
 * the lifecycle {@code pending_review → approved | rejected}. The raw YAML
 * document produced by the LLM is stored in {@code ruleYaml}; if the session
 * is approved, the output file path is recorded in {@code approvedPath}.
 *
 * @see com.hivearmor.domain.rulegen.HaRuleGenSession.SessionStatus
 */
@Entity
@Table(name = "ha_rule_gen_session")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HaRuleGenSession implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private SessionStatus status;

    @Column(name = "rule_name", length = 255)
    private String ruleName;

    @Lob
    @Column(name = "rule_yaml", nullable = false, columnDefinition = "TEXT")
    private String ruleYaml;

    @Column(name = "signal_key", length = 255)
    private String signalKey;

    @Column(name = "requested_by", length = 128)
    private String requestedBy;

    @Column(name = "approved_path", length = 1024)
    private String approvedPath;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---- equals / hashCode on id ----

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof HaRuleGenSession)) return false;
        HaRuleGenSession other = (HaRuleGenSession) o;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public String toString() {
        return "HaRuleGenSession{" +
            "id=" + id +
            ", status=" + status +
            ", ruleName='" + ruleName + '\'' +
            ", signalKey='" + signalKey + '\'' +
            ", requestedBy='" + requestedBy + '\'' +
            ", approvedPath='" + approvedPath + '\'' +
            ", createdAt=" + createdAt +
            ", updatedAt=" + updatedAt +
            '}';
    }

    // ---- nested enum ----

    /**
     * Lifecycle status of a rule generation session.
     * Values are stored as-is (lowercase snake_case) in the database
     * so the frontend can compare on equality without translation.
     */
    public enum SessionStatus {
        pending_review,
        approved,
        rejected
    }
}
