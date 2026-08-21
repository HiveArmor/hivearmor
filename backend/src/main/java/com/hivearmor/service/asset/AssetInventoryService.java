package com.hivearmor.service.asset;

import com.hivearmor.domain.UtmAssetMetrics;
import com.hivearmor.domain.datainput_ingestion.UtmDataInputStatus;
import com.hivearmor.domain.network_scan.UtmAssetGroup;
import com.hivearmor.domain.network_scan.UtmAssetTypes;
import com.hivearmor.domain.network_scan.UtmNetworkScan;
import com.hivearmor.domain.network_scan.enums.AssetRegisteredMode;
import com.hivearmor.domain.network_scan.enums.AssetStatus;
import com.hivearmor.repository.UtmAssetMetricsRepository;
import com.hivearmor.repository.datainput_ingestion.UtmDataInputStatusRepository;
import com.hivearmor.repository.network_scan.UtmNetworkScanRepository;
import com.hivearmor.service.asset.AssetCursorCodec.CursorPayload;
import com.hivearmor.web.rest.asset.dto.AssetInventoryDTO;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/** Canonical, explicitly safe inventory projection over the existing discovery repository. */
@Service
@Transactional(readOnly = true)
public class AssetInventoryService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Duration CURSOR_TTL = Duration.ofMinutes(10);
    private static final Set<String> SUPPORTED_SORTS = Set.of("riskScore:desc", "riskScore,desc");

    private final UtmNetworkScanRepository repository;
    private final UtmAssetMetricsRepository metricsRepository;
    private final UtmDataInputStatusRepository dataInputStatusRepository;
    private final AssetCursorCodec cursorCodec;

    public AssetInventoryService(UtmNetworkScanRepository repository,
                                 UtmAssetMetricsRepository metricsRepository,
                                 UtmDataInputStatusRepository dataInputStatusRepository,
                                 AssetCursorCodec cursorCodec) {
        this.repository = repository;
        this.metricsRepository = metricsRepository;
        this.dataInputStatusRepository = dataInputStatusRepository;
        this.cursorCodec = cursorCodec;
    }

    public AssetInventoryDTO.Page list(Query query, String owner, String tenantKey) {
        validate(query);
        Instant snapshotAt = Instant.now();
        String filterHash = filterHash(query);
        CursorPayload cursor = null;
        if (query.cursor() != null && !query.cursor().isBlank()) {
            cursor = cursorCodec.decode(query.cursor(), owner, tenantKey, filterHash);
            snapshotAt = cursor.snapshotAt();
        }

        Specification<UtmNetworkScan> filters = filters(query, snapshotAt);
        long total = repository.count(filters);
        Specification<UtmNetworkScan> sliceSpec = cursor == null ? filters : filters.and(after(cursor));
        Specification<UtmNetworkScan> orderedSlice = orderedByRisk(sliceSpec);
        List<UtmNetworkScan> loaded = repository.findAll(
            orderedSlice, PageRequest.of(0, query.limit() + 1)).getContent();
        boolean hasMore = loaded.size() > query.limit();
        List<UtmNetworkScan> pageAssets = hasMore
            ? new ArrayList<>(loaded.subList(0, query.limit()))
            : loaded;

        Map<String, Map<String, Long>> metrics = loadMetrics(pageAssets);
        List<AssetInventoryDTO.Item> items = pageAssets.stream()
            .map(asset -> toItem(asset, metrics.getOrDefault(asset.getAssetName(), Map.of())))
            .toList();
        String nextCursor = null;
        if (hasMore && !pageAssets.isEmpty()) {
            UtmNetworkScan last = pageAssets.get(pageAssets.size() - 1);
            nextCursor = cursorCodec.encode(new CursorPayload(
                owner, tenantKey, filterHash, riskScore(last), last.getId(), snapshotAt,
                Instant.now().plus(CURSOR_TTL)));
        }

        int totalPages = Math.max(1, (int) Math.ceil((double) total / query.limit()));
        return new AssetInventoryDTO.Page(
            items, items, nextCursor, hasMore, snapshotAt, total, true, total, totalPages,
            query.pageHint(), summary(filters, total), false, List.of(), "partial");
    }

    public AssetInventoryDTO.Detail detail(long assetId) {
        UtmNetworkScan asset = repository.findById(assetId)
            .orElseThrow(() -> new AssetContractException("ASSET_NOT_FOUND", "Asset was not found in the authorized inventory"));
        Map<String, Long> metrics = metricsRepository.findAllByAssetName(asset.getAssetName()).stream()
            .collect(Collectors.toMap(UtmAssetMetrics::getMetric, UtmAssetMetrics::getAmount, Long::sum, LinkedHashMap::new));
        List<UtmDataInputStatus> sources = dataInputStatusRepository.findByIpOrHostname(asset.getAssetIp(), asset.getAssetName());
        List<AssetInventoryDTO.Coverage> coverage = sources.stream().limit(100).map(this::coverage).toList();
        List<Map<String, Object>> riskDrivers = metrics.entrySet().stream().limit(50).map(entry -> {
            Map<String, Object> driver = new LinkedHashMap<>();
            driver.put("id", "metric:" + safeToken(entry.getKey()));
            driver.put("label", entry.getKey());
            driver.put("kind", metricKind(entry.getKey()));
            driver.put("severity", riskLevel(asset));
            driver.put("evidenceCount", entry.getValue());
            driver.put("summary", "Authoritative inventory metric; open linked evidence for details.");
            driver.put("provenance", "hive_asset_metrics");
            return driver;
        }).toList();
        Map<String, String> redactions = Map.of(
            "serviceCredentials", "not_projected",
            "licenceSecrets", "not_projected",
            "connectorCredentials", "not_projected");
        Map<String, String> provenance = Map.of(
            "identity", "hive_network_scan",
            "metrics", "hive_asset_metrics",
            "coverage", "hive_data_input_status");
        return new AssetInventoryDTO.Detail(
            toItem(asset, metrics), aliases(asset), riskDrivers, List.of(), coverage, redactions, provenance);
    }

    private AssetInventoryDTO.Summary summary(Specification<UtmNetworkScan> filters, long total) {
        long highRisk = repository.count(filters.and((root, ignored, cb) ->
            cb.greaterThanOrEqualTo(root.get("assetSeverityMetric"), 60F)));
        long notOnboarded = repository.count(filters.and((root, ignored, cb) ->
            cb.or(cb.isNull(root.get("isAgent")), cb.isFalse(root.get("isAgent")))));
        long sensorAttention = repository.count(filters.and((root, ignored, cb) -> cb.or(
            cb.isNull(root.get("isAgent")), cb.isFalse(root.get("isAgent")), cb.isFalse(root.get("assetAlive")),
            cb.equal(root.get("assetStatus"), AssetStatus.MISSING))));
        Instant sevenDaysAgo = Instant.now().minus(Duration.ofDays(7));
        long newlyDiscovered = repository.count(filters.and((root, ignored, cb) ->
            cb.greaterThanOrEqualTo(root.get("discoveredAt"), sevenDaysAgo)));
        return new AssetInventoryDTO.Summary(
            total, null, highRisk, null, notOnboarded, sensorAttention, newlyDiscovered,
            Map.of("criticalAssets", "unavailable", "highExposure", "unavailable", "other", "exact"));
    }

    private Specification<UtmNetworkScan> filters(Query query, Instant snapshotAt) {
        return (root, criteriaQuery, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.lessThanOrEqualTo(root.get("discoveredAt"), snapshotAt));
            predicates.add(cb.or(cb.isNull(root.get("modifiedAt")), cb.lessThanOrEqualTo(root.get("modifiedAt"), snapshotAt)));
            if (query.search() != null && !query.search().isBlank()) {
                String pattern = "%" + query.search().trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                    cb.like(cb.lower(root.get("assetName")), pattern),
                    cb.like(cb.lower(root.get("assetIp")), pattern),
                    cb.like(cb.lower(root.get("assetMac")), pattern),
                    cb.like(cb.lower(root.get("assetAlias")), pattern),
                    cb.like(cb.lower(root.get("assetAliases")), pattern),
                    cb.like(cb.lower(root.get("serverName")), pattern)));
            }
            addRiskPredicate(predicates, query.risk(), root.get("assetSeverityMetric"), cb);
            addCategoryPredicate(predicates, query.category(), root.join("assetType", JoinType.LEFT), root, cb);
            addSensorPredicate(predicates, query.sensorHealth(), root, cb);
            addOnboardingPredicate(predicates, query.onboarding(), root, cb);
            if (query.exposure() != null && !isAll(query.exposure()) && !"unknown".equalsIgnoreCase(query.exposure())) {
                predicates.add(cb.disjunction());
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Specification<UtmNetworkScan> after(CursorPayload cursor) {
        return (root, ignored, cb) -> {
            Expression<Float> score = cb.coalesce(root.<Float>get("assetSeverityMetric"), -1F);
            return cb.or(
                cb.lessThan(score, (float) cursor.lastRiskScore()),
                cb.and(cb.equal(score, (float) cursor.lastRiskScore()), cb.greaterThan(root.get("id"), cursor.lastId())));
        };
    }

    /**
     * Apply stable null-last keyset ordering inside the Criteria query. Spring
     * Data's {@code Sort.Order.nullsLast()} is not supported for Specification
     * queries on the Hibernate version used by the backend. Coalescing to -1
     * keeps unknown risk below the supported 0-100 range and exactly matches
     * the cursor comparison in {@link #after(CursorPayload)}.
     */
    private Specification<UtmNetworkScan> orderedByRisk(Specification<UtmNetworkScan> specification) {
        return specification.and((root, query, cb) -> {
            Expression<Float> score = cb.coalesce(root.<Float>get("assetSeverityMetric"), -1F);
            query.orderBy(cb.desc(score), cb.asc(root.get("id")));
            return cb.conjunction();
        });
    }

    private void addRiskPredicate(List<Predicate> predicates, String risk, Expression<Float> score,
                                  jakarta.persistence.criteria.CriteriaBuilder cb) {
        if (risk == null || isAll(risk)) return;
        switch (risk.toLowerCase(Locale.ROOT)) {
            case "critical" -> predicates.add(cb.greaterThanOrEqualTo(score, 80F));
            case "high" -> predicates.add(cb.and(cb.greaterThanOrEqualTo(score, 60F), cb.lessThan(score, 80F)));
            case "medium" -> predicates.add(cb.and(cb.greaterThanOrEqualTo(score, 40F), cb.lessThan(score, 60F)));
            case "low" -> predicates.add(cb.and(cb.greaterThanOrEqualTo(score, 0F), cb.lessThan(score, 40F)));
            case "none" -> predicates.add(cb.equal(score, 0F));
            case "unknown" -> predicates.add(cb.or(cb.isNull(score), cb.lessThan(score, 0F)));
            default -> throw new AssetContractException("ASSET_RISK_INVALID", "Unsupported asset risk filter");
        }
    }

    private void addCategoryPredicate(List<Predicate> predicates, String category,
                                      Join<UtmNetworkScan, UtmAssetTypes> typeJoin,
                                      jakarta.persistence.criteria.Root<UtmNetworkScan> root,
                                      jakarta.persistence.criteria.CriteriaBuilder cb) {
        if (category == null || isAll(category)) return;
        Expression<String> type = cb.lower(typeJoin.get("typeName"));
        Predicate endpoint = cb.isTrue(root.get("isAgent"));
        Predicate server = cb.or(cb.like(type, "%server%"), cb.isNotNull(root.get("serverName")));
        Predicate cloud = cb.like(type, "%cloud%");
        Predicate network = cb.or(cb.like(type, "%network%"), cb.like(type, "%router%"),
            cb.like(type, "%switch%"), cb.like(type, "%firewall%"));
        Predicate iot = cb.or(cb.like(type, "%iot%"), cb.like(type, "%ot%"));
        switch (category.toLowerCase(Locale.ROOT)) {
            case "endpoint" -> predicates.add(endpoint);
            case "server" -> predicates.add(server);
            case "cloud" -> predicates.add(cloud);
            case "network" -> predicates.add(network);
            case "iot_ot" -> predicates.add(iot);
            case "unknown" -> predicates.add(cb.and(cb.not(endpoint), cb.not(server), cb.not(cloud), cb.not(network), cb.not(iot)));
            default -> throw new AssetContractException("ASSET_CATEGORY_INVALID", "Unsupported asset category filter");
        }
    }

    private void addSensorPredicate(List<Predicate> predicates, String sensor,
                                    jakarta.persistence.criteria.Root<UtmNetworkScan> root,
                                    jakarta.persistence.criteria.CriteriaBuilder cb) {
        if (sensor == null || isAll(sensor)) return;
        switch (sensor.toLowerCase(Locale.ROOT)) {
            case "healthy" -> predicates.add(cb.and(cb.isTrue(root.get("isAgent")), cb.isTrue(root.get("assetAlive"))));
            case "degraded" -> predicates.add(cb.and(cb.isTrue(root.get("isAgent")), cb.or(cb.isNull(root.get("assetAlive")), cb.isFalse(root.get("assetAlive")))));
            case "inactive" -> predicates.add(cb.equal(root.get("assetStatus"), AssetStatus.MISSING));
            case "unmanaged" -> predicates.add(cb.or(cb.isNull(root.get("isAgent")), cb.isFalse(root.get("isAgent"))));
            case "unknown" -> predicates.add(cb.isNull(root.get("assetAlive")));
            default -> throw new AssetContractException("ASSET_SENSOR_INVALID", "Unsupported sensor-health filter");
        }
    }

    private void addOnboardingPredicate(List<Predicate> predicates, String onboarding,
                                        jakarta.persistence.criteria.Root<UtmNetworkScan> root,
                                        jakarta.persistence.criteria.CriteriaBuilder cb) {
        if (onboarding == null || isAll(onboarding)) return;
        switch (onboarding.toLowerCase(Locale.ROOT)) {
            case "onboarded" -> predicates.add(cb.isTrue(root.get("isAgent")));
            case "discovered" -> predicates.add(cb.equal(root.get("registeredMode"), AssetRegisteredMode.DISCOVERED));
            case "eligible" -> predicates.add(cb.equal(root.get("registeredMode"), AssetRegisteredMode.CUSTOM));
            case "unsupported" -> predicates.add(cb.equal(root.get("assetStatus"), AssetStatus.MISSING));
            case "unknown" -> predicates.add(cb.isNull(root.get("registeredMode")));
            default -> throw new AssetContractException("ASSET_ONBOARDING_INVALID", "Unsupported onboarding filter");
        }
    }

    private Map<String, Map<String, Long>> loadMetrics(List<UtmNetworkScan> assets) {
        List<String> names = assets.stream().map(UtmNetworkScan::getAssetName).filter(Objects::nonNull).distinct().toList();
        if (names.isEmpty()) return Map.of();
        Map<String, Map<String, Long>> result = new HashMap<>();
        for (UtmAssetMetrics metric : metricsRepository.findAllByAssetNameIn(names)) {
            result.computeIfAbsent(metric.getAssetName(), ignored -> new LinkedHashMap<>())
                .merge(metric.getMetric(), metric.getAmount(), Long::sum);
        }
        return result;
    }

    private AssetInventoryDTO.Item toItem(UtmNetworkScan asset, Map<String, Long> metrics) {
        String category = category(asset);
        Instant lastSeen = Optional.ofNullable(asset.getModifiedAt()).orElse(asset.getDiscoveredAt());
        UtmAssetGroup group = asset.getAssetGroup();
        UtmAssetTypes type = asset.getAssetType();
        LinkedHashSet<String> tags = new LinkedHashSet<>();
        if (group != null && group.getGroupName() != null) tags.add(group.getGroupName());
        if (type != null && type.getTypeName() != null) tags.add(type.getTypeName());
        return new AssetInventoryDTO.Item(
            asset.getId(), displayName(asset), group == null ? "Authorized inventory" : group.getGroupName(), "authorized",
            connectionStatus(asset), asset.getDiscoveredAt(), lastSeen, platform(asset.getAssetOsPlatform()), asset.getAssetOsVersion(),
            asset.getAssetIp(), asset.getAssetMac(), "asset-" + asset.getId(), category,
            type == null ? null : type.getTypeName(), "unassigned", riskLevel(asset), displayRiskScore(asset),
            "unknown", null, sensorHealth(asset), onboarding(asset), metric(metrics, "alert"),
            metric(metrics, "vulnerability"), metric(metrics, "critical_vulnerability"), metric(metrics, "attack_path"),
            null, group == null ? null : group.getGroupName(), discoverySources(asset), List.copyOf(tags), null, null,
            asset.getId() + ":" + (lastSeen == null ? "0" : lastSeen.toEpochMilli()),
            Map.of("inspect", true, "hunt", true, "editClassification", false, "export", false));
    }

    private AssetInventoryDTO.Coverage coverage(UtmDataInputStatus source) {
        Instant observed = source.getTimestamp() == null ? null : Instant.ofEpochSecond(source.getTimestamp());
        String state = Boolean.TRUE.equals(source.isDown()) ? "stale" : "healthy";
        return new AssetInventoryDTO.Coverage(
            source.getId(), source.getAlias() == null ? source.getDataType() : source.getAlias(), state,
            observed, source.getMedian(), Boolean.TRUE.equals(source.isDown()) ? "Observation cadence exceeded" : null,
            Boolean.TRUE.equals(source.isDown()) ? "reduced" : "normal");
    }

    private void validate(Query query) {
        if (query.limit() < 1 || query.limit() > MAX_PAGE_SIZE) {
            throw new AssetContractException("ASSET_LIMIT_INVALID", "Asset page size must be between 1 and 100");
        }
        if (query.search() != null && query.search().length() > 128) {
            throw new AssetContractException("ASSET_SEARCH_TOO_LONG", "Asset search cannot exceed 128 characters");
        }
        if (query.tenantScope() == null || query.tenantScope().isBlank()) {
            throw new AssetContractException("ASSET_SCOPE_REQUIRED", "Tenant scope is required");
        }
        if (query.criticality() != null && !isAll(query.criticality())) {
            throw new AssetContractException("ASSET_CRITICALITY_UNAVAILABLE", "Criticality filtering is unavailable until authoritative asset classification is connected");
        }
        if (query.owner() != null && !query.owner().isBlank()) {
            throw new AssetContractException("ASSET_OWNER_UNAVAILABLE", "Owner filtering is unavailable until authoritative ownership is connected");
        }
        if (query.tag() != null && !query.tag().isBlank()) {
            throw new AssetContractException("ASSET_TAG_UNAVAILABLE", "Tag filtering is unavailable until governed asset tags are connected");
        }
        if (query.sort() != null && !query.sort().isBlank() && !SUPPORTED_SORTS.contains(query.sort())) {
            throw new AssetContractException("ASSET_SORT_UNSUPPORTED", "Only riskScore descending is currently supported");
        }
    }

    private String filterHash(Query query) {
        String canonical = String.join("\n",
            text(query.search()), text(query.category()), text(query.risk()), text(query.exposure()),
            text(query.sensorHealth()), text(query.onboarding()), text(query.criticality()), text(query.owner()),
            text(query.tag()), text(query.tenantScope()), text(query.sort()), String.valueOf(query.limit()));
        try {
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to fingerprint asset filters", ex);
        }
    }

    private static String text(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }
    private static boolean isAll(String value) { return "all".equalsIgnoreCase(value); }
    private static double riskScore(UtmNetworkScan asset) { return asset.getAssetSeverityMetric() == null ? -1D : asset.getAssetSeverityMetric(); }
    private static Integer displayRiskScore(UtmNetworkScan asset) { return riskScore(asset) < 0 ? null : (int) Math.round(Math.min(100D, riskScore(asset))); }
    private static String riskLevel(UtmNetworkScan asset) {
        double value = riskScore(asset);
        if (value < 0) return "unknown";
        if (value == 0) return "none";
        if (value >= 80) return "critical";
        if (value >= 60) return "high";
        if (value >= 40) return "medium";
        return "low";
    }
    private static String category(UtmNetworkScan asset) {
        if (Boolean.TRUE.equals(asset.getIsAgent())) return "endpoint";
        String value = ((asset.getAssetType() == null ? "" : asset.getAssetType().getTypeName()) + " "
            + Objects.toString(asset.getServerName(), "")).toLowerCase(Locale.ROOT);
        if (value.contains("cloud")) return "cloud";
        if (value.contains("iot") || value.matches(".*\\bot\\b.*")) return "iot_ot";
        if (value.contains("network") || value.contains("router") || value.contains("switch") || value.contains("firewall")) return "network";
        if (value.contains("server")) return "server";
        return "unknown";
    }
    private static String sensorHealth(UtmNetworkScan asset) {
        if (asset.getAssetStatus() == AssetStatus.MISSING) return "inactive";
        if (!Boolean.TRUE.equals(asset.getIsAgent())) return "unmanaged";
        return Boolean.TRUE.equals(asset.getAssetAlive()) ? "healthy" : "degraded";
    }
    private static String onboarding(UtmNetworkScan asset) {
        if (Boolean.TRUE.equals(asset.getIsAgent())) return "onboarded";
        if (asset.getAssetStatus() == AssetStatus.MISSING) return "unsupported";
        if (asset.getRegisteredMode() == AssetRegisteredMode.CUSTOM) return "eligible";
        if (asset.getRegisteredMode() == AssetRegisteredMode.DISCOVERED || asset.getRegisteredMode() == AssetRegisteredMode.DYNAMIC) return "discovered";
        return "unknown";
    }
    private static String connectionStatus(UtmNetworkScan asset) {
        if (asset.getAssetStatus() == AssetStatus.MISSING) return "UNREACHABLE";
        if (asset.getAssetAlive() == null) return "UNKNOWN";
        return asset.getAssetAlive() ? "ACTIVE" : "INACTIVE";
    }
    private static String platform(String value) {
        if (value == null) return null;
        String normalized = value.toLowerCase(Locale.ROOT);
        if (normalized.contains("win")) return "windows";
        if (normalized.contains("linux")) return "linux";
        if (normalized.contains("mac") || normalized.contains("darwin")) return "macos";
        return "other";
    }
    private static String displayName(UtmNetworkScan asset) {
        if (asset.getAssetAlias() != null && !asset.getAssetAlias().isBlank()) return asset.getAssetAlias();
        if (asset.getAssetName() != null && !asset.getAssetName().isBlank()) return asset.getAssetName();
        if (asset.getAssetIp() != null && !asset.getAssetIp().isBlank()) return asset.getAssetIp();
        return "Asset " + asset.getId();
    }
    private static List<String> discoverySources(UtmNetworkScan asset) {
        return Boolean.TRUE.equals(asset.getIsAgent()) ? List.of("Endpoint sensor") : List.of("Network discovery");
    }
    private static long metric(Map<String, Long> metrics, String wanted) {
        return metrics.entrySet().stream()
            .filter(entry -> safeToken(entry.getKey()).equals(wanted))
            .mapToLong(entry -> Optional.ofNullable(entry.getValue()).orElse(0L)).sum();
    }
    private static String metricKind(String name) {
        String token = safeToken(name);
        if (token.contains("alert")) return "alert";
        if (token.contains("vulnerab")) return "vulnerability";
        if (token.contains("exposure") || token.contains("attack_path")) return "exposure";
        if (token.contains("identity")) return "identity";
        return "configuration";
    }
    private static String safeToken(String value) {
        return Objects.toString(value, "metric").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_").replaceAll("^_|_$", "");
    }
    private static List<String> aliases(UtmNetworkScan asset) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        if (asset.getAssetAlias() != null) result.add(asset.getAssetAlias());
        if (asset.getAssetAliases() != null) Collections.addAll(result, asset.getAssetAliases().split("[,;]"));
        result.removeIf(String::isBlank);
        return List.copyOf(result);
    }

    public record Query(
        String search,
        String category,
        String risk,
        String exposure,
        String sensorHealth,
        String onboarding,
        String criticality,
        String owner,
        String tag,
        String tenantScope,
        String cursor,
        int limit,
        String sort,
        int pageHint
    ) {}
}
