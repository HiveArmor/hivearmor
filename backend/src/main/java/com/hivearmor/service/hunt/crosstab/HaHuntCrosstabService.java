package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabRequestDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Orchestrates a Hunt Crosstab (Pivot) request: feature-flag gate &rarr; map flat DTO to the neutral
 * definition &rarr; V1 validate &rarr; plan/execute &rarr; telemetry.
 *
 * <p>PR-A P1. Owner/tenant are resolved by the controller and {@code TenantContext} is already set,
 * so the planner's index resolution is tenant-scoped identically to Search.
 */
@Service
public class HaHuntCrosstabService {

    private final CrosstabCostPolicy costPolicy;
    private final CrosstabRequestMapper mapper;
    private final CrosstabDefinitionValidator validator;
    private final HaHuntCrosstabPlanner planner;
    private final CrosstabMetrics metrics;
    private final CrosstabDeviationResolver deviationResolver;
    private final CrosstabSignificanceResolver significanceResolver;

    public HaHuntCrosstabService(CrosstabCostPolicy costPolicy,
                                 CrosstabRequestMapper mapper,
                                 CrosstabDefinitionValidator validator,
                                 HaHuntCrosstabPlanner planner,
                                 CrosstabMetrics metrics,
                                 CrosstabDeviationResolver deviationResolver,
                                 CrosstabSignificanceResolver significanceResolver) {
        this.costPolicy = costPolicy;
        this.mapper = mapper;
        this.validator = validator;
        this.planner = planner;
        this.metrics = metrics;
        this.deviationResolver = deviationResolver;
        this.significanceResolver = significanceResolver;
    }

    public boolean isEnabled() {
        return costPolicy.isEnabled();
    }

    public HuntCrosstabResponseDTO crosstab(HuntCrosstabRequestDTO request,
                                            String owner,
                                            String tenantKey) throws Exception {
        if (!costPolicy.isEnabled()) {
            throw new HuntQueryException("CROSSTAB_DISABLED",
                "The crosstab (Pivot) feature is not enabled", 0);
        }
        metrics.recordRequest();
        try {
            CrosstabDefinition definition = mapper.toDefinition(request);
            validator.validate(definition);
            HuntCrosstabResponseDTO response = planner.plan(definition);
            applyComparison(request, definition, response);
            applyDeviation(request, response);
            applySignificance(request, response);
            if ("PARTIAL".equals(response.getStatus())) {
                metrics.recordPartial();
            }
            if (response.getExecution() != null && response.getExecution().isTruncated()) {
                metrics.recordTruncated();
            }
            if (response.getCells() != null) {
                metrics.recordReturnedCells(response.getCells().size());
            }
            return response;
        } catch (HuntQueryException e) {
            throw e;
        } catch (Exception e) {
            metrics.recordFailure();
            throw e;
        }
    }

    /**
     * P2: when the request asks for a previous-period comparison, run a matrix-only pass over the shifted
     * window using the CURRENT run's members (identical keying + scope), then widen each cell with
     * {@code comparisonValue / delta / deltaPercent}. A non-comparison request is left untouched.
     *
     * <p>Skipped (no error, response unchanged) when the current window is not absolute/parseable, or the
     * current matrix is empty — the comparison is never fabricated. deltaPercent is null when the prior
     * value is 0 (no divide-by-zero, no fabricated infinity).
     */
    private void applyComparison(HuntCrosstabRequestDTO request, CrosstabDefinition definition,
                                 HuntCrosstabResponseDTO response) throws Exception {
        HuntCrosstabRequestDTO.ComparisonDTO cmp = request.getComparison();
        if (cmp == null) return;
        if (response.getCells() == null || response.getCells().isEmpty()) return;
        if (response.getRowKeys() == null || response.getColKeys() == null) return;

        var shifted = ComparisonWindow.shift(definition.timeRange(), cmp.getMode(), cmp.getOffset());
        if (shifted == null) return; // relative/unparseable window — skip rather than guess

        CrosstabDefinition prevDef = definition.withTimeRange(shifted);
        Map<String, Long> prior = planner.comparisonCells(prevDef, response.getRowKeys(), response.getColKeys());

        for (HuntCrosstabResponseDTO.CellDTO cell : response.getCells()) {
            long prev = prior.getOrDefault(cell.getRow() + "\u0000" + cell.getCol(), 0L);
            cell.setComparisonValue(prev);
            cell.setDelta(cell.getValue() - prev);
            cell.setDeltaPercent(prev == 0 ? null : ((cell.getValue() - prev) * 100.0) / prev);
        }
        response.setComparison(new HuntCrosstabResponseDTO.ComparisonDTO(
            cmp.getMode() == null ? "previous_period" : cmp.getMode(), shifted.getFrom(), shifted.getTo()));
        metrics.recordComparison();
    }

    /**
     * P2 Strand B: when requested AND the row axis is a UEBA-scored entity (user.name), attach the EXISTING
     * per-user z-score to each row (most-anomalous metric from the latest run). A no-op for any other row
     * field — never fabricates a score. Read-only; tenant-scoped identically to the UEBA timeline endpoint.
     */
    private void applyDeviation(HuntCrosstabRequestDTO request, HuntCrosstabResponseDTO response) {
        if (!request.isDeviation()) return;
        if (response.getRowKeys() == null || response.getRowKeys().isEmpty()) return;
        var deviations = deviationResolver.resolve(request.getRowField(), response.getRowKeys());
        if (deviations != null) response.setRowDeviations(deviations);
    }

    /**
     * P4 (Option A): when requested, flag cells whose observed count is surprising given the row/col totals
     * (standardized chi-square residual over the SHOWN matrix). Pure arithmetic on counts already in the
     * response — no OpenSearch call, no fabricated score. Safely skipped for a DISTINCT measure or an empty
     * matrix. Records the honest scope flag so the UI can say "within this result set".
     */
    private void applySignificance(HuntCrosstabRequestDTO request, HuntCrosstabResponseDTO response) {
        if (!request.isSignificance()) return;
        boolean computed = significanceResolver.annotate(response);
        if (computed) {
            response.setSignificanceScopedToShownMatrix(Boolean.TRUE);
            metrics.recordSignificance();
        }
    }
}
