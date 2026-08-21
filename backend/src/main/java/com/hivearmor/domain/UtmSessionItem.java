package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * An item pinned to an investigation session.
 * item_type values: LOG_EVENT, ALERT, SAVED_QUERY, NOTE.
 * S-5C
 */
@Entity
@Table(name = "hive_session_item")
@EntityListeners(AuditingEntityListener.class)
public class UtmSessionItem implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "hive_session_item_seq")
    @SequenceGenerator(name = "hive_session_item_seq", sequenceName = "hive_session_item_id_seq", allocationSize = 1)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private UtmInvestigationSession session;

    /** LOG_EVENT | ALERT | SAVED_QUERY | NOTE */
    @Column(name = "item_type", nullable = false, length = 32)
    private String itemType;

    /** OpenSearch doc ID, alert ID, saved query ID, etc. */
    @Column(name = "item_ref", length = 512)
    private String itemRef;

    /** Copy of key fields at pinning time, stored as JSONB. */
    @Column(name = "item_snapshot", columnDefinition = "jsonb")
    private String itemSnapshot;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "added_by", nullable = false, length = 255)
    private String addedBy;

    @CreatedDate
    @Column(name = "added_at", nullable = false, updatable = false)
    private Instant addedAt;

    // ── Getters & setters ───────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public UtmInvestigationSession getSession() { return session; }
    public void setSession(UtmInvestigationSession session) { this.session = session; }

    public String getItemType() { return itemType; }
    public void setItemType(String itemType) { this.itemType = itemType; }

    public String getItemRef() { return itemRef; }
    public void setItemRef(String itemRef) { this.itemRef = itemRef; }

    public String getItemSnapshot() { return itemSnapshot; }
    public void setItemSnapshot(String itemSnapshot) { this.itemSnapshot = itemSnapshot; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public String getAddedBy() { return addedBy; }
    public void setAddedBy(String addedBy) { this.addedBy = addedBy; }

    public Instant getAddedAt() { return addedAt; }
    public void setAddedAt(Instant addedAt) { this.addedAt = addedAt; }
}
