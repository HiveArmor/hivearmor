package com.hivearmor.domain.export;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity mapped to the {@code ha_export_manifest} table.
 *
 * <p>One row is persisted per forensic result export (B0-4). It is the durable
 * chain-of-custody record: who exported what, when, for which tenant/surface, in
 * which format, and — critically — the SHA-256 digest of the exact bytes streamed
 * to the client. The digest is computed incrementally while streaming and written
 * once the last byte has been flushed.
 */
@Getter
@Setter
@Entity
@Table(name = "ha_export_manifest")
public class HaExportManifest implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Opaque export identifier (UUID) surfaced to the client as {@code X-Export-Id}. */
    @Column(name = "export_id", nullable = false, unique = true, length = 64)
    private String exportId;

    @Column(name = "exported_by", length = 200)
    private String exportedBy;

    @CreationTimestamp
    @Column(name = "exported_at", nullable = false, updatable = false)
    private Instant exportedAt;

    /** Tenant prefix of the owning tenant, or {@code "default"} in single-tenant mode. */
    @Column(name = "tenant", length = 200)
    private String tenant;

    /** {@code hunt-search} or {@code alert-list}. */
    @Column(name = "surface", length = 64)
    private String surface;

    /** {@code csv} or {@code ndjson}. */
    @Column(name = "format", length = 16)
    private String format;

    @Column(name = "index_pattern", length = 500)
    private String indexPattern;

    @Column(name = "record_count")
    private Long recordCount;

    /** Hex SHA-256 of the exported payload bytes. */
    @Column(name = "sha256", length = 64)
    private String sha256;

    /** JSON snapshot of the query/filters/timeRange that produced this export. */
    @Column(name = "query_json", columnDefinition = "TEXT")
    private String queryJson;
}
