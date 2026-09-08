package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.CellDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.SignificanceDTO;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * P4 (Option A) — deterministic significant-combination detection.
 *
 * <p>Given the already-built matrix (cells + rowKeys/colKeys + rowTotals/colTotals + grandTotal), flags the
 * cells whose observed count is <b>surprising given the marginal totals</b>. For each cell it computes the
 * expected count under row/column independence ({@code expected = rowTotal * colTotal / grandTotal}) and the
 * standardized (Pearson) residual {@code (observed - expected) / sqrt(expected)}. A cell is flagged when
 * {@code |residual| >= RESIDUAL_THRESHOLD} AND {@code expected >= MIN_EXPECTED} (the floor keeps the
 * chi-square approximation honest — a tiny expected count produces a huge residual for a single event).
 *
 * <p><b>No fabricated score.</b> Every number is a standard statistic derived from counts already in the
 * response — no OpenSearch call, no model, no baseline query. The residuals are scoped to the SHOWN matrix
 * (top-N axes may be truncated), which the caller records on the response so the UI can label it honestly.
 *
 * <p>Skipped safely (returns false, response untouched) when the matrix or its marginals are missing/empty,
 * or the measure is DISTINCT (residuals over a contingency table of counts only — a distinct measure is not
 * an additive count, so significance is not computed and never faked).
 */
@Component
public class CrosstabSignificanceResolver {

    static final double RESIDUAL_THRESHOLD = 2.0;   // ~2σ from expected under independence
    static final double MIN_EXPECTED = 1.0;         // floor so a single rare event can't dominate

    /**
     * Annotate flagged cells in place with a {@link SignificanceDTO}. Returns true when significance was
     * actually computed (so the caller can set the scope flag), false when it was safely skipped.
     */
    public boolean annotate(HuntCrosstabResponseDTO response) {
        if (response == null) return false;
        // DISTINCT measures are not additive counts — a contingency-residual would be meaningless. Skip.
        if (response.getMeasure() != null && "distinct".equalsIgnoreCase(response.getMeasure().getFunction())) {
            return false;
        }
        List<CellDTO> cells = response.getCells();
        List<String> rowKeys = response.getRowKeys();
        List<String> colKeys = response.getColKeys();
        List<Long> rowTotals = response.getRowTotals();
        List<Long> colTotals = response.getColTotals();
        long grand = response.getGrandTotal();
        if (cells == null || cells.isEmpty() || grand <= 0
            || rowKeys == null || colKeys == null || rowTotals == null || colTotals == null
            || rowTotals.size() != rowKeys.size() || colTotals.size() != colKeys.size()) {
            return false;
        }

        Map<String, Long> rowTotalByKey = indexTotals(rowKeys, rowTotals);
        Map<String, Long> colTotalByKey = indexTotals(colKeys, colTotals);

        for (CellDTO cell : cells) {
            Long rt = rowTotalByKey.get(cell.getRow());
            Long ct = colTotalByKey.get(cell.getCol());
            if (rt == null || ct == null || rt <= 0 || ct <= 0) continue;

            double expected = ((double) rt * (double) ct) / (double) grand;
            if (expected < MIN_EXPECTED) continue;

            double residual = (cell.getValue() - expected) / Math.sqrt(expected);
            if (Math.abs(residual) < RESIDUAL_THRESHOLD) continue;

            double ratio = cell.getValue() / expected;
            String direction = residual >= 0 ? "over" : "under";
            cell.setSignificance(new SignificanceDTO(
                round(residual), round(expected), round(ratio), direction));
        }
        return true;
    }

    private static Map<String, Long> indexTotals(List<String> keys, List<Long> totals) {
        Map<String, Long> m = new HashMap<>();
        for (int i = 0; i < keys.size(); i++) {
            m.put(keys.get(i), totals.get(i));
        }
        return m;
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
