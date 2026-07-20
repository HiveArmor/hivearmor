package com.hivearmor.service.compliance;

import com.hivearmor.domain.compliance.UtmComplianceEvalHistory;
import com.hivearmor.repository.compliance.UtmComplianceControlConfigRepository;
import com.hivearmor.repository.compliance.UtmComplianceEvalHistoryRepository;
import com.hivearmor.repository.compliance.UtmComplianceStandardRepository;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;

/**
 * Scheduled service that reads real-time compliance evidence from OpenSearch
 * (_v3_hive_compliance_evidence-*) and produces per-framework scores, persisted
 * to hive_compliance_eval_history.
 *
 * Score formula per control:
 *   score = (sum of EVIDENCE weights) / (sum of EVIDENCE + VIOLATION weights + MIN_DENOMINATOR) * 100
 * MIN_DENOMINATOR prevents divide-by-zero on fresh deployments.
 */
@Service
public class ComplianceEvidenceScoringService {

    private static final Logger log = LoggerFactory.getLogger(ComplianceEvidenceScoringService.class);
    private static final String EVIDENCE_INDEX = "v3-hive-compliance-evidence-*";
    private static final double MIN_DENOMINATOR = 1.0;

    private final ElasticsearchService elasticsearchService;
    private final UtmComplianceControlConfigRepository controlConfigRepository;
    private final UtmComplianceStandardRepository standardRepository;
    private final UtmComplianceEvalHistoryRepository evalHistoryRepository;

    public ComplianceEvidenceScoringService(
            ElasticsearchService elasticsearchService,
            UtmComplianceControlConfigRepository controlConfigRepository,
            UtmComplianceStandardRepository standardRepository,
            UtmComplianceEvalHistoryRepository evalHistoryRepository) {
        this.elasticsearchService = elasticsearchService;
        this.controlConfigRepository = controlConfigRepository;
        this.standardRepository = standardRepository;
        this.evalHistoryRepository = evalHistoryRepository;
    }

    /**
     * Runs every 30 seconds. Skips silently when the evidence index does not yet exist.
     */
    @Scheduled(fixedDelay = 30_000, initialDelay = 15_000)
    @Transactional
    public void evaluateAllStandards() {
        try {
            standardRepository.findAll().forEach(standard -> {
                try {
                    evaluateStandard(standard.getId());
                } catch (Exception e) {
                    log.warn("[compliance-scoring] skipping standard={}: {}", standard.getId(), e.getMessage());
                }
            });
        } catch (Exception e) {
            log.error("[compliance-scoring] scheduled run failed: {}", e.getMessage(), e);
        }
    }

    private void evaluateStandard(Long standardId) {
        List<Long> controlIds = controlConfigRepository.findControlIdsByStandardId(standardId);
        if (controlIds.isEmpty()) {
            return;
        }

        int passed = 0;
        int failed = 0;
        double totalScore = 0.0;

        for (Long controlId : controlIds) {
            double score = scoreControl(controlId);
            totalScore += score;
            if (score >= 50.0) {
                passed++;
            } else {
                failed++;
            }
        }

        double overallScore = totalScore / controlIds.size();

        UtmComplianceEvalHistory history = new UtmComplianceEvalHistory();
        history.setFrameworkId(standardId);
        history.setEvaluatedAt(Instant.now());
        history.setOverallScore(BigDecimal.valueOf(overallScore).setScale(2, RoundingMode.HALF_UP));
        history.setControlsPassed(passed);
        history.setControlsFailed(failed);
        history.setControlsTotal(controlIds.size());
        evalHistoryRepository.save(history);
    }

    /**
     * Scores a single control by aggregating weighted evidence and violation hits
     * from the evidence index for non-expired records only.
     */
    public double scoreControl(Long controlId) {
        try {
            String now = Instant.now().toString();
            SearchRequest request = SearchRequest.of(s -> s
                    .index(EVIDENCE_INDEX)
                    .query(q -> q.bool(b -> b
                            .must(m -> m.term(t -> t
                                    .field("controlId")
                                    .value(FieldValue.of(controlId))
                            ))
                            .filter(f -> f.range(r -> r
                                    .field("evidenceExpiresAt")
                                    .gte(JsonData.of(now))
                            ))
                    ))
                    .aggregations("by_type", agg -> agg
                            .terms(t -> t.field("mappingType.keyword").size(10))
                            .aggregations("total_weight", sub -> sub
                                    .sum(sum -> sum.field("weight"))
                            )
                    )
                    .size(0)
            );

            SearchResponse<Map> response = elasticsearchService.search(request, Map.class);

            double evidenceWeight = 0.0;
            double violationWeight = 0.0;

            var byType = response.aggregations().get("by_type");
            if (byType != null && byType.isSterms()) {
                for (StringTermsBucket bucket : byType.sterms().buckets().array()) {
                    String type = bucket.key();
                    double weight = bucket.aggregations().get("total_weight").sum().value();
                    if ("EVIDENCE".equalsIgnoreCase(type)) {
                        evidenceWeight += weight;
                    } else if ("VIOLATION".equalsIgnoreCase(type)) {
                        violationWeight += weight;
                    }
                    // INDICATOR type does not affect score
                }
            }

            double denominator = evidenceWeight + violationWeight + MIN_DENOMINATOR;
            return (evidenceWeight / denominator) * 100.0;

        } catch (Exception e) {
            log.debug("[compliance-scoring] scoreControl controlId={}: {}", controlId, e.getMessage());
            return 0.0;
        }
    }
}
