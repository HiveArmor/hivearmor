package com.hivearmor.service.ops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.opensearch.enums.HttpMethod;
import com.hivearmor.service.dto.ops.PipelineSignalsDTO;
import com.hivearmor.service.dto.ops.PipelineSignalsDTO.ConsumerGroupLagDTO;
import com.hivearmor.service.dto.ops.PipelineSignalsDTO.SoakHistoryPointDTO;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * Collects measured SIEM pipeline signals for Admin operators (SIEM-009).
 *
 * <p>Does not invent SLO thresholds. Consumer lag is taken from the latest host
 * soak sample when present (Redpanda {@code rpk} runs on the host, not in-WAR).</p>
 */
@Service
public class PipelineSignalsService {

    private static final Logger log = LoggerFactory.getLogger(PipelineSignalsService.class);
    private static final int MAX_HISTORY_POINTS = 48;

    private static final List<String> BASE_LIMITATIONS = List.of(
        "Measured signals only — no invented SLO pass/fail thresholds",
        "Soak history is host sampler files only — not a Grafana board",
        "Consumer lag comes from the host soak sampler when available",
        "Not PRODUCTION READY"
    );

    private final OpensearchClientBuilder opensearchClientBuilder;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final Path sampleDir;
    private final Path sampleFile;

    public PipelineSignalsService(
        OpensearchClientBuilder opensearchClientBuilder,
        JdbcTemplate jdbcTemplate,
        ObjectMapper objectMapper,
        @Value("${ha.pipeline-signals.sample-dir:}") String sampleDir,
        @Value("${ha.pipeline-signals.sample-file:/var/hivearmor-slo-soak/latest.json}") String sampleFile
    ) {
        this.opensearchClientBuilder = opensearchClientBuilder;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.sampleDir = sampleDir == null || sampleDir.isBlank() ? null : Path.of(sampleDir);
        this.sampleFile = Path.of(sampleFile);
    }

    public PipelineSignalsDTO collect() {
        List<String> limitations = new ArrayList<>(BASE_LIMITATIONS);

        String osStatus = null;
        Integer unassigned = null;
        Long storeBytes = null;
        try {
            JsonNode health = readOpenSearchJson("/_cluster/health");
            if (health != null) {
                osStatus = textOrNull(health, "status");
                if (health.has("unassigned_shards") && health.get("unassigned_shards").canConvertToInt()) {
                    unassigned = health.get("unassigned_shards").asInt();
                }
            }
            JsonNode stats = readOpenSearchJson("/_cluster/stats");
            if (stats != null) {
                JsonNode size = stats.path("indices").path("store").path("size_in_bytes");
                if (size.canConvertToLong()) {
                    storeBytes = size.asLong();
                }
            }
        } catch (Exception e) {
            log.warn("pipeline signals: OpenSearch probe failed: {}", e.getMessage());
            limitations.add("OpenSearch probe failed on this request");
        }

        Long pgBytes = null;
        try {
            Long size = jdbcTemplate.queryForObject("SELECT pg_database_size(current_database())", Long.class);
            pgBytes = size;
        } catch (Exception e) {
            log.warn("pipeline signals: postgres size probe failed: {}", e.getMessage());
            limitations.add("PostgreSQL size probe failed on this request");
        }

        HostSample host = readHostSample(limitations);
        SoakHistory history = readSoakHistory(limitations);

        return new PipelineSignalsDTO(
            Instant.now(),
            "UP",
            osStatus,
            unassigned,
            storeBytes,
            pgBytes,
            host.lags(),
            host.topics(),
            host.path(),
            host.recordedAt(),
            host.status(),
            history.points(),
            history.spanHours(),
            history.sampleCount(),
            List.copyOf(limitations)
        );
    }

    private JsonNode readOpenSearchJson(String path) throws Exception {
        return opensearchClientBuilder.execute(client -> {
            try (Response rs = client.executeHttpRequest(path, null, null, HttpMethod.GET)) {
                if (!rs.isSuccessful() || rs.body() == null) {
                    return null;
                }
                return objectMapper.readTree(rs.body().string());
            }
        });
    }

    private HostSample readHostSample(List<String> limitations) {
        Path chosen = resolveLatestSample();
        if (chosen == null || !Files.isRegularFile(chosen)) {
            limitations.add("Host soak sample not mounted or not yet written");
            return HostSample.missing();
        }
        try {
            JsonNode root = objectMapper.readTree(Files.readString(chosen));
            Instant recordedAt = parseInstant(root);
            List<ConsumerGroupLagDTO> lags = parseLags(root);
            List<String> topics = new ArrayList<>();
            JsonNode topicsNode = root.get("topics");
            if (topicsNode != null && topicsNode.isArray()) {
                topicsNode.forEach(n -> {
                    if (n.isTextual()) {
                        topics.add(n.asText());
                    }
                });
            }
            String status = textOrNull(root, "status");
            return new HostSample(chosen.toString(), recordedAt, status, List.copyOf(lags), List.copyOf(topics));
        } catch (Exception e) {
            log.warn("pipeline signals: host sample parse failed: {}", e.getMessage());
            limitations.add("Host soak sample present but unreadable");
            return HostSample.missing();
        }
    }

    private SoakHistory readSoakHistory(List<String> limitations) {
        if (sampleDir == null || !Files.isDirectory(sampleDir)) {
            return SoakHistory.empty();
        }
        List<Path> files;
        try (Stream<Path> stream = Files.list(sampleDir)) {
            files = stream
                .filter(p -> {
                    String name = p.getFileName().toString();
                    return name.startsWith("sample-") && name.endsWith(".json") && Files.isRegularFile(p);
                })
                .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                .toList();
        } catch (Exception e) {
            limitations.add("Soak history directory unreadable");
            return SoakHistory.empty();
        }
        if (files.isEmpty()) {
            return SoakHistory.empty();
        }
        if (files.size() > MAX_HISTORY_POINTS) {
            files = files.subList(files.size() - MAX_HISTORY_POINTS, files.size());
        }

        List<SoakHistoryPointDTO> points = new ArrayList<>();
        for (Path file : files) {
            try {
                JsonNode root = objectMapper.readTree(Files.readString(file));
                Instant recordedAt = parseInstant(root);
                Long lag = null;
                List<ConsumerGroupLagDTO> lags = parseLags(root);
                if (!lags.isEmpty()) {
                    lag = lags.get(0).totalLag();
                }
                Long store = null;
                if (root.has("opensearch_store_bytes")
                    && !root.get("opensearch_store_bytes").isNull()
                    && root.get("opensearch_store_bytes").canConvertToLong()) {
                    store = root.get("opensearch_store_bytes").asLong();
                }
                points.add(new SoakHistoryPointDTO(
                    recordedAt,
                    textOrNull(root, "opensearch_status"),
                    store,
                    lag,
                    file.getFileName().toString()
                ));
            } catch (Exception e) {
                log.debug("pipeline signals: skip unreadable soak sample {}: {}", file, e.getMessage());
            }
        }

        Double spanHours = null;
        List<Instant> times = points.stream()
            .map(SoakHistoryPointDTO::recordedAt)
            .filter(t -> t != null)
            .sorted()
            .toList();
        if (times.size() >= 2) {
            spanHours = Duration.between(times.get(0), times.get(times.size() - 1)).toMillis() / 3_600_000.0;
        } else if (times.size() == 1) {
            spanHours = 0.0;
        }

        return new SoakHistory(List.copyOf(points), spanHours, points.size());
    }

    private Path resolveLatestSample() {
        if (Files.isRegularFile(sampleFile)) {
            return sampleFile;
        }
        if (sampleDir == null || !Files.isDirectory(sampleDir)) {
            return null;
        }
        try (Stream<Path> stream = Files.list(sampleDir)) {
            return stream
                .filter(p -> p.getFileName().toString().endsWith(".json"))
                .filter(Files::isRegularFile)
                .max(Comparator.comparingLong(p -> {
                    try {
                        return Files.getLastModifiedTime(p).toMillis();
                    } catch (Exception e) {
                        return 0L;
                    }
                }))
                .orElse(null);
        } catch (Exception e) {
            return null;
        }
    }

    private List<ConsumerGroupLagDTO> parseLags(JsonNode root) {
        List<ConsumerGroupLagDTO> lags = new ArrayList<>();
        JsonNode lagNode = root.get("consumer_group_lags");
        if (lagNode != null && lagNode.isArray()) {
            for (JsonNode row : lagNode) {
                String group = textOrNull(row, "group");
                Long totalLag = null;
                if (row.has("totalLag") && !row.get("totalLag").isNull() && row.get("totalLag").canConvertToLong()) {
                    totalLag = row.get("totalLag").asLong();
                }
                if (group != null) {
                    lags.add(new ConsumerGroupLagDTO(group, totalLag));
                }
            }
        }
        return lags;
    }

    private static Instant parseInstant(JsonNode root) {
        if (root != null && root.hasNonNull("recordedAt")) {
            try {
                return Instant.parse(root.get("recordedAt").asText());
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    private static String textOrNull(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) {
            return null;
        }
        String value = node.get(field).asText();
        return value.isBlank() ? null : value;
    }

    private record HostSample(
        String path,
        Instant recordedAt,
        String status,
        List<ConsumerGroupLagDTO> lags,
        List<String> topics
    ) {
        static HostSample missing() {
            return new HostSample(null, null, null, List.of(), List.of());
        }
    }

    private record SoakHistory(List<SoakHistoryPointDTO> points, Double spanHours, Integer sampleCount) {
        static SoakHistory empty() {
            return new SoakHistory(List.of(), null, 0);
        }
    }
}
