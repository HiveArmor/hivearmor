package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.PoamItemDTO;
import com.hivearmor.compliance.entity.HaPoamItem;
import com.hivearmor.repository.compliance.HaPoamItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HaPoamItemServiceTest {

    private static final Clock FIXED_CLOCK =
        Clock.fixed(Instant.parse("2026-08-31T12:00:00Z"), ZoneOffset.UTC);

    private HaPoamItemRepository repository;
    private HaPoamItemService service;

    @BeforeEach
    void setUp() {
        repository = mock(HaPoamItemRepository.class);
        service = new HaPoamItemService(repository, FIXED_CLOCK);
    }

    @Test
    void listByControlIdQueriesStringControlKeyAndProjectsDto() {
        HaPoamItem item = new HaPoamItem();
        item.setId(7L);
        item.setFrameworkId("1");
        item.setControlId("42");
        item.setTitle("Patch gap");
        item.setDescription("Missing patch cadence");
        item.setDueDate(LocalDate.of(2026, 8, 1));
        item.setStatus("open");
        item.setAssignee("analyst");
        item.setCreatedAt(Instant.parse("2026-08-01T00:00:00Z"));
        item.setUpdatedAt(Instant.parse("2026-08-15T00:00:00Z"));

        PageRequest pageable = PageRequest.of(0, 20);
        when(repository.findByControlId(eq("42"), eq(pageable)))
            .thenReturn(new PageImpl<>(List.of(item), pageable, 1));

        var page = service.listByControlId(42L, pageable);

        verify(repository).findByControlId("42", pageable);
        assertThat(page.getTotalElements()).isEqualTo(1);
        PoamItemDTO dto = page.getContent().get(0);
        assertThat(dto.id()).isEqualTo(7L);
        assertThat(dto.controlId()).isEqualTo("42");
        assertThat(dto.overdue()).isTrue();
    }
}
