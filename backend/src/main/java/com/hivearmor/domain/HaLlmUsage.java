package com.hivearmor.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * Durable LLM usage / cascade ledger row ({@code ha_llm_usage}).
 *
 * <p>P1 LLMOps — STAGING CANDIDATE. Stores prompt id/hash and token counts only —
 * never prompt bodies, chat content, or secrets.
 */
@Entity
@Table(name = "ha_llm_usage")
public class HaLlmUsage implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String DECISION_CALL_LLM = "CALL_LLM";
    public static final String DECISION_SKIP_LLM = "SKIP_LLM";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "prompt_id", length = 128)
    private String promptId;

    @Column(name = "prompt_hash", length = 64)
    private String promptHash;

    @Column(name = "prompt_tokens")
    private Long promptTokens;

    @Column(name = "completion_tokens")
    private Long completionTokens;

    @Column(name = "total_tokens")
    private Long totalTokens;

    @Column(name = "cascade_decision", nullable = false, length = 32)
    private String cascadeDecision;

    @Column(name = "cascade_reason", length = 64)
    private String cascadeReason;

    @Column(name = "user_login", length = 50)
    private String userLogin;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPromptId() {
        return promptId;
    }

    public void setPromptId(String promptId) {
        this.promptId = promptId;
    }

    public String getPromptHash() {
        return promptHash;
    }

    public void setPromptHash(String promptHash) {
        this.promptHash = promptHash;
    }

    public Long getPromptTokens() {
        return promptTokens;
    }

    public void setPromptTokens(Long promptTokens) {
        this.promptTokens = promptTokens;
    }

    public Long getCompletionTokens() {
        return completionTokens;
    }

    public void setCompletionTokens(Long completionTokens) {
        this.completionTokens = completionTokens;
    }

    public Long getTotalTokens() {
        return totalTokens;
    }

    public void setTotalTokens(Long totalTokens) {
        this.totalTokens = totalTokens;
    }

    public String getCascadeDecision() {
        return cascadeDecision;
    }

    public void setCascadeDecision(String cascadeDecision) {
        this.cascadeDecision = cascadeDecision;
    }

    public String getCascadeReason() {
        return cascadeReason;
    }

    public void setCascadeReason(String cascadeReason) {
        this.cascadeReason = cascadeReason;
    }

    public String getUserLogin() {
        return userLogin;
    }

    public void setUserLogin(String userLogin) {
        this.userLogin = userLogin;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof HaLlmUsage)) {
            return false;
        }
        HaLlmUsage other = (HaLlmUsage) o;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}
