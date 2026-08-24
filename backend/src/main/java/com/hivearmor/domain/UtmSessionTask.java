package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * A lightweight case task attached to an investigation session.
 * Status values: OPEN, DONE, CANCELLED.
 * STAGING CANDIDATE — P1 session case tasks.
 */
@Entity
@Table(name = "hive_session_task")
@EntityListeners(AuditingEntityListener.class)
public class UtmSessionTask implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "hive_session_task_seq")
    @SequenceGenerator(name = "hive_session_task_seq", sequenceName = "hive_session_task_id_seq", allocationSize = 1)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private UtmInvestigationSession session;

    @Column(name = "title", nullable = false, length = 500)
    private String title;

    /** OPEN | DONE | CANCELLED */
    @Column(name = "status", nullable = false, length = 32)
    private String status = "OPEN";

    @Column(name = "assignee", length = 255)
    private String assignee;

    @Column(name = "external_ticket_url", length = 2048)
    private String externalTicketUrl;

    @Column(name = "created_by", nullable = false, length = 255, updatable = false)
    private String createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public UtmInvestigationSession getSession() { return session; }
    public void setSession(UtmInvestigationSession session) { this.session = session; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getExternalTicketUrl() { return externalTicketUrl; }
    public void setExternalTicketUrl(String externalTicketUrl) { this.externalTicketUrl = externalTicketUrl; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
