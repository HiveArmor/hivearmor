package com.hivearmor.service.dto.alert;

import com.hivearmor.domain.shared_types.alert.UtmAlert;
import java.util.List;

/**
 * Result DTO for alert list queries.
 * Contains the page of alerts and the total count across all pages.
 */
public record AlertListResult(List<UtmAlert> alerts, long total) {}
