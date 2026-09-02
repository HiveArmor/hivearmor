package com.hivearmor.service.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.export.HaExportManifest;
import com.hivearmor.domain.shared_types.DataColumn;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.export.HaExportManifestRepository;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.elasticsearch.TenantScopeGuard;
import com.hivearmor.util.UtilCsv;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.apache.commons.csv.QuoteMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import java.io.BufferedWriter;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Shared forensic result-export service (B0-4).
 *
 * <p>Owns the single streaming path for hunt-search and alert-list exports:
 * <ol>
 *   <li>validates tenant scope via the shared {@link TenantScopeGuard} <em>before</em> streaming;</li>
 *   <li>feeds the committed filters into {@link ElasticsearchService#searchStream} (search_after
 *       cursor — no {@code max_result_window} wall);</li>
 *   <li>streams CSV (via {@link UtilCsv}) or NDJSON straight to the response
 *       {@link OutputStream}, wrapped in a {@link DigestOutputStream} so the SHA-256 of the exact
 *       delivered bytes is finalized when the last byte is written (no second pass);</li>
 *   <li>persists a {@link HaExportManifest} chain-of-custody row;</li>
 *   <li>writes exactly one export audit record.</li>
 * </ol>
 *
 * <p>Contract: the streamed HTTP response carries {@code X-Export-Id}. Because the SHA-256
 * finalizes only after the last byte is flushed, it is NOT sent as a response header on the
 * stream — the client reads it from {@code GET .../export/{exportId}/manifest} once the download
 * completes.
 */
@Service
public class ForensicExportService {

    private static final Logger log = LoggerFactory.getLogger(ForensicExportService.class);
    private static final String CLASSNAME = "ForensicExportService";

    /** Streaming batch size fed to searchStream (matches /search/csv). */
    private static final int PAGE_SIZE = 500;

    public static final String SURFACE_HUNT = "hunt-search";
    public static final String SURFACE_ALERT = "alert-list";

    private final ElasticsearchService elasticsearchService;
    private final TenantScopeGuard tenantScopeGuard;
    private final MsspIndexResolver indexResolver;
    private final HaExportManifestRepository manifestRepository;
    private final ApplicationEventService applicationEventService;
    private final ObjectMapper objectMapper;

    /** Hard cap on exported records (guardrail). Configurable via {@code export.max-records}. */
    private final long maxRecords;

    public ForensicExportService(ElasticsearchService elasticsearchService,
                                 TenantScopeGuard tenantScopeGuard,
                                 MsspIndexResolver indexResolver,
                                 HaExportManifestRepository manifestRepository,
                                 ApplicationEventService applicationEventService,
                                 ObjectMapper objectMapper,
                                 @Value("${export.max-records:1000000}") long maxRecords) {
        this.elasticsearchService = elasticsearchService;
        this.tenantScopeGuard = tenantScopeGuard;
        this.indexResolver = indexResolver;
        this.manifestRepository = manifestRepository;
        this.applicationEventService = applicationEventService;
        this.objectMapper = objectMapper;
        this.maxRecords = maxRecords > 0 ? maxRecords : 1_000_000L;
    }

    /**
     * Immutable description of a single export request, assembled by the controllers.
     */
    public static final class ExportRequest {
        private final String surface;
        private final ExportFormat format;
        private final String indexPattern;
        private final List<FilterType> filters;
        private final DataColumn[] columns;
        private final Map<String, Object> queryContext;

        public ExportRequest(String surface, ExportFormat format, String indexPattern,
                             List<FilterType> filters, DataColumn[] columns,
                             Map<String, Object> queryContext) {
            this.surface = surface;
            this.format = format;
            this.indexPattern = indexPattern;
            this.filters = filters;
            this.columns = columns;
            this.queryContext = queryContext;
        }
    }

    /**
     * Validates tenant scope for the resolved index pattern. MUST be called by the controller
     * BEFORE any bytes are written to the response.
     *
     * @throws com.hivearmor.web.rest.elasticsearch.TenantScopeViolationException if out of scope
     */
    public void validateScope(String indexPattern) {
        tenantScopeGuard.validate(indexPattern);
    }

    /**
     * Resolves the effective index pattern: the client-supplied one when present, otherwise the
     * tenant-resolved default for the surface ({@code alert} for alert exports, {@code log} for
     * hunt exports).
     */
    public String resolveIndexPattern(String requested, String surface) {
        if (requested != null && !requested.isBlank()) {
            return requested.trim();
        }
        String type = SURFACE_ALERT.equals(surface) ? "alert" : "log";
        return indexResolver.resolveIndexPattern(type);
    }

    /**
     * Streams the export to {@code response}, computing the digest incrementally, then persists
     * the manifest and writes one audit record. Sets the {@code X-Export-Id}, content-type,
     * {@code Content-Disposition: attachment} and {@code Cache-Control: no-store} headers before
     * the first byte.
     *
     * @return the generated export id (also set as the {@code X-Export-Id} header)
     */
    public String streamExport(ExportRequest request, HttpServletResponse response) throws Exception {
        final String ctx = CLASSNAME + ".streamExport";

        // Scope guard is also enforced here (defence in depth); controllers call validateScope first.
        tenantScopeGuard.validate(request.indexPattern);

        if (request.format == ExportFormat.CSV
                && (request.columns == null || request.columns.length == 0)) {
            throw new IllegalArgumentException("CSV export requires a non-empty 'columns' projection");
        }

        final String exportId = UUID.randomUUID().toString();
        final String tenant = currentTenant();
        final String exportedBy = SecurityUtils.getCurrentUserLogin().orElse("unknown");

        // Headers must be set before the first byte.
        response.setHeader("X-Export-Id", exportId);
        response.setContentType(request.format.contentType());
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=export-" + exportId + "." + request.format.fileExtension());
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long recordCount;

        // Wrap the response OutputStream so the digest covers the EXACT bytes delivered.
        OutputStream rawOut = response.getOutputStream();
        try (DigestOutputStream digestOut = new DigestOutputStream(rawOut, digest)) {
            if (request.format == ExportFormat.CSV) {
                recordCount = streamCsv(request, digestOut);
            } else {
                recordCount = streamNdjson(request, digestOut);
            }
            digestOut.flush();
        }

        String sha256 = toHex(digest.digest());

        persistManifest(exportId, exportedBy, tenant, request, recordCount, sha256);
        writeAuditRecord(request.surface, request.format, recordCount, sha256, exportId, tenant);

        log.info("{}: export {} surface={} format={} count={} sha256={}",
            ctx, exportId, request.surface, request.format, recordCount, sha256);
        return exportId;
    }

    // -------------------------------------------------------------------------
    // CSV / NDJSON streaming
    // -------------------------------------------------------------------------

    @SuppressWarnings("rawtypes")
    private long streamCsv(ExportRequest request, OutputStream out) {
        // Own the writer over the digest stream (UtilCsv.openCsvStream grabs response.getWriter(),
        // which cannot coexist with getOutputStream()); reuse UtilCsv row-writing logic instead.
        DataColumn[] columns = request.columns;

        // Normalize column field names (strip trailing .keyword) as UtilCsv does.
        for (DataColumn c : columns) {
            c.setField(c.getField().replace(".keyword", ""));
        }
        String[] headers = new String[columns.length];
        for (int i = 0; i < columns.length; i++) {
            String label = columns[i].getLabel();
            headers[i] = (label != null && !label.isBlank())
                ? label : columns[i].getField().replace(".keyword", "");
        }

        Writer writer = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
        final long[] counter = {0L};
        try (CSVPrinter printer = new CSVPrinter(writer,
                CSVFormat.DEFAULT.withHeader(headers).withQuoteMode(QuoteMode.ALL))) {
            elasticsearchService.searchStream(
                request.filters, (int) maxRecords, request.indexPattern, PAGE_SIZE, Map.class,
                batch -> {
                    UtilCsv.writeCsvBatch(printer, columns, batch);
                    counter[0] += batch.size();
                    return true;
                });
            printer.flush();
        } catch (Exception e) {
            throw new RuntimeException(CLASSNAME + ".streamCsv: " + e.getMessage(), e);
        }
        return counter[0];
    }

    @SuppressWarnings("rawtypes")
    private long streamNdjson(ExportRequest request, OutputStream out) {
        Writer writer = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
        final long[] counter = {0L};
        try {
            elasticsearchService.searchStream(
                request.filters, (int) maxRecords, request.indexPattern, PAGE_SIZE, Map.class,
                batch -> {
                    for (Object doc : batch) {
                        writer.write(objectMapper.writeValueAsString(doc));
                        writer.write('\n');
                    }
                    counter[0] += batch.size();
                    return true;
                });
            writer.flush();
        } catch (Exception e) {
            throw new RuntimeException(CLASSNAME + ".streamNdjson: " + e.getMessage(), e);
        }
        return counter[0];
    }

    // -------------------------------------------------------------------------
    // Manifest + audit
    // -------------------------------------------------------------------------

    private void persistManifest(String exportId, String exportedBy, String tenant,
                                 ExportRequest request, long recordCount, String sha256) {
        HaExportManifest manifest = new HaExportManifest();
        manifest.setExportId(exportId);
        manifest.setExportedBy(exportedBy);
        manifest.setTenant(tenant);
        manifest.setSurface(request.surface);
        manifest.setFormat(request.format.name().toLowerCase());
        manifest.setIndexPattern(request.indexPattern);
        manifest.setRecordCount(recordCount);
        manifest.setSha256(sha256);
        manifest.setQueryJson(serializeQuery(request.queryContext));
        manifestRepository.save(manifest);
    }

    private void writeAuditRecord(String surface, ExportFormat format, long recordCount,
                                  String sha256, String exportId, String tenant) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("action", "EXPORT");
        details.put("surface", surface);
        details.put("format", format.name().toLowerCase());
        details.put("count", recordCount);
        details.put("sha256", sha256);
        details.put("exportId", exportId);
        details.put("tenant", tenant);
        String message = String.format(
            "AUDIT: resource=export surface=%s format=%s count=%d sha256=%s exportId=%s by=%s",
            surface, format.name().toLowerCase(), recordCount, sha256, exportId,
            SecurityUtils.getCurrentUserLogin().orElse("unknown"));
        applicationEventService.createEvent(message, ApplicationEventType.INFO, details);
    }

    private String serializeQuery(Map<String, Object> queryContext) {
        if (queryContext == null || queryContext.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(queryContext);
        } catch (Exception e) {
            log.warn("{}.serializeQuery: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private String currentTenant() {
        String prefix = TenantContext.getClientPrefix();
        return (prefix == null || prefix.isBlank()) ? "default" : prefix;
    }

    static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }

    /**
     * Loads a manifest row as a lightweight map-free accessor for the controller to DTO-map.
     */
    public HaExportManifest findManifest(String exportId) {
        return manifestRepository.findByExportId(exportId).orElse(null);
    }

    /**
     * Builds a {@link FilterType} list from simple alert-queue filter fields — the thin adapter
     * that lets alert exports reuse the single {@code searchStream} path. Values are passed as
     * {@link FilterType} objects (never string-concatenated into a query).
     */
    public static List<FilterType> buildAlertFilters(String severity, String status, String from,
                                                     String to, String category, String assignee,
                                                     String tags, String riskMin, String q) {
        List<FilterType> filters = new ArrayList<>();
        addRange(filters, from, to);
        addTerm(filters, "severity", severity);
        addTerm(filters, "status", status);
        addTerm(filters, "category", category);
        addTerm(filters, "assignee", assignee);
        addTerm(filters, "tags", tags);
        if (riskMin != null && !riskMin.isBlank()) {
            filters.add(new FilterType("riskScore",
                com.hivearmor.domain.chart_builder.types.query.OperatorType.IS_GREATER_THAN, riskMin));
        }
        if (q != null && !q.isBlank()) {
            filters.add(new FilterType("message",
                com.hivearmor.domain.chart_builder.types.query.OperatorType.CONTAIN, q));
        }
        return filters;
    }

    /**
     * Builds a {@link FilterType} list for hunt exports from an optional structured filter list
     * plus a time range. Passthrough of the caller's filters, augmented with the range.
     */
    public static List<FilterType> buildHuntFilters(List<FilterType> filters, String from, String to) {
        List<FilterType> result = new ArrayList<>();
        if (filters != null) {
            result.addAll(filters);
        }
        addRange(result, from, to);
        return result;
    }

    private static void addTerm(List<FilterType> filters, String field, String value) {
        if (value != null && !value.isBlank()) {
            filters.add(new FilterType(field,
                com.hivearmor.domain.chart_builder.types.query.OperatorType.IS, value));
        }
    }

    private static void addRange(List<FilterType> filters, String from, String to) {
        if ((from != null && !from.isBlank()) && (to != null && !to.isBlank())) {
            filters.add(new FilterType("@timestamp",
                com.hivearmor.domain.chart_builder.types.query.OperatorType.IS_BETWEEN,
                List.of(from, to)));
        }
    }
}
