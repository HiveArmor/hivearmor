package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.service.hunt.HuntFieldRegistry;
import com.hivearmor.service.hunt.HuntFieldRegistry.FieldKind;
import com.hivearmor.service.hunt.HuntFieldRegistry.FieldSpec;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Dimension;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Measure;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.MeasureFn;
import com.hivearmor.service.hunt.crosstab.CrosstabFieldCapabilityResolver.Capability;
import org.springframework.stereotype.Component;

/**
 * V1 validator for the neutral {@link CrosstabDefinition}.
 *
 * <p>PR-A P1. Clamps the neutral model to the P1 shape ({@code rows==1, columns==1, measures==1})
 * and enforces field capability using the backend-owned resolver. P1.1 adds date-axis support: a
 * date field is allowed on an axis ONLY when it carries a DATE_HISTOGRAM bucket with an allow-listed
 * interval; an unbucketed date axis is still rejected with {@code DATE_REQUIRES_BUCKETING}.
 *
 * <p>Throws {@link HuntQueryException} (stable {@code code} + message) on any violation, matching
 * the hunt validation convention.
 */
@Component
public class CrosstabDefinitionValidator {

    private final CrosstabFieldCapabilityResolver capabilities;
    private final HuntFieldRegistry fieldRegistry;
    private final CrosstabCostPolicy costPolicy;

    public CrosstabDefinitionValidator(CrosstabFieldCapabilityResolver capabilities,
                                       HuntFieldRegistry fieldRegistry,
                                       CrosstabCostPolicy costPolicy) {
        this.capabilities = capabilities;
        this.fieldRegistry = fieldRegistry;
        this.costPolicy = costPolicy;
    }

    public void validate(CrosstabDefinition def) {
        if (def.dimensions().rows().size() != 1) {
            throw new HuntQueryException("CROSSTAB_ONE_ROW_REQUIRED", "Exactly one Rows dimension is required", 0);
        }
        if (def.dimensions().columns().size() != 1) {
            throw new HuntQueryException("CROSSTAB_ONE_COLUMN_REQUIRED", "Exactly one Columns dimension is required", 0);
        }
        if (def.measures().size() != 1) {
            throw new HuntQueryException("CROSSTAB_ONE_MEASURE_REQUIRED", "Exactly one measure is required", 0);
        }

        Dimension row = def.row();
        Dimension col = def.column();
        Measure measure = def.measure();

        // P1.1: at most ONE date axis. Two bucketed date axes are rejected in this phase.
        if (row.isDateHistogram() && col.isDateHistogram()) {
            throw new HuntQueryException("CROSSTAB_ONE_DATE_AXIS",
                "Only one axis may be a date (time) axis", 0);
        }

        validateAxis("row", row);
        validateAxis("column", col);

        if (measure.fn() == MeasureFn.DISTINCT) {
            String field = measure.field();
            if (field == null || field.isBlank()) {
                throw new HuntQueryException("CROSSTAB_DISTINCT_FIELD_REQUIRED",
                    "A distinct-count field is required when the measure is distinct", 0);
            }
            Capability cap = capabilities.capabilityFor(field);
            if (!cap.distinctMeasureAllowed()) {
                throw new HuntQueryException("CROSSTAB_DISTINCT_FIELD_UNSUPPORTED",
                    "Field cannot be used as a distinct measure: " + field + " (" + cap.reason() + ")", 0);
            }
        }
    }

    private void validateAxis(String which, Dimension dim) {
        String field = dim.field();
        if (dim.isDateHistogram()) {
            // INCLUDE (missing) on a date axis needs a sentinel date — deferred.
            if (dim.missing() == CrosstabDefinition.MissingMode.INCLUDE) {
                throw new HuntQueryException("CROSSTAB_MISSING_NOT_ON_DATE",
                    "A (missing) bucket is not supported on a date (time) " + which + " axis", 0);
            }
            // A bucketed date axis: the field must be a DATE, and the interval must be allow-listed.
            FieldSpec spec;
            try {
                spec = fieldRegistry.require(field);
            } catch (RuntimeException unknown) {
                throw new HuntQueryException("CROSSTAB_AXIS_FIELD_UNSUPPORTED",
                    "Field cannot be used as a " + which + " dimension: " + field + " (UNMAPPED)", 0);
            }
            if (spec.kind() != FieldKind.DATE) {
                throw new HuntQueryException("CROSSTAB_BUCKET_NOT_DATE",
                    "Only a date field can be bucketed on the " + which + " axis: " + field, 0);
            }
            String interval = dim.bucket() == null ? null : dim.bucket().interval();
            if (!costPolicy.isAllowedInterval(interval)) {
                throw new HuntQueryException("CROSSTAB_BUCKET_INTERVAL_UNSUPPORTED",
                    "Unsupported bucket interval on the " + which + " axis: " + interval, 0);
            }
            return;
        }
        // A TERM axis: use the capability resolver (date fields are rejected here as before).
        Capability cap = capabilities.capabilityFor(field);
        if (!cap.axisAllowed()) {
            throw new HuntQueryException("CROSSTAB_AXIS_FIELD_UNSUPPORTED",
                "Field cannot be used as a " + which + " dimension: " + field + " (" + cap.reason() + ")", 0);
        }
    }
}
