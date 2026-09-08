package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.domain.ueba.HaUebaDeviation;
import com.hivearmor.repository.ueba.HaUebaDeviationRepository;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.web.rest.hunt.dto.HuntCrosstabResponseDTO;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * P2 Strand B: attaches the EXISTING UEBA z-score to crosstab rows whose axis is a UEBA-scored entity.
 *
 * <p>Deliberately narrow. The only real behavioural baseline in the platform is
 * {@code HaUebaDeviationEngine} — per-user, per-metric z-scores against peer-group baselines (the fixed
 * {@code UebaMetrics.METRIC_SET}). It does NOT produce a score for an arbitrary crosstab cell, so this
 * resolver only fires when the ROW axis is {@code user.name}, and only for users that have a real
 * deviation row. For each such user it surfaces the MOST ANOMALOUS metric (max |z|) from that user's most
 * recent scoring run — a real value, never invented. Users with no deviation get {@code null}. Every other
 * row field is a no-op. Tenant-scoped identically to {@code GET /api/ha-ueba/entity-timeline}.
 */
@Component
public class CrosstabDeviationResolver {

    /** The only row field for which a UEBA deviation exists. */
    static final String UEBA_ENTITY_FIELD = "user.name";

    private final HaUebaDeviationRepository deviationRepository;

    public CrosstabDeviationResolver(HaUebaDeviationRepository deviationRepository) {
        this.deviationRepository = deviationRepository;
    }

    /** True when a deviation resolve is possible for this row axis. */
    public boolean applies(String rowField) {
        return UEBA_ENTITY_FIELD.equals(rowField);
    }

    /**
     * @return a list aligned index-for-index with {@code rowKeys}; each entry is the user's most-anomalous
     *         real z-score, or {@code null} when that user has no UEBA deviation. Returns {@code null} when
     *         the row axis is not a UEBA entity (caller leaves the response unchanged).
     */
    public List<HuntCrosstabResponseDTO.DeviationDTO> resolve(String rowField, List<String> rowKeys) {
        if (!applies(rowField) || rowKeys == null || rowKeys.isEmpty()) return null;
        String tenantId = TenantContext.get();
        List<HuntCrosstabResponseDTO.DeviationDTO> out = new ArrayList<>(rowKeys.size());
        for (String user : rowKeys) {
            out.add(latestMostAnomalous(tenantId, user));
        }
        return out;
    }

    /** The max-|z| metric from the user's most recent scoring run, or null when the user has no deviation. */
    private HuntCrosstabResponseDTO.DeviationDTO latestMostAnomalous(String tenantId, String user) {
        List<HaUebaDeviation> rows = deviationRepository
            .findAllByTenantIdAndUserIdOrderByRunTsAsc(tenantId, user);
        if (rows.isEmpty()) return null;
        // Rows are ascending by runTs; the last run is the most recent.
        Instant latestRun = rows.get(rows.size() - 1).getRunTs();
        HaUebaDeviation best = null;
        for (HaUebaDeviation d : rows) {
            if (!d.getRunTs().equals(latestRun)) continue;
            if (best == null || Math.abs(d.getZScore()) > Math.abs(best.getZScore())) best = d;
        }
        return best == null ? null
            : new HuntCrosstabResponseDTO.DeviationDTO(best.getMetricName(), best.getZScore());
    }
}
