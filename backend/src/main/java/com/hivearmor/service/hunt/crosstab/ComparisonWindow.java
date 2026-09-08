package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;

/**
 * P2: computes the shifted time range for a previous-period crosstab comparison.
 *
 * <p>Two modes:
 * <ul>
 *   <li><b>previous_period</b> — shift the window back by its OWN width (last 24h vs the 24h before it).</li>
 *   <li><b>previous_window</b> — shift the window back by an explicit {@code offset} duration (e.g. "7d"
 *       for week-over-week), preserving the window width.</li>
 * </ul>
 *
 * <p>Time bounds are ISO-8601 instants (the crosstab request already uses absolute {@code from}/{@code to}).
 * Relative expressions ("now-24h") are NOT shifted here — the caller resolves those to absolute bounds
 * before comparison; a range that cannot be parsed as an instant yields no comparison (null), never a guess.
 */
public final class ComparisonWindow {

    private ComparisonWindow() {}

    /**
     * @return the shifted {@link HuntSearchRequestDTO.TimeRangeDTO}, or {@code null} when the current
     *         range is not absolute/parseable (so the caller skips comparison rather than fabricating one).
     */
    public static HuntSearchRequestDTO.TimeRangeDTO shift(HuntSearchRequestDTO.TimeRangeDTO current,
                                                          String mode, String offset) {
        if (current == null || current.getFrom() == null || current.getTo() == null) return null;
        final Instant from;
        final Instant to;
        try {
            from = Instant.parse(current.getFrom());
            to = Instant.parse(current.getTo());
        } catch (DateTimeParseException e) {
            return null; // relative or non-ISO bounds — do not fabricate a comparison window
        }
        if (!to.isAfter(from)) return null;

        final Duration back;
        if ("previous_window".equals(mode)) {
            Duration off = parseOffset(offset);
            if (off == null || off.isZero() || off.isNegative()) return null;
            back = off;
        } else {
            // previous_period: shift by the window's own width
            back = Duration.between(from, to);
        }

        HuntSearchRequestDTO.TimeRangeDTO shifted = new HuntSearchRequestDTO.TimeRangeDTO();
        shifted.setFrom(from.minus(back).toString());
        shifted.setTo(to.minus(back).toString());
        return shifted;
    }

    /** Parse a simple duration like "7d", "12h", "30m", "45s". Returns null when unrecognised. */
    static Duration parseOffset(String offset) {
        if (offset == null || offset.length() < 2) return null;
        char unit = offset.charAt(offset.length() - 1);
        final long n;
        try {
            n = Long.parseLong(offset.substring(0, offset.length() - 1).trim());
        } catch (NumberFormatException e) {
            return null;
        }
        return switch (unit) {
            case 's' -> Duration.ofSeconds(n);
            case 'm' -> Duration.ofMinutes(n);
            case 'h' -> Duration.ofHours(n);
            case 'd' -> Duration.ofDays(n);
            default -> null;
        };
    }
}
