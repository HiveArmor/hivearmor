package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.BucketSpec;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.DimKind;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Dimension;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Dimensions;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.Measure;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.MeasureFn;
import com.hivearmor.service.hunt.crosstab.CrosstabDefinition.MissingMode;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabRequestDTO;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

/**
 * Maps the flat public {@link HuntCrosstabRequestDTO} into the neutral {@link CrosstabDefinition}.
 *
 * <p>PR-A P1. The 10-line adapter that lets the public DTO stay simple while the engine speaks the
 * future-proof neutral model. Clamps the requested per-axis sizes against {@link CrosstabCostPolicy}
 * here (so the definition already carries safe caps) and resolves the measure function.
 */
@Component
public class CrosstabRequestMapper {

    private final CrosstabCostPolicy costPolicy;

    public CrosstabRequestMapper(CrosstabCostPolicy costPolicy) {
        this.costPolicy = costPolicy;
    }

    public CrosstabDefinition toDefinition(HuntCrosstabRequestDTO request) {
        MeasureFn fn = parseMeasureFn(request.getValueFn());
        String distinctField = fn == MeasureFn.DISTINCT ? request.getDistinctField() : null;

        Dimension row = toDimension(request.getRowField(), request.getRowBucket(), request.getRowMissing());
        Dimension col = toDimension(request.getColField(), request.getColBucket(), request.getColMissing());
        Dimensions dimensions = new Dimensions(List.of(row), List.of(col));
        Measure measure = new Measure(fn, distinctField);

        int rowSize = costPolicy.clampRowSize(request.getRowSize());
        int colSize = costPolicy.clampColSize(request.getColSize());

        return new CrosstabDefinition(
            request.getQuery(),
            request.getLanguage(),
            request.getTimeRange(),
            request.getIndexType(),
            request.getTenantScope(),
            dimensions,
            List.of(measure),
            rowSize,
            colSize);
    }

    private static Dimension toDimension(String field, HuntCrosstabRequestDTO.BucketDTO bucket, String missing) {
        MissingMode mode = "include".equalsIgnoreCase(missing == null ? "" : missing.trim())
            ? MissingMode.INCLUDE : MissingMode.OMIT;
        if (bucket != null && bucket.getInterval() != null && !bucket.getInterval().isBlank()) {
            return new Dimension(field, DimKind.DATE_HISTOGRAM, mode,
                new BucketSpec(bucket.getInterval().trim(), bucket.getTimezone()));
        }
        return new Dimension(field, DimKind.TERM, mode);
    }

    private static MeasureFn parseMeasureFn(String valueFn) {
        String normalized = valueFn == null ? "count" : valueFn.toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "count" -> MeasureFn.COUNT;
            case "distinct" -> MeasureFn.DISTINCT;
            default -> throw new HuntQueryException("CROSSTAB_MEASURE_UNSUPPORTED",
                "Unsupported measure function: " + valueFn, 0);
        };
    }
}
