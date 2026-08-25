package com.hivearmor.service.dto;

import org.springframework.data.domain.Page;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Thin paged inventory projection for {@code GET /api/ha-edr/quarantine} and
 * {@code GET /api/ha-edr/isolation}.
 *
 * <p>Preserves the Spring {@code Page} field names the frontend already consumes
 * ({@code content}, {@code totalElements}, {@code totalPages}, {@code number})
 * and adds list-freshness honesty fields for RESP-021:
 * <ul>
 *   <li>{@code snapshotAt} — server time when this page was read</li>
 *   <li>{@code asOf} — newest record timestamp on this page, or null when empty</li>
 * </ul>
 *
 * <p>STAGING CANDIDATE — not cursor/PIT-bound, not production-ready freshness.
 * No Lombok.
 */
public class HaEdrInventoryPageDTO<T> {

    private List<T> content = new ArrayList<>();
    private long totalElements;
    private int totalPages;
    private int number;
    private Instant snapshotAt;
    private Instant asOf;

    public static <T> HaEdrInventoryPageDTO<T> from(Page<T> page, Instant snapshotAt, Instant asOf) {
        HaEdrInventoryPageDTO<T> dto = new HaEdrInventoryPageDTO<>();
        dto.setContent(page.getContent());
        dto.setTotalElements(page.getTotalElements());
        dto.setTotalPages(page.getTotalPages());
        dto.setNumber(page.getNumber());
        dto.setSnapshotAt(snapshotAt);
        dto.setAsOf(asOf);
        return dto;
    }

    public List<T> getContent() {
        return content;
    }

    public void setContent(List<T> content) {
        this.content = content != null ? content : new ArrayList<>();
    }

    public long getTotalElements() {
        return totalElements;
    }

    public void setTotalElements(long totalElements) {
        this.totalElements = totalElements;
    }

    public int getTotalPages() {
        return totalPages;
    }

    public void setTotalPages(int totalPages) {
        this.totalPages = totalPages;
    }

    public int getNumber() {
        return number;
    }

    public void setNumber(int number) {
        this.number = number;
    }

    public Instant getSnapshotAt() {
        return snapshotAt;
    }

    public void setSnapshotAt(Instant snapshotAt) {
        this.snapshotAt = snapshotAt;
    }

    public Instant getAsOf() {
        return asOf;
    }

    public void setAsOf(Instant asOf) {
        this.asOf = asOf;
    }
}
