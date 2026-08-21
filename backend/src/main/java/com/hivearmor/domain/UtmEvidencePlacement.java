package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * Records the position and size of an evidence item on a specific board.
 * Uses an optimistic-style schema_version field for conflict detection.
 * S-4A
 */
@Entity
@Table(name = "hive_evidence_placement")
@EntityListeners(AuditingEntityListener.class)
public class UtmEvidencePlacement implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "board_id", nullable = false)
    private UtmEvidenceBoard board;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "evidence_item_id", nullable = false)
    private UtmEvidenceItem evidenceItem;

    @Column(name = "pos_x", nullable = false)
    private Integer posX;

    @Column(name = "pos_y", nullable = false)
    private Integer posY;

    @Column(name = "width", nullable = false)
    private Integer width;

    @Column(name = "height", nullable = false)
    private Integer height;

    /**
     * Incremented on every batch save; used for optimistic conflict detection.
     */
    @Column(name = "schema_version", nullable = false)
    private Integer schemaVersion;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ── Getters & setters ───────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public UtmEvidenceBoard getBoard() { return board; }
    public void setBoard(UtmEvidenceBoard board) { this.board = board; }

    public UtmEvidenceItem getEvidenceItem() { return evidenceItem; }
    public void setEvidenceItem(UtmEvidenceItem evidenceItem) { this.evidenceItem = evidenceItem; }

    public Integer getPosX() { return posX; }
    public void setPosX(Integer posX) { this.posX = posX; }

    public Integer getPosY() { return posY; }
    public void setPosY(Integer posY) { this.posY = posY; }

    public Integer getWidth() { return width; }
    public void setWidth(Integer width) { this.width = width; }

    public Integer getHeight() { return height; }
    public void setHeight(Integer height) { this.height = height; }

    public Integer getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(Integer schemaVersion) { this.schemaVersion = schemaVersion; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
