package com.hivearmor.service;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.dto.HiveTenantDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HiveTenantServiceTest {

    @Mock
    private HaClientRepository clientRepository;

    private HiveTenantService service;

    @BeforeEach
    void setUp() {
        service = new HiveTenantService(clientRepository);
    }

    @Test
    void findAllMapsHaClientToDto() {
        HaClient client = new HaClient();
        client.setId(7L);
        client.setName("Acme");
        client.setClientPrefix("acme");
        client.setContactEmail("soc@acme.example");
        when(clientRepository.findAll(any(PageRequest.class)))
            .thenReturn(new PageImpl<>(List.of(client)));

        Page<HiveTenantDTO> page = service.findAll(PageRequest.of(0, 20));

        assertThat(page.getContent()).hasSize(1);
        HiveTenantDTO dto = page.getContent().get(0);
        assertThat(dto.getId()).isEqualTo(7L);
        assertThat(dto.getName()).isEqualTo("Acme");
        assertThat(dto.getPrefix()).isEqualTo("acme");
        assertThat(dto.getDomain()).isEqualTo("soc@acme.example");
        assertThat(dto.getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void createPersistsHaClientAndRejectsDuplicatePrefix() {
        when(clientRepository.existsByClientPrefix("north")).thenReturn(false);
        when(clientRepository.save(any(HaClient.class))).thenAnswer(inv -> {
            HaClient c = inv.getArgument(0);
            c.setId(42L);
            return c;
        });

        HiveTenantDTO req = new HiveTenantDTO();
        req.setName("Northwind");
        req.setPrefix("north");
        req.setDomain("ops@north.example");

        HiveTenantDTO created = service.create(req);
        assertThat(created.getId()).isEqualTo(42L);
        assertThat(created.getStatus()).isEqualTo("ACTIVE");

        ArgumentCaptor<HaClient> captor = ArgumentCaptor.forClass(HaClient.class);
        verify(clientRepository).save(captor.capture());
        assertThat(captor.getValue().isMsspManaged()).isFalse();
        assertThat(captor.getValue().getClientPrefix()).isEqualTo("north");

        when(clientRepository.existsByClientPrefix("north")).thenReturn(true);
        assertThatThrownBy(() -> service.create(req))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode().value()).isEqualTo(409));
    }

    @Test
    void findByIdEmptyWhenMissing() {
        when(clientRepository.findById(99L)).thenReturn(Optional.empty());
        assertThat(service.findById(99L)).isEmpty();
    }
}
