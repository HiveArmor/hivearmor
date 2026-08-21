package com.hivearmor.service.queue;

import com.hivearmor.domain.UtmInvestigationTask;
import com.hivearmor.repository.UtmInvestigationTaskRepository;
import com.hivearmor.service.dto.QueueItemDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service that assembles the composite analyst queue.
 *
 * Priority score formula:
 *   (severityWeight * 0.4) + (ageScore * 0.3) + (assignedToMeScore * 0.2) + (typeWeight * 0.1)
 *
 * Weights:
 *   severityWeight : critical=100, high=75, medium=50, low=25
 *   ageScore       : min(hours_since_created, 100)
 *   assignedToMe   : 100 if assignedTo == currentUser else 0
 *   typeWeight     : ALERT=80, INCIDENT=60, OFFENSE=40, TASK=20
 *
 * S-3B-QUEUE
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class QueueService {

    private final UtmInvestigationTaskRepository taskRepository;

    // ── Public record for query params ──────────────────────────────────────

    public record QueueParams(
            int page,
            int size,
            String[] type,
            String assignedTo,
            String severity,
            String[] status
    ) {}

    // ── Main entry point ────────────────────────────────────────────────────

    public Page<QueueItemDTO> getQueue(QueueParams params, String currentUser) {
        List<QueueItemDTO> allItems = new ArrayList<>();

        Set<String> requestedTypes = params.type() != null && params.type().length > 0
                ? Arrays.stream(params.type()).map(String::toUpperCase).collect(Collectors.toSet())
                : Set.of("ALERT", "INCIDENT", "OFFENSE", "TASK");

        // Tasks come from the local DB — always safe to query
        if (requestedTypes.contains("TASK")) {
            allItems.addAll(fetchTasks(params, currentUser));
        }

        // For ALERT / INCIDENT / OFFENSE: OpenSearch / service might be unavailable.
        // Any exception is caught and logged; the type is silently omitted.
        if (requestedTypes.contains("ALERT")) {
            try {
                allItems.addAll(fetchAlerts(params, currentUser));
            } catch (Exception e) {
                log.warn("QueueService: could not fetch ALERT items — {}", e.getMessage());
            }
        }

        if (requestedTypes.contains("INCIDENT")) {
            try {
                allItems.addAll(fetchIncidents(params, currentUser));
            } catch (Exception e) {
                log.warn("QueueService: could not fetch INCIDENT items — {}", e.getMessage());
            }
        }

        if (requestedTypes.contains("OFFENSE")) {
            try {
                allItems.addAll(fetchOffenses(params, currentUser));
            } catch (Exception e) {
                log.warn("QueueService: could not fetch OFFENSE items — {}", e.getMessage());
            }
        }

        // Apply severity filter
        if (params.severity() != null && !params.severity().isBlank()) {
            String sev = params.severity().toLowerCase();
            allItems = allItems.stream()
                    .filter(i -> i.severity() != null && i.severity().toLowerCase().equals(sev))
                    .collect(Collectors.toList());
        }

        // Apply assignedTo filter
        if (params.assignedTo() != null && !params.assignedTo().isBlank()) {
            String at = params.assignedTo();
            allItems = allItems.stream()
                    .filter(i -> at.equals(i.assignedTo()))
                    .collect(Collectors.toList());
        }

        // Apply status filter
        if (params.status() != null && params.status().length > 0) {
            Set<String> statusSet = Arrays.stream(params.status())
                    .map(String::toUpperCase)
                    .collect(Collectors.toSet());
            allItems = allItems.stream()
                    .filter(i -> i.status() != null && statusSet.contains(i.status().toUpperCase()))
                    .collect(Collectors.toList());
        }

        // Compute priority score and sort descending
        List<QueueItemDTO> scored = allItems.stream()
                .map(item -> withPriorityScore(item, currentUser))
                .sorted(Comparator.comparingDouble(QueueItemDTO::priorityScore).reversed())
                .collect(Collectors.toList());

        // Manual pagination
        int total = scored.size();
        int fromIndex = Math.min(params.page() * params.size(), total);
        int toIndex   = Math.min(fromIndex + params.size(), total);
        List<QueueItemDTO> page = scored.subList(fromIndex, toIndex);

        return new PageImpl<>(page, PageRequest.of(params.page(), params.size()), total);
    }

    // ── Task fetching ────────────────────────────────────────────────────────

    private List<QueueItemDTO> fetchTasks(QueueParams params, String currentUser) {
        Pageable pageable = PageRequest.of(0, 1000); // fetch all non-completed, paginate in memory
        Page<UtmInvestigationTask> taskPage = taskRepository.findByStatusNot("COMPLETED", pageable);

        return taskPage.getContent().stream()
                .map(t -> taskToQueueItem(t, currentUser))
                .collect(Collectors.toList());
    }

    private QueueItemDTO taskToQueueItem(UtmInvestigationTask task, String currentUser) {
        String severity = priorityToSeverity(task.getTaskPriority());
        return new QueueItemDTO(
                task.getId(),
                "TASK",
                task.getTitle(),
                severity,
                0.0, // will be replaced by withPriorityScore
                task.getStatus(),
                task.getAssignedTo(),
                String.valueOf(task.getId()),
                null,
                task.getCreatedAt(),
                task.getDueDate(),
                isSlaBreached(task.getDueDate()),
                List.of(),
                task.getIncidentId()
        );
    }

    // ── Alert / Incident / Offense stubs ────────────────────────────────────
    // These will delegate to OpenSearch / IncidentRepository in a later sprint.
    // Throwing here ensures callers get an empty list via the catch block.

    private List<QueueItemDTO> fetchAlerts(QueueParams params, String currentUser) {
        // Will be implemented with OpenSearch integration in S-3C
        return List.of();
    }

    private List<QueueItemDTO> fetchIncidents(QueueParams params, String currentUser) {
        // Will be implemented with UtmIncidentRepository in S-3C
        return List.of();
    }

    private List<QueueItemDTO> fetchOffenses(QueueParams params, String currentUser) {
        // Will be implemented with OpenSearch integration in S-3C
        return List.of();
    }

    // ── Priority score ───────────────────────────────────────────────────────

    private QueueItemDTO withPriorityScore(QueueItemDTO item, String currentUser) {
        double severityWeight = severityWeight(item.severity());
        double ageScore = ageScore(item.createdAt());
        double assignedToMeScore = item.assignedTo() != null && item.assignedTo().equals(currentUser) ? 100.0 : 0.0;
        double typeWeight = typeWeight(item.itemType());

        double score = (severityWeight * 0.4) + (ageScore * 0.3) + (assignedToMeScore * 0.2) + (typeWeight * 0.1);

        return new QueueItemDTO(
                item.id(), item.itemType(), item.title(), item.severity(),
                Math.round(score * 100.0) / 100.0,
                item.status(), item.assignedTo(), item.sourceRef(), item.dataSource(),
                item.createdAt(), item.slaDeadline(), item.slaBreached(), item.tags(), item.incidentId()
        );
    }

    private double severityWeight(String severity) {
        if (severity == null) return 25.0;
        return switch (severity.toLowerCase()) {
            case "critical" -> 100.0;
            case "high"     -> 75.0;
            case "medium"   -> 50.0;
            default         -> 25.0; // low
        };
    }

    private double ageScore(Instant createdAt) {
        if (createdAt == null) return 0.0;
        long hours = Duration.between(createdAt, Instant.now()).toHours();
        return Math.min(hours, 100.0);
    }

    private double typeWeight(String itemType) {
        if (itemType == null) return 20.0;
        return switch (itemType.toUpperCase()) {
            case "ALERT"    -> 80.0;
            case "INCIDENT" -> 60.0;
            case "OFFENSE"  -> 40.0;
            default         -> 20.0; // TASK
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private String priorityToSeverity(String priority) {
        if (priority == null) return "low";
        return switch (priority.toUpperCase()) {
            case "P1" -> "critical";
            case "P2" -> "high";
            case "P3" -> "medium";
            default   -> "low";
        };
    }

    private Boolean isSlaBreached(Instant dueDate) {
        if (dueDate == null) return false;
        return Instant.now().isAfter(dueDate);
    }
}
