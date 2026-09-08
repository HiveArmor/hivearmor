package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabRequestDTO;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO;
import org.springframework.stereotype.Service;

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

    public HaHuntCrosstabService(CrosstabCostPolicy costPolicy,
                                 CrosstabRequestMapper mapper,
                                 CrosstabDefinitionValidator validator,
                                 HaHuntCrosstabPlanner planner,
                                 CrosstabMetrics metrics) {
        this.costPolicy = costPolicy;
        this.mapper = mapper;
        this.validator = validator;
        this.planner = planner;
        this.metrics = metrics;
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
}
