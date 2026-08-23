package com.hivearmor.service.hunt;

import com.hivearmor.domain.ResponseJob;
import com.hivearmor.repository.ResponseJobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Honesty tests for {@link ResponseJobService}: jobs must not claim successful
 * remote containment when ProcessCommand dispatch is not implemented.
 */
@ExtendWith(MockitoExtension.class)
class ResponseJobServiceTest {

    @Mock
    private ResponseJobRepository responseJobRepository;

    private ResponseJobService service;

    @BeforeEach
    void setUp() {
        service = new ResponseJobService(responseJobRepository);
        lenient().when(responseJobRepository.save(any(ResponseJob.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void executeAsync_marksJobUnsupported_notCompletedSuccess() {
        ResponseJob job = new ResponseJob();
        job.setId("job-1");
        job.setActionId("isolate_host");
        job.setTargetId("host-abc");
        job.setTargetType("host");
        job.setStatus("queued");
        job.setTenantId(1L);
        job.setCreatedBy("analyst");

        service.executeAsync(job);

        ArgumentCaptor<ResponseJob> captor = ArgumentCaptor.forClass(ResponseJob.class);
        verify(responseJobRepository, atLeastOnce()).save(captor.capture());
        ResponseJob last = captor.getAllValues().get(captor.getAllValues().size() - 1);

        assertThat(last.getStatus()).isEqualTo("unsupported");
        assertThat(last.getErrorCode()).isEqualTo("NOT_IMPLEMENTED");
        assertThat(last.getErrorMessage()).contains("not implemented");
        assertThat(last.getResult()).doesNotContainIgnoringCase("successfully");
        assertThat(last.getResult()).containsIgnoringCase("not implemented");
        assertThat(last.getCompletedAt()).isNotNull();
    }

    @Test
    void createJob_startsQueued() {
        ResponseJob saved = service.createJob(
            "kill_process", "pid-9", "process", "{}", "analyst", 1L, "alert-1");

        assertThat(saved.getStatus()).isEqualTo("queued");
        assertThat(saved.getId()).isNotBlank();
        assertThat(saved.getActionId()).isEqualTo("kill_process");
    }
}
