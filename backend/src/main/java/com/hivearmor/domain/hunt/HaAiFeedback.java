package com.hivearmor.domain.hunt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;

/**
 * Analyst feedback on an AI verdict/lead (Hunt AI contract §6, HUNT-AI-BACKEND-SCOPE §1d).
 *
 * <p>Each 👍/👎 (and optional correction) is the source data from which the verdict endpoint's
 * {@code AiCalibration} block (agreement rate, sample size, override trend) is computed, scoped
 * by {@code verdictScope}. This is the visible "close the loop" of the AI-SOC design.
 */
@Entity
@Table(name = "ha_ai_feedback")
public class HaAiFeedback implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String TARGET_VERDICT = "verdict";
    public static final String TARGET_LEAD = "lead";
    public static final String VOTE_UP = "up";
    public static final String VOTE_DOWN = "down";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "tenant", length = 200)
    private String tenant;

    @Column(name = "target_type", length = 16, nullable = false)
    private String targetType;

    @Column(name = "target_id", length = 128, nullable = false)
    private String targetId;

    @Column(name = "verdict_scope", length = 128)
    private String verdictScope;

    @Column(name = "vote", length = 8, nullable = false)
    private String vote;

    @Column(name = "corrected_verdict", length = 16)
    private String correctedVerdict;

    @Column(name = "note", columnDefinition = "text")
    private String note;

    @Column(name = "user_login", length = 200)
    private String userLogin;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTenant() { return tenant; }
    public void setTenant(String tenant) { this.tenant = tenant; }

    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }

    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }

    public String getVerdictScope() { return verdictScope; }
    public void setVerdictScope(String verdictScope) { this.verdictScope = verdictScope; }

    public String getVote() { return vote; }
    public void setVote(String vote) { this.vote = vote; }

    public String getCorrectedVerdict() { return correctedVerdict; }
    public void setCorrectedVerdict(String correctedVerdict) { this.correctedVerdict = correctedVerdict; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public String getUserLogin() { return userLogin; }
    public void setUserLogin(String userLogin) { this.userLogin = userLogin; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
