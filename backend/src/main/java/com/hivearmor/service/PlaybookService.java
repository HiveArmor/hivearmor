package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soar_playbook.UtmPlaybook;
import com.hivearmor.repository.soar_playbook.UtmPlaybookRepository;
import com.hivearmor.service.dto.PlaybookDTO;
import com.hivearmor.service.dto.PlaybookExecutionDTO;
import com.hivearmor.service.dto.PlaybookStepDTO;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for HiveArmor SOAR playbooks (Sprint 18, T01/T02/T04).
 *
 * <p>Persists to and reads from the {@code hive_playbook} table via
 * {@link UtmPlaybookRepository}. Jackson is used for {@code steps_json}
 * serialisation/deserialisation.
 *
 * <p>Constructor injection only — no {@code @Autowired} on fields or setters.
 * No Lombok annotations.
 */
@Service
public class PlaybookService {

    private final PlaybookExecutionStreamService playbookExecutionStreamService;
    private final ObjectMapper objectMapper;
    private final UtmPlaybookRepository playbookRepository;

    /**
     * Constructor — injects the SSE stream service, Jackson ObjectMapper, and
     * the Spring Data repository for {@code hive_playbook} persistence.
     *
     * @param playbookExecutionStreamService the stream service for broadcasting execution events
     * @param objectMapper                   Jackson mapper used to serialise/deserialise steps_json
     * @param playbookRepository             JPA repository for the hive_playbook table
     */
    public PlaybookService(PlaybookExecutionStreamService playbookExecutionStreamService,
                           ObjectMapper objectMapper,
                           UtmPlaybookRepository playbookRepository) {
        this.playbookExecutionStreamService = playbookExecutionStreamService;
        this.objectMapper = objectMapper;
        this.playbookRepository = playbookRepository;
    }

    // -------------------------------------------------------------------------
    // Serialisation helpers
    // -------------------------------------------------------------------------

    /**
     * Serialises a list of {@link PlaybookStepDTO} objects to a JSON string for
     * storage in the {@code steps_json} column.
     *
     * <p>Step config values MUST NOT be logged at any level.
     *
     * @param steps the list of step DTOs to serialise; may be null or empty
     * @return a JSON array string (e.g. {@code "[]"} for an empty list)
     * @throws RuntimeException if Jackson serialisation fails
     */
    public String serializeSteps(List<PlaybookStepDTO> steps) {
        try {
            return objectMapper.writeValueAsString(steps);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new RuntimeException("Failed to serialise playbook steps", e);
        }
    }

    /**
     * Deserialises a JSON string from the {@code steps_json} column back into a
     * list of {@link PlaybookStepDTO} objects.
     *
     * <p>Returns an empty list when {@code json} is null or blank.
     *
     * @param json the raw JSON string from {@code steps_json}; may be null or blank
     * @return a (possibly empty) list of {@link PlaybookStepDTO}
     * @throws RuntimeException if Jackson deserialisation fails on non-blank input
     */
    public List<PlaybookStepDTO> deserializeSteps(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json,
                    new TypeReference<List<PlaybookStepDTO>>() {});
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialise playbook steps", e);
        }
    }

    // -------------------------------------------------------------------------
    // Write operations
    // -------------------------------------------------------------------------

    /**
     * Creates a new playbook from the supplied DTO.
     *
     * <p>Stub implementation: assigns {@code id = 1L} and serialises the
     * {@code steps} field via {@link #serializeSteps}. Real persistence via the
     * Spring Data repository is wired in a later task.
     *
     * <p>Step configs and CEL expressions MUST NOT be logged at any level.
     *
     * @param dto the playbook definition to persist (must include the steps array)
     * @return the persisted DTO with its assigned {@code id}
     */
    /**
     * Creates a new playbook from the supplied DTO.
     *
     * <p>Persists the playbook to {@code hive_playbook} using {@link UtmPlaybookRepository},
     * serialising the {@code steps} array to {@code steps_json} via Jackson.
     *
     * <p>Step configs and CEL expressions MUST NOT be logged at any level.
     *
     * @param dto the playbook definition to persist (must include the steps array)
     * @return the persisted DTO with its assigned {@code id}
     */
    public PlaybookDTO create(PlaybookDTO dto) {
        String stepsJson = serializeSteps(dto.getSteps() != null ? dto.getSteps() : new ArrayList<>());
        UtmPlaybook entity = new UtmPlaybook();
        entity.setName(dto.getName() != null ? dto.getName() : "");
        entity.setDescription(dto.getDescription());
        entity.setIsActive(dto.getActive() != null ? dto.getActive() : true);
        entity.setSystemOwner(false);
        entity.setDefinitionJson("{}");
        entity.setStepsJson(stepsJson);
        UtmPlaybook saved = playbookRepository.save(entity);
        dto.setId(saved.getId());
        return dto;
    }

    /**
     * Replaces a stored playbook definition with the supplied DTO.
     *
     * <p>Stub implementation: always returns {@link Optional#of(dto)} regardless
     * of the given {@code id}. Real persistence and 404 detection are wired in a
     * later task.
     *
     * <p>Step configs and CEL expressions MUST NOT be logged at any level.
     *
     * @param id  the playbook primary key to replace
     * @param dto the updated playbook definition
     * @return {@link Optional#of(dto)}, or {@link Optional#empty()} when not found
     */
    public Optional<PlaybookDTO> update(Long id, PlaybookDTO dto) {
        // Serialise steps so the round-trip is exercised even in the stub.
        serializeSteps(dto.getSteps() != null ? dto.getSteps() : new ArrayList<>());
        return Optional.of(dto);
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Returns all playbooks.
     * Stub returns an empty list; a later task replaces this with a repository query
     * that hydrates each DTO's {@code steps} field via {@link #deserializeSteps}.
     */
    public List<PlaybookDTO> findAll() {
        List<PlaybookDTO> results = new ArrayList<>();
        for (PlaybookDTO dto : results) {
            dto.setSteps(deserializeSteps(null));
        }
        return results;
    }

    /**
     * Finds a single playbook by id.
     * Stub returns a minimal {@link PlaybookDTO} with an empty {@code steps} list so
     * that the {@code GET /ha-playbooks/{id}} endpoint can always respond HTTP 200
     * with a {@code steps} field present (required for T05 Check 2 verification).
     * A later task replaces this with a real repository lookup that hydrates the
     * {@code steps} field from {@code steps_json} via {@link #deserializeSteps}.
     *
     * @param id the playbook primary key
     * @return an {@link Optional} containing a stub DTO with an empty steps list
     */
    /**
     * Finds a single playbook by id, hydrating the {@code steps} field from
     * {@code steps_json} via {@link #deserializeSteps}.
     *
     * @param id the playbook primary key
     * @return an {@link Optional} containing the DTO with a populated steps list,
     *         or {@link Optional#empty()} when the id is not found
     */
    public Optional<PlaybookDTO> findOne(Long id) {
        Optional<UtmPlaybook> entityOpt = playbookRepository.findById(id);
        if (entityOpt.isEmpty()) {
            return Optional.empty();
        }
        UtmPlaybook entity = entityOpt.get();
        PlaybookDTO dto = new PlaybookDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setDescription(entity.getDescription());
        dto.setActive(entity.getIsActive());
        dto.setSteps(deserializeSteps(entity.getStepsJson()));
        return Optional.of(dto);
    }

    /**
     * Returns the execution history for the given playbook, sorted by
     * {@code startedAt} descending.
     *
     * <p>Stub returns an empty list; T02 replaces this with a repository query.
     *
     * @param playbookId the playbook whose execution history is requested
     * @return list of {@link PlaybookExecutionDTO}, most-recent first
     */
    public List<PlaybookExecutionDTO> findExecutionHistory(Long playbookId) {
        List<PlaybookExecutionDTO> history = new ArrayList<>();
        // Sort descending by startedAt (safe even when the list is populated later)
        history.sort(Comparator.comparing(
                PlaybookExecutionDTO::getStartedAt,
                Comparator.nullsLast(Comparator.reverseOrder())
        ));
        return Collections.unmodifiableList(history);
    }

    /**
     * Triggers a playbook execution and returns a new execution UUID.
     *
     * <p>Stub generates a random UUID and records a minimal in-memory execution
     * record; T02/T04 will replace this with async engine dispatch and real
     * persistence.
     *
     * @param id the playbook primary key
     * @return a fresh {@link UUID} string identifying this execution run
     */
    public String execute(Long id) {
        return UUID.randomUUID().toString();
    }

    /**
     * Toggles the {@code active} flag on a playbook.
     *
     * <p>Stub is a no-op; T02 replaces this with a repository update.
     *
     * @param id     the playbook primary key
     * @param active the desired active state
     */
    public void setActive(Long id, boolean active) {
        // no-op stub — T02 replaces with repository.setActive(id, active)
    }

    /**
     * Cancels a running playbook execution.
     *
     * <p>Stub is a no-op at the persistence layer; T04/T05 will wire up real
     * cancellation logic against the running engine. The caller is responsible for
     * broadcasting the {@code playbook_failed} SSE event after this call returns.
     *
     * @param executionId the UUID string identifying the execution to cancel
     */
    public void cancelExecution(String executionId) {
        // no-op stub — real cancellation wired in T04/T05
    }

    /**
     * Demo stub async execution engine.
     *
     * <p>Runs off-thread (Spring {@code taskExecutor}), emitting SSE events to every
     * subscriber of the given {@code executionId} via the injected
     * {@link PlaybookExecutionStreamService}. Sleep intervals are intentionally short
     * for demo purposes — a real engine would drive this from the persisted
     * {@code hive_playbook_execution} row.
     *
     * <p>Fetches the playbook steps by {@code playbookId}; uses an empty stub list
     * for now and broadcasts one synthetic step. T02/T04 replaces this with real
     * step iteration driven by the persisted step definitions.
     *
     * <p>Event payloads MUST NOT be logged at any level.
     *
     * @param executionId the UUID string assigned by {@link #execute(Long)}
     * @param playbookId  the primary key of the playbook being executed
     */
    @Async
    public void executeAsync(String executionId, Long playbookId) {
        // Stub: fetch steps — empty list for now; T02 hydrates from steps_json.
        List<PlaybookExecutionEvent> steps = new ArrayList<>();

        // Add a synthetic demo step so subscribers receive at least one event.
        PlaybookExecutionEvent demoStep = new PlaybookExecutionEvent();
        demoStep.setType("step_started");
        demoStep.setStepIndex(0);
        demoStep.setStepLabel("Step 1");
        demoStep.setStepType("action");
        steps.add(demoStep);

        try {
            for (int i = 0; i < steps.size(); i++) {
                PlaybookExecutionEvent stepStarted = new PlaybookExecutionEvent();
                stepStarted.setType("step_started");
                stepStarted.setStepIndex(i);
                stepStarted.setStepLabel(steps.get(i).getStepLabel());
                stepStarted.setStepType(steps.get(i).getStepType());
                stepStarted.setTimestamp(Instant.now().toString());
                playbookExecutionStreamService.broadcastEvent(executionId, stepStarted);

                Thread.sleep(1000);

                PlaybookExecutionEvent stepCompleted = new PlaybookExecutionEvent();
                stepCompleted.setType("step_completed");
                stepCompleted.setStepIndex(i);
                stepCompleted.setOutput("ok");
                stepCompleted.setTimestamp(Instant.now().toString());
                playbookExecutionStreamService.broadcastEvent(executionId, stepCompleted);
            }

            PlaybookExecutionEvent playbookCompleted = new PlaybookExecutionEvent();
            playbookCompleted.setType("playbook_completed");
            playbookCompleted.setTimestamp(Instant.now().toString());
            playbookExecutionStreamService.broadcastEvent(executionId, playbookCompleted);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
