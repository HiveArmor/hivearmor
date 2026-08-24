package com.hivearmor.service.session;

import com.hivearmor.domain.UtmInvestigationSession;
import com.hivearmor.domain.UtmSessionItem;
import com.hivearmor.domain.UtmSessionTask;
import com.hivearmor.domain.incident.UtmIncident;
import com.hivearmor.domain.incident.enums.IncidentStatusEnum;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.UtmInvestigationSessionRepository;
import com.hivearmor.repository.UtmSessionItemRepository;
import com.hivearmor.repository.UtmSessionTaskRepository;
import com.hivearmor.repository.incident.UtmIncidentRepository;
import com.hivearmor.service.dto.InvestigationSessionDTO;
import com.hivearmor.service.dto.SessionItemDTO;
import com.hivearmor.service.dto.SessionTaskDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for investigation session management.
 * S-5C
 */
@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class InvestigationSessionService {

    private final UtmInvestigationSessionRepository sessionRepository;
    private final UtmSessionItemRepository itemRepository;
    private final UtmSessionTaskRepository taskRepository;
    private final UtmIncidentRepository incidentRepository;

    // ── Session CRUD ──────────────────────────────────────────────────────────

    /**
     * List sessions.
     * ADMIN/SOC_MANAGER see all sessions; ANALYST/USER see only their own.
     */
    @Transactional(readOnly = true)
    public Page<InvestigationSessionDTO> listSessions(String currentUser, boolean isAdminOrManager, Pageable pageable) {
        Long tenantId = TenantContext.getClientId();
        Page<UtmInvestigationSession> page;
        if (tenantId != null) {
            page = isAdminOrManager
                ? sessionRepository.findByTenantIdOrderByCreatedAtDesc(tenantId, pageable)
                : sessionRepository.findByTenantIdAndCreatedByOrderByCreatedAtDesc(tenantId, currentUser, pageable);
        } else {
            page = isAdminOrManager
                ? sessionRepository.findAllByOrderByCreatedAtDesc(pageable)
                : sessionRepository.findByCreatedByOrderByCreatedAtDesc(currentUser, pageable);
        }

        List<Long> sessionIds = page.getContent().stream().map(UtmInvestigationSession::getId).toList();
        Map<Long, Integer> itemCounts = sessionIds.isEmpty()
            ? Collections.emptyMap()
            : itemRepository.countBySessionIds(sessionIds).stream().collect(Collectors.toMap(
                row -> ((Number) row[0]).longValue(),
                row -> Math.toIntExact(((Number) row[1]).longValue())
            ));

        List<InvestigationSessionDTO> dtos = page.getContent().stream()
                .map(session -> toDTO(session, itemCounts.getOrDefault(session.getId(), 0)))
                .collect(Collectors.toList());

        return new PageImpl<>(dtos, pageable, page.getTotalElements());
    }

    /**
     * Create a new session. createdBy is always set from the current user.
     */
    public InvestigationSessionDTO createSession(InvestigationSessionDTO dto, String currentUser) {
        UtmInvestigationSession session = new UtmInvestigationSession();
        session.setSessionName(dto.sessionName());
        session.setDescription(dto.description());
        session.setStatus(dto.status() != null ? dto.status() : "ACTIVE");
        session.setTenantId(TenantContext.getClientId());
        session.setCreatedBy(currentUser);
        session.setAssignedTo(dto.assignedTo());
        session.setCreatedAt(Instant.now());
        session.setUpdatedAt(Instant.now());

        UtmInvestigationSession saved = sessionRepository.save(session);
        log.debug("Created investigation session id={} for user={}", saved.getId(), currentUser);
        return toDTO(saved);
    }

    /**
     * Get a single session by id; throws 404 if not found.
     */
    @Transactional(readOnly = true)
    public InvestigationSessionDTO getSession(Long id, String currentUser, boolean isAdminOrManager) {
        return toDTO(loadAuthorizedSession(id, currentUser, isAdminOrManager));
    }

    /**
     * Admin-aware update — admins bypass ownership check.
     */
    public InvestigationSessionDTO updateSessionAuthorized(Long id, InvestigationSessionDTO dto,
                                                           String currentUser, boolean isAdminOrManager) {
        UtmInvestigationSession existing = loadAuthorizedSession(id, currentUser, isAdminOrManager);
        assertExpectedVersion(existing, dto.version());
        if (dto.sessionName() != null) existing.setSessionName(dto.sessionName());
        if (dto.description() != null) existing.setDescription(dto.description());
        if (dto.status() != null) existing.setStatus(dto.status());
        if (dto.assignedTo() != null) existing.setAssignedTo(dto.assignedTo());
        existing.setUpdatedAt(Instant.now());
        return toDTO(sessionRepository.save(existing));
    }

    /**
     * Delete a session. Only the owner or an ADMIN may delete; others get 403.
     */
    public void deleteSession(Long id, String currentUser, boolean isAdminOrManager) {
        UtmInvestigationSession existing = loadAuthorizedSession(id, currentUser, isAdminOrManager);
        sessionRepository.deleteById(id);
        log.debug("Deleted investigation session id={} by user={}", id, currentUser);
    }

    // ── Session items ─────────────────────────────────────────────────────────

    /**
     * Pin an item to a session.
     */
    public SessionItemDTO pinItem(Long sessionId, SessionItemDTO dto, String currentUser, boolean isAdminOrManager) {
        UtmInvestigationSession session = loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);

        UtmSessionItem item = new UtmSessionItem();
        item.setSession(session);
        item.setItemType(dto.itemType());
        item.setItemRef(dto.itemRef());
        item.setItemSnapshot(dto.itemSnapshot());
        item.setNote(dto.note());
        item.setAddedBy(currentUser);
        item.setAddedAt(Instant.now());

        UtmSessionItem saved = itemRepository.save(item);
        session.setUpdatedAt(Instant.now());
        sessionRepository.save(session);

        log.debug("Pinned item id={} to session id={} by user={}", saved.getId(), sessionId, currentUser);
        return toItemDTO(saved);
    }

    /**
     * List all items in a session, newest first.
     */
    @Transactional(readOnly = true)
    public Page<SessionItemDTO> listItems(Long sessionId, String currentUser,
                                          boolean isAdminOrManager, Pageable pageable) {
        loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);
        return itemRepository.findBySessionIdOrderByAddedAtDesc(sessionId, pageable).map(this::toItemDTO);
    }

    /**
     * List items in a session filtered by type, newest first.
     */
    @Transactional(readOnly = true)
    public Page<SessionItemDTO> listItemsByType(Long sessionId, String itemType, String currentUser,
                                                boolean isAdminOrManager, Pageable pageable) {
        loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);
        return itemRepository.findBySessionIdAndItemTypeOrderByAddedAtDesc(sessionId, itemType, pageable).map(this::toItemDTO);
    }

    /**
     * Unpin (delete) an item from a session.
     * Only the item adder or an ADMIN may unpin; others get 403.
     */
    public void unpinItem(Long sessionId, Long itemId, String currentUser, boolean isAdminOrManager) {
        loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);
        UtmSessionItem item = itemRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Session item not found: " + itemId));

        if (!item.getSession().getId().equals(sessionId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Item does not belong to session " + sessionId);
        }

        if (!isAdminOrManager && !currentUser.equals(item.getAddedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the item adder or an admin may unpin this item");
        }

        itemRepository.deleteById(itemId);
        log.debug("Unpinned item id={} from session id={} by user={}", itemId, sessionId, currentUser);
    }

    // ── Session case tasks (P1 STAGING CANDIDATE) ─────────────────────────────

    /**
     * List case tasks for a session. Access follows session tenant/owner authz.
     */
    @Transactional(readOnly = true)
    public List<SessionTaskDTO> listTasks(Long sessionId, String currentUser, boolean isAdminOrManager) {
        loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);
        return taskRepository.findBySessionIdOrderByCreatedAtAsc(sessionId).stream()
                .map(this::toTaskDTO)
                .collect(Collectors.toList());
    }

    /**
     * Create a case task on an authorized session.
     */
    public SessionTaskDTO createTask(Long sessionId, SessionTaskDTO dto, String currentUser, boolean isAdminOrManager) {
        UtmInvestigationSession session = loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);

        UtmSessionTask task = new UtmSessionTask();
        task.setSession(session);
        task.setTitle(dto.title().trim());
        task.setStatus(dto.status() != null && !dto.status().isBlank() ? dto.status() : "OPEN");
        task.setAssignee(blankToNull(dto.assignee()));
        task.setExternalTicketUrl(normalizeTicketUrl(dto.externalTicketUrl()));
        task.setCreatedBy(currentUser);
        task.setCreatedAt(Instant.now());
        task.setUpdatedAt(Instant.now());

        UtmSessionTask saved = taskRepository.save(task);
        session.setUpdatedAt(Instant.now());
        sessionRepository.save(session);

        log.debug("Created session task id={} on session id={} by user={}", saved.getId(), sessionId, currentUser);
        return toTaskDTO(saved);
    }

    /**
     * Update a case task. Tenant isolation is enforced via the parent session.
     */
    public SessionTaskDTO updateTask(Long sessionId, Long taskId, SessionTaskDTO dto,
                                     String currentUser, boolean isAdminOrManager) {
        loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);
        UtmSessionTask task = taskRepository.findByIdAndSessionId(taskId, sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Session task not found: " + taskId));

        if (dto.title() != null && !dto.title().isBlank()) {
            task.setTitle(dto.title().trim());
        }
        if (dto.status() != null && !dto.status().isBlank()) {
            task.setStatus(dto.status());
        }
        if (dto.assignee() != null) {
            task.setAssignee(blankToNull(dto.assignee()));
        }
        if (dto.externalTicketUrl() != null) {
            task.setExternalTicketUrl(normalizeTicketUrl(dto.externalTicketUrl()));
        }
        task.setUpdatedAt(Instant.now());

        return toTaskDTO(taskRepository.save(task));
    }

    /**
     * Delete a case task. Tenant isolation is enforced via the parent session.
     */
    public void deleteTask(Long sessionId, Long taskId, String currentUser, boolean isAdminOrManager) {
        loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);
        UtmSessionTask task = taskRepository.findByIdAndSessionId(taskId, sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Session task not found: " + taskId));
        taskRepository.delete(task);
        log.debug("Deleted session task id={} from session id={} by user={}", taskId, sessionId, currentUser);
    }

    // ── Convert to incident ───────────────────────────────────────────────────

    /**
     * Convert this session into a formal UtmIncident.
     * <p>
     * Creates a minimal incident with:
     *   - incidentName = session.sessionName (truncated to 250 chars, made unique with timestamp suffix)
     *   - incidentDescription = "Created from investigation session #" + sessionId
     *   - incidentStatus = OPEN
     *   - incidentSeverity = 2 (medium)
     *   - incidentCreatedDate = now
     *   - incidentPriority = P3
     *   - incidentAssignedTo = session.assignedTo (may be null — that is fine)
     * <p>
     * Sets session.status = CONVERTED and session.incidentId = new incident id.
     * Returns the new incident id.
     *
     * TODO S-10: link ALERT-type session items to hive_incident_alert after SOAR integration.
     */
    public Long convertToIncident(Long sessionId, String currentUser, boolean isAdminOrManager) {
        UtmInvestigationSession session = loadAuthorizedSession(sessionId, currentUser, isAdminOrManager);

        if ("CONVERTED".equals(session.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Session is already converted to incident " + session.getIncidentId());
        }

        // Build a unique incident name (max 250 chars)
        String rawName = session.getSessionName();
        String suffix = " [sess-" + sessionId + "]";
        String incidentName = rawName.length() + suffix.length() <= 250
                ? rawName + suffix
                : rawName.substring(0, 250 - suffix.length()) + suffix;

        UtmIncident incident = new UtmIncident();
        incident.setIncidentName(incidentName);
        incident.setIncidentDescription("Created from investigation session #" + sessionId
                + (session.getDescription() != null && !session.getDescription().isBlank()
                ? ": " + session.getDescription().substring(0, Math.min(session.getDescription().length(), 1900))
                : ""));
        incident.setIncidentStatus(IncidentStatusEnum.OPEN);
        incident.setIncidentSeverity(2);
        incident.setIncidentCreatedDate(Instant.now());
        incident.setIncidentPriority("P3");
        incident.setSlaBreached(false);
        if (session.getAssignedTo() != null) {
            incident.setIncidentAssignedTo(session.getAssignedTo());
        }

        UtmIncident savedIncident = incidentRepository.save(incident);

        // Mark session converted
        session.setStatus("CONVERTED");
        session.setIncidentId(savedIncident.getId());
        session.setUpdatedAt(Instant.now());
        sessionRepository.save(session);

        log.info("Converted investigation session id={} to incident id={} by user={}",
                sessionId, savedIncident.getId(), currentUser);

        return savedIncident.getId();
    }

    // ── Mapping helpers ───────────────────────────────────────────────────────

    private InvestigationSessionDTO toDTO(UtmInvestigationSession s) {
        return toDTO(s, Math.toIntExact(itemRepository.countBySessionId(s.getId())));
    }

    private InvestigationSessionDTO toDTO(UtmInvestigationSession s, int itemCount) {
        return new InvestigationSessionDTO(
                s.getId(),
                s.getVersion(),
                s.getTenantId(),
                s.getSessionName(),
                s.getDescription(),
                s.getStatus(),
                s.getCreatedBy(),
                s.getAssignedTo(),
                s.getIncidentId(),
                s.getCreatedAt(),
                s.getUpdatedAt(),
                itemCount
        );
    }

    private UtmInvestigationSession loadAuthorizedSession(Long id, String currentUser, boolean isAdminOrManager) {
        Long tenantId = TenantContext.getClientId();
        UtmInvestigationSession session = tenantId == null
            ? sessionRepository.findById(id).orElse(null)
            : sessionRepository.findByIdAndTenantId(id, tenantId).orElse(null);
        if (session == null) {
            // Do not reveal whether a record exists in another tenant.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Investigation session not found: " + id);
        }
        if (!isAdminOrManager && !currentUser.equals(session.getCreatedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Investigation session is outside the authorized scope");
        }
        return session;
    }

    private void assertExpectedVersion(UtmInvestigationSession existing, Long expectedVersion) {
        if (expectedVersion == null) {
            throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,
                "version is required for investigation updates");
        }
        if (!expectedVersion.equals(existing.getVersion())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Investigation was modified by another user; refresh before retrying");
        }
    }

    private SessionItemDTO toItemDTO(UtmSessionItem item) {
        return new SessionItemDTO(
                item.getId(),
                item.getSession().getId(),
                item.getItemType(),
                item.getItemRef(),
                item.getItemSnapshot(),
                item.getNote(),
                item.getAddedBy(),
                item.getAddedAt()
        );
    }

    private SessionTaskDTO toTaskDTO(UtmSessionTask task) {
        return new SessionTaskDTO(
                task.getId(),
                task.getSession().getId(),
                task.getTitle(),
                task.getStatus(),
                task.getAssignee(),
                task.getExternalTicketUrl(),
                task.getCreatedBy(),
                task.getCreatedAt(),
                task.getUpdatedAt()
        );
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static String normalizeTicketUrl(String value) {
        String trimmed = blankToNull(value);
        if (trimmed == null) {
            return null;
        }
        String lower = trimmed.toLowerCase();
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "externalTicketUrl must be an http(s) URL");
        }
        return trimmed;
    }
}
