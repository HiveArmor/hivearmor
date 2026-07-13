package com.hivearmor.service.compliance.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.hivearmor.domain.compliance.UtmComplianceControlConfig;
import com.hivearmor.service.dto.compliance.UtmComplianceControlConfigDto;
import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryDto;
import com.hivearmor.service.dto.compliance.UtmComplianceControlLatestEvaluationDto;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.mapper.compliance.UtmComplianceControlConfigMapper;
import com.hivearmor.service.mapper.compliance.UtmComplianceControlLatestEvaluationMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import jakarta.persistence.EntityNotFoundException;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class UtmComplianceControlEvaluationLatestService {

    private final UtmComplianceControlConfigService configService;
    private final ElasticsearchService elasticsearchService;
    private final UtmComplianceControlConfigMapper controlMapper;

    // Keys are sorted comma-joined control IDs; values are the batch result map.
    private final Cache<String, Map<Long, UtmComplianceControlEvaluationHistoryDto>> evalCache =
            Caffeine.newBuilder()
                    .expireAfterWrite(60, TimeUnit.SECONDS)
                    .maximumSize(20)
                    .build();

    public UtmComplianceControlEvaluationLatestService(UtmComplianceControlConfigService configService,
                                                       ElasticsearchService elasticsearchService,
                                                       UtmComplianceControlConfigMapper controlMapper) {
        this.configService = configService;
        this.elasticsearchService = elasticsearchService;
        this.controlMapper = controlMapper;
    }

    public Page<UtmComplianceControlLatestEvaluationDto> getControlsWithLastEvaluation(
            Long sectionId, String search, Pageable pageable) {

        Page<UtmComplianceControlConfig> controls = configService.findBySection(sectionId, search, pageable);

        if (controls.isEmpty()) return controls.map(c -> null);

        List<Long> ids = controls.getContent().stream()
                .map(UtmComplianceControlConfig::getId)
                .collect(Collectors.toList());

        Map<Long, UtmComplianceControlEvaluationHistoryDto> evaluations = fetchBatchCached(ids);

        return controls.map(control -> {
            UtmComplianceControlConfigDto controlDto = controlMapper.toDto(control);
            return UtmComplianceControlLatestEvaluationMapper.toDto(controlDto, evaluations.get(control.getId()));
        });
    }

    public UtmComplianceControlLatestEvaluationDto getControlWithLastEvaluation(Long controlId) {
        UtmComplianceControlConfigDto controlDto = configService.findById(controlId);
        var lastEval = elasticsearchService.getLatestControlEvaluation(controlId);
        return UtmComplianceControlLatestEvaluationMapper.toDto(controlDto, lastEval);
    }

    private Map<Long, UtmComplianceControlEvaluationHistoryDto> fetchBatchCached(List<Long> controlIds) {
        String cacheKey = controlIds.stream()
                .sorted()
                .map(String::valueOf)
                .collect(Collectors.joining(","));
        return evalCache.get(cacheKey, key -> elasticsearchService.getBatchLatestEvaluations(controlIds));
    }
}
