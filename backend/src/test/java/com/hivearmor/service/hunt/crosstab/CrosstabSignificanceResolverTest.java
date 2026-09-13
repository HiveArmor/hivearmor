package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.CellDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO.MetricDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link CrosstabSignificanceResolver} (P4 Option A). Pure arithmetic over a contingency
 * table — the point is that flags are real chi-square residuals, never fabricated, and skipped honestly.
 */
class CrosstabSignificanceResolverTest {

    private final CrosstabSignificanceResolver resolver = new CrosstabSignificanceResolver();

    /**
     * A perfectly-concentrated diagonal (each user only ever touches one host) is maximally surprising vs.
     * independence — every diagonal cell is "over", every implied off-diagonal zero would be "under".
     */
    private HuntCrosstabResponseDTO diagonalMatrix() {
        HuntCrosstabResponseDTO r = new HuntCrosstabResponseDTO();
        r.setRowKeys(List.of("u1", "u2"));
        r.setColKeys(List.of("h1", "h2"));
        r.setRowTotals(List.of(40L, 40L));
        r.setColTotals(List.of(40L, 40L));
        r.setGrandTotal(80L);
        // Only the diagonal is populated (u1×h1=40, u2×h2=40); off-diagonal cells are absent (zero).
        r.setCells(List.of(new CellDTO("u1", "h1", 40), new CellDTO("u2", "h2", 40)));
        return r;
    }

    @Test
    @DisplayName("a concentrated diagonal cell is flagged 'over' with a real residual (expected=20, observed=40)")
    void diagonalOver() {
        HuntCrosstabResponseDTO r = diagonalMatrix();
        boolean computed = resolver.annotate(r);
        assertThat(computed).isTrue();
        var cell = r.getCells().get(0);           // u1 × h1
        assertThat(cell.getSignificance()).isNotNull();
        assertThat(cell.getSignificance().getDirection()).isEqualTo("over");
        assertThat(cell.getSignificance().getExpected()).isEqualTo(20.0);   // 40*40/80
        assertThat(cell.getSignificance().getResidual()).isGreaterThan(2.0);
        assertThat(cell.getSignificance().getRatio()).isEqualTo(2.0);       // 40/20
    }

    @Test
    @DisplayName("a cell exactly at its expected count is NOT flagged (residual 0)")
    void expectedCellNotFlagged() {
        HuntCrosstabResponseDTO r = new HuntCrosstabResponseDTO();
        r.setRowKeys(List.of("u1"));
        r.setColKeys(List.of("h1"));
        r.setRowTotals(List.of(50L));
        r.setColTotals(List.of(50L));
        r.setGrandTotal(50L);                     // expected = 50*50/50 = 50 = observed
        r.setCells(List.of(new CellDTO("u1", "h1", 50)));
        assertThat(resolver.annotate(r)).isTrue();
        assertThat(r.getCells().get(0).getSignificance()).isNull();
    }

    @Test
    @DisplayName("a DISTINCT measure is skipped (residuals over counts only — never faked)")
    void distinctSkipped() {
        HuntCrosstabResponseDTO r = diagonalMatrix();
        r.setMeasure(new MetricDTO("distinct", "user.name", true));
        assertThat(resolver.annotate(r)).isFalse();
        assertThat(r.getCells().get(0).getSignificance()).isNull();
    }

    @Test
    @DisplayName("an empty / zero-grand-total matrix is skipped safely")
    void emptySkipped() {
        HuntCrosstabResponseDTO r = new HuntCrosstabResponseDTO();
        assertThat(resolver.annotate(r)).isFalse();
    }

    @Test
    @DisplayName("a tiny expected count under the floor is not flagged (chi-square honesty guard)")
    void tinyExpectedFloor() {
        HuntCrosstabResponseDTO r = new HuntCrosstabResponseDTO();
        r.setRowKeys(List.of("u1"));
        r.setColKeys(List.of("h1"));
        r.setRowTotals(List.of(1L));
        r.setColTotals(List.of(1L));
        r.setGrandTotal(1000L);                   // expected = 1*1/1000 = 0.001 < MIN_EXPECTED
        r.setCells(List.of(new CellDTO("u1", "h1", 1)));
        assertThat(resolver.annotate(r)).isTrue();
        assertThat(r.getCells().get(0).getSignificance()).isNull();
    }
}
