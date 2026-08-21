package com.hivearmor.service.dto.agent_manager;

import java.util.List;

public record EnrollmentAuditPageDTO(
    List<EnrollmentAuditEventDTO> rows,
    long total
) { }
