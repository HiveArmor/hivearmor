package com.hivearmor.service;

import com.hivearmor.domain.HaLlmUsage;
import com.hivearmor.repository.HaLlmUsageRepository;
import com.hivearmor.service.dto.HaLlmUsageDTO;
import com.hivearmor.service.dto.HaLlmUsageSummaryDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Read-side service for the durable {@code ha_llm_usage} ledger.
 *
 * <p>Maps entities to safe DTOs only — never prompt bodies or secrets.
 */
@Service
@Transactional(readOnly = true)
public class HaLlmUsageService {

    private final HaLlmUsageRepository repository;

    public HaLlmUsageService(HaLlmUsageRepository repository) {
        this.repository = repository;
    }

    public Page<HaLlmUsageDTO> findAll(Pageable pageable) {
        return repository.findAll(pageable).map(this::toDto);
    }

    public List<HaLlmUsageSummaryDTO> summarizeByCascadeDecision() {
        List<Object[]> rows = repository.countGroupedByCascadeDecision();
        List<HaLlmUsageSummaryDTO> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            String decision = row[0] != null ? row[0].toString() : null;
            long count = row[1] instanceof Number n ? n.longValue() : 0L;
            out.add(new HaLlmUsageSummaryDTO(decision, count));
        }
        return out;
    }

    HaLlmUsageDTO toDto(HaLlmUsage entity) {
        return new HaLlmUsageDTO(
            entity.getId(),
            entity.getPromptId(),
            entity.getPromptHash(),
            entity.getPromptTokens(),
            entity.getCompletionTokens(),
            entity.getTotalTokens(),
            entity.getCascadeDecision(),
            entity.getCascadeReason(),
            entity.getUserLogin(),
            entity.getCreatedAt()
        );
    }
}
