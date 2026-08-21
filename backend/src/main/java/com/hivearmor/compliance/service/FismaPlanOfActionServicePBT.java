package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.PoamItemDTO;
import com.hivearmor.compliance.entity.HaPoamItem;
import net.jqwik.api.*;

import java.time.*;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based test for the POA&amp;M Overdue Invariant.
 *
 * <p><strong>Validates: Requirements 4.5, 5.3</strong>
 *
 * <p>Property 2 (POA&amp;M Overdue Invariant): For any {@code HaPoamItem} {@code p},
 * the DTO projection produced by {@code PoamItemDTO.from(p, clock)} has
 * {@code overdue == true} if and only if {@code dueDate != null AND dueDate < today
 * AND status ∉ {"closed", "risk_accepted"}}.
 */
@Label("Feature: sprint-30-compliance-packs, Property 2: POA&M Overdue Invariant")
class FismaPlanOfActionServicePBT {

    /**
     * Fixed clock anchored at 2026-07-25 for deterministic evaluation of the
     * overdue biconditional across all generated inputs.
     */
    private static final LocalDate FIXED_TODAY = LocalDate.of(2026, 7, 25);
    private static final Clock FIXED_CLOCK = Clock.fixed(
            FIXED_TODAY.atStartOfDay(ZoneOffset.UTC).toInstant(),
            ZoneOffset.UTC
    );

    private static final Set<String> TERMINAL_STATUSES = Set.of("closed", "risk_accepted");

    /**
     * Property 2: POA&amp;M Overdue Invariant.
     *
     * <p>For any generated {@code HaPoamItem}, assert {@code overdue == true} iff
     * ({@code dueDate != null} AND {@code dueDate < today} AND
     * {@code status ∉ {closed, risk_accepted}}).
     *
     * <p><strong>Validates: Requirements 4.5, 5.3</strong>
     */
    @Property(tries = 200)
    @Tag("Feature: sprint-30-compliance-packs, Property 2: POA&M Overdue Invariant")
    @Label("overdueBiconditional")
    void overdueBiconditional(@ForAll("poamItems") HaPoamItem item) {
        // -- Act --
        PoamItemDTO dto = PoamItemDTO.from(item, FIXED_CLOCK);

        // -- Compute expected overdue from the biconditional definition --
        boolean expectedOverdue = item.getDueDate() != null
                && item.getDueDate().isBefore(FIXED_TODAY)
                && !TERMINAL_STATUSES.contains(item.getStatus());

        // -- Assert: biconditional holds --
        assertThat(dto.overdue())
                .as("overdue biconditional violated for item with dueDate=%s, status='%s' (today=%s). "
                                + "Expected overdue=%s but got overdue=%s",
                        item.getDueDate(), item.getStatus(), FIXED_TODAY,
                        expectedOverdue, dto.overdue())
                .isEqualTo(expectedOverdue);

        // -- Assert: DTO fields match entity fields (projection correctness) --
        assertThat(dto.id()).isEqualTo(item.getId());
        assertThat(dto.frameworkId()).isEqualTo(item.getFrameworkId());
        assertThat(dto.controlId()).isEqualTo(item.getControlId());
        assertThat(dto.title()).isEqualTo(item.getTitle());
        assertThat(dto.description()).isEqualTo(item.getDescription());
        assertThat(dto.dueDate()).isEqualTo(item.getDueDate());
        assertThat(dto.status()).isEqualTo(item.getStatus());
        assertThat(dto.assignee()).isEqualTo(item.getAssignee());
        assertThat(dto.createdAt()).isEqualTo(item.getCreatedAt());
        assertThat(dto.updatedAt()).isEqualTo(item.getUpdatedAt());
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates random {@code HaPoamItem} instances with varied:
     * <ul>
     *   <li>dueDate: null, past (before today), today, future (after today)</li>
     *   <li>status: open, in_progress, closed, risk_accepted</li>
     * </ul>
     */
    @Provide
    Arbitrary<HaPoamItem> poamItems() {
        Arbitrary<Long> ids = Arbitraries.longs().between(1L, 100_000L);

        Arbitrary<String> frameworkIds = Arbitraries.of(
                "FEDRAMP-MODERATE", "FISMA", "CMMC-L2", "NIST-800-53-R5", "PCI-DSS-V4"
        );

        Arbitrary<String> controlIds = Arbitraries.strings()
                .withCharRange('A', 'Z')
                .ofLength(2)
                .flatMap(prefix -> Arbitraries.integers().between(1, 20)
                        .map(num -> prefix + "-" + num));

        Arbitrary<String> titles = Arbitraries.strings()
                .withCharRange('A', 'Z')
                .withCharRange('a', 'z')
                .withChars(' ')
                .ofMinLength(5)
                .ofMaxLength(80)
                .filter(s -> !s.isBlank());

        // Due dates: null, past (before today), today, future (after today)
        Arbitrary<LocalDate> dueDates = Arbitraries.oneOf(
                // Past dates — 1 to 365 days before FIXED_TODAY
                Arbitraries.integers().between(1, 365)
                        .map(FIXED_TODAY::minusDays),
                // Today
                Arbitraries.just(FIXED_TODAY),
                // Future dates — 1 to 365 days after FIXED_TODAY
                Arbitraries.integers().between(1, 365)
                        .map(FIXED_TODAY::plusDays)
        );

        Arbitrary<LocalDate> nullableDueDates = Arbitraries.oneOf(
                dueDates,
                Arbitraries.just((LocalDate) null)
        );

        // Status values — the four valid statuses
        Arbitrary<String> statuses = Arbitraries.of(
                "open", "in_progress", "closed", "risk_accepted"
        );

        Arbitrary<String> assignees = Arbitraries.of(
                "alice@example.com", "bob@example.com", "charlie@example.com", null
        );

        Arbitrary<Instant> timestamps = Arbitraries.longs()
                .between(1_700_000_000L, 1_800_000_000L)
                .map(Instant::ofEpochSecond);

        // jqwik Combinators.combine supports up to 8 args; use flatMap for the remaining fields
        return Combinators.combine(
                ids, frameworkIds, controlIds, titles,
                nullableDueDates, statuses, assignees, timestamps
        ).as((id, fwId, ctrlId, title, dueDate, status, assignee, createdAt) -> {
            HaPoamItem item = new HaPoamItem();
            item.setId(id);
            item.setFrameworkId(fwId);
            item.setControlId(ctrlId);
            item.setTitle(title);
            item.setDescription(null);
            item.setDueDate(dueDate);
            item.setStatus(status);
            item.setAssignee(assignee);
            item.setCreatedAt(createdAt);
            item.setUpdatedAt(createdAt);
            return item;
        });
    }
}
