package com.hivearmor.service;

import com.hivearmor.domain.HaSigmaRule;
import com.hivearmor.repository.HaSigmaRuleRepository;
import com.hivearmor.service.dto.SigmaSyncResultDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Service responsible for synchronising the SigmaHQ community rule archive into
 * the {@code ha_sigma_rule} PostgreSQL table.
 *
 * <p>Two entry points exist:
 * <ol>
 *   <li>{@link #scheduledSync()} — Monday 03:00 cron; skips silently when
 *       {@code app.air-gap=true}.</li>
 *   <li>{@link #syncFromGithub()} — on-demand; constructs the {@link HttpClient}
 *       and performs the actual download + upsert.</li>
 * </ol>
 *
 * <p>Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.15, 2.16
 */
@Service
@Transactional
public class HaSigmaSyncService {

    private static final Logger log = LoggerFactory.getLogger(HaSigmaSyncService.class);

    private static final String SIGMA_ARCHIVE_URL =
        "https://github.com/SigmaHQ/sigma/archive/refs/heads/master.zip";

    /** Injected from {@code app.air-gap} Spring property; defaults to {@code false}. */
    @Value("${app.air-gap:false}")
    private boolean airGap;

    private final HaSigmaRuleRepository sigmaRuleRepository;

    public HaSigmaSyncService(HaSigmaRuleRepository sigmaRuleRepository) {
        this.sigmaRuleRepository = sigmaRuleRepository;
    }

    // ---- Public API ----------------------------------------------------------

    /**
     * Downloads the SigmaHQ master archive, iterates every ZIP entry whose path
     * ends with {@code .yml} and contains {@code /rules/}, parses the YAML, and
     * upserts every entry that contains a {@code title} key into {@code ha_sigma_rule}
     * keyed by {@code sigma_id}.
     *
     * <p>This is the <em>only</em> method that constructs an {@link HttpClient}.
     *
     * @return a {@link SigmaSyncResultDTO} with processed/inserted/updated/errors counts
     * @throws IOException          if the archive download returns HTTP ≠ 200 (message includes
     *                              the returned status code), or on I/O failure reading the stream
     * @throws InterruptedException if the HTTP send is interrupted
     */
    public SigmaSyncResultDTO syncFromGithub() throws IOException, InterruptedException {
        HttpClient client = buildHttpClient();

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(SIGMA_ARCHIVE_URL))
            .timeout(Duration.ofSeconds(120))
            .GET()
            .build();

        HttpResponse<InputStream> response =
            client.send(request, HttpResponse.BodyHandlers.ofInputStream());

        int status = response.statusCode();
        if (status != 200) {
            throw new IOException(
                "SigmaHQ archive download failed: HTTP " + status);
        }

        return processArchive(response.body());
    }

    /**
     * Maps a Sigma rule level string to a HiveArmor severity integer.
     *
     * <table>
     *   <tr><th>Level</th><th>Severity</th></tr>
     *   <tr><td>critical</td><td>5</td></tr>
     *   <tr><td>high</td><td>4</td></tr>
     *   <tr><td>medium</td><td>3</td></tr>
     *   <tr><td>low or null</td><td>2</td></tr>
     *   <tr><td>any other non-null</td><td>1</td></tr>
     * </table>
     *
     * <p>Matching is case-insensitive (Requirement 2.8).
     *
     * @param level the Sigma level string; may be {@code null}
     * @return integer severity 1–5
     */
    public int mapSigmaLevel(String level) {
        if (level == null) {
            return 2;
        }
        switch (level.toLowerCase()) {
            case "critical": return 5;
            case "high":     return 4;
            case "medium":   return 3;
            case "low":      return 2;
            default:         return 1;
        }
    }

    // ---- Scheduled entry point ----------------------------------------------

    /**
     * Scheduled entry point — runs every Monday at 03:00 local time.
     *
     * <p>When {@code app.air-gap=true} the method logs a skip reason and returns
     * immediately without constructing any {@link HttpClient} or making an outbound
     * network call (Requirement 2.10).
     */
    @Scheduled(cron = "0 0 3 * * 1")
    public void scheduledSync() {
        if (airGap) {
            log.info("HaSigmaSyncService.scheduledSync: skipped — air-gap mode is enabled; " +
                     "no outbound network call will be made");
            return;
        }
        try {
            SigmaSyncResultDTO result = syncFromGithub();
            log.info("HaSigmaSyncService.scheduledSync: complete — " +
                     "processed={}, inserted={}, updated={}, errors={}",
                result.getProcessed(), result.getInserted(),
                result.getUpdated(), result.getErrors());
        } catch (IOException e) {
            log.error("HaSigmaSyncService.scheduledSync: I/O error during sync — {}", e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("HaSigmaSyncService.scheduledSync: interrupted", e);
        }
    }

    // ---- Test seams (package-private) ----------------------------------------

    /**
     * Returns the current value of the {@code app.air-gap} flag.
     * Package-private to allow test assertions via constructor injection.
     */
    boolean isAirGap() {
        return airGap;
    }

    /**
     * Constructs and returns a new {@link HttpClient} with a 30-second connect timeout.
     * Extracted as a separate method so tests can override it via a constructor overload.
     */
    HttpClient buildHttpClient() {
        return HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    }

    // ---- Archive processing --------------------------------------------------

    /**
     * Iterates a SigmaHQ ZIP archive stream, finds YAML rule entries, and upserts
     * each one that contains a {@code title} key.
     *
     * @param archiveStream the raw ZIP input stream from the HTTP response body
     * @return counts of processed/inserted/updated/errors
     * @throws IOException on ZIP reading failures
     */
    private SigmaSyncResultDTO processArchive(InputStream archiveStream) throws IOException {
        int processed = 0;
        int inserted  = 0;
        int updated   = 0;
        int errors    = 0;

        Yaml yaml = new Yaml();

        try (ZipInputStream zis = new ZipInputStream(archiveStream)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String entryName = entry.getName();

                // Only process YAML files under a /rules/ path component
                if (!entryName.endsWith(".yml") || !entryName.contains("/rules/")) {
                    zis.closeEntry();
                    continue;
                }

                processed++;

                try {
                    // Read entry bytes without closing the outer ZipInputStream
                    byte[] bytes = zis.readAllBytes();
                    Map<String, Object> parsed = yaml.load(new java.io.ByteArrayInputStream(bytes));

                    if (parsed == null || !parsed.containsKey("title")) {
                        // Entry has no title — not a valid Sigma rule; skip silently
                        zis.closeEntry();
                        continue;
                    }

                    String rawYaml = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
                    boolean wasInserted = upsertRule(parsed, rawYaml);
                    if (wasInserted) {
                        inserted++;
                    } else {
                        updated++;
                    }

                } catch (Exception e) {
                    errors++;
                    log.warn("HaSigmaSyncService: error processing entry '{}' — {}", entryName, e.getMessage());
                }

                zis.closeEntry();
            }
        }

        return new SigmaSyncResultDTO(processed, inserted, updated, errors);
    }

    /**
     * Upserts a single parsed Sigma rule map into the repository.
     *
     * <p>On insert: sets both {@code imported_at} and {@code updated_at} to now; sets
     * {@code active=true} (Requirement 2.7).<br>
     * On update: preserves {@code imported_at}; updates {@code updated_at} to now
     * (Requirement 2.6).
     *
     * @param parsed  the SnakeYAML-parsed rule map
     * @param rawYaml verbatim YAML string for {@code detection_yaml} storage
     * @return {@code true} if a new row was inserted; {@code false} if an existing row was updated
     */
    private boolean upsertRule(Map<String, Object> parsed, String rawYaml) {
        String sigmaId = objectToString(parsed.get("id"));
        if (sigmaId == null || sigmaId.isBlank()) {
            // Use the title as a fallback key when id is absent
            sigmaId = "title:" + objectToString(parsed.get("title"));
        }

        String title            = objectToString(parsed.get("title"));
        String ruleStatus       = objectToString(parsed.get("status"));
        String level            = objectToString(parsed.get("level"));
        int    haSeverity       = mapSigmaLevel(level);
        String mitreTags        = extractMitreTags(parsed);

        String logsourceProduct = null;
        String logsourceService = null;
        Object logsourceObj = parsed.get("logsource");
        if (logsourceObj instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> logsource = (Map<String, Object>) logsourceObj;
            logsourceProduct = objectToString(logsource.get("product"));
            logsourceService = objectToString(logsource.get("service"));
        }

        Optional<HaSigmaRule> existing = sigmaRuleRepository.findBySigmaId(sigmaId);
        Instant now = Instant.now();

        if (existing.isPresent()) {
            HaSigmaRule rule = existing.get();
            rule.setRuleTitle(title != null ? title : "");
            rule.setRuleStatus(ruleStatus);
            rule.setDetectionYaml(rawYaml);
            rule.setHaSeverity(haSeverity);
            rule.setMitreTags(mitreTags);
            rule.setLogsourceProduct(logsourceProduct);
            rule.setLogsourceService(logsourceService);
            // Requirement 2.6: preserve imported_at; only update updated_at
            rule.setUpdatedAt(now);
            sigmaRuleRepository.save(rule);
            return false;
        } else {
            HaSigmaRule rule = new HaSigmaRule();
            rule.setSigmaId(sigmaId);
            rule.setRuleTitle(title != null ? title : "");
            rule.setRuleStatus(ruleStatus);
            rule.setDetectionYaml(rawYaml);
            rule.setHaSeverity(haSeverity);
            rule.setMitreTags(mitreTags);
            rule.setLogsourceProduct(logsourceProduct);
            rule.setLogsourceService(logsourceService);
            // Requirement 2.7: set both timestamps; active=true on insert
            rule.setImportedAt(now);
            rule.setUpdatedAt(now);
            rule.setActive(Boolean.TRUE);
            sigmaRuleRepository.save(rule);
            return true;
        }
    }

    // ---- Helpers -------------------------------------------------------------

    /**
     * Extracts a comma-separated string of MITRE ATT&amp;CK tags from the rule's
     * {@code tags} list (entries starting with {@code attack.}).
     */
    @SuppressWarnings("unchecked")
    private String extractMitreTags(Map<String, Object> parsed) {
        Object tagsObj = parsed.get("tags");
        if (!(tagsObj instanceof List)) {
            return null;
        }
        List<Object> tags = (List<Object>) tagsObj;
        List<String> mitre = new ArrayList<>();
        for (Object tag : tags) {
            if (tag != null) {
                String tagStr = tag.toString();
                if (tagStr.startsWith("attack.")) {
                    mitre.add(tagStr);
                }
            }
        }
        if (mitre.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < mitre.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(mitre.get(i));
        }
        return sb.toString();
    }

    /**
     * Converts a parsed YAML value to a trimmed String, returning {@code null} if
     * the value is null or blank.
     */
    private String objectToString(Object value) {
        if (value == null) {
            return null;
        }
        String str = value.toString().trim();
        return str.isEmpty() ? null : str;
    }
}
