package com.hivearmor.service.soar;

import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * SSRF-hardened outbound webhook for SOAR playbook steps.
 *
 * <p>Blocks private/link-local/loopback/metadata hosts. Only http/https.
 * Does not log request bodies or URLs with credentials.
 */
@Component
public class PlaybookWebhookExecutor {

    private static final Duration TIMEOUT = Duration.ofSeconds(8);
    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(TIMEOUT)
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();

    public Map<String, Object> send(String url, String method, String body) throws Exception {
        if (url == null || url.isBlank()) {
            throw new IllegalArgumentException("Webhook URL is required");
        }
        URI uri = URI.create(url.trim());
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            throw new IllegalArgumentException("Webhook URL must use http or https");
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("Webhook URL host is required");
        }
        assertHostSafe(uri.getHost());

        String verb = method != null && !method.isBlank()
            ? method.trim().toUpperCase(Locale.ROOT)
            : "POST";
        if (!verb.equals("POST") && !verb.equals("PUT")) {
            throw new IllegalArgumentException("Webhook method must be POST or PUT");
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
            .timeout(TIMEOUT)
            .header("Content-Type", "application/json")
            .header("User-Agent", "HiveArmor-SOAR/1.0");

        String payload = body != null ? body : "{}";
        if ("PUT".equals(verb)) {
            builder.PUT(HttpRequest.BodyPublishers.ofString(payload));
        } else {
            builder.POST(HttpRequest.BodyPublishers.ofString(payload));
        }

        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        int code = response.statusCode();
        if (code < 200 || code >= 300) {
            throw new IllegalStateException("Webhook returned HTTP " + code);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("action", "send-webhook");
        out.put("statusCode", code);
        out.put("host", uri.getHost());
        return out;
    }

    static void assertHostSafe(String host) throws Exception {
        String h = host.trim().toLowerCase(Locale.ROOT);
        if ("localhost".equals(h) || h.endsWith(".localhost") || h.endsWith(".local")
            || "metadata.google.internal".equals(h)
            || "metadata".equals(h)) {
            throw new IllegalArgumentException("Webhook host is not allowed");
        }
        InetAddress[] addrs = InetAddress.getAllByName(h);
        for (InetAddress addr : addrs) {
            if (addr.isAnyLocalAddress()
                || addr.isLoopbackAddress()
                || addr.isLinkLocalAddress()
                || addr.isSiteLocalAddress()
                || addr.isMulticastAddress()) {
                throw new IllegalArgumentException("Webhook host resolves to a private/reserved address");
            }
            // AWS/GCP/Azure metadata link-local
            String ip = addr.getHostAddress();
            if (ip.startsWith("169.254.") || ip.equals("::1") || ip.startsWith("fc") || ip.startsWith("fd")) {
                throw new IllegalArgumentException("Webhook host resolves to a reserved address");
            }
        }
    }
}
