package com.hivearmor.web.rest;

import com.hivearmor.service.HiveRetentionPolicyService;
import com.hivearmor.service.dto.HiveRetentionPolicyDTO;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class HaRetentionPoliciesResourceTest {

    @Test
    void enrollmentAuditArchiveTargetIsRejectedWithoutCallingService() {
        HiveRetentionPolicyService service = mock(HiveRetentionPolicyService.class);
        HaRetentionPoliciesResource resource = new HaRetentionPoliciesResource(service);
        HiveRetentionPolicyDTO dto = new HiveRetentionPolicyDTO();
        dto.setName("Enrollment audit");
        dto.setDataType("ENROLLMENT_AUDIT");
        dto.setRetentionDays(2555);
        dto.setArchiveTarget("S3");

        ResponseEntity<HiveRetentionPolicyDTO> response = resource.upsert("ENROLLMENT_AUDIT", dto);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        verifyNoInteractions(service);
    }
}
