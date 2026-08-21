package com.hivearmor.service;

import com.hivearmor.domain.HiveRetentionPolicy;
import com.hivearmor.repository.HiveRetentionPolicyRepository;
import com.hivearmor.service.dto.HiveRetentionPolicyDTO;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HiveRetentionPolicyServiceTest {

    @Test
    void enrollmentAuditRejectsArchiveTargetsAndMarksSourceImmutable() {
        HiveRetentionPolicyRepository repository = mock(HiveRetentionPolicyRepository.class);
        when(repository.findByDataType("ENROLLMENT_AUDIT")).thenReturn(Optional.empty());
        when(repository.save(any(HiveRetentionPolicy.class))).thenAnswer(invocation -> invocation.getArgument(0));
        HiveRetentionPolicyService service = new HiveRetentionPolicyService(repository);

        HiveRetentionPolicyDTO dto = new HiveRetentionPolicyDTO();
        dto.setName("Enrollment audit");
        dto.setRetentionDays(2555);
        dto.setArchiveTarget("S3");

        assertThatThrownBy(() -> service.upsert("ENROLLMENT_AUDIT", dto))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("append-only");

        dto.setArchiveTarget("NONE");
        HiveRetentionPolicyDTO saved = service.upsert("ENROLLMENT_AUDIT", dto);
        assertThat(saved.getArchiveTarget()).isEqualTo("NONE");
        assertThat(saved.getSourceImmutable()).isTrue();
        assertThat(saved.getCompressionEnabled()).isFalse();
    }
}
