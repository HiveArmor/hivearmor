package com.hivearmor.web.rest.task;

import com.hivearmor.domain.UtmInvestigationTask;
import com.hivearmor.repository.UtmInvestigationTaskRepository;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;

/**
 * REST controller for investigation task CRUD.
 * POST   /api/ha-tasks
 * GET    /api/ha-tasks/{id}
 * PUT    /api/ha-tasks/{id}
 * DELETE /api/ha-tasks/{id}
 * S-3B-QUEUE
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class InvestigationTaskResource {

    private static final String ENTITY_NAME = "investigationTask";

    private final UtmInvestigationTaskRepository taskRepository;

    /**
     * POST /api/ha-tasks — create a new investigation task.
     */
    @PostMapping("/ha-tasks")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<UtmInvestigationTask> createTask(
            @RequestBody UtmInvestigationTask task,
            Authentication authentication
    ) throws URISyntaxException {
        if (task.getId() != null) {
            throw new BadRequestAlertException("A new task cannot already have an ID", ENTITY_NAME, "idexists");
        }
        if (task.getStatus() == null || task.getStatus().isBlank()) {
            task.setStatus("OPEN");
        }
        if (task.getTaskPriority() == null || task.getTaskPriority().isBlank()) {
            task.setTaskPriority("P3");
        }
        if (task.getCreatedBy() == null && authentication != null) {
            task.setCreatedBy(authentication.getName());
        }
        task.setCreatedAt(Instant.now());
        task.setUpdatedAt(Instant.now());

        UtmInvestigationTask saved = taskRepository.save(task);
        return ResponseEntity
                .created(new URI("/api/ha-tasks/" + saved.getId()))
                .body(saved);
    }

    /**
     * GET /api/ha-tasks/{id} — get a single task.
     */
    @GetMapping("/ha-tasks/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST','ROLE_USER','ROLE_READ_ONLY')")
    public ResponseEntity<UtmInvestigationTask> getTask(@PathVariable Long id) {
        return taskRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * PUT /api/ha-tasks/{id} — update an existing task.
     */
    @PutMapping("/ha-tasks/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')")
    public ResponseEntity<UtmInvestigationTask> updateTask(
            @PathVariable Long id,
            @RequestBody UtmInvestigationTask task
    ) {
        if (!taskRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        task.setId(id);
        task.setUpdatedAt(Instant.now());
        UtmInvestigationTask saved = taskRepository.save(task);
        return ResponseEntity.ok(saved);
    }

    /**
     * DELETE /api/ha-tasks/{id} — delete a task.
     */
    @DeleteMapping("/ha-tasks/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')")
    public ResponseEntity<Void> deleteTask(@PathVariable Long id) {
        if (!taskRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        taskRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
