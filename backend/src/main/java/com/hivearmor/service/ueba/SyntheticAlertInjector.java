package com.hivearmor.service.ueba;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.Constants;
import com.hivearmor.config.TlsClientFactory;
import okhttp3.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Posts synthetic UEBA alerts to the event-processor injection endpoint.
 *
 * <p>This component builds and sends the HTTP POST request to
 * {@code POST /v1/inject} with the shared {@code X-Internal-Key} header.
 *
 * <h3>Security invariants:</h3>
 * <ul>
 *   <li>The internal key is transmitted exclusively via the {@code X-Internal-Key}
 *       HTTP header — never in a URL query parameter, request body, response payload,
 *       or log line.</li>
 *   <li>On failure, only the HTTP status code and userId are logged; the key value
 *       is never included in any log statement.</li>
 * </ul>
 *
 * @see SyntheticAlertPayload
 */
@Component
public class SyntheticAlertInjector {

    private static final Logger log = LoggerFactory.getLogger(SyntheticAlertInjector.class);
    private static final MediaType JSON_MEDIA_TYPE = MediaType.parse("application/json; charset=utf-8");

    private final OkHttpClient httpClient;
    private final String injectorUrl;
    private final String internalKey;
    private final ObjectMapper mapper;

    public SyntheticAlertInjector(
            ObjectMapper mapper,
            @Value("${EVENT_PROCESSOR_INJECT_URL:http://event-processor:8081/v1/inject}") String injectorUrl) {
        this.mapper = mapper;
        this.injectorUrl = injectorUrl;
        this.internalKey = System.getenv(Constants.ENV_INTERNAL_KEY);
        this.httpClient = TlsClientFactory.buildOkHttpClient(10, 10, 30);
    }

    /**
     * Posts a synthetic alert payload to the event-processor injection endpoint.
     *
     * <p>Sends a JSON-serialized {@link SyntheticAlertPayload} via HTTP POST to
     * the configured injector URL. The shared internal key is sent exclusively in
     * the {@code X-Internal-Key} header.
     *
     * <p>If the internal key is not configured, the method logs a warning and
     * returns without sending the request.
     *
     * @param payload the alert payload describing the user, contributing metrics, and total score
     */
    public void postToInjector(SyntheticAlertPayload payload) {
        if (internalKey == null || internalKey.isBlank()) {
            log.warn("UEBA synthetic alert injection skipped: INTERNAL_KEY not configured, userId={}",
                payload.userId());
            return;
        }

        try {
            byte[] bodyBytes = mapper.writeValueAsBytes(payload);

            Request request = new Request.Builder()
                .url(injectorUrl)
                .post(RequestBody.create(bodyBytes, JSON_MEDIA_TYPE))
                .addHeader("Content-Type", "application/json")
                .addHeader("X-Internal-Key", internalKey)
                .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    log.warn("UEBA synthetic alert injection failed status={} userId={}",
                        response.code(), payload.userId());
                }
            }
        } catch (IOException e) {
            log.warn("UEBA synthetic alert injection failed userId={}: {}",
                payload.userId(), e.getMessage());
        }
    }
}
