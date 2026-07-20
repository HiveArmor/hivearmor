package com.hivearmor.service.sigma;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.correlation.rules.UtmCorrelationRules;
import com.hivearmor.domain.sigma.SigmaSyncConfig;
import com.hivearmor.repository.correlation.rules.UtmCorrelationRulesRepository;
import com.hivearmor.repository.sigma.SigmaSyncConfigRepository;
import com.hivearmor.service.dto.correlation.AdversaryType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;

@Service
public class SigmaSyncService {

    private static final Logger log = LoggerFactory.getLogger(SigmaSyncService.class);

    @Value("${GITHUB_TOKEN:}")
    private String githubToken;

    private final SigmaSyncConfigRepository syncConfigRepository;
    private final UtmCorrelationRulesRepository rulesRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public SigmaSyncService(SigmaSyncConfigRepository syncConfigRepository,
                            UtmCorrelationRulesRepository rulesRepository) {
        this.syncConfigRepository = syncConfigRepository;
        this.rulesRepository = rulesRepository;
    }

    // Checks every hour; skips if the configured frequency has not elapsed.
    @Scheduled(fixedDelay = 3_600_000)
    public void syncSigmaRules() {
        SigmaSyncConfig config = syncConfigRepository.findFirstByOrderByIdAsc().orElse(null);
        if (config == null || !config.isEnabled()) return;

        if (config.getLastSyncedAt() != null) {
            long hoursSince = (Instant.now().toEpochMilli() - config.getLastSyncedAt().toEpochMilli()) / 3_600_000;
            if (hoursSince < config.getSyncFrequencyHours()) {
                log.debug("Sigma sync skipped: {} h elapsed, next run in {} h",
                    hoursSince, config.getSyncFrequencyHours() - hoursSince);
                return;
            }
        }

        doSync(config);
    }

    public SigmaSyncResult triggerManualSync() {
        SigmaSyncConfig config = syncConfigRepository.findFirstByOrderByIdAsc().orElse(null);
        if (config == null) {
            return new SigmaSyncResult(0, 0, "No sync configuration found");
        }
        return doSync(config);
    }

    private SigmaSyncResult doSync(SigmaSyncConfig config) {
        try {
            String latestCommit = fetchLatestCommitSha(config);
            if (latestCommit == null) {
                return new SigmaSyncResult(0, 0, "Could not fetch latest commit");
            }

            if (latestCommit.equals(config.getLastSyncedCommit())) {
                log.info("Sigma sync: no changes since last sync (commit {})", latestCommit);
                config.setLastSyncedAt(Instant.now());
                syncConfigRepository.save(config);
                return new SigmaSyncResult(0, 0, "No changes since last sync");
            }

            List<JsonNode> ruleFiles = fetchRuleFiles(config);
            int staged = 0, skipped = 0;
            for (JsonNode file : ruleFiles) {
                String downloadUrl = file.path("download_url").asText(null);
                String path = file.path("path").asText("");
                if (downloadUrl == null || !path.endsWith(".yml")) continue;

                String ruleId = path.replace("/", "_").replace(".yml", "");
                if (rulesRepository.existsBySigmaRuleId(ruleId)) {
                    skipped++;
                    continue;
                }

                try {
                    String yamlContent = fetchContent(downloadUrl);
                    UtmCorrelationRules rule = buildRuleFromSigma(ruleId, yamlContent,
                        "https://github.com/SigmaHQ/sigma/blob/master/" + path,
                        config.isAutoActivate());
                    rulesRepository.save(rule);
                    staged++;
                } catch (Exception e) {
                    log.warn("Sigma sync: skipping rule {} — {}", ruleId, e.getMessage());
                    skipped++;
                }
            }

            config.setLastSyncedCommit(latestCommit);
            config.setLastSyncedAt(Instant.now());
            syncConfigRepository.save(config);

            log.info("Sigma sync complete: {} staged, {} skipped", staged, skipped);
            return new SigmaSyncResult(staged, skipped, "Sync complete");

        } catch (RateLimitException e) {
            log.warn("Sigma sync: GitHub rate limit reached — will retry next scheduled interval");
            return new SigmaSyncResult(0, 0, "GitHub rate limit reached, will retry later");
        } catch (Exception e) {
            log.error("Sigma sync failed: {}", e.getMessage(), e);
            return new SigmaSyncResult(0, 0, "Sync failed: " + e.getMessage());
        }
    }

    private String fetchLatestCommitSha(SigmaSyncConfig config) throws IOException, InterruptedException {
        String url = "https://api.github.com/repos/SigmaHQ/sigma/commits?per_page=1";
        String body = get(url);
        JsonNode arr = objectMapper.readTree(body);
        if (arr.isArray() && arr.size() > 0) {
            return arr.get(0).path("sha").asText(null);
        }
        return null;
    }

    private List<JsonNode> fetchRuleFiles(SigmaSyncConfig config) throws IOException, InterruptedException {
        List<JsonNode> files = new ArrayList<>();
        String url = config.getSyncUrl();
        fetchDirectory(url, files, config.getCategoryFilter(), 0);
        return files;
    }

    private void fetchDirectory(String url, List<JsonNode> files, String categoryFilter, int depth)
            throws IOException, InterruptedException {
        if (depth > 3) return; // guard against runaway recursion
        String body = get(url);
        JsonNode entries = objectMapper.readTree(body);
        if (!entries.isArray()) return;

        for (JsonNode entry : entries) {
            String type = entry.path("type").asText();
            String name = entry.path("name").asText();

            if ("file".equals(type) && name.endsWith(".yml")) {
                if (categoryFilter == null || categoryFilter.isBlank() || url.contains(categoryFilter)) {
                    files.add(entry);
                }
            } else if ("dir".equals(type)) {
                String subdirUrl = entry.path("url").asText(null);
                if (subdirUrl != null) {
                    fetchDirectory(subdirUrl, files, categoryFilter, depth + 1);
                }
            }

            // Cap to avoid exhausting anonymous rate limit in a single run
            if (files.size() >= 200) break;
        }
    }

    private String fetchContent(String url) throws IOException, InterruptedException {
        return get(url);
    }

    private String get(String url) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", "HiveArmor-SigmaSync/1.0");
        if (githubToken != null && !githubToken.isBlank()) {
            builder.header("Authorization", "Bearer " + githubToken);
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 403 || response.statusCode() == 429) {
            throw new RateLimitException("GitHub API rate limit: HTTP " + response.statusCode());
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("GitHub API error: HTTP " + response.statusCode());
        }
        return response.body();
    }

    private UtmCorrelationRules buildRuleFromSigma(String sigmaRuleId, String yamlContent,
                                                    String sigmaRuleUrl, boolean autoActivate) {
        // Extract a few fields from the YAML with simple string scanning to avoid a full YAML dep.
        String title = extractYamlField(yamlContent, "title");
        String description = extractYamlField(yamlContent, "description");
        String level = extractYamlField(yamlContent, "level"); // critical/high/medium/low/informational
        String category = extractYamlField(yamlContent, "category");
        String technique = extractYamlField(yamlContent, "attack");

        UtmCorrelationRules rule = new UtmCorrelationRules();
        rule.setRuleName(title != null && !title.isBlank() ? title : "Sigma: " + sigmaRuleId);
        rule.setRuleDescription(description);
        rule.setRuleCategory(category != null && !category.isBlank() ? category : "sigma");
        rule.setRuleTechnique(technique != null && !technique.isBlank() ? technique : "T0000");
        rule.setRuleAdversary(AdversaryType.origin);

        int severity = levelToScore(level);
        rule.setRuleConfidentiality(severity);
        rule.setRuleIntegrity(severity);
        rule.setRuleAvailability(severity);

        rule.setRuleDefinition("{\"ruleVariables\":[],\"ruleExpression\":\"true\"}");
        rule.setRuleActive(autoActivate);
        rule.setSystemOwner(false);
        rule.setStaged(!autoActivate);
        rule.setSigmaRuleId(sigmaRuleId);
        rule.setSigmaRuleUrl(sigmaRuleUrl);
        rule.setSigmaAccuracy(level != null ? level : "medium");
        rule.setDataTypes(new HashSet<>());
        return rule;
    }

    private String extractYamlField(String yaml, String field) {
        for (String line : yaml.split("\n")) {
            if (line.startsWith(field + ":") || line.startsWith(field + " :")) {
                String value = line.substring(line.indexOf(':') + 1).trim();
                value = value.replaceAll("^['\"]|['\"]$", "");
                return value.isBlank() ? null : value;
            }
        }
        return null;
    }

    private int levelToScore(String level) {
        if (level == null) return 1;
        return switch (level.toLowerCase()) {
            case "critical" -> 3;
            case "high"     -> 2;
            case "medium"   -> 1;
            default         -> 0;
        };
    }

    // ── Activate / Dismiss ─────────────────────────────────────────────────────

    @Transactional
    public void activateStagedRule(Long id) {
        if (!rulesRepository.existsById(id)) {
            throw new jakarta.persistence.EntityNotFoundException("Rule " + id + " not found");
        }
        rulesRepository.activateStagedRule(id);
    }

    @Transactional
    public void dismissStagedRule(Long id) {
        if (!rulesRepository.existsById(id)) {
            throw new jakarta.persistence.EntityNotFoundException("Rule " + id + " not found");
        }
        rulesRepository.dismissStagedRule(id);
    }

    public List<UtmCorrelationRules> getStagedRules() {
        return rulesRepository.findAllByStagedTrue();
    }

    public SigmaSyncConfig getConfig() {
        return syncConfigRepository.findFirstByOrderByIdAsc().orElse(new SigmaSyncConfig());
    }

    public SigmaSyncConfig saveConfig(SigmaSyncConfig config) {
        SigmaSyncConfig existing = syncConfigRepository.findFirstByOrderByIdAsc().orElse(config);
        existing.setEnabled(config.isEnabled());
        existing.setSyncFrequencyHours(config.getSyncFrequencyHours());
        existing.setAutoActivate(config.isAutoActivate());
        existing.setCategoryFilter(config.getCategoryFilter());
        return syncConfigRepository.save(existing);
    }

    // ── Inner types ────────────────────────────────────────────────────────────

    private static class RateLimitException extends RuntimeException {
        RateLimitException(String msg) { super(msg); }
    }

    public record SigmaSyncResult(int staged, int skipped, String message) {}
}
