package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Dimension;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Measure;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.MeasureFn;
import com.hivearmor.service.hunt.crosstab.CrosstabFieldCapabilityResolver.Capability;
import org.springframework.stereotype.Component;

/**
 * V1 validator for the neutral {@link CrosstabDefinition}.
 *
 * <p>PR-A P1. Clamps the neutral model to the P1 shape ({@code rows==1, columns==1, measures==1})
 * and enforces field capability using the backend-owned resolver. Only the validator changes when
 * P1.1+ raises the clamp — the planner and DTOs already speak the neutral model.
 *
 * <p>Throws {@link HuntQueryException} (stable {@code code} + message) on any violation, matching
 * the hunt validation convention.
 */
@Component
public class CrosstabDefinitionValidator {

    private final CrosstabFieldCapabilityResolver capabilities;

    public CrosstabDefinitionValidator(CrosstabFieldCapabilityResolver capabilities) {
        this.capabilities = capabilities;
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

        validateAxis("row", row.field());
        validateAxis("column", col.field());

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

    private void validateAxis(String which, String field) {
        Capability cap = capabilities.capabilityFor(field);
        if (!cap.axisAllowed()) {
            throw new HuntQueryException("CROSSTAB_AXIS_FIELD_UNSUPPORTED",
                "Field cannot be used as a " + which + " dimension: " + field + " (" + cap.reason() + ")", 0);
        }
    }
}
