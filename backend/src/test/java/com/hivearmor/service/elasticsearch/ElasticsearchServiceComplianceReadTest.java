package com.hivearmor.service.elasticsearch;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.opensearch.OpenSearch;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.MailService;
import com.hivearmor.service.UtmSpaceNotificationControlService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.index_policy.IndexPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.core.SearchRequest;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ElasticsearchServiceComplianceReadTest {

    private OpenSearch openSearch;
    private OpensearchClientBuilder clientBuilder;
    private ElasticsearchService service;

    @BeforeEach
    void setUp() throws Exception {
        openSearch = mock(OpenSearch.class);
        clientBuilder = mock(OpensearchClientBuilder.class);
        when(clientBuilder.getClient()).thenReturn(openSearch);

        Cache<String, List<String>> fieldValuesCache = Caffeine.newBuilder().maximumSize(10).build();
        service = new ElasticsearchService(
                mock(ApplicationEventService.class),
                mock(UserRepository.class),
                mock(MailService.class),
                mock(UtmSpaceNotificationControlService.class),
                mock(IndexPolicyService.class),
                clientBuilder,
                fieldValuesCache,
                new MsspIndexResolver()
        );
    }

    @Test
    void getControlEvaluations_missingIndexReturnsEmptyList() throws Exception {
        when(clientBuilder.execute(any())).thenThrow(new RuntimeException("index_not_found_exception"));

        assertThat(service.getControlEvaluations(1L)).isEmpty();
    }

    @Test
    void getLatestControlEvaluation_missingIndexReturnsNull() throws Exception {
        when(openSearch.search(any(SearchRequest.class), eq(Map.class)))
                .thenThrow(new RuntimeException("no such index"));

        assertThat(service.getLatestControlEvaluation(1L)).isNull();
    }
}
