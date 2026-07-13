package com.hivearmor.service.search;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.search.UtmSearchAcceleration;
import com.hivearmor.repository.search.UtmSearchAccelerationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.*;

@Service
@Transactional
@Slf4j
public class UtmSearchAccelerationService {

    private final UtmSearchAccelerationRepository settingsRepo;
    private final RestTemplate restTemplate;

    public UtmSearchAccelerationService(
            UtmSearchAccelerationRepository settingsRepo,
            @Qualifier("restTemplateWithSsl") RestTemplate restTemplate) {
        this.settingsRepo = settingsRepo;
        this.restTemplate = restTemplate;
    }

    public List<UtmSearchAcceleration> listSettings() {
        return settingsRepo.findAllByOrderBySettingKeyAsc();
    }

    public UtmSearchAcceleration updateSetting(String key, String value) {
        UtmSearchAcceleration setting = settingsRepo.findBySettingKey(key)
            .orElseThrow(() -> new NoSuchElementException("Unknown setting: " + key));
        setting.setSettingValue(value);
        setting.setUpdatedAt(Instant.now());
        setting.setUpdatedBy(currentUser());
        return settingsRepo.save(setting);
    }

    public List<UtmSearchAcceleration> updateAll(Map<String, String> keyValueMap) {
        List<UtmSearchAcceleration> updated = new ArrayList<>();
        keyValueMap.forEach((k, v) -> {
            settingsRepo.findBySettingKey(k).ifPresent(s -> {
                s.setSettingValue(v);
                s.setUpdatedAt(Instant.now());
                s.setUpdatedBy(currentUser());
                updated.add(settingsRepo.save(s));
            });
        });
        return updated;
    }

    /**
     * Push field data cache and query cache settings to OpenSearch cluster.
     */
    public Map<String, Object> applyToOpenSearch() {
        String host = System.getenv(Constants.ENV_ELASTICSEARCH_HOST);
        String port = System.getenv(Constants.ENV_ELASTICSEARCH_PORT);
        if (!StringUtils.hasText(host) || !StringUtils.hasText(port)) {
            return Map.of("ok", false, "error", "ELASTICSEARCH_HOST / ELASTICSEARCH_PORT not configured");
        }
        String baseUrl = "https://" + host + ":" + port;

        Map<String, Object> results = new LinkedHashMap<>();

        // 1. Cluster-level field data + query cache settings
        try {
            Map<String, Object> persistent = new LinkedHashMap<>();
            settingsRepo.findBySettingKey("fielddata_cache_size").ifPresent(s ->
                persistent.put("indices.fielddata.cache.size", s.getSettingValue()));
            settingsRepo.findBySettingKey("indices_query_cache_size").ifPresent(s ->
                persistent.put("indices.queries.cache.size", s.getSettingValue()));
            settingsRepo.findBySettingKey("indices_requests_cache_size").ifPresent(s ->
                persistent.put("indices.requests.cache.size", s.getSettingValue()));

            Map<String, Object> body = Map.of("persistent", persistent);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            addAuth(headers);
            ResponseEntity<String> resp = restTemplate.exchange(
                baseUrl + "/_cluster/settings", HttpMethod.PUT,
                new HttpEntity<>(body, headers), String.class);
            results.put("cluster_settings", Map.of("status", resp.getStatusCodeValue(), "ok", resp.getStatusCode().is2xxSuccessful()));
        } catch (Exception e) {
            results.put("cluster_settings", Map.of("ok", false, "error", e.getMessage()));
        }

        // 2. Index-level refresh interval + translog for the alert index pattern
        try {
            Map<String, Object> idxSettings = new LinkedHashMap<>();
            settingsRepo.findBySettingKey("refresh_interval").ifPresent(s ->
                idxSettings.put("refresh_interval", s.getSettingValue()));
            settingsRepo.findBySettingKey("translog_durability").ifPresent(s ->
                idxSettings.put("translog.durability", s.getSettingValue()));
            settingsRepo.findBySettingKey("max_result_window").ifPresent(s ->
                idxSettings.put("max_result_window", s.getSettingValue()));

            Map<String, Object> body = Map.of("index", idxSettings);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            addAuth(headers);
            ResponseEntity<String> resp = restTemplate.exchange(
                baseUrl + "/_v3_hive_alert-*/_settings", HttpMethod.PUT,
                new HttpEntity<>(body, headers), String.class);
            results.put("index_settings", Map.of("status", resp.getStatusCodeValue(), "ok", resp.getStatusCode().is2xxSuccessful()));
        } catch (Exception e) {
            results.put("index_settings", Map.of("ok", false, "error", e.getMessage()));
        }

        boolean allOk = results.values().stream()
            .filter(v -> v instanceof Map)
            .allMatch(v -> Boolean.TRUE.equals(((Map<?, ?>) v).get("ok")));
        results.put("ok", allOk);
        return results;
    }

    private void addAuth(HttpHeaders headers) {
        String user = System.getenv(Constants.ENV_ELASTICSEARCH_USER);
        String pass = System.getenv(Constants.ENV_ELASTICSEARCH_PASSWORD);
        if (StringUtils.hasText(user) && StringUtils.hasText(pass)) {
            String creds = Base64.getEncoder().encodeToString((user + ":" + pass).getBytes());
            headers.set("Authorization", "Basic " + creds);
        }
    }

    private String currentUser() {
        try { return SecurityContextHolder.getContext().getAuthentication().getName(); }
        catch (Exception e) { return "system"; }
    }
}
