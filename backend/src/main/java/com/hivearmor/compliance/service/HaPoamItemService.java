package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.CreatePoamItemRequest;
import com.hivearmor.compliance.dto.PoamItemDTO;
import com.hivearmor.compliance.dto.UpdatePoamItemRequest;
import com.hivearmor.compliance.entity.HaPoamItem;
import com.hivearmor.repository.compliance.HaPoamItemRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Set;

@Service
@Transactional
public class HaPoamItemService {

    static final Set<String> ALLOWED_STATUSES = Set.of("open", "in_progress", "closed", "risk_accepted");

    private final HaPoamItemRepository poamItemRepository;
    private final Clock clock;

    public HaPoamItemService(HaPoamItemRepository poamItemRepository, Clock clock) {
        this.poamItemRepository = poamItemRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<PoamItemDTO> listByControlId(Long controlId, Pageable pageable) {
        String controlKey = String.valueOf(controlId);
        Page<HaPoamItem> page = poamItemRepository.findByControlId(controlKey, pageable);
        return page.map(item -> PoamItemDTO.from(item, clock));
    }

    public PoamItemDTO create(CreatePoamItemRequest request) {
        String status = normalizeStatus(request.status(), "open");
        HaPoamItem entity = new HaPoamItem();
        entity.setFrameworkId(request.frameworkId().trim());
        entity.setControlId(String.valueOf(request.controlId()));
        entity.setTitle(request.title().trim());
        entity.setDescription(trimOrNull(request.description()));
        entity.setDueDate(request.dueDate());
        entity.setAssignee(trimOrNull(request.assignee()));
        entity.setStatus(status);
        return PoamItemDTO.from(poamItemRepository.save(entity), clock);
    }

    public PoamItemDTO update(Long id, UpdatePoamItemRequest request) {
        HaPoamItem entity = poamItemRepository
            .findById(id)
            .orElseThrow(() -> new EntityNotFoundException("POA&M item not found: " + id));

        if (request.title() != null) {
            entity.setTitle(request.title().trim());
        }
        if (request.status() != null) {
            entity.setStatus(normalizeStatus(request.status(), entity.getStatus()));
        }
        if (request.assignee() != null) {
            entity.setAssignee(trimOrNull(request.assignee()));
        }
        if (request.dueDate() != null) {
            entity.setDueDate(request.dueDate());
        }

        return PoamItemDTO.from(poamItemRepository.save(entity), clock);
    }

    public void delete(Long id) {
        if (!poamItemRepository.existsById(id)) {
            throw new EntityNotFoundException("POA&M item not found: " + id);
        }
        poamItemRepository.deleteById(id);
    }

    private String normalizeStatus(String candidate, String fallback) {
        if (candidate == null || candidate.isBlank()) {
            return fallback;
        }
        String normalized = candidate.trim().toLowerCase();
        if (!ALLOWED_STATUSES.contains(normalized)) {
            throw new IllegalArgumentException("Unsupported POA&M status: " + candidate);
        }
        return normalized;
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
