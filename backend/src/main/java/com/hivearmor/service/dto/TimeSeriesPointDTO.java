package com.hivearmor.service.dto;

/**
 * DTO representing a single time-series data point for FIM change events.
 * Each point covers one time bucket and breaks out the count of each change type.
 *
 * <p>No Lombok — every accessor is an explicit public method.
 */
public class TimeSeriesPointDTO {

    private String timestamp;
    private int create;
    private int modify;
    private int delete;
    private int rename;

    // ---- Getters ----

    public String getTimestamp() {
        return timestamp;
    }

    public int getCreate() {
        return create;
    }

    public int getModify() {
        return modify;
    }

    public int getDelete() {
        return delete;
    }

    public int getRename() {
        return rename;
    }

    // ---- Setters ----

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }

    public void setCreate(int create) {
        this.create = create;
    }

    public void setModify(int modify) {
        this.modify = modify;
    }

    public void setDelete(int delete) {
        this.delete = delete;
    }

    public void setRename(int rename) {
        this.rename = rename;
    }
}
