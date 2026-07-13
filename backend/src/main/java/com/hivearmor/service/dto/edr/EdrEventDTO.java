package com.hivearmor.service.dto.edr;

import java.time.Instant;

public class EdrEventDTO {
    private Long id;
    private String agentId;
    private String hostname;
    private String eventType;
    private Instant eventTime;
    private String processName;
    private Integer processPid;
    private String processPath;
    private String processCmdline;
    private String processUser;
    private String processHash;
    private String filePath;
    private String fileHash;
    private String networkSrcIp;
    private String networkDstIp;
    private Integer networkDstPort;
    private String networkProto;
    private Long matchedRuleId;
    private String severity;
    private String rawEvent;
    private Instant createdAt;

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
