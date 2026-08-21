package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * DTO matching the frontend EntityEventDTO TypeScript type.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveEntityEventDTO {

    private String timestamp;  // ISO 8601
    private String source;
    private String message;

    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
