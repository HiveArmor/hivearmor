package com.hivearmor.service.detection;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.detection.HaDetectionException;
import com.hivearmor.repository.detection.HaDetectionExceptionRepository;
import com.hivearmor.service.detection.dto.DetectionExceptionDtos.CreateExceptionRequest;
import com.hivearmor.service.detection.dto.DetectionExceptionDtos.DetectionExceptionDTO;
import com.hivearmor.service.detection.dto.DetectionExceptionDtos.ExceptionCondition;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Persisted detection exceptions (DET-FP-001).
 *
 * <p>STAGING CANDIDATE — stores drafts and active/inactive flags for the
 * analyst FP → exception loop. Active exceptions sync via config plugin to
 * the event-processor and are enforced pre-alert during CEL evaluate
 * (sync lag up to ~60s).
 */
@Service
@Transactional
public class DetectionExceptionService {

    private static final Logger log = LoggerFactory.getLogger(DetectionExceptionService.class);
    private static final String CLASSNAME = "DetectionExceptionService";

    private static final String HONESTY =
        "STAGING CANDIDATE — exception is persisted in PostgreSQL. "
            + "When active, the config plugin writes rules/exceptions/exceptions.yaml and the "
            + "event-processor suppresses matching alerts pre-buildAlert (sync lag typically ≤60s). "
            + "Sequence/graph/baseline paths are not covered.";

    private final HaDetectionExceptionRepository repository;
    private final ObjectMapper objectMapper;

    public DetectionExceptionService(HaDetectionExceptionRepository repository,
                                     ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<DetectionExceptionDTO> listByRuleId(String ruleId) {
        return repository.findByRuleIdOrderByUpdatedAtDesc(ruleId).stream()
            .map(this::toDto)
            .toList();
    }

    public DetectionExceptionDTO create(String ruleId, CreateExceptionRequest request, String actor) {
        if (request == null || request.conditions() == null || request.conditions().isEmpty()) {
            throw new IllegalArgumentException("At least one exception condition is required");
        }
        for (ExceptionCondition condition : request.conditions()) {
            if (condition == null
                || isBlank(condition.field())
                || isBlank(condition.operator())
                || isBlank(condition.value())) {
                throw new IllegalArgumentException("Each condition requires field, operator, and value");
            }
        }

        String title = request.title() != null && !request.title().isBlank()
            ? request.title().trim()
            : "Exception for rule " + ruleId;

        HaDetectionException entity = new HaDetectionException();
        entity.setRuleId(ruleId);
        entity.setTitle(title);
        entity.setReason(trimOrNull(request.reason()));
        entity.setConditionsJson(serializeConditions(request.conditions()));
        entity.setActive(false);
        entity.setStatus("draft");
        entity.setCreatedBy(actor);

        HaDetectionException saved = repository.save(entity);
        log.info("{}.create: id={} ruleId={} actor={}", CLASSNAME, saved.getId(), ruleId, actor);
        return toDto(saved);
    }

    public DetectionExceptionDTO activate(String ruleId, Long id, String actor) {
        HaDetectionException entity = requireOwned(ruleId, id);
        entity.setActive(true);
        entity.setStatus("active");
        entity.setActivatedBy(actor);
        entity.setActivatedAt(Instant.now());
        return toDto(repository.save(entity));
    }

    public DetectionExceptionDTO deactivate(String ruleId, Long id, String actor) {
        HaDetectionException entity = requireOwned(ruleId, id);
        entity.setActive(false);
        entity.setStatus("inactive");
        entity.setActivatedBy(actor);
        return toDto(repository.save(entity));
    }

    private HaDetectionException requireOwned(String ruleId, Long id) {
        return repository.findByIdAndRuleId(id, ruleId)
            .orElseThrow(() -> new EntityNotFoundException(
                "Detection exception not found for rule " + ruleId + ": " + id));
    }

    private DetectionExceptionDTO toDto(HaDetectionException entity) {
        return new DetectionExceptionDTO(
            entity.getId(),
            entity.getRuleId(),
            entity.getTitle(),
            entity.getReason(),
            deserializeConditions(entity.getConditionsJson()),
            entity.isActive(),
            entity.getStatus(),
            entity.getCreatedBy(),
            entity.getActivatedBy(),
            entity.getActivatedAt(),
            entity.getCreatedAt(),
            entity.getUpdatedAt(),
            HONESTY
        );
    }

    private String serializeConditions(List<ExceptionCondition> conditions) {
        try {
            List<Map<String, String>> rows = new ArrayList<>();
            for (ExceptionCondition condition : conditions) {
                Map<String, String> row = new LinkedHashMap<>();
                row.put("field", condition.field().trim());
                row.put("operator", condition.operator().trim());
                row.put("value", condition.value().trim());
                rows.add(row);
            }
            return objectMapper.writeValueAsString(rows);
        } catch (Exception e) {
            throw new IllegalArgumentException("Unable to serialize exception conditions", e);
        }
    }

    private List<Map<String, String>> deserializeConditions(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("{}.deserializeConditions: {}", CLASSNAME, e.getMessage());
            return List.of();
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
