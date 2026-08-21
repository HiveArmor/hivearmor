package com.hivearmor.service.incident;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.IncidentActivity;
import com.hivearmor.domain.IncidentTask;
import com.hivearmor.repository.IncidentActivityRepository;
import com.hivearmor.repository.IncidentTaskRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/**
 * Service for incident task CRUD operations with checklist merge and optimistic versioning.
 *
 * <p>Implements INC-002: Task management within the incident workbench.
 * Provides cursor-based pagination, checklist item ID generation, non-destructive
 * checklist merge, and version-based conflict detection.
 *
 * <p>Sprint 43 — Incident Workbench.
 */
@Service
@Transactional
public class IncidentTaskService {

    private static final Logger log = LoggerFactory.getLogger(IncidentTaskService.class);
    private static final String CLASSNAME = "IncidentTaskService";

    /** Priority ordering for DESC sort (higher value = higher priority). */
    private static final Map<String, Integer> PRIORITY_ORDER = Map.of(
        "critical", 4,
        "high", 3,
        "medium", 2,
        "low", 1
    );

    private final IncidentTaskRepository taskRepository;
    private final IncidentActivityRepository activityRepository;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private IncidentSseService sseService;

    public IncidentTaskService(IncidentTaskRepository taskRepository,
                               IncidentActivityRepository activityRepository,
                               ObjectMapper objectMapper) {
        this.taskRepository = taskRepository;
        this.activityRepository = activityRepository;
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // Result types
    // =========================================================================

    /**
     * Result of a task list operation with cursor pagination.
     */
    public static class TaskListResult {
        private final List<Map<String, Object>> items;
        private final String cursor;
        private final long total;

        public TaskListResult(List<Map<String, Object>> items, String cursor, long total) {
            this.items = items;
            this.cursor = cursor;
            this.total = total;
        }

        public List<Map<String, Object>> getItems() { return items; }
        public String getCursor() { return cursor; }
        public long getTotal() { return total; }
    }

    /**
     * Unified result for task create/update operations.
     */
    public static class TaskResult {
        private final boolean success;
        private final Map<String, Object> task;
        private final Map<String, Object> conflictBody;
        private final boolean conflict;
        private final String errorMessage;

        private TaskResult(boolean success, Map<String, Object> task,
                           Map<String, Object> conflictBody, boolean conflict, String errorMessage) {
            this.success = success;
            this.task = task;
            this.conflictBody = conflictBody;
            this.conflict = conflict;
            this.errorMessage = errorMessage;
        }

        public static TaskResult success(Map<String, Object> task) {
            return new TaskResult(true, task, null, false, null);
        }

        public static TaskResult conflict(Map<String, Object> conflictBody) {
            return new TaskResult(false, null, conflictBody, true, "Version conflict");
        }

        public static TaskResult notFound(String taskId) {
            return new TaskResult(false, null, null, false, "Task not found: " + taskId);
        }

        public static TaskResult error(String message) {
            return new TaskResult(false, null, null, false, message);
        }

        public boolean isSuccess() { return success; }
        public Map<String, Object> getTask() { return task; }
        public Map<String, Object> getConflictBody() { return conflictBody; }
        public boolean isConflict() { return conflict; }
        public String getErrorMessage() { return errorMessage; }
    }

    // =========================================================================
    // 4.2 — listTasks with cursor pagination
    // =========================================================================

    /**
     * Lists tasks for an incident with cursor-based pagination, optional status filter,
     * ordered by priority DESC then created_at ASC.
     *
     * @param incidentId the incident identifier
     * @param cursor     Base64-encoded cursor (null for first page)
     * @param limit      max items per page
     * @param status     optional status filter (null for all)
     * @param tenantId   the tenant identifier
     * @return paginated task list result
     */
    public TaskListResult listTasks(String incidentId, String cursor, int limit, String status, Long tenantId) {
        final String ctx = CLASSNAME + ".listTasks";

        try {
            // Fetch all tasks for this incident and tenant
            List<IncidentTask> allTasks;
            if (status != null && !status.isBlank()) {
                allTasks = taskRepository.findByIncidentIdAndStatus(incidentId, status);
                // Further filter by tenant
                allTasks = allTasks.stream()
                    .filter(t -> tenantId.equals(t.getTenantId()))
                    .toList();
            } else {
                allTasks = taskRepository.findByIncidentIdAndTenantId(incidentId, tenantId);
            }

            long total = allTasks.size();

            // Sort: priority DESC, then created_at ASC
            List<IncidentTask> sorted = new ArrayList<>(allTasks);
            sorted.sort((a, b) -> {
                int pa = PRIORITY_ORDER.getOrDefault(a.getPriority(), 0);
                int pb = PRIORITY_ORDER.getOrDefault(b.getPriority(), 0);
                if (pa != pb) return Integer.compare(pb, pa); // DESC
                // created_at ASC
                if (a.getCreatedAt() == null && b.getCreatedAt() == null) return 0;
                if (a.getCreatedAt() == null) return -1;
                if (b.getCreatedAt() == null) return 1;
                return a.getCreatedAt().compareTo(b.getCreatedAt());
            });

            // Apply cursor
            int startIndex = 0;
            if (cursor != null && !cursor.isBlank()) {
                CursorData cursorData = decodeCursor(cursor);
                if (cursorData != null) {
                    // Find position after the cursor task
                    for (int i = 0; i < sorted.size(); i++) {
                        if (sorted.get(i).getId().equals(cursorData.taskId)) {
                            startIndex = i + 1;
                            break;
                        }
                    }
                }
            }

            // Slice page
            int endIndex = Math.min(startIndex + limit, sorted.size());
            List<IncidentTask> page = sorted.subList(startIndex, endIndex);

            // Build response items
            List<Map<String, Object>> items = new ArrayList<>();
            for (IncidentTask task : page) {
                items.add(taskToMap(task));
            }

            // Build next cursor
            String nextCursor = null;
            if (endIndex < sorted.size() && !page.isEmpty()) {
                IncidentTask last = page.get(page.size() - 1);
                nextCursor = encodeCursor(last.getId(), last.getPriority());
            }

            return new TaskListResult(items, nextCursor, total);

        } catch (Exception e) {
            log.error("{}: failed to list tasks for incident {}: {}", ctx, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to list tasks: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // 4.4, 4.5 — createTask
    // =========================================================================

    /**
     * Creates a new task for an incident.
     *
     * <p>Validates title is required, generates UUID, sets version=1,
     * generates checklist item IDs (chk-{uuid-short}), persists the task,
     * records a task.created activity entry, and broadcasts via SSE.
     *
     * @param incidentId the incident identifier
     * @param body       task creation body
     * @param userId     the creating user
     * @param tenantId   the tenant identifier
     * @return the created task as a TaskResult
     */
    @SuppressWarnings("unchecked")
    public TaskResult createTask(String incidentId, Map<String, Object> body,
                                  String userId, Long tenantId) {
        final String ctx = CLASSNAME + ".createTask";

        try {
            // Validate title
            String title = body.get("title") instanceof String ? (String) body.get("title") : null;
            if (title == null || title.isBlank()) {
                return TaskResult.error("Task title is required");
            }

            // Generate UUID for task ID
            String taskId = UUID.randomUUID().toString();

            // Build entity
            IncidentTask task = new IncidentTask();
            task.setId(taskId);
            task.setIncidentId(incidentId);
            task.setTitle(title);
            task.setDescription(body.get("description") instanceof String ? (String) body.get("description") : null);
            task.setStatus(body.get("status") instanceof String ? (String) body.get("status") : "open");
            task.setAssignee(body.get("assignee") instanceof String ? (String) body.get("assignee") : null);
            task.setPriority(body.get("priority") instanceof String ? (String) body.get("priority") : "medium");
            task.setCreatedBy(userId);
            task.setTenantId(tenantId);
            task.setVersion(1);

            // Parse dueAt
            if (body.get("dueAt") instanceof String dueAtStr) {
                task.setDueAt(Instant.parse(dueAtStr));
            }

            // Process checklist — generate IDs for items
            if (body.get("checklist") instanceof List<?> rawChecklist) {
                List<Map<String, Object>> checklistItems = new ArrayList<>();
                for (Object item : rawChecklist) {
                    if (item instanceof Map<?, ?> itemMap) {
                        Map<String, Object> checklistItem = new LinkedHashMap<>();
                        // Generate ID: chk-{uuid-short}
                        String chkId = "chk-" + UUID.randomUUID().toString().substring(0, 8);
                        checklistItem.put("id", chkId);
                        checklistItem.put("label", itemMap.get("label"));
                        checklistItem.put("checked", Boolean.TRUE.equals(itemMap.get("checked")));
                        checklistItems.add(checklistItem);
                    }
                }
                task.setChecklist(objectMapper.writeValueAsString(checklistItems));
            }

            // Persist
            task = taskRepository.save(task);

            // Record task.created activity
            recordActivity(incidentId, "task.created", userId, tenantId,
                "Created task: " + title,
                Map.of("taskId", taskId, "taskTitle", title));

            // Broadcast task.updated via SSE
            Map<String, Object> taskMap = taskToMap(task);
            broadcastTaskEvent(incidentId, "task.updated", taskMap, userId);

            return TaskResult.success(taskMap);

        } catch (Exception e) {
            log.error("{}: failed to create task for incident {}: {}", ctx, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to create task: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // 4.6, 4.7, 4.8 — updateTask with checklist merge and status transitions
    // =========================================================================

    /**
     * Updates a task with optimistic versioning and non-destructive checklist merge.
     *
     * <p>Compares If-Match version against task.version. If mismatch, returns 409.
     * For checklist merge: items with matching ID have their checked field updated;
     * new items without ID are appended with generated IDs.
     * If status transitions to "completed", auto-sets completedAt.
     *
     * @param incidentId     the incident identifier
     * @param taskId         the task identifier
     * @param patchBody      the patch fields
     * @param ifMatchVersion the version from If-Match header
     * @param userId         the user performing the update
     * @param tenantId       the tenant identifier
     * @return TaskResult (success, conflict, or not found)
     */
    @SuppressWarnings("unchecked")
    public TaskResult updateTask(String incidentId, String taskId, Map<String, Object> patchBody,
                                  int ifMatchVersion, String userId, Long tenantId) {
        final String ctx = CLASSNAME + ".updateTask";

        try {
            // Fetch the task
            Optional<IncidentTask> taskOpt = taskRepository.findById(taskId);
            if (taskOpt.isEmpty()) {
                return TaskResult.notFound(taskId);
            }

            IncidentTask task = taskOpt.get();

            // Verify task belongs to incident and tenant
            if (!incidentId.equals(task.getIncidentId()) || !tenantId.equals(task.getTenantId())) {
                return TaskResult.notFound(taskId);
            }

            // Optimistic version check
            int currentVersion = task.getVersion() != null ? task.getVersion() : 1;
            if (currentVersion != ifMatchVersion) {
                Map<String, Object> conflictBody = new LinkedHashMap<>();
                conflictBody.put("conflict", true);
                conflictBody.put("serverVersion", currentVersion);
                conflictBody.put("clientVersion", ifMatchVersion);
                return TaskResult.conflict(conflictBody);
            }

            // Track status change
            String oldStatus = task.getStatus();

            // Apply scalar fields
            if (patchBody.containsKey("title") && patchBody.get("title") instanceof String newTitle) {
                if (!newTitle.isBlank()) {
                    task.setTitle(newTitle);
                }
            }
            if (patchBody.containsKey("description")) {
                task.setDescription(patchBody.get("description") instanceof String s ? s : null);
            }
            if (patchBody.containsKey("status") && patchBody.get("status") instanceof String newStatus) {
                task.setStatus(newStatus);
            }
            if (patchBody.containsKey("assignee")) {
                task.setAssignee(patchBody.get("assignee") instanceof String s ? s : null);
            }
            if (patchBody.containsKey("priority") && patchBody.get("priority") instanceof String newPriority) {
                task.setPriority(newPriority);
            }
            if (patchBody.containsKey("dueAt")) {
                if (patchBody.get("dueAt") instanceof String dueAtStr) {
                    task.setDueAt(Instant.parse(dueAtStr));
                } else {
                    task.setDueAt(null);
                }
            }

            // Non-destructive checklist merge (4.7)
            if (patchBody.containsKey("checklist") && patchBody.get("checklist") instanceof List<?> patchChecklist) {
                List<Map<String, Object>> existingChecklist = parseChecklist(task.getChecklist());
                List<Map<String, Object>> mergedChecklist = mergeChecklist(existingChecklist, patchChecklist);
                task.setChecklist(objectMapper.writeValueAsString(mergedChecklist));
            }

            // Status transition to "completed" (4.8)
            String newStatus = task.getStatus();
            if ("completed".equals(newStatus) && !"completed".equals(oldStatus)) {
                task.setCompletedAt(Instant.now());

                // Record task.completed activity
                recordActivity(incidentId, "task.completed", userId, tenantId,
                    "Completed task: " + task.getTitle(),
                    Map.of("taskId", taskId, "taskTitle", task.getTitle()));
            }

            // If transitioning away from completed, clear completedAt
            if (!"completed".equals(newStatus) && "completed".equals(oldStatus)) {
                task.setCompletedAt(null);
            }

            // Increment version
            task.setVersion(currentVersion + 1);

            // Persist
            task = taskRepository.save(task);

            // Broadcast task.updated via SSE
            Map<String, Object> taskMap = taskToMap(task);
            broadcastTaskEvent(incidentId, "task.updated", taskMap, userId);

            return TaskResult.success(taskMap);

        } catch (Exception e) {
            log.error("{}: failed to update task {} for incident {}: {}", ctx, taskId, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to update task: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // 4.3 — Cursor encoding/decoding
    // =========================================================================

    /**
     * Cursor data holder for pagination.
     */
    private static class CursorData {
        final String taskId;
        final String priority;

        CursorData(String taskId, String priority) {
            this.taskId = taskId;
            this.priority = priority;
        }
    }

    /**
     * Encodes a cursor as Base64 JSON: {"taskId":"...","priority":"..."}.
     */
    private String encodeCursor(String taskId, String priority) {
        try {
            Map<String, String> cursorMap = new LinkedHashMap<>();
            cursorMap.put("taskId", taskId);
            cursorMap.put("priority", priority);
            String json = objectMapper.writeValueAsString(cursorMap);
            return Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8));
        } catch (JsonProcessingException e) {
            log.warn("{}: failed to encode cursor: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    /**
     * Decodes a Base64-encoded cursor back to taskId and priority.
     */
    private CursorData decodeCursor(String cursor) {
        try {
            byte[] decoded = Base64.getDecoder().decode(cursor);
            String json = new String(decoded, StandardCharsets.UTF_8);
            Map<String, String> cursorMap = objectMapper.readValue(json, new TypeReference<>() {});
            return new CursorData(cursorMap.get("taskId"), cursorMap.get("priority"));
        } catch (Exception e) {
            log.warn("{}: failed to decode cursor: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    // =========================================================================
    // 4.7 — Checklist merge logic
    // =========================================================================

    /**
     * Non-destructive checklist merge.
     *
     * <p>For each item in the patch checklist:
     * - If it has an ID that matches an existing item, update the checked field (and label if provided)
     * - If it has no ID (or an ID not found), append it as a new item with a generated ID
     *
     * <p>Existing items not mentioned in the patch remain unchanged.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> mergeChecklist(List<Map<String, Object>> existing, List<?> patchChecklist) {
        // Build map of existing items by ID for lookup
        Map<String, Map<String, Object>> existingById = new LinkedHashMap<>();
        for (Map<String, Object> item : existing) {
            String id = item.get("id") instanceof String s ? s : null;
            if (id != null) {
                existingById.put(id, item);
            }
        }

        // Process patch items
        for (Object rawItem : patchChecklist) {
            if (rawItem instanceof Map<?, ?> patchItem) {
                String itemId = patchItem.get("id") instanceof String s ? s : null;

                if (itemId != null && existingById.containsKey(itemId)) {
                    // Update existing item — only update checked (and label if provided)
                    Map<String, Object> target = existingById.get(itemId);
                    if (patchItem.containsKey("checked")) {
                        target.put("checked", Boolean.TRUE.equals(patchItem.get("checked")));
                    }
                    if (patchItem.containsKey("label") && patchItem.get("label") instanceof String newLabel) {
                        target.put("label", newLabel);
                    }
                } else {
                    // New item — generate ID and append
                    Map<String, Object> newItem = new LinkedHashMap<>();
                    String newId = "chk-" + UUID.randomUUID().toString().substring(0, 8);
                    newItem.put("id", newId);
                    newItem.put("label", patchItem.get("label"));
                    newItem.put("checked", Boolean.TRUE.equals(patchItem.get("checked")));
                    existing.add(newItem);
                    existingById.put(newId, newItem);
                }
            }
        }

        return existing;
    }

    /**
     * Parses the checklist JSONB string into a mutable list of maps.
     */
    private List<Map<String, Object>> parseChecklist(String checklistJson) {
        if (checklistJson == null || checklistJson.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<Map<String, Object>> list = objectMapper.readValue(checklistJson, new TypeReference<>() {});
            return new ArrayList<>(list); // Ensure mutable
        } catch (Exception e) {
            log.warn("{}: failed to parse checklist JSON: {}", CLASSNAME, e.getMessage());
            return new ArrayList<>();
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Converts an IncidentTask entity to a response map.
     */
    private Map<String, Object> taskToMap(IncidentTask task) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", task.getId());
        map.put("title", task.getTitle());
        map.put("description", task.getDescription());
        map.put("status", task.getStatus());
        map.put("assignee", task.getAssignee());
        map.put("priority", task.getPriority());
        map.put("dueAt", task.getDueAt() != null ? task.getDueAt().toString() : null);
        map.put("createdBy", task.getCreatedBy());
        map.put("createdAt", task.getCreatedAt() != null ? task.getCreatedAt().toString() : null);
        map.put("updatedAt", task.getUpdatedAt() != null ? task.getUpdatedAt().toString() : null);
        map.put("completedAt", task.getCompletedAt() != null ? task.getCompletedAt().toString() : null);
        map.put("version", task.getVersion());
        map.put("checklist", parseChecklist(task.getChecklist()));
        return map;
    }

    /**
     * Records an activity entry for task events.
     */
    private void recordActivity(String incidentId, String type, String actorId, Long tenantId,
                                 String content, Map<String, Object> metadata) {
        try {
            IncidentActivity activity = new IncidentActivity();
            activity.setId(UUID.randomUUID().toString());
            activity.setIncidentId(incidentId);
            activity.setType(type);
            activity.setActorId(actorId);
            activity.setContent(content);
            activity.setTenantId(tenantId);
            activity.setMetadata(objectMapper.writeValueAsString(metadata));
            activityRepository.save(activity);
        } catch (Exception e) {
            log.warn("{}: failed to record activity for incident {}: {}", CLASSNAME, incidentId, e.getMessage());
        }
    }

    /**
     * Broadcasts a task event via SSE.
     */
    private void broadcastTaskEvent(String incidentId, String eventType, Map<String, Object> taskData, String actor) {
        if (sseService == null) {
            return;
        }
        try {
            Map<String, Object> eventData = new LinkedHashMap<>();
            eventData.put("type", eventType);
            eventData.put("timestamp", Instant.now().toString());
            eventData.put("data", taskData);
            eventData.put("actor", actor);
            sseService.broadcast(incidentId, eventType, eventData, actor);
        } catch (Exception e) {
            log.warn("{}: failed to broadcast SSE for incident {}: {}", CLASSNAME, incidentId, e.getMessage());
        }
    }
}
