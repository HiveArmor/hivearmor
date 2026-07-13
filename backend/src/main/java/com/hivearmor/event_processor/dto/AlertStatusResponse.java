package com.hivearmor.event_processor.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AlertStatusResponse {
    private int statusCode;
    private String status;
}

