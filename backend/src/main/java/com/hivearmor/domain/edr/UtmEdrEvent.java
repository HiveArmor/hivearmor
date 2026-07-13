package com.hivearmor.domain.edr;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_edr_event")
public class UtmEdrEvent implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agent_id", length = 150, nullable = false)
    private String agentId;

    @Column(name = "hostname", length = 200)
    private String hostname;

    @Column(name = "event_type", length = 50, nullable = false)
    private String eventType;

    @Column(name = "event_time", nullable = false)
    private Instant eventTime;

    @Column(name = "process_name", length = 500)
    private String processName;

    @Column(name = "process_pid")
    private Integer processPid;

    @Column(name = "process_path", columnDefinition = "TEXT")
    private String processPath;

    @Column(name = "process_cmdline", columnDefinition = "TEXT")
    private String processCmdline;

    @Column(name = "process_user", length = 200)
    private String processUser;

    @Column(name = "process_hash", length = 128)
    private String processHash;

    @Column(name = "file_path", columnDefinition = "TEXT")
    private String filePath;

    @Column(name = "file_hash", length = 128)
    private String fileHash;

    @Column(name = "network_src_ip", length = 45)
    private String networkSrcIp;

    @Column(name = "network_dst_ip", length = 45)
    private String networkDstIp;

    @Column(name = "network_dst_port")
    private Integer networkDstPort;

    @Column(name = "network_proto", length = 10)
    private String networkProto;

    @Column(name = "matched_rule_id")
    private Long matchedRuleId;

    @Column(name = "severity", length = 20, nullable = false)
    private String severity = "INFO";

    @Column(name = "raw_event", columnDefinition = "TEXT")
    private String rawEvent;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }
    public String getHostname() { return hostname; }
    public void setHostname(String hostname) { this.hostname = hostname; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public Instant getEventTime() { return eventTime; }
    public void setEventTime(Instant eventTime) { this.eventTime = eventTime; }
    public String getProcessName() { return processName; }
    public void setProcessName(String processName) { this.processName = processName; }
    public Integer getProcessPid() { return processPid; }
    public void setProcessPid(Integer processPid) { this.processPid = processPid; }
    public String getProcessPath() { return processPath; }
    public void setProcessPath(String processPath) { this.processPath = processPath; }
    public String getProcessCmdline() { return processCmdline; }
    public void setProcessCmdline(String processCmdline) { this.processCmdline = processCmdline; }
    public String getProcessUser() { return processUser; }
    public void setProcessUser(String processUser) { this.processUser = processUser; }
    public String getProcessHash() { return processHash; }
    public void setProcessHash(String processHash) { this.processHash = processHash; }
    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }
    public String getFileHash() { return fileHash; }
    public void setFileHash(String fileHash) { this.fileHash = fileHash; }
    public String getNetworkSrcIp() { return networkSrcIp; }
    public void setNetworkSrcIp(String networkSrcIp) { this.networkSrcIp = networkSrcIp; }
    public String getNetworkDstIp() { return networkDstIp; }
    public void setNetworkDstIp(String networkDstIp) { this.networkDstIp = networkDstIp; }
    public Integer getNetworkDstPort() { return networkDstPort; }
    public void setNetworkDstPort(Integer networkDstPort) { this.networkDstPort = networkDstPort; }
    public String getNetworkProto() { return networkProto; }
    public void setNetworkProto(String networkProto) { this.networkProto = networkProto; }
    public Long getMatchedRuleId() { return matchedRuleId; }
    public void setMatchedRuleId(Long matchedRuleId) { this.matchedRuleId = matchedRuleId; }
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
    public String getRawEvent() { return rawEvent; }
    public void setRawEvent(String rawEvent) { this.rawEvent = rawEvent; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
