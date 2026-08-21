package com.hivearmor.service.evidence;

import com.hivearmor.domain.UtmEvidenceBoard;
import com.hivearmor.domain.UtmEvidenceItem;
import com.hivearmor.domain.UtmEvidencePlacement;
import com.hivearmor.domain.UtmEvidenceRelationship;
import com.hivearmor.repository.UtmEvidenceBoardRepository;
import com.hivearmor.repository.UtmEvidenceItemRepository;
import com.hivearmor.repository.UtmEvidencePlacementRepository;
import com.hivearmor.repository.UtmEvidenceRelationshipRepository;
import com.hivearmor.service.dto.EvidenceBoardDTO;
import com.hivearmor.service.dto.EvidenceItemDTO;
import com.hivearmor.service.dto.EvidencePlacementDTO;
import com.hivearmor.service.dto.EvidenceRelationshipDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for all evidence board operations.
 * Handles CRUD for evidence items, boards, placements (with version-conflict detection),
 * and relationships.
 * S-4A
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class EvidenceService {

    private final UtmEvidenceItemRepository itemRepo;
    private final UtmEvidenceBoardRepository boardRepo;
    private final UtmEvidencePlacementRepository placementRepo;
    private final UtmEvidenceRelationshipRepository relRepo;

    // ── Evidence items ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<EvidenceItemDTO> listItems(Long incidentId) {
        return itemRepo.findByIncidentId(incidentId)
                .stream()
                .map(this::toItemDTO)
                .collect(Collectors.toList());
    }

    public EvidenceItemDTO addItem(Long incidentId, EvidenceItemDTO dto, String currentUser) {
        UtmEvidenceItem item = new UtmEvidenceItem();
        item.setIncidentId(incidentId);
        item.setItemType(dto.itemType());
        item.setTitle(dto.title());
        item.setContent(dto.content());
        item.setSourceRef(dto.sourceRef());
        item.setSeverityHint(dto.severityHint());
        item.setCreatedBy(currentUser);
        item.setCreatedAt(Instant.now());
        item.setUpdatedAt(Instant.now());
        return toItemDTO(itemRepo.save(item));
    }

    public EvidenceItemDTO updateItem(Long itemId, EvidenceItemDTO dto) {
        UtmEvidenceItem item = itemRepo.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Evidence item not found: " + itemId));
        if (dto.title() != null) item.setTitle(dto.title());
        if (dto.content() != null) item.setContent(dto.content());
        if (dto.sourceRef() != null) item.setSourceRef(dto.sourceRef());
        if (dto.severityHint() != null) item.setSeverityHint(dto.severityHint());
        item.setUpdatedAt(Instant.now());
        return toItemDTO(itemRepo.save(item));
    }

    public void deleteItem(Long itemId) {
        itemRepo.deleteById(itemId);
    }

    // ── Boards ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public EvidenceBoardDTO getBoard(Long incidentId, Long boardId) {
        UtmEvidenceBoard board = boardRepo.findById(boardId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Board not found: " + boardId));
        List<EvidencePlacementDTO> placements = placementRepo.findByBoardId(boardId)
                .stream()
                .map(this::toPlacementDTO)
                .collect(Collectors.toList());
        return new EvidenceBoardDTO(board.getId(), board.getIncidentId(), board.getName(), placements);
    }

    /**
     * Returns the first board for the incident; creates a "Main Board" if none exists.
     */
    public EvidenceBoardDTO getOrCreateMainBoard(Long incidentId) {
        UtmEvidenceBoard board = boardRepo.findFirstByIncidentId(incidentId)
                .orElseGet(() -> {
                    UtmEvidenceBoard b = new UtmEvidenceBoard();
                    b.setIncidentId(incidentId);
                    b.setName("Main Board");
                    b.setCreatedAt(Instant.now());
                    b.setUpdatedAt(Instant.now());
                    return boardRepo.save(b);
                });
        List<EvidencePlacementDTO> placements = placementRepo.findByBoardId(board.getId())
                .stream()
                .map(this::toPlacementDTO)
                .collect(Collectors.toList());
        return new EvidenceBoardDTO(board.getId(), board.getIncidentId(), board.getName(), placements);
    }

    // ── Placements ──────────────────────────────────────────────────────────

    /**
     * Batch-saves placements for a board using an optimistic version check.
     * If the stored max(schemaVersion) > submittedVersion, throws 409 CONFLICT.
     * Otherwise deletes the existing placements, saves new ones at submittedVersion+1,
     * and returns the new version number.
     *
     * @param boardId          board to update
     * @param placements       new placement list from the client
     * @param submittedVersion the version the client believes is current
     * @return the new schema version after the save
     */
    public int savePlacements(Long boardId, List<EvidencePlacementDTO> placements, int submittedVersion) {
        UtmEvidenceBoard board = boardRepo.findById(boardId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Board not found: " + boardId));

        // Conflict detection: find the maximum version stored for this board
        List<UtmEvidencePlacement> existing = placementRepo.findByBoardId(boardId);
        int storedMax = existing.stream()
                .mapToInt(p -> p.getSchemaVersion() != null ? p.getSchemaVersion() : 0)
                .max()
                .orElse(0);

        if (storedMax > submittedVersion) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Version conflict: stored version " + storedMax
                            + " is newer than submitted version " + submittedVersion);
        }

        int newVersion = submittedVersion + 1;
        placementRepo.deleteByBoardId(boardId);
        placementRepo.flush();

        for (EvidencePlacementDTO dto : placements) {
            UtmEvidenceItem item = itemRepo.findById(dto.evidenceItemId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                            "Evidence item not found: " + dto.evidenceItemId()));
            UtmEvidencePlacement p = new UtmEvidencePlacement();
            p.setBoard(board);
            p.setEvidenceItem(item);
            p.setPosX(dto.posX() != null ? dto.posX() : 0);
            p.setPosY(dto.posY() != null ? dto.posY() : 0);
            p.setWidth(dto.width() != null ? dto.width() : 200);
            p.setHeight(dto.height() != null ? dto.height() : 150);
            p.setSchemaVersion(newVersion);
            p.setUpdatedAt(Instant.now());
            placementRepo.save(p);
        }

        return newVersion;
    }

    // ── Relationships ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<EvidenceRelationshipDTO> listRelationships(Long incidentId) {
        return relRepo.findByIncidentId(incidentId)
                .stream()
                .map(this::toRelDTO)
                .collect(Collectors.toList());
    }

    public EvidenceRelationshipDTO addRelationship(Long incidentId, EvidenceRelationshipDTO dto, String currentUser) {
        UtmEvidenceItem source = itemRepo.findById(dto.sourceItemId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Source evidence item not found: " + dto.sourceItemId()));
        UtmEvidenceItem target = itemRepo.findById(dto.targetItemId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Target evidence item not found: " + dto.targetItemId()));

        UtmEvidenceRelationship rel = new UtmEvidenceRelationship();
        rel.setIncidentId(incidentId);
        rel.setSourceItem(source);
        rel.setTargetItem(target);
        rel.setRelationshipType(dto.relationshipType() != null ? dto.relationshipType() : "RELATED");
        rel.setLabel(dto.label());
        rel.setCreatedBy(currentUser);
        rel.setCreatedAt(Instant.now());
        return toRelDTO(relRepo.save(rel));
    }

    public void deleteRelationship(Long relationshipId) {
        relRepo.deleteById(relationshipId);
    }

    // ── Mappers ─────────────────────────────────────────────────────────────

    private EvidenceItemDTO toItemDTO(UtmEvidenceItem e) {
        return new EvidenceItemDTO(
                e.getId(),
                e.getIncidentId(),
                e.getItemType(),
                e.getTitle(),
                e.getContent(),
                e.getSourceRef(),
                e.getSeverityHint(),
                e.getCreatedBy(),
                e.getCreatedAt(),
                e.getUpdatedAt()
        );
    }

    private EvidencePlacementDTO toPlacementDTO(UtmEvidencePlacement p) {
        return new EvidencePlacementDTO(
                p.getId(),
                p.getBoard() != null ? p.getBoard().getId() : null,
                p.getEvidenceItem() != null ? p.getEvidenceItem().getId() : null,
                p.getPosX(),
                p.getPosY(),
                p.getWidth(),
                p.getHeight(),
                p.getSchemaVersion()
        );
    }

    private EvidenceRelationshipDTO toRelDTO(UtmEvidenceRelationship r) {
        return new EvidenceRelationshipDTO(
                r.getId(),
                r.getIncidentId(),
                r.getSourceItem() != null ? r.getSourceItem().getId() : null,
                r.getTargetItem() != null ? r.getTargetItem().getId() : null,
                r.getRelationshipType(),
                r.getLabel(),
                r.getCreatedBy(),
                r.getCreatedAt()
        );
    }
}
