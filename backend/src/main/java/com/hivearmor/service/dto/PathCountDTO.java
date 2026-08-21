package com.hivearmor.service.dto;

/**
 * DTO representing a file path and the number of FIM change events observed on it.
 *
 * <p>No Lombok — every accessor is an explicit public method.
 */
public class PathCountDTO {

    private String path;
    private int count;

    // ---- Getters ----

    public String getPath() {
        return path;
    }

    public int getCount() {
        return count;
    }

    // ---- Setters ----

    public void setPath(String path) {
        this.path = path;
    }

    public void setCount(int count) {
        this.count = count;
    }
}
