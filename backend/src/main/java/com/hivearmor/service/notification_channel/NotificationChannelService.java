package com.hivearmor.service.notification_channel;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.notification_channel.UtmNotificationChannel;
import com.hivearmor.domain.notification_channel.UtmNotificationRoute;
import com.hivearmor.domain.notification.NotificationSource;
import com.hivearmor.domain.notification.NotificationType;
import com.hivearmor.repository.notification_channel.UtmNotificationChannelRepository;
import com.hivearmor.repository.notification_channel.UtmNotificationRouteRepository;
import com.hivearmor.service.MailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.*;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class NotificationChannelService {

    private final UtmNotificationChannelRepository channelRepo;
    private final UtmNotificationRouteRepository routeRepo;
    private final MailService mailService;
    private final ObjectMapper objectMapper;

    private final RestTemplate restTemplate = new RestTemplate();

    // ── Channel CRUD ─────────────────────────────────────────────────────────

    public List<UtmNotificationChannel> listChannels() {
        return channelRepo.findAllByOrderByCreatedAtDesc();
    }

    public UtmNotificationChannel getChannel(Long id) {
        return channelRepo.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Channel not found: " + id));
    }

    public UtmNotificationChannel createChannel(UtmNotificationChannel ch) {
        ch.setCreatedAt(Instant.now());
        ch.setCreatedBy(currentUser());
        return channelRepo.save(ch);
    }

    public UtmNotificationChannel updateChannel(Long id, UtmNotificationChannel patch) {
        UtmNotificationChannel existing = getChannel(id);
        existing.setName(patch.getName());
        existing.setChannelType(patch.getChannelType());
        existing.setEnabled(patch.getEnabled());
        existing.setConfigJson(patch.getConfigJson());
        existing.setUpdatedAt(Instant.now());
        return channelRepo.save(existing);
    }

    public void deleteChannel(Long id) {
        channelRepo.deleteById(id);
    }

    public Map<String, Object> testChannel(Long id) {
        UtmNotificationChannel ch = getChannel(id);
        boolean ok = false;
        String error = null;
        try {
            dispatch(ch, "HiveArmor Test", "This is a test notification from HiveArmor SIEM.", "info");
            ok = true;
        } catch (Exception e) {
            error = e.getMessage();
            log.warn("Channel test failed for {}: {}", ch.getName(), e.getMessage());
        }
        ch.setLastTestedAt(Instant.now());
        ch.setLastTestOk(ok);
        channelRepo.save(ch);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", ok);
        result.put("channelId", id);
        result.put("channelName", ch.getName());
        result.put("error", error);
        return result;
    }

    // ── Route CRUD ───────────────────────────────────────────────────────────

    public List<UtmNotificationRoute> listRoutes() {
        return routeRepo.findAllByOrderByCreatedAtDesc();
    }

    public UtmNotificationRoute createRoute(UtmNotificationRoute route) {
        route.setCreatedAt(Instant.now());
        return routeRepo.save(route);
    }

    public UtmNotificationRoute updateRoute(Long id, UtmNotificationRoute patch) {
        UtmNotificationRoute existing = routeRepo.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Route not found: " + id));
        existing.setName(patch.getName());
        existing.setChannelId(patch.getChannelId());
        existing.setMatchSeverity(patch.getMatchSeverity());
        existing.setMatchSource(patch.getMatchSource());
        existing.setMatchType(patch.getMatchType());
        existing.setEnabled(patch.getEnabled());
        existing.setThrottleMinutes(patch.getThrottleMinutes());
        return routeRepo.save(existing);
    }

    public void deleteRoute(Long id) {
        routeRepo.deleteById(id);
    }

    // ── Routing dispatch ─────────────────────────────────────────────────────

    public void routeNotification(String message, String severity, NotificationSource source, NotificationType type) {
        List<UtmNotificationRoute> routes = routeRepo.findByEnabledTrue();
        for (UtmNotificationRoute route : routes) {
            if (!matchesSeverity(route, severity)) continue;
            if (!matchesSource(route, source)) continue;
            if (!matchesType(route, type)) continue;
            if (isThrottled(route)) continue;

            channelRepo.findById(route.getChannelId()).ifPresent(ch -> {
                if (!Boolean.TRUE.equals(ch.getEnabled())) return;
                try {
                    dispatch(ch, "HiveArmor Alert", message, severity);
                    route.setLastFiredAt(Instant.now());
                    routeRepo.save(route);
                } catch (Exception e) {
                    log.error("Route dispatch failed for route {} channel {}: {}", route.getName(), ch.getName(), e.getMessage());
                }
            });
        }
    }

    // ── Private dispatch ─────────────────────────────────────────────────────

    private void dispatch(UtmNotificationChannel ch, String subject, String message, String severity) throws Exception {
        switch (ch.getChannelType().toLowerCase()) {
            case "email"     -> dispatchEmail(ch, subject, message);
            case "slack"     -> dispatchSlack(ch, message, severity);
            case "webhook"   -> dispatchWebhook(ch, message, severity);
            case "teams"     -> dispatchTeams(ch, message, severity);
            case "pagerduty" -> dispatchPagerDuty(ch, message, severity);
            default          -> throw new IllegalArgumentException("Unknown channel type: " + ch.getChannelType());
        }
    }

    private void dispatchEmail(UtmNotificationChannel ch, String subject, String message) throws Exception {
        Map<String, Object> cfg = parseConfig(ch.getConfigJson());
        @SuppressWarnings("unchecked")
        List<String> toAddresses = (List<String>) cfg.getOrDefault("toAddresses", List.of());
        if (toAddresses.isEmpty()) throw new IllegalStateException("No toAddresses configured");
        mailService.sendEmail(toAddresses, subject, "<pre>" + message + "</pre>", false, true);
    }

    private void dispatchSlack(UtmNotificationChannel ch, String message, String severity) {
        Map<String, Object> cfg = parseConfig(ch.getConfigJson());
        String webhookUrl = (String) cfg.get("webhookUrl");
        if (webhookUrl == null || webhookUrl.isBlank()) throw new IllegalStateException("No webhookUrl configured");

        String emoji = switch (severity) {
            case "critical" -> ":rotating_light:";
            case "high"     -> ":warning:";
            case "medium"   -> ":large_yellow_circle:";
            default         -> ":information_source:";
        };
        String username = (String) cfg.getOrDefault("username", "HiveArmor");
        String iconEmoji = (String) cfg.getOrDefault("iconEmoji", ":shield:");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", emoji + " *" + severity.toUpperCase() + "* " + message);
        payload.put("username", username);
        payload.put("icon_emoji", iconEmoji);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> req = new HttpEntity<>(payload, headers);
        ResponseEntity<String> resp = restTemplate.postForEntity(webhookUrl, req, String.class);
        if (!resp.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("Slack webhook returned: " + resp.getStatusCode());
        }
    }

    private void dispatchWebhook(UtmNotificationChannel ch, String message, String severity) {
        Map<String, Object> cfg = parseConfig(ch.getConfigJson());
        String url = (String) cfg.get("url");
        if (url == null || url.isBlank()) throw new IllegalStateException("No url configured");

        String method = ((String) cfg.getOrDefault("method", "POST")).toUpperCase();
        @SuppressWarnings("unchecked")
        Map<String, String> headerMap = (Map<String, String>) cfg.getOrDefault("headers", Map.of());
        String bodyTemplate = (String) cfg.getOrDefault("bodyTemplate",
            "{\"message\":\"{{message}}\",\"severity\":\"{{severity}}\",\"source\":\"HiveArmor\"}");

        String body = bodyTemplate
            .replace("{{message}}", message.replace("\"", "\\\""))
            .replace("{{severity}}", severity);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headerMap.forEach(headers::set);
        HttpEntity<String> req = new HttpEntity<>(body, headers);

        ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.valueOf(method), req, String.class);
        if (!resp.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("Webhook returned: " + resp.getStatusCode());
        }
    }

    private void dispatchTeams(UtmNotificationChannel ch, String message, String severity) {
        Map<String, Object> cfg = parseConfig(ch.getConfigJson());
        String webhookUrl = (String) cfg.get("webhookUrl");
        if (webhookUrl == null || webhookUrl.isBlank()) throw new IllegalStateException("No webhookUrl configured");

        String color = switch (severity.toLowerCase()) {
            case "high", "critical" -> "Attention";
            case "medium"           -> "Warning";
            default                 -> "Good";
        };

        Map<String, Object> titleBlock = new LinkedHashMap<>();
        titleBlock.put("type", "TextBlock");
        titleBlock.put("text", "HiveArmor SIEM Alert");
        titleBlock.put("weight", "Bolder");
        titleBlock.put("size", "Medium");
        titleBlock.put("color", color);

        Map<String, Object> bodyBlock = new LinkedHashMap<>();
        bodyBlock.put("type", "TextBlock");
        bodyBlock.put("text", message);
        bodyBlock.put("wrap", true);

        Map<String, Object> card = new LinkedHashMap<>();
        card.put("type", "AdaptiveCard");
        card.put("$schema", "http://adaptivecards.io/schemas/adaptive-card.json");
        card.put("version", "1.2");
        card.put("body", List.of(titleBlock, bodyBlock));

        Map<String, Object> attachment = new LinkedHashMap<>();
        attachment.put("contentType", "application/vnd.microsoft.card.adaptive");
        attachment.put("content", card);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "message");
        payload.put("attachments", List.of(attachment));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> req = new HttpEntity<>(payload, headers);
        ResponseEntity<String> resp = restTemplate.postForEntity(webhookUrl, req, String.class);
        if (!resp.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("Teams webhook returned: " + resp.getStatusCode());
        }
    }

    private void dispatchPagerDuty(UtmNotificationChannel ch, String message, String severity) {
        Map<String, Object> cfg = parseConfig(ch.getConfigJson());
        String apiKey = (String) cfg.get("apiKey");
        if (apiKey == null || apiKey.isBlank()) throw new IllegalStateException("No apiKey configured");

        String pdSeverity = switch (severity.toLowerCase()) {
            case "high", "critical" -> "critical";
            case "medium"           -> "warning";
            default                 -> "info";
        };

        Map<String, Object> pdPayload = new LinkedHashMap<>();
        pdPayload.put("summary", message);
        pdPayload.put("severity", pdSeverity);
        pdPayload.put("source", "HiveArmor SIEM");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("routing_key", apiKey);
        body.put("event_action", "trigger");
        body.put("payload", pdPayload);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> req = new HttpEntity<>(body, headers);
        ResponseEntity<String> resp = restTemplate.postForEntity(
            "https://events.pagerduty.com/v2/enqueue", req, String.class);
        if (!resp.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("PagerDuty returned: " + resp.getStatusCode());
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Map<String, Object> parseConfig(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("Invalid channel config JSON: " + e.getMessage(), e);
        }
    }

    private boolean matchesSeverity(UtmNotificationRoute route, String severity) {
        if (route.getMatchSeverity() == null || route.getMatchSeverity().isBlank()) return true;
        return Arrays.asList(route.getMatchSeverity().split(",")).contains(severity);
    }

    private boolean matchesSource(UtmNotificationRoute route, NotificationSource source) {
        if (route.getMatchSource() == null || route.getMatchSource().isBlank()) return true;
        return Arrays.asList(route.getMatchSource().split(",")).contains(source.name());
    }

    private boolean matchesType(UtmNotificationRoute route, NotificationType type) {
        if (route.getMatchType() == null || route.getMatchType().isBlank()) return true;
        return Arrays.asList(route.getMatchType().split(",")).contains(type.name());
    }

    private boolean isThrottled(UtmNotificationRoute route) {
        if (route.getThrottleMinutes() == null || route.getThrottleMinutes() <= 0) return false;
        if (route.getLastFiredAt() == null) return false;
        Instant cutoff = Instant.now().minusSeconds(route.getThrottleMinutes() * 60L);
        return route.getLastFiredAt().isAfter(cutoff);
    }

    private String currentUser() {
        try {
            return SecurityContextHolder.getContext().getAuthentication().getName();
        } catch (Exception e) {
            return "system";
        }
    }
}
