package com.hivearmor.web.rest.export.dto;

import com.hivearmor.domain.export.HaExportManifest;

/**
 * Response DTO for the chain-of-custody manifest (B0-4).
 *
 * <p>Mirrors the JSON sidecar shape described in the B0-4 spec §5. Controllers
 * return this — never the {@link HaExportManifest} entity.
 */
public class ExportManifestDTO {

    private String exportId;
    private String exportedBy;
    private String exportedAt;
    private String tenant;
    private String surface;
    private String format;
    private String indexPattern;
    private long recordCount;
    private String sha256;
    private String queryJson;
    private final String product = "HiveArmor";
    private final String schemaVersion = "1";

    public static ExportManifestDTO from(HaExportManifest m) {
        ExportManifestDTO dto = new ExportManifestDTO();
        dto.exportId = m.getExportId();
        dto.exportedBy = m.getExportedBy();
        dto.exportedAt = m.getExportedAt() != null ? m.getExportedAt().toString() : null;
        dto.tenant = m.getTenant();
        dto.surface = m.getSurface();
        dto.format = m.getFormat();
        dto.indexPattern = m.getIndexPattern();
        dto.recordCount = m.getRecordCount() != null ? m.getRecordCount() : 0L;
        dto.sha256 = m.getSha256();
        dto.queryJson = m.getQueryJson();
        return dto;
    }

    public String getExportId() { return exportId; }
    public String getExportedBy() { return exportedBy; }
    public String getExportedAt() { return exportedAt; }
    public String getTenant() { return tenant; }
    public String getSurface() { return surface; }
    public String getFormat() { return format; }
    public String getIndexPattern() { return indexPattern; }
    public long getRecordCount() { return recordCount; }
    public String getSha256() { return sha256; }
    public String getQueryJson() { return queryJson; }
    public String getProduct() { return product; }
    public String getSchemaVersion() { return schemaVersion; }
}
