package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.domain.uba.UtmUbaEntityRisk;
import com.hivearmor.repository.uba.UtmUbaEntityRiskRepository;
import com.hivearmor.service.dto.*;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch._types.query_dsl.TermQuery;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.json.JsonData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Service for entity list, entity detail, entity alerts and entity events.
 *
 * Entity list/detail: backed by hive_uba_entity_risk (PostgreSQL).
 * Alerts per entity:  backed by OpenSearch v3-hive-alert-* index pattern.
 * Events per entity:  backed by OpenSearch v3-hive-log-* index pattern (raw log events).
 */
@Service
@Transactional(readOnly = true)
public class HiveEntityService {

    private static final Logger log = LoggerFactory.getLogger(HiveEntityService.class);
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_INSTANT.withZone(ZoneOffset.UTC);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final UtmUbaEntityRiskRepository entityRepo;
    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;

    public HiveEntityService(UtmUbaEntityRiskRepository entityRepo,
                             OpensearchClientBuilder osClient,
                             MsspIndexResolver indexResolver) {
        this.entityRepo = entityRepo;
        this.osClient = osClient;
        this.indexResolver = indexResolver;
    }

    // ------------------------------------------------------------------
    // Entity list
    // ------------------------------------------------------------------

    public Page<UtmUbaEntityRisk> listEntities(String type, int page, int size) {
        PageRequest pr = PageRequest.of(page, size);
        if (type != null && !type.isBlank()) {
            return entityRepo.findByEntityTypeOrderByRiskScoreDesc(type, pr);
        }
        return entityRepo.findAllByOrderByRiskScoreDesc(pr);
    }

    public HiveEntityDTO toEntityDTO(UtmUbaEntityRisk e) {
        HiveEntityDTO dto = new HiveEntityDTO();
        dto.setId(e.getEntityId());
        dto.setEntityType(e.getEntityType());
        dto.setRiskScore(e.getRiskScore());
        dto.setAlertCount(e.getAlertCount());

        // Resolve hostname / ipAddress by entity type
        if ("host".equals(e.getEntityType())) {
            dto.setHostname(e.getDisplayName() != null ? e.getDisplayName() : e.getEntityId());
        } else if ("ip".equals(e.getEntityType())) {
            dto.setIpAddress(e.getEntityId());
        } else if ("user".equals(e.getEntityType())) {
            dto.setHostname(e.getDisplayName() != null ? e.getDisplayName() : e.getEntityId());
        } else {
            dto.setHostname(e.getDisplayName() != null ? e.getDisplayName() : e.getEntityId());
        }

        if (e.getLastSeen() != null) {
            dto.setLastSeen(ISO.format(e.getLastSeen()));
        }
        return dto;
    }

    // ------------------------------------------------------------------
    // Entity detail
    // ------------------------------------------------------------------

    public Optional<HiveEntityDetailDTO> getEntityDetail(String entityId) {
        Optional<UtmUbaEntityRisk> opt = entityRepo.findFirstByEntityId(entityId);
        if (opt.isEmpty()) return Optional.empty();

        UtmUbaEntityRisk e = opt.get();
        HiveEntityDetailDTO dto = new HiveEntityDetailDTO();
        dto.setId(e.getEntityId());
        dto.setName(e.getDisplayName() != null ? e.getDisplayName() : e.getEntityId());
        dto.setEntityType(e.getEntityType());
        dto.setRiskScore(e.getRiskScore());
        dto.setAlertCount(e.getAlertCount());
        if (e.getLastSeen() != null) {
            dto.setLastSeen(ISO.format(e.getLastSeen()));
        }

        // Parse risk timeline from riskTrendJson
        dto.setRiskTimeline(parseRiskTimeline(e.getRiskTrendJson()));

        // Enrich from OpenSearch: associated users/hosts and attack techniques
        try {
            enrichDetail(dto, e.getEntityId(), e.getEntityType());
        } catch (Exception ex) {
            log.warn("HiveEntityService.getEntityDetail: enrichment failed for {}: {}", entityId, ex.getMessage());
        }

        return Optional.of(dto);
    }

    private List<HiveEntityDetailDTO.RiskTimelinePoint> parseRiskTimeline(String riskTrendJson) {
        if (riskTrendJson == null || riskTrendJson.isBlank()) return List.of();
        try {
            List<Map<String, Object>> trend = MAPPER.readValue(riskTrendJson,
                new TypeReference<List<Map<String, Object>>>() {});
            List<HiveEntityDetailDTO.RiskTimelinePoint> timeline = new ArrayList<>();
            for (Map<String, Object> point : trend) {
                HiveEntityDetailDTO.RiskTimelinePoint p = new HiveEntityDetailDTO.RiskTimelinePoint();
                p.setTimestamp(String.valueOf(point.getOrDefault("timestamp", "")));
                p.setScore(((Number) point.getOrDefault("score", 0)).intValue());
                timeline.add(p);
            }
            return timeline;
        } catch (Exception e) {
            return List.of();
        }
    }

    private void enrichDetail(HiveEntityDetailDTO dto, String entityId, String entityType) throws Exception {
        String field = entityField(entityType);
        String since = Instant.now().minus(30, ChronoUnit.DAYS).toString();

        Query q = Query.of(qb -> qb.bool(BoolQuery.of(b -> b
            .must(Query.of(m -> m.term(TermQuery.of(t -> t
                .field(field + ".keyword").value(FieldValue.of(entityId))))))
            .must(Query.of(m -> m.range(RangeQuery.of(r -> r
                .field("@timestamp").gte(JsonData.of(since))))))
        )));

        SearchRequest req = SearchRequest.of(r -> r
            .index(indexResolver.resolveAlertIndexPattern())
            .query(q)
            .size(0)
            .aggregations("techniques",    a -> a.terms(t -> t.field("tags.keyword").size(20)))
            .aggregations("assoc_users",   a -> a.terms(t -> t.field("adversary.user.keyword").size(10)))
            .aggregations("assoc_hosts",   a -> a.terms(t -> t.field("adversary.host.keyword").size(10)))
        );

        @SuppressWarnings("rawtypes")
        SearchResponse<Map> resp = osClient.execute(os -> os.search(req, Map.class));

        // Attack techniques from tags aggregation
        List<HiveEntityDetailDTO.AttackTechnique> techniques = new ArrayList<>();
        var techAgg = resp.aggregations().get("techniques");
        if (techAgg != null && techAgg.sterms() != null) {
            for (StringTermsBucket bucket : techAgg.sterms().buckets().array()) {
                String tag = bucket.key();
                if (tag != null && tag.matches("T[0-9]{4}.*")) {
                    HiveEntityDetailDTO.AttackTechnique t = new HiveEntityDetailDTO.AttackTechnique();
                    t.setId(tag);
                    t.setName(tag);
                    t.setCount((int) bucket.docCount());
                    techniques.add(t);
                }
            }
        }
        dto.setTopAttackTechniques(techniques);

        // Associated users
        List<String> users = new ArrayList<>();
        var usersAgg = resp.aggregations().get("assoc_users");
        if (usersAgg != null && usersAgg.sterms() != null) {
            for (StringTermsBucket bucket : usersAgg.sterms().buckets().array()) {
                if (bucket.key() != null && !bucket.key().isBlank()) users.add(bucket.key());
            }
        }
        dto.setAssociatedUsers(users);

        // Associated hosts
        List<String> hosts = new ArrayList<>();
        var hostsAgg = resp.aggregations().get("assoc_hosts");
        if (hostsAgg != null && hostsAgg.sterms() != null) {
            for (StringTermsBucket bucket : hostsAgg.sterms().buckets().array()) {
                if (bucket.key() != null && !bucket.key().isBlank()) hosts.add(bucket.key());
            }
        }
        dto.setAssociatedHosts(hosts);
    }

    // ------------------------------------------------------------------
    // Entity alerts  (GET /ha-entities/{id}/alerts)
    // ------------------------------------------------------------------

    public List<HiveEntityAlertDTO> getEntityAlerts(String entityId, String entityType, int size) {
        String field = entityType != null ? entityField(entityType) : "adversary.ip";
        try {
            return osClient.execute(os -> {
                String since = Instant.now().minus(30, ChronoUnit.DAYS).toString();

                Query q = Query.of(qb -> qb.bool(BoolQuery.of(b -> b
                    .must(Query.of(m -> m.term(TermQuery.of(t -> t
                        .field(field + ".keyword").value(FieldValue.of(entityId))))))
                    .must(Query.of(m -> m.range(RangeQuery.of(r -> r
                        .field("@timestamp").gte(JsonData.of(since))))))
                )));

                SearchRequest req = SearchRequest.of(r -> r
                    .index(indexResolver.resolveAlertIndexPattern())
                    .query(q)
                    .size(Math.min(size, 100))
                    .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                );

                @SuppressWarnings("rawtypes")
                SearchResponse<Map> resp = os.search(req, Map.class);

                List<HiveEntityAlertDTO> alerts = new ArrayList<>();
                for (var hit : resp.hits().hits()) {
                    @SuppressWarnings("rawtypes")
                    Map src = hit.source() != null ? hit.source() : Collections.emptyMap();
                    HiveEntityAlertDTO a = new HiveEntityAlertDTO();
                    a.setId(hit.id());
                    a.setTitle((String) src.getOrDefault("name", "Unknown Alert"));
                    a.setSeverity(((Number) src.getOrDefault("severity", 1)).intValue());
                    a.setTimestamp((String) src.getOrDefault("@timestamp", ""));
                    a.setStatus((String) src.getOrDefault("status", "open"));
                    alerts.add(a);
                }
                return alerts;
            });
        } catch (Exception e) {
            log.warn("HiveEntityService.getEntityAlerts: failed for {}: {}", entityId, e.getMessage());
            return List.of();
        }
    }

    // ------------------------------------------------------------------
    // Entity events  (GET /ha-entities/{id}/events)
    // ------------------------------------------------------------------

    public List<HiveEntityEventDTO> getEntityEvents(String entityId, String entityType, int size) {
        String field = entityType != null ? entityField(entityType) : "adversary.ip";
        try {
            return osClient.execute(os -> {
                String since = Instant.now().minus(7, ChronoUnit.DAYS).toString();

                Query q = Query.of(qb -> qb.bool(BoolQuery.of(b -> b
                    .must(Query.of(m -> m.term(TermQuery.of(t -> t
                        .field(field + ".keyword").value(FieldValue.of(entityId))))))
                    .must(Query.of(m -> m.range(RangeQuery.of(r -> r
                        .field("@timestamp").gte(JsonData.of(since))))))
                )));

                SearchRequest req = SearchRequest.of(r -> r
                    .index(indexResolver.resolveIndexPattern("log"))
                    .query(q)
                    .size(Math.min(size, 200))
                    .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                );

                @SuppressWarnings("rawtypes")
                SearchResponse<Map> resp = os.search(req, Map.class);

                List<HiveEntityEventDTO> events = new ArrayList<>();
                for (var hit : resp.hits().hits()) {
                    @SuppressWarnings("rawtypes")
                    Map src = hit.source() != null ? hit.source() : Collections.emptyMap();
                    HiveEntityEventDTO ev = new HiveEntityEventDTO();
                    ev.setTimestamp((String) src.getOrDefault("@timestamp", ""));
                    ev.setSource((String) src.getOrDefault("dataType",
                        src.getOrDefault("source", "unknown")));
                    // message: prefer logx.raw, then message, then _index
                    @SuppressWarnings("unchecked")
                    Map<String, Object> logx = (Map<String, Object>) src.get("logx");
                    if (logx != null && logx.get("raw") != null) {
                        ev.setMessage(String.valueOf(logx.get("raw")));
                    } else {
                        ev.setMessage((String) src.getOrDefault("message",
                            src.getOrDefault("event", hit.index())));
                    }
                    events.add(ev);
                }
                return events;
            });
        } catch (Exception e) {
            log.warn("HiveEntityService.getEntityEvents: failed for {}: {}", entityId, e.getMessage());
            return List.of();
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static String entityField(String entityType) {
        if (entityType == null) return "adversary.ip";
        return switch (entityType) {
            case "ip"      -> "adversary.ip";
            case "host"    -> "adversary.host";
            case "user"    -> "adversary.user";
            case "process" -> "adversary.process";
            default        -> "adversary.ip";
        };
    }
}
