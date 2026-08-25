package com.hivearmor.web.rest.util;

import com.hivearmor.service.dto.HaEdrInventoryPageDTO;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.Objects;
import java.util.function.Function;

/**
 * Builds RESP-021 STAGING CANDIDATE list-freshness metadata for EDR inventory
 * reads. Exposes {@code snapshotAt}/{@code asOf} in the JSON body and mirrors
 * them as {@code X-Snapshot-At} / {@code X-As-Of} response headers.
 *
 * <p>Does not implement cursor/PIT binding, action history, or governed
 * preview/approval. Not production-ready freshness.
 */
public final class HaEdrListFreshness {

    public static final String HEADER_SNAPSHOT_AT = "X-Snapshot-At";
    public static final String HEADER_AS_OF = "X-As-Of";

    private HaEdrListFreshness() {
    }

    /**
     * Wraps a Spring page with server read time and newest-on-page asOf.
     *
     * @param page          Spring page result
     * @param asOfExtractor extracts the record event time used for asOf
     * @param <T>           row type
     * @return 200 OK with body + exposed freshness headers
     */
    public static <T> ResponseEntity<HaEdrInventoryPageDTO<T>> ok(
            Page<T> page,
            Function<T, Instant> asOfExtractor) {
        Instant snapshotAt = Instant.now();
        Instant asOf = page.getContent().stream()
            .map(asOfExtractor)
            .filter(Objects::nonNull)
            .max(Instant::compareTo)
            .orElse(null);

        HaEdrInventoryPageDTO<T> body = HaEdrInventoryPageDTO.from(page, snapshotAt, asOf);
        HttpHeaders headers = new HttpHeaders();
        headers.add(HEADER_SNAPSHOT_AT, snapshotAt.toString());
        if (asOf != null) {
            headers.add(HEADER_AS_OF, asOf.toString());
        }
        headers.add(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, HEADER_SNAPSHOT_AT + ", " + HEADER_AS_OF);
        return ResponseEntity.ok().headers(headers).body(body);
    }

    /**
     * Parses an ISO-8601 instant string; returns null when blank or unparseable
     * so asOf stays honest rather than inventing a timestamp.
     */
    public static Instant parseInstantOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value.trim());
        } catch (Exception ignored) {
            return null;
        }
    }
}
