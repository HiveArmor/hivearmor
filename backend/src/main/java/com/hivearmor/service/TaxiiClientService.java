package com.hivearmor.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.hivearmor.config.HaAirGapConfig;
import com.hivearmor.domain.HiveTaxiiFeed;
import com.hivearmor.domain.HiveThreatIoc;
import com.hivearmor.repository.HiveTaxiiFeedRepository;
import com.hivearmor.repository.HiveThreatIocRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HiveArmor TAXII 2.1 client service.
 *
 * Polls configured TAXII 2.1 feeds for STIX 2.1 indicator bundles, parses patterns,
 * and upserts normalized IOC records into the hive_threat_ioc table.
 *
 * Scheduled to run every 6 hours via the @Scheduled cron annotation.
 * Can also be triggered on-demand via HaTaxiiFeedResource.
 *
 * Security invariants:
 *  - Raw IOC values are NEVER logged at any log level.
 *  - API keys and TAXII URLs are NEVER logged at any log level.
 *  - No @Autowired on fields - constructor injection only.
 *  - No Lombok annotations.
 *  - No java.util.List.getFirst() - uses .get(0) for Java 17 compatibility.
 */
@Service
@Transactional
public class TaxiiClientService {

    private static final Logger log = LoggerFactory.getLogger(TaxiiClientService.class);

    // STIX 2.1 compiled pattern constants (order is significant: first match wins)

    /** Matches [ipv4-addr:value = '...'] */
    private static final Pattern STIX_IP =
        Pattern.compile("ipv4-addr:value\\s*=\\s*'([^']+)'");

    /** Matches [domain-name:value = '...'] */
    private static final Pattern STIX_DOMAIN =
        Pattern.compile("domain-name:value\\s*=\\s*'([^']+)'");

    /** Matches [file:hashes.SHA256|MD5|SHA1 = '...'] */
    private static final Pattern STIX_HASH =
        Pattern.compile("file:hashes\\.(?:SHA256|MD5|SHA1)\\s*=\\s*'([^']+)'");

    /** Matches [url:value = '...'] */
    private static final Pattern STIX_URL =
        Pattern.compile("url:value\\s*=\\s*'([^']+)'");

    /** Matches [email-addr:value = '...'] */
    private static final Pattern STIX_EMAIL =
        Pattern.compile("email-addr:value\\s*=\\s*'([^']+)'");

    // dependencies

    private final HaAirGapConfig haAirGapConfig;
    private final HiveTaxiiFeedRepository feedRepository;
    private final HiveThreatIocRepository iocRepository;
    private final WebClient webClient;

    public TaxiiClientService(
        HaAirGapConfig haAirGapConfig,
        HiveTaxiiFeedRepository feedRepository,
        HiveThreatIocRepository iocRepository,
        WebClient.Builder webClientBuilder
    ) {
        this.haAirGapConfig = haAirGapConfig;
        this.feedRepository = feedRepository;
        this.iocRepository = iocRepository;
        this.webClient = webClientBuilder.build();
    }

    // inner record

    /**
     * Holds the result of a successful STIX pattern parse.
     * Carries the normalized IOC type, extracted value, and TLP level.
     */
    public record IocExtract(String type, String value, String tlp) {}

    // public API

    /**
     * Attempts to extract an IOC from a STIX 2.1 pattern string.
     *
     * Patterns are tried in a fixed order: IP, domain, hash, URL, email.
     * The order MUST NOT change because the parser short-circuits on the first match.
     *
     * @param pattern the raw STIX pattern string (e.g. "[ipv4-addr:value = '1.2.3.4']")
     * @param tlp     the TLP level to associate with the extracted IOC
     * @return an IocExtract if a known pattern matches, or Optional.empty() otherwise
     */
    public Optional<IocExtract> parseStixPattern(String pattern, String tlp) {
        if (pattern == null || pattern.isBlank()) {
            return Optional.empty();
        }

        // 1 - IP address (must remain first)
        Matcher ipMatcher = STIX_IP.matcher(pattern);
        if (ipMatcher.find()) {
            return Optional.of(new IocExtract("ip", ipMatcher.group(1), tlp));
        }

        // 2 - domain name
        Matcher domainMatcher = STIX_DOMAIN.matcher(pattern);
        if (domainMatcher.find()) {
            return Optional.of(new IocExtract("domain", domainMatcher.group(1), tlp));
        }

        // 3 - file hash (SHA256, MD5, SHA1)
        Matcher hashMatcher = STIX_HASH.matcher(pattern);
        if (hashMatcher.find()) {
            return Optional.of(new IocExtract("hash", hashMatcher.group(1), tlp));
        }

        // 4 - URL
        Matcher urlMatcher = STIX_URL.matcher(pattern);
        if (urlMatcher.find()) {
            return Optional.of(new IocExtract("url", urlMatcher.group(1), tlp));
        }

        // 5 - email address
        Matcher emailMatcher = STIX_EMAIL.matcher(pattern);
        if (emailMatcher.find()) {
            return Optional.of(new IocExtract("email", emailMatcher.group(1), tlp));
        }

        return Optional.empty();
    }

    /**
     * Upserts a single IOC into hive_threat_ioc.
     *
     * If a row already exists for (iocType, iocValue, feedId): updates lastSeen to
     * now and ensures active = true. Confidence, tlp, firstSeen, and feedName are
     * left unchanged on an existing row.
     *
     * If no matching row exists: inserts a new row with firstSeen = lastSeen = now,
     * active = true, confidence = 50, and tlp from the extract.
     *
     * @param extract   the parsed IOC type, value, and TLP
     * @param feedId    the source feed primary key
     * @param feedName  the display name snapshot of the source feed
     * @param sourceRef the STIX indicator ID or other source object reference
     */
    public void upsertIoc(IocExtract extract, Long feedId, String feedName, String sourceRef) {
        Optional<HiveThreatIoc> existing =
            iocRepository.findByIocTypeAndIocValueAndFeedId(extract.type(), extract.value(), feedId);

        if (existing.isPresent()) {
            HiveThreatIoc ioc = existing.get();
            ioc.setLastSeen(Instant.now());
            ioc.setActive(true);
            iocRepository.save(ioc);
        } else {
            HiveThreatIoc ioc = new HiveThreatIoc();
            ioc.setIocType(extract.type());
            ioc.setIocValue(extract.value());
            ioc.setTlp(extract.tlp() != null ? extract.tlp() : "WHITE");
            ioc.setFeedId(feedId);
            ioc.setFeedName(feedName);
            ioc.setSourceRef(sourceRef);
            ioc.setConfidence(50);
            ioc.setFirstSeen(Instant.now());
            ioc.setLastSeen(Instant.now());
            ioc.setActive(true);
            iocRepository.save(ioc);
        }
    }

    /**
     * Polls all pages of a single TAXII 2.1 collection and upserts each indicator.
     *
     * Uses WebClient in blocking mode (.block()) because @Scheduled methods run
     * outside a reactive pipeline.
     *
     * Request: GET {feed.taxiiUrl}/collections/{feed.collectionId}/objects/?limit=1000
     * Headers:
     *   Accept: application/taxii+json;version=2.1
     *   Authorization: {apiKeyEncrypted}  (only when present and non-blank)
     *
     * Pagination: follows the "next" cursor field in each response envelope until the
     * field is absent or blank.
     *
     * After all pages are consumed, updates feed.lastSyncAt, feed.lastSyncStatus = "OK",
     * and feed.lastSyncCount with the total count, then saves the feed.
     *
     * @param feed the configured TAXII feed to poll
     * @return total number of IOCs upserted during this poll run
     */
    public int pollCollection(HiveTaxiiFeed feed) {
        int count = 0;
        String cursor = null;

        do {
            String url = buildCollectionUrl(feed.getTaxiiUrl(), feed.getCollectionId(), cursor);

            boolean hasKey = feed.getApiKeyEncrypted() != null
                && !feed.getApiKeyEncrypted().isBlank();

            WebClient.RequestHeadersSpec<?> request;
            if (hasKey) {
                request = webClient
                    .get()
                    .uri(url)
                    .header("Accept", "application/taxii+json;version=2.1")
                    .header("Authorization", feed.getApiKeyEncrypted());
            } else {
                request = webClient
                    .get()
                    .uri(url)
                    .header("Accept", "application/taxii+json;version=2.1");
            }

            JsonNode responseBody = request
                .retrieve()
                .bodyToMono(JsonNode.class)
                .block();

            if (responseBody == null) {
                break;
            }

            JsonNode objects = responseBody.path("objects");
            if (objects.isArray()) {
                for (JsonNode obj : objects) {
                    String type = obj.path("type").asText("");
                    if (!"indicator".equals(type)) {
                        continue;
                    }

                    String pattern = obj.path("pattern").asText("");
                    String sourceRef = obj.path("id").asText(null);

                    // TLP defaults to WHITE; real feeds may embed it in object_marking_refs
                    String tlp = "WHITE";

                    Optional<IocExtract> extracted = parseStixPattern(pattern, tlp);
                    if (extracted.isPresent()) {
                        upsertIoc(extracted.get(), feed.getId(), feed.getName(), sourceRef);
                        count++;
                    }
                }
            }

            // Advance cursor - absent or blank means the last page has been consumed.
            JsonNode nextNode = responseBody.path("next");
            cursor = (nextNode.isMissingNode() || nextNode.isNull() || nextNode.asText("").isBlank())
                ? null
                : nextNode.asText();

        } while (cursor != null);

        feed.setLastSyncAt(Instant.now());
        feed.setLastSyncStatus("OK");
        feed.setLastSyncCount(count);
        feedRepository.save(feed);

        return count;
    }

    /**
     * Scheduled synchronization of all enabled TAXII feeds.
     *
     * Runs every 6 hours. Errors per feed are caught individually and logged
     * without exposing IOC values, API keys, or TAXII URLs. The failed feed's
     * lastSyncStatus is set to "ERROR".
     *
     * Uses .get(i) loop iteration rather than List.getFirst() for Java 17 compatibility.
     */
    @Scheduled(cron = "0 0 */6 * * *")
    public void syncAllFeeds() {
        if (haAirGapConfig.isAirGap()) {
            log.warn("Air-gap mode active — TAXII/MISP sync disabled");
            return;
        }

        log.info("HiveArmor TAXII sync starting");

        List<HiveTaxiiFeed> feeds = feedRepository.findByEnabled(true);

        for (HiveTaxiiFeed feed : feeds) {
            try {
                int synced = pollCollection(feed);
                log.info("HiveArmor TAXII sync complete for feed id={} count={}", feed.getId(), synced);
            } catch (Exception ex) {
                log.error("HiveArmor TAXII sync failed for feed id={}", feed.getId(), ex);
                feed.setLastSyncAt(Instant.now());
                feed.setLastSyncStatus("ERROR");
                feed.setLastSyncCount(0);
                feedRepository.save(feed);
            }
        }

        log.info("HiveArmor TAXII sync finished, feeds processed={}", feeds.size());
    }

    // private helpers

    /**
     * Builds the TAXII collection objects URL with optional pagination cursor.
     * The cursor is appended as a query parameter only when non-null.
     */
    private String buildCollectionUrl(String taxiiUrl, String collectionId, String cursor) {
        String base = taxiiUrl.endsWith("/") ? taxiiUrl : taxiiUrl + "/";
        String url = base + "collections/" + collectionId + "/objects/?limit=1000";
        if (cursor != null && !cursor.isBlank()) {
            url = url + "&next=" + cursor;
        }
        return url;
    }
}
