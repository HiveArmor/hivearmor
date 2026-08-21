package com.hivearmor.service.dto;

/**
 * DTO representing a single process node in the EDR process tree.
 *
 * Fields map to the OpenSearch process event fields returned by the
 * v3-hive-event-* index pattern for a given agent and time window.
 *
 * No Lombok — all accessors are explicit public methods.
 */
public class ProcessNodeDTO {

    private long pid;
    private long ppid;
    private String name;
    private String cmdline;
    private String user;
    private String startTime;
    private String endTime;
    private boolean suspicious;

    public long getPid() {
        return pid;
    }

    public void setPid(long pid) {
        this.pid = pid;
    }

    public long getPpid() {
        return ppid;
    }

    public void setPpid(long ppid) {
        this.ppid = ppid;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCmdline() {
        return cmdline;
    }

    public void setCmdline(String cmdline) {
        this.cmdline = cmdline;
    }

    public String getUser() {
        return user;
    }

    public void setUser(String user) {
        this.user = user;
    }

    public String getStartTime() {
        return startTime;
    }

    public void setStartTime(String startTime) {
        this.startTime = startTime;
    }

    public String getEndTime() {
        return endTime;
    }

    public void setEndTime(String endTime) {
        this.endTime = endTime;
    }

    public boolean isSuspicious() {
        return suspicious;
    }

    public void setSuspicious(boolean suspicious) {
        this.suspicious = suspicious;
    }
}
