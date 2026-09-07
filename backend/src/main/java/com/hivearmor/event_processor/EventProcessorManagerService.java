package com.hivearmor.event_processor;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.Constants;
import com.hivearmor.service.dto.application_modules.ModuleDTO;
import com.hivearmor.service.web_clients.rest_template.RestTemplateService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class EventProcessorManagerService {

    private static final String CLASSNAME = "EventProcessorManagerService";
    private final Logger log = LoggerFactory.getLogger(EventProcessorManagerService.class);

    private final RestTemplateService restTemplateService;
    private final ObjectMapper objectMapper;

    public static final String EVENT_PROCESSOR_BASE_URL = "http://" +
            System.getenv(Constants.ENV_EVENT_PROCESSOR_HOST) + ":" +
            System.getenv(Constants.ENV_EVENT_PROCESSOR_PORT);

    public void updateModule(ModuleDTO module) {
        final String ctx = CLASSNAME + ".updateModule";

        String url = UriComponentsBuilder
                .fromHttpUrl(EVENT_PROCESSOR_BASE_URL + "/api/v1/modules-config")
                .queryParam("nameShort", module.getModuleName())
                .toUriString();

        try{
            ResponseEntity<String> response = restTemplateService.post(
                    url,
                    List.of(module),
                    String.class,
                    buildEventProcessorHeaders()
            );
            response.getStatusCode();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * DET-OBS-001 — GET /health from event-processor (includes LoadReport).
     */
    public Map<String, Object> fetchHealth() {
        String url = EVENT_PROCESSOR_BASE_URL + "/health";
        try {
            ResponseEntity<String> response = restTemplateService.get(
                url,
                String.class,
                buildEventProcessorHeaders()
            );
            if (response.getBody() == null || response.getBody().isBlank()) {
                throw new IllegalStateException("Empty health response from event-processor");
            }
            return objectMapper.readValue(response.getBody(), new TypeReference<>() {});
        } catch (Exception e) {
            throw new IllegalStateException("event-processor health unavailable: " + e.getMessage(), e);
        }
    }

    /**
     * DET-OBS-001 — GET /api/rules/status (INTERNAL_KEY).
     */
    public Map<String, Object> fetchRulesStatus() {
        String url = EVENT_PROCESSOR_BASE_URL + "/api/rules/status";
        try {
            ResponseEntity<String> response = restTemplateService.get(
                url,
                String.class,
                buildEventProcessorHeaders()
            );
            if (response.getBody() == null || response.getBody().isBlank()) {
                return Map.of();
            }
            return objectMapper.readValue(response.getBody(), new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("{}.fetchRulesStatus: {}", CLASSNAME, e.getMessage());
            return Map.of();
        }
    }

    /**
     * DET-SIGMA-001 — POST /api/rules/reload (INTERNAL_KEY). Returns honesty payload.
     */
    public Map<String, Object> requestRuleReload() {
        Map<String, Object> result = new LinkedHashMap<>();
        String url = EVENT_PROCESSOR_BASE_URL + "/api/rules/reload";
        try {
            ResponseEntity<String> response = restTemplateService.post(
                url,
                Map.of(),
                String.class,
                buildEventProcessorHeaders()
            );
            result.put("requested", true);
            result.put("httpStatus", response.getStatusCode().value());
            result.put("body", response.getBody());
            result.put("honesty",
                "STAGING CANDIDATE — reload accepted by event-processor; config plugin sync may still lag.");
            return result;
        } catch (Exception e) {
            log.warn("{}.requestRuleReload: {}", CLASSNAME, e.getMessage());
            result.put("requested", false);
            result.put("error", e.getMessage());
            result.put("honesty",
                "Engine reload could not be requested — event-processor unreachable or INTERNAL_KEY missing.");
            return result;
        }
    }

    private HttpHeaders buildEventProcessorHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.ALL));
        headers.set(
                Constants.EVENT_PROCESSOR_INTERNAL_KEY_HEADER,
                System.getenv(Constants.ENV_INTERNAL_KEY)
        );
        return headers;
    }
}
