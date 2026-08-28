package com.hivearmor.service.intelligence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.intelligence.*;
import com.hivearmor.repository.intelligence.HiveIntelligenceFindingFeedbackRepository;
import com.hivearmor.repository.intelligence.HiveIntelligenceFindingRepository;
import com.hivearmor.service.dto.intelligence.IntelligenceFactDTO;
import com.hivearmor.service.dto.intelligence.IntelligenceFindingDTO;
import com.hivearmor.service.dto.intelligence.IntelligenceInferenceDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class IntelligenceFindingService {

    private static final String PROVENANCE_SOC_AI = "soc-ai";
    private static final String PROVENANCE_UNCONFIGURED = "soc-ai-unconfigured";

    private final HiveIntelligenceFindingRepository findingRepository;
    private final HiveIntelligenceFindingFeedbackRepository feedbackRepository;
    private final ObjectMapper objectMapper;

    public IntelligenceFindingService(
        HiveIntelligenceFindingRepository findingRepository,
        HiveIntelligenceFindingFeedbackRepository feedbackRepository,
        ObjectMapper objectMapper
    ) {
        this.findingRepository = findingRepository;
        this.feedbackRepository = feedbackRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public Page<IntelligenceFindingDTO> listFindings(Pageable pageable) {
        return findingRepository.findAllByOrderByCreatedAtDesc(pageable).map(this::toDto);
    }

    @Transactional(readOnly = true)
    public Optional<IntelligenceFindingDTO> getFinding(Long id) {
        return findingRepository.findWithDetailsById(id).map(this::toDto);
    }

    public IntelligenceFindingDTO saveFinding(IntelligenceFindingDTO dto, String createdBy) {
        HiveIntelligenceFinding entity = new HiveIntelligenceFinding();
        entity.setTitle(dto.title());
        entity.setSummary(dto.summary());
        entity.setAnswer(dto.answer());
        entity.setConfidence(dto.confidence());
        entity.setConfidenceExplanation(dto.confidenceExplanation());
        entity.setProvenance(dto.provenance());
        entity.setContextType(dto.contextType());
        entity.setContextRef(dto.contextRef());
        entity.setSourcesJson(writeSources(dto.sources()));
        entity.setCreatedBy(createdBy);
        entity.setCreatedAt(Instant.now());
        entity.setUpdatedAt(Instant.now());
        applyChildren(entity, dto);
        return toDto(findingRepository.save(entity));
    }

    public IntelligenceFindingDTO buildFromSocAiAnswer(
        String answer,
        double confidence,
        List<String> sources,
        String contextType,
        String contextRef,
        boolean aiConfigured
    ) {
        IntelligenceFindingParser.ParsedFinding parsed = IntelligenceFindingParser.parse(answer);
        String provenance = aiConfigured ? PROVENANCE_SOC_AI : PROVENANCE_UNCONFIGURED;
        String confidenceExplanation = aiConfigured
            ? "Derived from assistive SOC AI response. STAGING CANDIDATE — verify facts before action."
            : "SOC AI is not configured. No model inference was performed.";

        if (!aiConfigured) {
            return new IntelligenceFindingDTO(
                null,
                "SOC AI unavailable",
                parsed.summary(),
                answer,
                List.of(new IntelligenceFactDTO(null, answer, null)),
                List.of(),
                List.of(),
                List.of("Configure SOC_AI_BASE_URL to enable structured assistive analysis."),
                0.0,
                confidenceExplanation,
                List.of(),
                provenance,
                contextType,
                contextRef,
                null,
                null
            );
        }

        return new IntelligenceFindingDTO(
            null,
            truncate(parsed.summary(), 120),
            parsed.summary(),
            answer,
            parsed.facts(),
            parsed.inferences(),
            parsed.contradictions(),
            parsed.missingEvidence(),
            confidence,
            confidenceExplanation,
            sources != null ? sources : List.of(),
            provenance,
            contextType,
            contextRef,
            null,
            null
        );
    }

    public IntelligenceFindingDTO persistSocAiFinding(
        IntelligenceFindingDTO finding,
        String createdBy
    ) {
        return saveFinding(finding, createdBy);
    }

    public void addFeedback(Long findingId, String userLogin, String rating, String comment) {
        HiveIntelligenceFinding finding = findingRepository.findById(findingId)
            .orElseThrow(() -> new IllegalArgumentException("Finding not found: " + findingId));
        HiveIntelligenceFindingFeedback feedback = new HiveIntelligenceFindingFeedback();
        feedback.setFinding(finding);
        feedback.setUserLogin(userLogin);
        feedback.setRating(rating);
        feedback.setComment(comment);
        feedback.setCreatedAt(Instant.now());
        feedbackRepository.save(feedback);
    }

    private void applyChildren(HiveIntelligenceFinding entity, IntelligenceFindingDTO dto) {
        int order = 0;
        for (IntelligenceFactDTO fact : dto.facts()) {
            HiveIntelligenceFindingFact child = new HiveIntelligenceFindingFact();
            child.setFinding(entity);
            child.setText(fact.text());
            child.setSource(fact.source());
            child.setSortOrder(order++);
            entity.getFacts().add(child);
        }
        order = 0;
        for (IntelligenceInferenceDTO inference : dto.inferences()) {
            HiveIntelligenceFindingInference child = new HiveIntelligenceFindingInference();
            child.setFinding(entity);
            child.setText(inference.text());
            child.setConfidence(inference.confidence());
            child.setContradiction(false);
            child.setSortOrder(order++);
            entity.getInferences().add(child);
        }
        order = 0;
        for (IntelligenceInferenceDTO contradiction : dto.contradictions()) {
            HiveIntelligenceFindingInference child = new HiveIntelligenceFindingInference();
            child.setFinding(entity);
            child.setText(contradiction.text());
            child.setConfidence(contradiction.confidence());
            child.setContradiction(true);
            child.setSortOrder(order++);
            entity.getInferences().add(child);
        }
        order = 0;
        for (String gap : dto.missingEvidence()) {
            HiveIntelligenceEvidenceGap child = new HiveIntelligenceEvidenceGap();
            child.setFinding(entity);
            child.setText(gap);
            child.setSortOrder(order++);
            entity.getEvidenceGaps().add(child);
        }
    }

    private IntelligenceFindingDTO toDto(HiveIntelligenceFinding entity) {
        List<IntelligenceFactDTO> facts = entity.getFacts().stream()
            .map(f -> new IntelligenceFactDTO(f.getId(), f.getText(), f.getSource()))
            .toList();

        List<IntelligenceInferenceDTO> inferences = new ArrayList<>();
        List<IntelligenceInferenceDTO> contradictions = new ArrayList<>();
        for (HiveIntelligenceFindingInference inf : entity.getInferences()) {
            IntelligenceInferenceDTO dto = new IntelligenceInferenceDTO(inf.getId(), inf.getText(), inf.getConfidence());
            if (Boolean.TRUE.equals(inf.getContradiction())) {
                contradictions.add(dto);
            } else {
                inferences.add(dto);
            }
        }

        List<String> gaps = entity.getEvidenceGaps().stream()
            .map(HiveIntelligenceEvidenceGap::getText)
            .toList();

        return new IntelligenceFindingDTO(
            entity.getId(),
            entity.getTitle(),
            entity.getSummary(),
            entity.getAnswer(),
            facts,
            inferences,
            contradictions,
            gaps,
            entity.getConfidence() != null ? entity.getConfidence() : 0.0,
            entity.getConfidenceExplanation(),
            readSources(entity.getSourcesJson()),
            entity.getProvenance(),
            entity.getContextType(),
            entity.getContextRef(),
            entity.getCreatedAt() != null ? entity.getCreatedAt().toString() : null,
            entity.getCreatedBy()
        );
    }

    private String writeSources(List<String> sources) {
        try {
            return objectMapper.writeValueAsString(sources != null ? sources : List.of());
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private List<String> readSources(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }
}
