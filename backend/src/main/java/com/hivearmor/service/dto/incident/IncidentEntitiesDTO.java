package com.hivearmor.service.dto.incident;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class IncidentEntitiesDTO {

    private List<IpEntity> ips = new ArrayList<>();
    private List<UserEntity> users = new ArrayList<>();
    private List<HostEntity> hosts = new ArrayList<>();
    private List<ProcessEntity> processes = new ArrayList<>();

    public List<IpEntity> getIps() { return ips; }
    public void setIps(List<IpEntity> ips) { this.ips = ips; }

    public List<UserEntity> getUsers() { return users; }
    public void setUsers(List<UserEntity> users) { this.users = users; }

    public List<HostEntity> getHosts() { return hosts; }
    public void setHosts(List<HostEntity> hosts) { this.hosts = hosts; }

    public List<ProcessEntity> getProcesses() { return processes; }
    public void setProcesses(List<ProcessEntity> processes) { this.processes = processes; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class IpEntity {
        private String ip;
        private String country;
        private String asn;
        private boolean isMalicious;
        private Integer riskScore;
        private List<String> alerts = new ArrayList<>();

        public String getIp() { return ip; }
        public void setIp(String ip) { this.ip = ip; }

        public String getCountry() { return country; }
        public void setCountry(String country) { this.country = country; }

        public String getAsn() { return asn; }
        public void setAsn(String asn) { this.asn = asn; }

        public boolean isMalicious() { return isMalicious; }
        public void setMalicious(boolean malicious) { isMalicious = malicious; }

        public Integer getRiskScore() { return riskScore; }
        public void setRiskScore(Integer riskScore) { this.riskScore = riskScore; }

        public List<String> getAlerts() { return alerts; }
        public void setAlerts(List<String> alerts) { this.alerts = alerts; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class UserEntity {
        private String username;
        private String domain;
        private String lastSeen;
        private int anomalyCount;

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getDomain() { return domain; }
        public void setDomain(String domain) { this.domain = domain; }

        public String getLastSeen() { return lastSeen; }
        public void setLastSeen(String lastSeen) { this.lastSeen = lastSeen; }

        public int getAnomalyCount() { return anomalyCount; }
        public void setAnomalyCount(int anomalyCount) { this.anomalyCount = anomalyCount; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class HostEntity {
        private String hostname;
        private String os;
        private String criticality;
        private String owner;

        public String getHostname() { return hostname; }
        public void setHostname(String hostname) { this.hostname = hostname; }

        public String getOs() { return os; }
        public void setOs(String os) { this.os = os; }

        public String getCriticality() { return criticality; }
        public void setCriticality(String criticality) { this.criticality = criticality; }

        public String getOwner() { return owner; }
        public void setOwner(String owner) { this.owner = owner; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ProcessEntity {
        private String name;
        private String path;
        private String commandLine;
        private String parentProcess;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }

        public String getCommandLine() { return commandLine; }
        public void setCommandLine(String commandLine) { this.commandLine = commandLine; }

        public String getParentProcess() { return parentProcess; }
        public void setParentProcess(String parentProcess) { this.parentProcess = parentProcess; }
    }
}
