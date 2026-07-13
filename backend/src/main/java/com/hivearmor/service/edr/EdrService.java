package com.hivearmor.service.edr;

import com.hivearmor.domain.edr.*;
import com.hivearmor.repository.edr.*;
import com.hivearmor.service.dto.edr.*;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import io.grpc.stub.StreamObserver;
import com.hivearmor.service.grpc.CommandResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class EdrService {

    private final UtmEdrRuleRepository ruleRepo;
    private final UtmEdrEventRepository eventRepo;
    private final UtmEdrQuarantineRepository quarantineRepo;
    private final UtmEdrIsolationRepository isolationRepo;
    private final IncidentResponseCommandService commandService;

    public EdrService(UtmEdrRuleRepository ruleRepo,
                      UtmEdrEventRepository eventRepo,
                      UtmEdrQuarantineRepository quarantineRepo,
                      UtmEdrIsolationRepository isolationRepo,
                      IncidentResponseCommandService commandService) {
        this.ruleRepo = ruleRepo;
        this.eventRepo = eventRepo;
        this.quarantineRepo = quarantineRepo;
        this.isolationRepo = isolationRepo;
        this.commandService = commandService;
    }

    // ---- Rules ----

    public List<EdrRuleDTO> listRules() {
        return ruleRepo.findAll(Sort.by("createdAt").descending()).stream()
            .map(this::toRuleDTO).collect(Collectors.toList());
    }

    public Optional<EdrRuleDTO> getRule(Long id) {
        return ruleRepo.findById(id).map(this::toRuleDTO);
    }

    public EdrRuleDTO createRule(EdrRuleDTO dto, String createdBy) {
        UtmEdrRule r = new UtmEdrRule();
        r.setRuleName(dto.getRuleName());
        r.setDescription(dto.getDescription());
        r.setEventType(dto.getEventType());
        r.setPlatform(dto.getPlatform() != null ? dto.getPlatform() : "ALL");
        r.setConditionJson(dto.getConditionJson() != null ? dto.getConditionJson() : "{}");
        r.setAction(dto.getAction());
        r.setSeverity(dto.getSeverity() != null ? dto.getSeverity() : "MEDIUM");
        r.setIsActive(dto.getIsActive() != null ? dto.getIsActive() : true);
        r.setCreatedBy(createdBy);
        r.setCreatedAt(Instant.now());
        return toRuleDTO(ruleRepo.save(r));
    }

    public EdrRuleDTO updateRule(Long id, EdrRuleDTO dto) {
        UtmEdrRule r = ruleRepo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("EDR rule not found: " + id));
        if (dto.getRuleName() != null) r.setRuleName(dto.getRuleName());
        if (dto.getDescription() != null) r.setDescription(dto.getDescription());
        if (dto.getEventType() != null) r.setEventType(dto.getEventType());
        if (dto.getPlatform() != null) r.setPlatform(dto.getPlatform());
        if (dto.getConditionJson() != null) r.setConditionJson(dto.getConditionJson());
        if (dto.getAction() != null) r.setAction(dto.getAction());
        if (dto.getSeverity() != null) r.setSeverity(dto.getSeverity());
        if (dto.getIsActive() != null) r.setIsActive(dto.getIsActive());
        r.setUpdatedAt(Instant.now());
        return toRuleDTO(ruleRepo.save(r));
    }

    public void deleteRule(Long id) {
        ruleRepo.deleteById(id);
    }

    // ---- Events ----

    public Page<EdrEventDTO> queryEvents(String agentId, String eventType, String severity,
                                          Instant from, Instant to, int page, int size) {
        PageRequest pr = PageRequest.of(page, size, Sort.by("eventTime").descending());
        return eventRepo.findFiltered(agentId, eventType, severity, from, to, pr)
            .map(this::toEventDTO);
    }

    public EdrEventDTO ingestEvent(EdrEventDTO dto) {
        UtmEdrEvent e = new UtmEdrEvent();
        e.setAgentId(dto.getAgentId());
        e.setHostname(dto.getHostname());
        e.setEventType(dto.getEventType());
        e.setEventTime(dto.getEventTime() != null ? dto.getEventTime() : Instant.now());
        e.setProcessName(dto.getProcessName());
        e.setProcessPid(dto.getProcessPid());
        e.setProcessPath(dto.getProcessPath());
        e.setProcessCmdline(dto.getProcessCmdline());
        e.setProcessUser(dto.getProcessUser());
        e.setProcessHash(dto.getProcessHash());
        e.setFilePath(dto.getFilePath());
        e.setFileHash(dto.getFileHash());
        e.setNetworkSrcIp(dto.getNetworkSrcIp());
        e.setNetworkDstIp(dto.getNetworkDstIp());
        e.setNetworkDstPort(dto.getNetworkDstPort());
        e.setNetworkProto(dto.getNetworkProto());
        e.setMatchedRuleId(dto.getMatchedRuleId());
        e.setSeverity(dto.getSeverity() != null ? dto.getSeverity() : "INFO");
        e.setRawEvent(dto.getRawEvent());
        e.setCreatedAt(Instant.now());
        return toEventDTO(eventRepo.save(e));
    }

    // ---- Quarantine ----

    public Page<EdrQuarantineDTO> listQuarantine(String agentId, String status, int page, int size) {
        PageRequest pr = PageRequest.of(page, size, Sort.by("quarantinedAt").descending());
        if (agentId != null) {
            return quarantineRepo.findByAgentId(agentId, pr).map(this::toQuarantineDTO);
        }
        if (status != null) {
            return quarantineRepo.findByStatus(status, pr).map(this::toQuarantineDTO);
        }
        return quarantineRepo.findAll(pr).map(this::toQuarantineDTO);
    }

    public EdrQuarantineDTO quarantineFile(EdrQuarantineDTO dto, String actionedBy) {
        UtmEdrQuarantine q = new UtmEdrQuarantine();
        q.setAgentId(dto.getAgentId());
        q.setHostname(dto.getHostname());
        q.setFilePath(dto.getFilePath());
        q.setFileHash(dto.getFileHash());
        q.setFileSize(dto.getFileSize());
        q.setOriginalPath(dto.getOriginalPath());
        q.setReason(dto.getReason());
        q.setStatus("QUARANTINED");
        q.setQuarantinedAt(Instant.now());
        q.setActionedBy(actionedBy);
        q.setEdrEventId(dto.getEdrEventId());
        UtmEdrQuarantine saved = quarantineRepo.save(q);

        // Send QUARANTINE_FILE command to agent
        commandService.sendCommand(
            dto.getAgentId(),
            "EDR_QUARANTINE:" + dto.getFilePath(),
            "EDR_ACTION",
            saved.getId().toString(),
            "Quarantine file " + dto.getFilePath(),
            actionedBy,
            "",
            new StreamObserver<CommandResult>() {
                @Override public void onNext(CommandResult r) {
                    saved.setQuarantinePath(r.getResult());
                    quarantineRepo.save(saved);
                }
                @Override public void onError(Throwable t) {
                    saved.setStatus("FAILED");
                    saved.setReason("Command failed: " + t.getMessage());
                    quarantineRepo.save(saved);
                }
                @Override public void onCompleted() {}
            }
        );
        return toQuarantineDTO(saved);
    }

    public EdrQuarantineDTO restoreFile(Long quarantineId, String actionedBy) {
        UtmEdrQuarantine q = quarantineRepo.findById(quarantineId)
            .orElseThrow(() -> new IllegalArgumentException("Quarantine entry not found: " + quarantineId));
        q.setStatus("RESTORED");
        q.setRestoredAt(Instant.now());
        q.setActionedBy(actionedBy);
        quarantineRepo.save(q);

        commandService.sendCommand(
            q.getAgentId(),
            "EDR_RESTORE:" + quarantineId,
            "EDR_ACTION",
            quarantineId.toString(),
            "Restore quarantined file",
            actionedBy,
            "",
            new StreamObserver<CommandResult>() {
                @Override public void onNext(CommandResult r) {}
                @Override public void onError(Throwable t) {}
                @Override public void onCompleted() {}
            }
        );
        return toQuarantineDTO(q);
    }

    // ---- Isolation ----

    public Page<EdrIsolationDTO> listIsolations(String status, int page, int size) {
        PageRequest pr = PageRequest.of(page, size, Sort.by("isolatedAt").descending());
        if (status != null) {
            return isolationRepo.findByStatus(status, pr).map(this::toIsolationDTO);
        }
        return isolationRepo.findAll(pr).map(this::toIsolationDTO);
    }

    public EdrIsolationDTO isolateAgent(EdrIsolationDTO dto, String actionedBy) {
        if (isolationRepo.existsByAgentIdAndStatus(dto.getAgentId(), "ACTIVE")) {
            throw new IllegalStateException("Agent " + dto.getAgentId() + " is already isolated");
        }
        UtmEdrIsolation iso = new UtmEdrIsolation();
        iso.setAgentId(dto.getAgentId());
        iso.setHostname(dto.getHostname());
        iso.setIsolationType(dto.getIsolationType() != null ? dto.getIsolationType() : "FULL");
        iso.setStatus("ACTIVE");
        iso.setReason(dto.getReason());
        iso.setAllowedIps(dto.getAllowedIps());
        iso.setIsolatedAt(Instant.now());
        iso.setActionedBy(actionedBy);
        iso.setEdrEventId(dto.getEdrEventId());
        UtmEdrIsolation saved = isolationRepo.save(iso);

        String cmd = "EDR_ISOLATE:" + iso.getIsolationType();
        if (iso.getAllowedIps() != null) cmd += ":" + iso.getAllowedIps();
        commandService.sendCommand(
            dto.getAgentId(), cmd, "EDR_ACTION", saved.getId().toString(),
            "Isolate agent " + dto.getAgentId(), actionedBy, "",
            new StreamObserver<CommandResult>() {
                @Override public void onNext(CommandResult r) {}
                @Override public void onError(Throwable t) {
                    saved.setStatus("FAILED");
                    isolationRepo.save(saved);
                }
                @Override public void onCompleted() {}
            }
        );
        return toIsolationDTO(saved);
    }

    public EdrIsolationDTO liftIsolation(Long isolationId, String actionedBy) {
        UtmEdrIsolation iso = isolationRepo.findById(isolationId)
            .orElseThrow(() -> new IllegalArgumentException("Isolation not found: " + isolationId));
        iso.setStatus("LIFTED");
        iso.setLiftedAt(Instant.now());
        iso.setActionedBy(actionedBy);
        isolationRepo.save(iso);

        commandService.sendCommand(
            iso.getAgentId(), "EDR_LIFT_ISOLATION", "EDR_ACTION", isolationId.toString(),
            "Lift isolation for " + iso.getAgentId(), actionedBy, "",
            new StreamObserver<CommandResult>() {
                @Override public void onNext(CommandResult r) {}
                @Override public void onError(Throwable t) {}
                @Override public void onCompleted() {}
            }
        );
        return toIsolationDTO(iso);
    }

    // ---- Response actions ----

    public String killProcess(String agentId, Integer pid, String processName, String actionedBy) {
        String cmd = "EDR_KILL:" + pid;
        commandService.sendCommand(
            agentId, cmd, "EDR_ACTION", String.valueOf(pid),
            "Kill process " + pid + " (" + processName + ")", actionedBy, "",
            new StreamObserver<CommandResult>() {
                @Override public void onNext(CommandResult r) {}
                @Override public void onError(Throwable t) {}
                @Override public void onCompleted() {}
            }
        );
        return "Kill command dispatched for PID " + pid + " on agent " + agentId;
    }

    // ---- Mappers ----

    private EdrRuleDTO toRuleDTO(UtmEdrRule r) {
        EdrRuleDTO d = new EdrRuleDTO();
        d.setId(r.getId());
        d.setRuleName(r.getRuleName());
        d.setDescription(r.getDescription());
        d.setEventType(r.getEventType());
        d.setPlatform(r.getPlatform());
        d.setConditionJson(r.getConditionJson());
        d.setAction(r.getAction());
        d.setSeverity(r.getSeverity());
        d.setIsActive(r.getIsActive());
        d.setCreatedBy(r.getCreatedBy());
        d.setCreatedAt(r.getCreatedAt());
        d.setUpdatedAt(r.getUpdatedAt());
        return d;
    }

    private EdrEventDTO toEventDTO(UtmEdrEvent e) {
        EdrEventDTO d = new EdrEventDTO();
        d.setId(e.getId());
        d.setAgentId(e.getAgentId());
        d.setHostname(e.getHostname());
        d.setEventType(e.getEventType());
        d.setEventTime(e.getEventTime());
        d.setProcessName(e.getProcessName());
        d.setProcessPid(e.getProcessPid());
        d.setProcessPath(e.getProcessPath());
        d.setProcessCmdline(e.getProcessCmdline());
        d.setProcessUser(e.getProcessUser());
        d.setProcessHash(e.getProcessHash());
        d.setFilePath(e.getFilePath());
        d.setFileHash(e.getFileHash());
        d.setNetworkSrcIp(e.getNetworkSrcIp());
        d.setNetworkDstIp(e.getNetworkDstIp());
        d.setNetworkDstPort(e.getNetworkDstPort());
        d.setNetworkProto(e.getNetworkProto());
        d.setMatchedRuleId(e.getMatchedRuleId());
        d.setSeverity(e.getSeverity());
        d.setRawEvent(e.getRawEvent());
        d.setCreatedAt(e.getCreatedAt());
        return d;
    }

    private EdrQuarantineDTO toQuarantineDTO(UtmEdrQuarantine q) {
        EdrQuarantineDTO d = new EdrQuarantineDTO();
        d.setId(q.getId());
        d.setAgentId(q.getAgentId());
        d.setHostname(q.getHostname());
        d.setFilePath(q.getFilePath());
        d.setFileHash(q.getFileHash());
        d.setFileSize(q.getFileSize());
        d.setOriginalPath(q.getOriginalPath());
        d.setQuarantinePath(q.getQuarantinePath());
        d.setReason(q.getReason());
        d.setStatus(q.getStatus());
        d.setQuarantinedAt(q.getQuarantinedAt());
        d.setRestoredAt(q.getRestoredAt());
        d.setActionedBy(q.getActionedBy());
        d.setEdrEventId(q.getEdrEventId());
        return d;
    }

    private EdrIsolationDTO toIsolationDTO(UtmEdrIsolation iso) {
        EdrIsolationDTO d = new EdrIsolationDTO();
        d.setId(iso.getId());
        d.setAgentId(iso.getAgentId());
        d.setHostname(iso.getHostname());
        d.setIsolationType(iso.getIsolationType());
        d.setStatus(iso.getStatus());
        d.setReason(iso.getReason());
        d.setAllowedIps(iso.getAllowedIps());
        d.setIsolatedAt(iso.getIsolatedAt());
        d.setLiftedAt(iso.getLiftedAt());
        d.setActionedBy(iso.getActionedBy());
        d.setEdrEventId(iso.getEdrEventId());
        return d;
    }
}
