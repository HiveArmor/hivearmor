package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.databind.JsonNode;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Posts package queries to OSV. No scores are invented; the HTTP body is returned as-is.
 */
@Component
public class OsvClient {

    private static final String DEFAULT_URL = "https://api.osv.dev/v1/querybatch";

    private final HttpClient http;
    private final URI endpoint;
    private final Duration timeout;

    public OsvClient() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
                URI.create(DEFAULT_URL), Duration.ofSeconds(20));
    }

    public OsvClient(HttpClient http, URI endpoint, Duration timeout) {
        this.http = http;
        this.endpoint = endpoint;
        this.timeout = timeout;
    }

    public String queryBatch(JsonNode body) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("OSV HTTP " + response.statusCode());
        }
        return response.body();
    }
}
