package com.hivearmor.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.hivearmor.config.HaAirGapConfig;
import com.hivearmor.domain.HiveMispFeed;
import com.hivearmor.domain.HiveThreatIoc;
import com.hivearmor.repository.HiveMispFeedRepository;
import com.hivearmor.repository.HiveThreatIocRepository;
import com.hivearmor.service.dto.threat_intel.ThreatFeedSyncReceipt;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * HiveArmor MISP connector service.
 *
 * Polls configured MISP instances for IOC attributes via POST /attributes/restSearch,
 * normalizes them into hive_threat_ioc using the MISP type map and TLP tag extraction.
 *
 * Scheduled every 4 hours. Also triggerable on-demand via HaMispFeedResource.
 *
 * Security invariants:
 *  - Raw IOC values are NEVER logged at any log level.
 *  - MISP API keys and URLs are NEVER logged at any log level.
 *  - No @Autowired on fields — constructor injection only.
 *  - No Lombok annotations.
 *  - No java.util.List.getFirst() — uses enhanced for-loop.
 */
@Service
@Transactional
public class MispConnectorService {

    private static final Logger log = LoggerFactory.getLogger(MispConnectorService.class);

    /**
     * Immutable MISP attribute type to normalized IOC type mapping.
     * Nine entries covering all MISP attribute types ingested by Sprint 19.
     */
    private static final Map<String, String> MISP_TYPE_MAP = Map.of(
        "ip-dst",    "ip",
        "ip-src",    "ip",
        "domain",    "domain",
        "md5",       "hash",
        "sha256",    "hash",
        "sha1",      "hash",
        "url",       "url",
        "email-dst", "email",
        "email-src", "email"
    );

    private final HaAirGapConfig haAirGapConfig;
    private final HiveMispFeedRepository feedRepository;
    private final HiveThreatIocRepository iocRepository;
    private final WebClient webClient;

    public MispConnectorService(
        HaAirGapConfig haAirGapConfig,
        HiveMispFeedRepository feedRepository,
        HiveThreatIocRepository iocRepository,
        WebClient.Builder webClientBuilder
    ) {
        this.haAirGapConfig = haAirGapConfig;
        this.feedRepository = feedRepository;
        this.iocRepository = iocRepository;
        this.webClient = webClientBuilder.build();
    }

    /**
     * Maps a MISP attribute type string to a normalized IOC type.
     *
     * @param mispType the raw MISP attribute type (e.g. "ip-dst", "sha256")
     * @return the normalized type ("ip", "domain", "hash", "url", "email"),
     *         or Optional.empty() for unrecognized types
     */
    public Optional<String> mapMispType(String mispType) {
        return Optional.ofNullable(MISP_TYPE_MAP.get(mispType));
    }

    /**
     * Extracts the TLP level from a MISP event tag array.
     *
     * Returns "WHITE" when the array is null, absent, or contains no tlp: tag.
     * Case-insensitive: "TLP:RED", "tlp:red", and "Tlp:Red" all yield "RED".
     *
     * @param tagArray a JsonNode representing the Event.Tag array (may be null)
     * @return one of "WHITE", "GREEN", "AMBER", "RED"
     */
    public String extractTlpFromTags(JsonNode tagArray) {
        if (tagArray == null || !tagArray.isArray()) {
            return "WHITE";
        }

        for (JsonNode tag : tagArray) {
            JsonNode nameNode = tag.path("name");
            if (nameNode.isMissingNode() || nameNode.isNull()) {
                continue;
            }
            String name = nameNode.asText("").toLowerCase();
            if (name.startsWith("tlp:")) {
                String level = name.substring(4).toUpperCase();
                if ("WHITE".equals(level) || "GREEN".equals(level)
                    || "AMBER".equals(level) || "RED".equals(level)) {
                    return level;
                }
            }
        }
        return "WHITE";
    }

    /**
     * Synchronizes a single MISP feed by fetching attributes via restSearch.
     *
     * POST {feed.mispUrl}/attributes/restSearch
     * Headers: Authorization: {apiKeyEncrypted}, Accept: application/json,
     *          Content-Type: application/json
     * Body: {"returnFormat":"json","type":["ip-dst","ip-src","domain","md5","sha256","sha1","url"]}
     *
     * Parses response.Attribute[], maps types, extracts TLP, upserts IOCs.
     *
     * @param feed the MISP feed to synchronize
     * @return total number of IOCs upserted
     */
    public int syncFeed(HiveMispFeed feed) {
        String requestBody = "{\"returnFormat\":\"json\",\"type\":[\"ip-dst\",\"ip-src\",\"domain\","
            + "\"md5\",\"sha256\",\"sha1\",\"url\",\"email-dst\",\"email-src\"]}";

        String url = feed.getMispUrl().endsWith("/")
            ? feed.getMispUrl() + "attributes/restSearch"
            : feed.getMispUrl() + "/attributes/restSearch";

        JsonNode responseBody = webClient
            .post()
            .uri(url)
            .header("Authorization", feed.getApiKeyEncrypted())
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .bodyValue(requestBody)
            .retrieve()
            .bodyToMono(JsonNode.class)
            .block();

        if (responseBody == null) {
            feed.setLastSyncAt(Instant.now());
            feed.setLastSyncStatus(ThreatFeedSyncReceipt.STATUS_OK);
            feed.setLastSyncCount(0);
            feedRepository.save(feed);
            return 0;
        }

        int count = 0;
        JsonNode attributes = responseBody.path("response").path("Attribute");

        if (attributes.isArray()) {
            for (JsonNode attr : attributes) {
                String mispType = attr.path("type").asText("");
                Optional<String> normalizedType = mapMispType(mispType);
                if (normalizedType.isEmpty()) {
                    continue;
                }

                String value = attr.path("value").asText("");
                if (value.isBlank()) {
                    continue;
                }

                String sourceRef = attr.path("uuid").asText(null);
                JsonNode eventTags = attr.path("Event").path("Tag");
                String tlp = extractTlpFromTags(eventTags.isArray() ? eventTags : null);

                upsertIoc(normalizedType.get(), value, feed, sourceRef, tlp);
                count++;
            }
        }

        feed.setLastSyncAt(Instant.now());
        feed.setLastSyncStatus(ThreatFeedSyncReceipt.STATUS_OK);
        feed.setLastSyncCount(count);
        feedRepository.save(feed);

        return count;
    }

    /**
     * Upserts a single IOC from a MISP attribute into hive_threat_ioc.
     */
    private void upsertIoc(String iocType, String iocValue, HiveMispFeed feed,
                            String sourceRef, String tlp) {
        Optional<HiveThreatIoc> existing =
            iocRepository.findByIocTypeAndIocValueAndFeedId(iocType, iocValue, feed.getId());

        if (existing.isPresent()) {
            HiveThreatIoc ioc = existing.get();
            ioc.setLastSeen(Instant.now());
            ioc.setActive(true);
            iocRepository.save(ioc);
        } else {
            HiveThreatIoc ioc = new HiveThreatIoc();
            ioc.setIocType(iocType);
            ioc.setIocValue(iocValue);
            ioc.setTlp(tlp != null ? tlp : "WHITE");
            ioc.setFeedId(feed.getId());
            ioc.setFeedName(feed.getName());
            ioc.setSourceRef(sourceRef);
            ioc.setConfidence(50);
            ioc.setFirstSeen(Instant.now());
            ioc.setLastSeen(Instant.now());
            ioc.setActive(true);
            iocRepository.save(ioc);
        }
    }

    /**
     * Scheduled synchronization of all enabled MISP feeds.
     * Runs every 4 hours. Errors per feed are caught individually and persist
     * {@code lastSyncStatus=ERROR} + {@code lastSyncAt} (TI-004 STAGING CANDIDATE).
     * Never logs API keys, MISP URLs, or raw IOC values.
     */
    @Scheduled(cron = "0 0 */4 * * *")
    public void syncAllFeeds() {
        if (haAirGapConfig.isAirGap()) {
            log.warn("Air-gap mode active — TAXII/MISP sync disabled");
            return;
        }

        log.info("HiveArmor MISP sync starting");

        List<HiveMispFeed> feeds = feedRepository.findByEnabled(true);
        for (HiveMispFeed feed : feeds) {
            try {
                int synced = syncFeed(feed);
                log.info("HiveArmor MISP sync complete for feed id={} count={}", feed.getId(), synced);
            } catch (Exception ex) {
                log.error("HiveArmor MISP sync failed for feed id={}", feed.getId(), ex);
                feed.setLastSyncAt(Instant.now());
                feed.setLastSyncStatus(ThreatFeedSyncReceipt.STATUS_ERROR);
                feed.setLastSyncCount(0);
                feedRepository.save(feed);
            }
        }

        log.info("HiveArmor MISP sync finished, feeds processed={}", feeds.size());
    }
}
