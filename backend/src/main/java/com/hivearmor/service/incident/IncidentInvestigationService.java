package com.hivearmor.service.incident;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;
import com.hivearmor.config.Constants;
import com.hivearmor.config.TlsClientFactory;
import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.domain.incident.UtmIncidentAlert;
import com.hivearmor.domain.incident.UtmIncidentHistory;
import com.hivearmor.domain.shared_types.alert.Side;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import com.hivearmor.repository.incident.UtmIncidentAlertRepository;
import com.hivearmor.repository.incident.UtmIncidentHistoryRepository;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.service.dto.incident.*;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
public class IncidentInvestigationService {

    private static final String SOCAI_SUMMARIZE_ENDPOINT = "/api/v1/summarize-incident";

    private final UtmIncidentAlertRepository incidentAlertRepository;
    private final UtmIncidentHistoryRepository incidentHistoryRepository;
    private final UtmIncidentService incidentService;
    private final UtmAlertService alertService;
    private final ObjectMapper objectMapper;
    private final OkHttpClient httpClient;
    private final String socAiBaseUrl;

    public IncidentInvestigationService(
            UtmIncidentAlertRepository incidentAlertRepository,
            UtmIncidentHistoryRepository incidentHistoryRepository,
            UtmIncidentService incidentService,
            UtmAlertService alertService,
            ObjectMapper objectMapper) {
        this.incidentAlertRepository = incidentAlertRepository;
        this.incidentHistoryRepository = incidentHistoryRepository;
        this.incidentService = incidentService;
        this.alertService = alertService;
        this.objectMapper = objectMapper;
        this.httpClient = TlsClientFactory.buildOkHttpClient(10, 10, 60);
        this.socAiBaseUrl = System.getenv("SOC_AI_BASE_URL");
    }

    // ── Evidence Board ────────────────────────────────────────────────────────

    public List<IncidentEvidenceDTO> getEvidence(Long incidentId) {
        List<UtmIncidentAlert> links = incidentAlertRepository.findAllByIncidentId(incidentId);
        if (links.isEmpty()) return Collections.emptyList();

        List<String> alertIds = links.stream().map(UtmIncidentAlert::getAlertId).collect(Collectors.toList());
        List<UtmAlert> alerts;
        try {
            alerts = alertService.getAlertsByIds(alertIds);
        } catch (Exception e) {
            log.warn("Could not fetch alerts for incident {}: {}", incidentId, e.getMessage());
            alerts = Collections.emptyList();
        }

        Map<String, UtmAlert> alertMap = alerts.stream()
                .filter(a -> a.getId() != null)
                .collect(Collectors.toMap(UtmAlert::getId, a -> a, (a, b) -> a));

        List<IncidentEvidenceDTO> result = new ArrayList<>();
        for (UtmIncidentAlert link : links) {
            IncidentEvidenceDTO dto = new IncidentEvidenceDTO();
            dto.setId(link.getAlertId());
            dto.setType("ALERT");
            dto.setTitle(link.getAlertName());
            dto.setSeverity(link.getAlertSeverity());

            UtmAlert alert = alertMap.get(link.getAlertId());
            if (alert != null) {
                dto.setTimestamp(alert.getTimestamp());
                dto.setSource(alert.getDataSource());
                dto.setTags(alert.getTags());
                try {
                    dto.setRawData(objectMapper.writeValueAsString(alert));
                } catch (Exception ignored) {}
            }
            result.add(dto);
        }
        return result;
    }

    // ── Attack Timeline ───────────────────────────────────────────────────────

    public List<TimelineEventDTO> getTimeline(Long incidentId) {
        Optional<UtmIncident> incidentOpt = incidentService.findOne(incidentId);
        List<TimelineEventDTO> events = new ArrayList<>();

        // Incident creation event
        incidentOpt.ifPresent(incident -> {
            TimelineEventDTO created = new TimelineEventDTO();
            created.setType("STATUS_CHANGE");
            created.setTitle("Incident created: " + incident.getIncidentName());
            created.setActor(nullSafe(incident.getIncidentAssignedTo(), "system"));
            created.setTimestamp(instant(incident.getIncidentCreatedDate()));
            events.add(created);
        });

        // History entries (status changes, notes, commands)
        List<UtmIncidentHistory> history = incidentHistoryRepository.findByIncidentIdOrderByActionDateAsc(incidentId);
        for (UtmIncidentHistory h : history) {
            TimelineEventDTO evt = new TimelineEventDTO();
            evt.setType(mapHistoryType(h.getActionType().name()));
            evt.setTitle(h.getAction());
            evt.setActor(h.getActionCreatedBy());
            evt.setDetails(h.getActionDetail());
            evt.setTimestamp(instant(h.getActionDate()));
            events.add(evt);
        }

        // Alert events from OpenSearch
        List<UtmIncidentAlert> links = incidentAlertRepository.findAllByIncidentId(incidentId);
        if (!links.isEmpty()) {
            List<String> alertIds = links.stream().map(UtmIncidentAlert::getAlertId).collect(Collectors.toList());
            List<UtmAlert> alerts;
            try {
                alerts = alertService.getAlertsByIds(alertIds);
            } catch (Exception e) {
                log.warn("Could not fetch alerts for timeline {}: {}", incidentId, e.getMessage());
                alerts = Collections.emptyList();
            }
            for (UtmAlert alert : alerts) {
                TimelineEventDTO evt = new TimelineEventDTO();
                evt.setType("ALERT");
                evt.setTitle(alert.getName());
                evt.setSeverity(alert.getSeverity());
                evt.setTimestamp(alert.getTimestamp());
                evt.setRelatedAlertId(alert.getId());
                evt.setDetails(alert.getDescription());
                if (alert.getAdversary() != null) {
                    evt.setActor(nullSafe(alert.getAdversary().getIp(),
                            nullSafe(alert.getAdversary().getUser(), null)));
                }
                events.add(evt);
            }
        }

        events.sort(Comparator.comparing(TimelineEventDTO::getTimestamp,
                Comparator.nullsFirst(Comparator.naturalOrder())));
        return events;
    }

    // ── Entities ──────────────────────────────────────────────────────────────

    public IncidentEntitiesDTO getEntities(Long incidentId) {
        List<UtmIncidentAlert> links = incidentAlertRepository.findAllByIncidentId(incidentId);
        IncidentEntitiesDTO result = new IncidentEntitiesDTO();

        if (links.isEmpty()) return result;

        List<String> alertIds = links.stream().map(UtmIncidentAlert::getAlertId).collect(Collectors.toList());
        List<UtmAlert> alerts;
        try {
            alerts = alertService.getAlertsByIds(alertIds);
        } catch (Exception e) {
            log.warn("Could not fetch alerts for entities {}: {}", incidentId, e.getMessage());
            return result;
        }

        Map<String, IncidentEntitiesDTO.IpEntity> ipMap = new LinkedHashMap<>();
        Map<String, IncidentEntitiesDTO.UserEntity> userMap = new LinkedHashMap<>();
        Map<String, IncidentEntitiesDTO.HostEntity> hostMap = new LinkedHashMap<>();
        Map<String, IncidentEntitiesDTO.ProcessEntity> processMap = new LinkedHashMap<>();

        for (UtmAlert alert : alerts) {
            extractEntities(alert, alert.getAdversary(), ipMap, userMap, hostMap, processMap);
            extractEntities(alert, alert.getTarget(), ipMap, userMap, hostMap, processMap);
        }

        result.setIps(new ArrayList<>(ipMap.values()));
        result.setUsers(new ArrayList<>(userMap.values()));
        result.setHosts(new ArrayList<>(hostMap.values()));
        result.setProcesses(new ArrayList<>(processMap.values()));
        return result;
    }

    private void extractEntities(UtmAlert alert, Side side,
                                  Map<String, IncidentEntitiesDTO.IpEntity> ipMap,
                                  Map<String, IncidentEntitiesDTO.UserEntity> userMap,
                                  Map<String, IncidentEntitiesDTO.HostEntity> hostMap,
                                  Map<String, IncidentEntitiesDTO.ProcessEntity> processMap) {
        if (side == null) return;

        if (StringUtils.hasText(side.getIp())) {
            IncidentEntitiesDTO.IpEntity ip = ipMap.computeIfAbsent(side.getIp(), k -> {
                IncidentEntitiesDTO.IpEntity e = new IncidentEntitiesDTO.IpEntity();
                e.setIp(k);
                if (side.getGeolocation() != null) {
                    e.setCountry(side.getGeolocation().getCountry());
                    Long asn = side.getGeolocation().getAsn();
                    e.setAsn(asn != null ? asn.toString() : null);
                }
                return e;
            });
            if (alert.getId() != null) ip.getAlerts().add(alert.getId());
        }

        if (StringUtils.hasText(side.getUser())) {
            userMap.computeIfAbsent(side.getUser(), k -> {
                IncidentEntitiesDTO.UserEntity e = new IncidentEntitiesDTO.UserEntity();
                e.setUsername(k);
                e.setDomain(side.getDomain());
                e.setLastSeen(alert.getTimestamp());
                return e;
            });
            userMap.computeIfPresent(side.getUser(), (k, e) -> {
                e.setAnomalyCount(e.getAnomalyCount() + 1);
                return e;
            });
        }

        if (StringUtils.hasText(side.getHost())) {
            hostMap.computeIfAbsent(side.getHost(), k -> {
                IncidentEntitiesDTO.HostEntity e = new IncidentEntitiesDTO.HostEntity();
                e.setHostname(k);
                e.setOs(side.getOperatingSystem());
                return e;
            });
        }

        if (StringUtils.hasText(side.getProcess())) {
            processMap.computeIfAbsent(side.getProcess(), k -> {
                IncidentEntitiesDTO.ProcessEntity e = new IncidentEntitiesDTO.ProcessEntity();
                e.setName(k);
                e.setPath(side.getPath());
                e.setCommandLine(side.getCommand());
                return e;
            });
        }
    }

    // ── AI Summary ────────────────────────────────────────────────────────────

    public AiSummaryDTO generateAiSummary(Long incidentId) {
        Optional<UtmIncident> incidentOpt = incidentService.findOne(incidentId);
        if (incidentOpt.isEmpty()) {
            throw new IllegalArgumentException("Incident not found: " + incidentId);
        }

        UtmIncident incident = incidentOpt.get();
        List<UtmIncidentAlert> links = incidentAlertRepository.findAllByIncidentId(incidentId);
        List<TimelineEventDTO> timeline = getTimeline(incidentId);

        // Build context payload (truncated to ~50K chars)
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("incidentId", incidentId);
        context.put("incidentName", incident.getIncidentName());
        context.put("incidentDescription", incident.getIncidentDescription());
        context.put("severity", incident.getIncidentSeverity());
        context.put("status", incident.getIncidentStatus() != null ? incident.getIncidentStatus().name() : null);
        context.put("createdAt", instant(incident.getIncidentCreatedDate()));
        context.put("alertCount", links.size());
        context.put("timeline", timeline.stream().limit(50).collect(Collectors.toList()));

        String contextJson;
        try {
            contextJson = objectMapper.writeValueAsString(context);
            if (contextJson.length() > 50000) {
                contextJson = contextJson.substring(0, 50000) + "...[TRUNCATED]";
            }
        } catch (Exception e) {
            contextJson = "{\"incidentId\":" + incidentId + "}";
        }

        if (!StringUtils.hasText(socAiBaseUrl)) {
            return buildFallbackSummary(incident, links.size());
        }

        try {
            String internalKey = System.getenv(Constants.ENV_INTERNAL_KEY);
            if (!StringUtils.hasText(internalKey)) {
                return buildFallbackSummary(incident, links.size());
            }

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("incidentContext", contextJson);
            payload.put("requestedBy", currentUser());

            MediaType json = MediaType.parse("application/json; charset=utf-8");
            RequestBody body = RequestBody.create(new Gson().toJson(payload), json);

            Request req = new Request.Builder()
                    .url(socAiBaseUrl + SOCAI_SUMMARIZE_ENDPOINT)
                    .post(body)
                    .addHeader("Content-Type", "application/json")
                    .addHeader("X-Internal-Key", internalKey)
                    .build();

            try (Response resp = httpClient.newCall(req).execute()) {
                if (resp.isSuccessful() && resp.body() != null) {
                    String responseBody = resp.body().string();
                    AiSummaryDTO dto = objectMapper.readValue(responseBody, AiSummaryDTO.class);
                    if (dto != null && StringUtils.hasText(dto.getSummary())) return dto;
                }
            }
        } catch (Exception e) {
            log.warn("SOC-AI summarize-incident call failed for incident {}: {}", incidentId, e.getMessage());
        }

        return buildFallbackSummary(incident, links.size());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private AiSummaryDTO buildFallbackSummary(UtmIncident incident, int alertCount) {
        AiSummaryDTO dto = new AiSummaryDTO();
        dto.setSummary("Incident \"" + incident.getIncidentName() + "\" involves " + alertCount +
                " correlated alert(s) with severity " + incident.getIncidentSeverity() +
                ". Status: " + (incident.getIncidentStatus() != null ? incident.getIncidentStatus().name() : "OPEN") +
                ". AI analysis unavailable — SOC-AI plugin not configured.");
        dto.setKeyFindings(List.of("Manual review required"));
        dto.setRecommendedActions(List.of("Configure SOC-AI plugin for AI-assisted analysis"));
        dto.setSeverity(String.valueOf(incident.getIncidentSeverity()));
        dto.setConfidence(0.0);
        return dto;
    }

    private String instant(Instant i) {
        return i != null ? i.toString() : null;
    }

    private String nullSafe(String a, String fallback) {
        return StringUtils.hasText(a) ? a : fallback;
    }

    private String mapHistoryType(String actionType) {
        if (actionType == null) return "STATUS_CHANGE";
        return switch (actionType) {
            case "INCIDENT_NOTE_ADD", "INCIDENT_NOTE_CHANGE" -> "NOTE";
            case "INCIDENT_COMMAND_EXECUTED" -> "COMMAND";
            default -> "STATUS_CHANGE";
        };
    }

    private String currentUser() {
        try {
            return SecurityContextHolder.getContext().getAuthentication().getName();
        } catch (Exception e) {
            return "system";
        }
    }
}
