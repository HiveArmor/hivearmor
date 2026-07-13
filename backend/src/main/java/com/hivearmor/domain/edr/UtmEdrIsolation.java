package com.hivearmor.domain.edr;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_edr_isolation")
public class UtmEdrIsolation implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agent_id", length = 150, nullable = false)
    private String agentId;

    @Column(name = "hostname", length = 200)
    private String hostname;

    @Column(name = "isolation_type", length = 30, nullable = false)
    private String isolationType = "FULL";

    @Column(name = "status", length = 20, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "allowed_ips", columnDefinition = "TEXT")
    private String allowedIps;

    @Column(name = "isolated_at", nullable = false)
    private Instant isolatedAt;

    @Column(name = "lifted_at")
    private Instant liftedAt;

    @Column(name = "actioned_by", length = 100, nullable = false)
    private String actionedBy;

    @Column(name = "edr_event_id")
    private Long edrEventId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }
    public String getHostname() { return hostname; }
    public void setHostname(String hostname) { this.hostname = hostname; }
    public String getIsolationType() { return isolationType; }
    public void setIsolationType(String isolationType) { this.isolationType = isolationType; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getAllowedIps() { return allowedIps; }
    public void setAllowedIps(String allowedIps) { this.allowedIps = allowedIps; }
    public Instant getIsolatedAt() { return isolatedAt; }
    public void setIsolatedAt(Instant isolatedAt) { this.isolatedAt = isolatedAt; }
    public Instant getLiftedAt() { return liftedAt; }
    public void setLiftedAt(Instant liftedAt) { this.liftedAt = liftedAt; }
    public String getActionedBy() { return actionedBy; }
    public void setActionedBy(String actionedBy) { this.actionedBy = actionedBy; }
    public Long getEdrEventId() { return edrEventId; }
    public void setEdrEventId(Long edrEventId) { this.edrEventId = edrEventId; }
}
