package com.hivearmor.compliance.service;

import com.hivearmor.compliance.dto.CreatePoamItemRequest;
import com.hivearmor.compliance.dto.PoamItemDTO;
import com.hivearmor.compliance.dto.UpdatePoamItemRequest;
import com.hivearmor.compliance.entity.HaPoamItem;
import com.hivearmor.repository.compliance.HaPoamItemRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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

    @Test
    void createPersistsOpenPoamItem() {
        when(repository.save(any(HaPoamItem.class))).thenAnswer(invocation -> {
            HaPoamItem saved = invocation.getArgument(0);
            saved.setId(99L);
            saved.setCreatedAt(Instant.parse("2026-08-31T12:00:00Z"));
            saved.setUpdatedAt(Instant.parse("2026-08-31T12:00:00Z"));
            return saved;
        });

        PoamItemDTO dto = service.create(
            new CreatePoamItemRequest("1", 42L, "Enable MFA", "Gap", LocalDate.of(2026, 9, 30), "admin", null)
        );

        assertThat(dto.id()).isEqualTo(99L);
        assertThat(dto.status()).isEqualTo("open");
        assertThat(dto.title()).isEqualTo("Enable MFA");
    }

    @Test
    void updateChangesStatusAndAssignee() {
        HaPoamItem existing = new HaPoamItem();
        existing.setId(7L);
        existing.setFrameworkId("1");
        existing.setControlId("42");
        existing.setTitle("Patch gap");
        existing.setStatus("open");
        existing.setCreatedAt(Instant.parse("2026-08-01T00:00:00Z"));
        existing.setUpdatedAt(Instant.parse("2026-08-15T00:00:00Z"));

        when(repository.findById(7L)).thenReturn(Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);

        PoamItemDTO dto = service.update(
            7L,
            new UpdatePoamItemRequest(null, "closed", "soc-manager", LocalDate.of(2026, 10, 1))
        );

        assertThat(dto.status()).isEqualTo("closed");
        assertThat(dto.assignee()).isEqualTo("soc-manager");
        assertThat(dto.dueDate()).isEqualTo(LocalDate.of(2026, 10, 1));
    }

    @Test
    void deleteThrowsWhenMissing() {
        when(repository.existsById(404L)).thenReturn(false);
        assertThatThrownBy(() -> service.delete(404L)).isInstanceOf(EntityNotFoundException.class);
    }
}
