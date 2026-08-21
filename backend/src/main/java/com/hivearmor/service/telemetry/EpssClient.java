package com.hivearmor.service.telemetry;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

/**
 * Reads FIRST EPSS scores. Does not invent values when the feed is unreachable or empty.
 */
@Component
public class EpssClient {

    private static final String DEFAULT_URL = "https://api.first.org/data/v1/epss";

    private final HttpClient http;
    private final String endpoint;
    private final Duration timeout;

    public EpssClient() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
                DEFAULT_URL, Duration.ofSeconds(20));
    }

    public EpssClient(HttpClient http, String endpoint, Duration timeout) {
        this.http = http;
        this.endpoint = endpoint;
        this.timeout = timeout;
    }

    public String queryCves(List<String> cves) throws Exception {
        if (cves == null || cves.isEmpty()) {
            return "{\"status\":\"OK\",\"data\":[]}";
        }
        String joined = cves.stream()
                .map(cve -> URLEncoder.encode(cve, StandardCharsets.UTF_8))
                .collect(Collectors.joining(","));
        URI uri = URI.create(endpoint + "?cve=" + joined);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("EPSS HTTP " + response.statusCode());
        }
        return response.body();
    }
}
