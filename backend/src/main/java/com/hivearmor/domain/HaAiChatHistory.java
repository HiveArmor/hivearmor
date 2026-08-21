package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * JPA entity for the {@code ha_ai_chat_history} table.
 *
 * <p>Stores AI chat conversation history and cached triage/incident-summary
 * results per user and context. The {@code messagesJson} column holds the
 * full message list serialised as a JSON string by the service layer.
 *
 * <p>Lifecycle timestamps are managed automatically:
 * <ul>
 *   <li>{@code createdAt} — set once on first persist; never updated ({@code updatable = false}).</li>
 *   <li>{@code updatedAt} — set on first persist and updated on every subsequent update.</li>
 * </ul>
 *
 * <p>No Lombok — all accessors are explicit public methods.
 *
 * @see com.hivearmor.repository.HaAiChatHistoryRepository
 */
@Entity
@Table(name = "ha_ai_chat_history")
public class HaAiChatHistory implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Login (username) of the authenticated user who owns this history row.
     * Derived from the Spring Security {@code Principal} — never from the request body.
     */
    @Column(name = "user_login", nullable = false, length = 50)
    private String userLogin;

    /**
     * Context category for this chat session.
     * Values: {@code alert}, {@code incident}, {@code general}, {@code triage},
     * {@code incident_summary}.
     */
    @Column(name = "context_type", nullable = false, length = 30)
    private String contextType;

    /**
     * Identifier of the alert or incident that provides context.
     * May be {@code null} for general chats.
     */
    @Column(name = "context_id", length = 255)
    private String contextId;

    /**
     * Full message list serialised as a JSON string by the service layer.
     * Stored as an unbounded TEXT column to accommodate arbitrarily long conversations.
     */
    @Lob
    @Column(name = "messages_json", nullable = false, columnDefinition = "TEXT")
    private String messagesJson;

    /**
     * Server timestamp of initial row creation (UTC).
     * Set once by {@link #onCreate()} and never changed thereafter
     * ({@code updatable = false} enforces this at the JPA level).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Server timestamp of the most recent row update (UTC).
     * Set to the same value as {@code createdAt} on first persist by
     * {@link #onCreate()}, and refreshed on every subsequent update by
     * {@link #onUpdate()}.
     */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---- JPA lifecycle callbacks ----

    /**
     * Called before the first INSERT. Sets both {@code createdAt} and
     * {@code updatedAt} to the same {@link Instant#now()} snapshot so that
     * a freshly persisted row always satisfies {@code createdAt == updatedAt}.
     */
    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    /**
     * Called before every UPDATE. Refreshes {@code updatedAt} only;
     * {@code createdAt} is intentionally left untouched.
     */
    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    // ---- getters / setters ----

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUserLogin() {
        return userLogin;
    }

    public void setUserLogin(String userLogin) {
        this.userLogin = userLogin;
    }

    public String getContextType() {
        return contextType;
    }

    public void setContextType(String contextType) {
        this.contextType = contextType;
    }

    public String getContextId() {
        return contextId;
    }

    public void setContextId(String contextId) {
        this.contextId = contextId;
    }

    public String getMessagesJson() {
        return messagesJson;
    }

    public void setMessagesJson(String messagesJson) {
        this.messagesJson = messagesJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    // ---- equals / hashCode on id ----

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof HaAiChatHistory)) return false;
        HaAiChatHistory other = (HaAiChatHistory) o;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public String toString() {
        return "HaAiChatHistory{" +
            "id=" + id +
            ", userLogin='" + userLogin + '\'' +
            ", contextType='" + contextType + '\'' +
            ", contextId='" + contextId + '\'' +
            ", createdAt=" + createdAt +
            ", updatedAt=" + updatedAt +
            '}';
    }
}
