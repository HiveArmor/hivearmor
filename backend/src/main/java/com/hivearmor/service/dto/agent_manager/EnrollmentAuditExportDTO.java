package com.hivearmor.service.dto.agent_manager;

import java.util.List;

public record EnrollmentAuditExportDTO(
    List<EnrollmentAuditEventDTO> rows,
    long total,
    boolean truncated
) { }
