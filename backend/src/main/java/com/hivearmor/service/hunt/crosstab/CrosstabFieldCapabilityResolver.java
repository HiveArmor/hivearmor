package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.service.hunt.HuntFieldRegistry;
import com.hivearmor.service.hunt.HuntFieldRegistry.FieldKind;
import com.hivearmor.service.hunt.HuntFieldRegistry.FieldSpec;
import org.springframework.stereotype.Component;

/**
 * Backend-owned authority for whether a Hunt field can be a crosstab dimension / distinct measure.
 *
 * <p>PR-A P1. The browser only learns "can this field be used?" ({@code axisAllowed}) and a
 * {@link CrosstabCapabilityReason}; it never sees the physical aggregation path (that is
 * {@code aggFieldPathFor}'s job inside the planner). Date fields are disabled in P1 with
 * {@link CrosstabCapabilityReason#DATE_REQUIRES_BUCKETING}; date-histogram bucketing is a P1.1 hook.
 */
@Component
public class CrosstabFieldCapabilityResolver {

    private final HuntFieldRegistry fieldRegistry;

    public CrosstabFieldCapabilityResolver(HuntFieldRegistry fieldRegistry) {
        this.fieldRegistry = fieldRegistry;
    }

    /** Immutable capability verdict for one field. */
    public record Capability(boolean axisAllowed, boolean distinctMeasureAllowed, CrosstabCapabilityReason reason) {}

    /**
     * Capability for a field name. Unknown fields resolve to UNMAPPED rather than throwing, so the
     * schema surface can present every field with an honest disabled state.
     */
    public Capability capabilityFor(String fieldName) {
        FieldSpec spec;
        try {
            spec = fieldRegistry.require(fieldName);
        } catch (RuntimeException unknown) {
            return new Capability(false, false, CrosstabCapabilityReason.UNMAPPED);
        }
        return capabilityFor(spec);
    }

    /** Capability for a resolved field spec. */
    public Capability capabilityFor(FieldSpec spec) {
        if (spec.kind() == FieldKind.DATE) {
            // Aggregatable in principle, but a raw date axis would explode into millions of columns.
            return new Capability(false, false, CrosstabCapabilityReason.DATE_REQUIRES_BUCKETING);
        }
        if (!spec.aggregatable()) {
            // Analyzed text without a keyword sub-field (e.g. message, process.command_line).
            return new Capability(false, false, CrosstabCapabilityReason.NOT_AGGREGATABLE);
        }
        return switch (spec.kind()) {
            case KEYWORD, TEXT, IP, NUMBER, BOOLEAN ->
                new Capability(true, true, CrosstabCapabilityReason.OK);
            // DATE handled above; any future unmodelled kind is rejected rather than guessed.
            default -> new Capability(false, false, CrosstabCapabilityReason.UNSUPPORTED_TYPE);
        };
    }

    /** True if the field may be used as a Rows/Columns dimension. */
    public boolean isAxisAllowed(String fieldName) {
        return capabilityFor(fieldName).axisAllowed();
    }

    /** True if the field may be the target of a distinct-count measure. */
    public boolean isDistinctMeasureAllowed(String fieldName) {
        return capabilityFor(fieldName).distinctMeasureAllowed();
    }
}
