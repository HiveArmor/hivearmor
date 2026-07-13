package com.hivearmor.service.network_scan;

import com.hivearmor.domain.UtmAssetMetrics;
import com.hivearmor.domain.network_scan.AssetGroupFilter;
import com.hivearmor.domain.network_scan.UtmAssetGroup;
import com.hivearmor.domain.network_scan.UtmNetworkScan;
import com.hivearmor.repository.UtmAssetMetricsRepository;
import com.hivearmor.repository.network_scan.UtmAssetGroupRepository;
import com.hivearmor.repository.network_scan.UtmNetworkScanRepository;
import com.hivearmor.service.dto.network_scan.AssetGroupDTO;
import com.hivearmor.util.SqlSortValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Service Implementation for managing UtmAssetGroup.
 */
@Service
@Transactional
public class UtmAssetGroupService {

    private final Logger log = LoggerFactory.getLogger(UtmAssetGroupService.class);
    private static final String CLASSNAME = "UtmAssetGroupService";

    private static final Set<String> ASSET_GROUP_SORT_COLS = Set.of(
        "hive_asset_group.id",
        "hive_asset_group.group_name",
        "hive_asset_group.group_description",
        "hive_network_scan.asset_ip",
        "hive_network_scan.asset_name",
        "hive_network_scan.os",
        "hive_network_scan.type",
        "created_date",
        "last_modified_date"
    );

    private final UtmAssetGroupRepository utmAssetGroupRepository;
    private final UtmAssetMetricsRepository assetMetricsRepository;
    private final UtmNetworkScanRepository networkScanRepository;
    private final EntityManager em;

    public UtmAssetGroupService(UtmAssetGroupRepository utmAssetGroupRepository,
                                UtmAssetMetricsRepository assetMetricsRepository,
                                UtmNetworkScanRepository networkScanRepository, EntityManager em) {
        this.utmAssetGroupRepository = utmAssetGroupRepository;
        this.assetMetricsRepository = assetMetricsRepository;
        this.networkScanRepository = networkScanRepository;
        this.em = em;
    }

    /**
     * Save a utmAssetGroup.
     *
     * @param utmAssetGroup the entity to save
     * @return the persisted entity
     */
    public UtmAssetGroup save(UtmAssetGroup utmAssetGroup) {
        log.debug("Request to save UtmAssetGroup : {}", utmAssetGroup);
        return utmAssetGroupRepository.save(utmAssetGroup);
    }

    /**
     * Get all the utmAssetGroups.
     *
     * @param pageable the pagination information
     * @return the list of entities
     */
    @Transactional(readOnly = true)
    public Page<UtmAssetGroup> findAll(Pageable pageable) {
        log.debug("Request to get all UtmAssetGroups");
        return utmAssetGroupRepository.findAll(pageable);
    }

    public Page<AssetGroupDTO> searchGroupsByFilter(AssetGroupFilter filter, Pageable pageable) {
        FilteredQuery fq = buildFilteredQuery(filter);
        Sort validatedSort = SqlSortValidator.validateAndFilter(pageable.getSort(), ASSET_GROUP_SORT_COLS);

        String countSql = "SELECT count(*) FROM (" + fq.sql + ") AS total";
        Query countQuery = em.createNativeQuery(countSql);
        applyParams(countQuery, fq.params);
        long count = ((Number) countQuery.getSingleResult()).longValue();

        String dataSql = fq.sql + buildSortClause(validatedSort)
            + " OFFSET " + pageable.getOffset() + " LIMIT " + pageable.getPageSize();
        Query dataQuery = em.createNativeQuery(dataSql, UtmAssetGroup.class);
        applyParams(dataQuery, fq.params);

        List<UtmAssetGroup> results = new ArrayList<>(dataQuery.getResultList());

        if (!CollectionUtils.isEmpty(results)) {
            results.forEach(g -> {
                Optional<List<UtmNetworkScan>> assetsOpt = networkScanRepository.findAllByGroupId(g.getId());
                if (assetsOpt.isPresent()) {
                    g.setAssets(assetsOpt.get());
                    List<String> assetNames = assetsOpt.get().stream()
                        .map(UtmNetworkScan::getAssetName).collect(Collectors.toList());
                    List<UtmAssetMetrics> metrics = assetMetricsRepository.findAllByAssetNameIn(assetNames);
                    g.setMetrics(metrics);
                }
            });
        }
        return new PageImpl<>(results.stream().map(AssetGroupDTO::new).collect(Collectors.toList()), pageable, count);
    }

    /**
     * Get one utmAssetGroup by id.
     *
     * @param id the id of the entity
     * @return the entity
     */
    @Transactional(readOnly = true)
    public Optional<UtmAssetGroup> findOne(Long id) {
        log.debug("Request to get UtmAssetGroup : {}", id);
        return utmAssetGroupRepository.findById(id);
    }

    /**
     * Delete the utmAssetGroup by id.
     *
     * @param id the id of the entity
     */
    public void delete(Long id) {
        log.debug("Request to delete UtmAssetGroup : {}", id);
        utmAssetGroupRepository.deleteById(id);
    }

    private static class FilteredQuery {
        final String sql;
        final List<Object> params;
        FilteredQuery(String sql, List<Object> params) {
            this.sql = sql;
            this.params = params;
        }
    }

    private FilteredQuery buildFilteredQuery(AssetGroupFilter filters) {
        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        sb.append("SELECT DISTINCT hive_asset_group.* FROM hive_asset_group"
            + " LEFT JOIN hive_network_scan ON hive_asset_group.id = hive_network_scan.group_id"
            + " WHERE 1=1\n");

        if (filters == null) {
            return new FilteredQuery(sb.toString(), params);
        }

        // assetType (scalar, single value)
        if (StringUtils.hasText(filters.getAssetType())) {
            sb.append("AND type = ?\n");
            params.add(filters.getAssetType());
        }

        // id (numeric — no injection risk, but keep consistent)
        if (Objects.nonNull(filters.getId())) {
            sb.append("AND hive_asset_group.id = ?\n");
            params.add(filters.getId());
        }

        // groupName (LIKE)
        if (StringUtils.hasText(filters.getGroupName())) {
            sb.append("AND lower(hive_asset_group.group_name) LIKE ?\n");
            params.add("%" + filters.getGroupName().toLowerCase() + "%");
        }

        // date range
        if (Objects.nonNull(filters.getInitDate()) && Objects.nonNull(filters.getEndDate())) {
            sb.append("AND (hive_asset_group.created_date BETWEEN ? AND ?)\n");
            params.add(filters.getInitDate());
            params.add(filters.getEndDate());
        }

        // type list (IN clause via repeated positional params)
        if (!CollectionUtils.isEmpty(filters.getType())) {
            appendInClause(sb, params,
                "hive_network_scan.asset_type_id IN (SELECT hive_asset_types.id FROM hive_asset_types WHERE hive_asset_types.type_name IN (",
                filters.getType());
        }

        // probe list
        if (!CollectionUtils.isEmpty(filters.getProbe())) {
            appendInClause(sb, params, "hive_network_scan.server_name IN (", filters.getProbe());
        }

        // os list
        if (!CollectionUtils.isEmpty(filters.getOs())) {
            appendInClause(sb, params, "hive_network_scan.asset_os IN (", filters.getOs());
        }

        // assetIp list
        if (!CollectionUtils.isEmpty(filters.getAssetIp())) {
            appendInClause(sb, params, "hive_network_scan.asset_ip IN (", filters.getAssetIp());
        }

        // assetName list
        if (!CollectionUtils.isEmpty(filters.getAssetName())) {
            appendInClause(sb, params, "hive_network_scan.asset_name IN (", filters.getAssetName());
        }

        return new FilteredQuery(sb.toString(), params);
    }

    // Builds "AND <prefix>?,?,?<closeParen>)\n" and adds values to params.
    // prefix should end with " IN (" or the sub-select opening; we close with "))\n" for
    // subselects (type_name) and ")\n" for direct IN clauses.
    private void appendInClause(StringBuilder sb, List<Object> params, String prefix, List<String> values) {
        sb.append("AND ").append(prefix);
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('?');
            params.add(values.get(i));
        }
        // close the sub-select bracket if it was opened
        if (prefix.contains("SELECT")) {
            sb.append("))\n");
        } else {
            sb.append(")\n");
        }
    }

    private void applyParams(Query query, List<Object> params) {
        for (int i = 0; i < params.size(); i++) {
            query.setParameter(i + 1, params.get(i));
        }
    }

    // Returns " ORDER BY col1 DIR, col2 DIR" or "" if nothing to sort.
    // Columns come from the allowlist — safe to interpolate directly.
    private String buildSortClause(Sort sort) {
        if (sort.isUnsorted()) return "\n";
        return "\nORDER BY " + sort.stream()
            .map(o -> o.getProperty() + " " + o.getDirection().name())
            .collect(Collectors.joining(", ")) + "\n";
    }
}
