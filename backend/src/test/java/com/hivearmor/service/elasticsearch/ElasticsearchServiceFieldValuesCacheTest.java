package com.hivearmor.service.elasticsearch;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.hivearmor.opensearch.OpenSearch;
import com.hivearmor.opensearch.enums.TermOrder;
import com.hivearmor.service.MailService;
import com.hivearmor.service.UtmSpaceNotificationControlService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.index_policy.IndexPolicyService;
import com.hivearmor.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch._types.SortOrder;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ElasticsearchServiceFieldValuesCacheTest {

    private OpenSearch openSearch;
    private OpensearchClientBuilder clientBuilder;
    private Cache<String, List<String>> fieldValuesCache;
    private ElasticsearchService service;

    @BeforeEach
    void setUp() throws Exception {
        openSearch = mock(OpenSearch.class);
        clientBuilder = mock(OpensearchClientBuilder.class);
        when(clientBuilder.getClient()).thenReturn(openSearch);

        fieldValuesCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(60))
                .maximumSize(500)
                .build();

        service = new ElasticsearchService(
                mock(ApplicationEventService.class),
                mock(UserRepository.class),
                mock(MailService.class),
                mock(UtmSpaceNotificationControlService.class),
                mock(IndexPolicyService.class),
                clientBuilder,
                fieldValuesCache
        );
    }

    @Test
    void getFieldValues_callsOpenSearchOnCacheMiss() throws Exception {
        when(openSearch.getFieldValues(
                eq("user.keyword"), eq("v3-hive-log-*"),
                isNull(), eq(500), any(TermOrder.class), any(SortOrder.class)
        )).thenReturn(Map.of("value1", 10L, "value2", 5L));

        List<String> result = service.getFieldValues("user.keyword", "v3-hive-log-*");

        assertThat(result).containsExactlyInAnyOrder("value1", "value2");
        verify(openSearch, times(1)).getFieldValues(
                anyString(), anyString(), isNull(), eq(500), any(), any());
    }

    @Test
    void getFieldValues_returnsCachedValueOnSecondCall() throws Exception {
        when(openSearch.getFieldValues(
                eq("user.keyword"), eq("v3-hive-log-*"),
                isNull(), anyInt(), any(TermOrder.class), any(SortOrder.class)
        )).thenReturn(Map.of("value1", 10L));

        service.getFieldValues("user.keyword", "v3-hive-log-*");
        service.getFieldValues("user.keyword", "v3-hive-log-*");

        verify(openSearch, times(1)).getFieldValues(
                anyString(), anyString(), any(), anyInt(), any(), any());
    }

    @Test
    void getFieldValues_neverRequestsMoreThan500Buckets() throws Exception {
        when(openSearch.getFieldValues(
                anyString(), anyString(), isNull(), anyInt(), any(TermOrder.class), any(SortOrder.class)
        )).thenReturn(Collections.emptyMap());

        service.getFieldValues("host.keyword", "v3-hive-log-*");

        verify(openSearch).getFieldValues(
                anyString(), anyString(), isNull(),
                intThat(size -> size <= 500),
                any(), any());
    }

    @Test
    void getFieldValues_differentKeysNotSharedInCache() throws Exception {
        when(openSearch.getFieldValues(
                anyString(), anyString(), isNull(), anyInt(), any(TermOrder.class), any(SortOrder.class)
        )).thenReturn(Map.of("v", 1L));

        service.getFieldValues("user.keyword", "index-a-*");
        service.getFieldValues("user.keyword", "index-b-*");

        // Two distinct cache keys → two OpenSearch calls
        verify(openSearch, times(2)).getFieldValues(
                anyString(), anyString(), any(), anyInt(), any(), any());
    }
}
