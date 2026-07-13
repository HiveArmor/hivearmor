package com.hivearmor.service.network_scan;

import com.hivearmor.domain.network_scan.AssetGroupFilter;
import com.hivearmor.domain.network_scan.UtmAssetGroup;
import com.hivearmor.repository.UtmAssetMetricsRepository;
import com.hivearmor.repository.network_scan.UtmAssetGroupRepository;
import com.hivearmor.repository.network_scan.UtmNetworkScanRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UtmAssetGroupServiceSqlInjectionTest {

    private EntityManager em;
    private UtmAssetGroupService service;

    @BeforeEach
    void setUp() {
        em = mock(EntityManager.class);
        UtmAssetGroupRepository repo = mock(UtmAssetGroupRepository.class);
        UtmAssetMetricsRepository metricsRepo = mock(UtmAssetMetricsRepository.class);
        UtmNetworkScanRepository scanRepo = mock(UtmNetworkScanRepository.class);

        Query mockQuery = mock(Query.class);
        when(em.createNativeQuery(anyString())).thenReturn(mockQuery);
        when(em.createNativeQuery(anyString(), any(Class.class))).thenReturn(mockQuery);
        when(mockQuery.setParameter(anyInt(), any())).thenReturn(mockQuery);
        when(mockQuery.getSingleResult()).thenReturn(0L);
        when(mockQuery.getResultList()).thenReturn(Collections.emptyList());
        when(scanRepo.findAllByGroupId(any())).thenReturn(Optional.empty());

        service = new UtmAssetGroupService(repo, metricsRepo, scanRepo, em);
    }

    /**
     * SEC-NEW-05 / SEC-NEW-06: a malicious column name in the sort request must be stripped by
     * SqlSortValidator before it reaches the SQL string. The ORDER BY clause must never contain
     * the injection payload.
     */
    @Test
    void sortParameterInjectionAttempt_doesNotExecuteArbitrarySql() {
        Sort injectedSort = Sort.by(Sort.Order.asc("1; DROP TABLE utm_asset_group; --"));
        Pageable pageable = PageRequest.of(0, 10, injectedSort);

        assertDoesNotThrow(() -> service.searchGroupsByFilter(new AssetGroupFilter(), pageable));

        // Capture the data query (two-arg createNativeQuery) and assert no injection text in SQL
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(em, atLeastOnce()).createNativeQuery(sqlCaptor.capture(), any(Class.class));
        List<String> captured = sqlCaptor.getAllValues();
        assertThat(captured).isNotEmpty();
        captured.forEach(sql -> {
            assertThat(sql).doesNotContain("DROP TABLE");
            assertThat(sql).doesNotContain("--");
            assertThat(sql).doesNotContain("1; ");
        });
    }

    /**
     * SEC-NEW-06: a SQL injection payload in a string filter must be bound as a positional
     * parameter, not interpolated into the SQL string.
     */
    @Test
    void assetTypeFilterInjection_doesNotReturnExtraRows() {
        AssetGroupFilter filters = new AssetGroupFilter();
        filters.setAssetType("x' OR '1'='1");

        assertDoesNotThrow(() -> service.searchGroupsByFilter(filters, PageRequest.of(0, 100)));

        // The SQL must use ? placeholder, not the raw injection string
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(em, atLeastOnce()).createNativeQuery(sqlCaptor.capture());
        sqlCaptor.getAllValues().forEach(sql -> {
            assertThat(sql).doesNotContain("OR '1'='1");
            assertThat(sql).doesNotContain("x'");
        });
    }

    /**
     * A single-quote in a literal filter value (e.g. Irish name) must not break the query.
     * Parameterized binding handles escaping transparently.
     */
    @Test
    void groupNameFilterWithSpecialChars_isSafe() {
        AssetGroupFilter filters = new AssetGroupFilter();
        filters.setGroupName("O'Brien");

        assertDoesNotThrow(() -> service.searchGroupsByFilter(filters, PageRequest.of(0, 10)));

        // The single-quote must not appear raw in the SQL — only ? placeholders
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(em, atLeastOnce()).createNativeQuery(sqlCaptor.capture());
        sqlCaptor.getAllValues().forEach(sql ->
            assertThat(sql).doesNotContain("O'Brien")
        );
    }

    /**
     * A column name that is on the allowlist must pass through to the ORDER BY clause.
     */
    @Test
    void validSortColumn_isPassedThrough() {
        Sort validSort = Sort.by(Sort.Order.asc("utm_asset_group.group_name"));
        Pageable pageable = PageRequest.of(0, 10, validSort);

        assertDoesNotThrow(() -> service.searchGroupsByFilter(new AssetGroupFilter(), pageable));

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(em, atLeastOnce()).createNativeQuery(sqlCaptor.capture(), any(Class.class));
        assertThat(sqlCaptor.getAllValues())
            .anyMatch(sql -> sql.contains("utm_asset_group.group_name"));
    }
}
