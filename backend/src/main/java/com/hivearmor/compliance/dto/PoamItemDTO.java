package com.hivearmor.compliance.dto;

import com.hivearmor.compliance.entity.HaPoamItem;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;

/**
 * DTO returned by the POA&amp;M REST endpoints.
 * Contains all {@link HaPoamItem} fields plus a computed {@code overdue} boolean.
 *
 * <p>The overdue biconditional is materialized exclusively in {@link #from(HaPoamItem, Clock)}:
 * {@code overdue == true} iff {@code dueDate != null AND dueDate < today AND status ∉ {closed, risk_accepted}}.
 */
public record PoamItemDTO(
        Long id,
        String frameworkId,
        String controlId,
        String title,
        String description,
        LocalDate dueDate,
        String status,
        String assignee,
        Instant createdAt,
        Instant updatedAt,
        boolean overdue
) {

    /**
     * Projects a JPA entity into a DTO, computing the {@code overdue} flag
     * using the provided clock for deterministic testing.
     *
     * @param e     the persisted POA&amp;M item
     * @param clock clock used to determine "today"
     * @return a fully-populated DTO
     */
    public static PoamItemDTO from(HaPoamItem e, Clock clock) {
        LocalDate today = LocalDate.now(clock);
        boolean overdue = e.getDueDate() != null
                && e.getDueDate().isBefore(today)
                && !"closed".equals(e.getStatus())
                && !"risk_accepted".equals(e.getStatus());
        return new PoamItemDTO(
                e.getId(),
                e.getFrameworkId(),
                e.getControlId(),
                e.getTitle(),
                e.getDescription(),
                e.getDueDate(),
                e.getStatus(),
                e.getAssignee(),
                e.getCreatedAt(),
                e.getUpdatedAt(),
                overdue
        );
    }
}
