package com.hivearmor.service.compliance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import com.hivearmor.service.dto.compliance.ComplianceReportDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link ComplianceReportGenerationService}.
 *
 * <p>Verifies that {@code tenantPrefix} and {@code tenantName} are correctly
 * populated on {@link ComplianceReportDto} from the {@code ha_client} row
 * identified by the caller-supplied {@code tenantId} (Requirements 7.1–7.5).
 */
@ExtendWith(MockitoExtension.class)
class ComplianceReportGenerationServiceTest {

    private static final Long   TENANT_ID = 10L;
    private static final String PREFIX    = "acme";
    private static final String NAME      = "Acme Corp";

    @Mock
    private ComplianceResultRepository complianceResultRepository;

    @Mock
    private MsspIndexResolver msspIndexResolver;

    @Mock
    private HaClientRepository haClientRepository;

    @InjectMocks
    private ComplianceReportGenerationService service;

    // -------------------------------------------------------------------------
    // tenantId is always echoed back (Requirement 7.1 / 7.2 pre-condition)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("generate: returned DTO always carries the supplied tenantId")
    void generate_tenantIdIsPopulated() {
        HaClient tenant = buildClient(TENANT_ID, PREFIX, NAME);
        when(haClientRepository.findById(TENANT_ID)).thenReturn(Optional.of(tenant));

        ComplianceReportDto report = service.generate(TENANT_ID);

        assertThat(report.getTenantId()).isEqualTo(TENANT_ID);
    }

    // -------------------------------------------------------------------------
    // tenantPrefix populated from ha_client.client_prefix (Requirement 7.3, 7.4)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("generate: tenantPrefix is populated from ha_client.client_prefix — Req 7.3, 7.4")
    void generate_tenantPrefixPopulatedFromClientRow() {
        HaClient tenant = buildClient(TENANT_ID, PREFIX, NAME);
        when(haClientRepository.findById(TENANT_ID)).thenReturn(Optional.of(tenant));

        ComplianceReportDto report = service.generate(TENANT_ID);

        assertThat(report.getTenantPrefix())
                .as("tenantPrefix must equal ha_client.client_prefix")
                .isEqualTo(PREFIX);
    }

    // -------------------------------------------------------------------------
    // tenantName populated from ha_client.name (Requirement 7.3, 7.4)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("generate: tenantName is populated from ha_client.name — Req 7.3, 7.4")
    void generate_tenantNamePopulatedFromClientRow() {
        HaClient tenant = buildClient(TENANT_ID, PREFIX, NAME);
        when(haClientRepository.findById(TENANT_ID)).thenReturn(Optional.of(tenant));

        ComplianceReportDto report = service.generate(TENANT_ID);

        assertThat(report.getTenantName())
                .as("tenantName must equal ha_client.name")
                .isEqualTo(NAME);
    }

    // -------------------------------------------------------------------------
    // NULL client_prefix → tenantPrefix is null, report still valid (Requirement 7.5)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("generate: tenantPrefix is null when ha_client.client_prefix is NULL — Req 7.5")
    void generate_tenantPrefixIsNullWhenClientPrefixIsNull() {
        HaClient tenant = buildClient(TENANT_ID, null /* no prefix */, NAME);
        when(haClientRepository.findById(TENANT_ID)).thenReturn(Optional.of(tenant));

        ComplianceReportDto report = service.generate(TENANT_ID);

        assertThat(report.getTenantPrefix())
                .as("tenantPrefix must be null when ha_client.client_prefix is NULL")
                .isNull();
        // Report generation must still succeed — we reached this line, so it did.
        assertThat(report.getTenantId()).isEqualTo(TENANT_ID);
    }

    @Test
    @DisplayName("generate: tenantName is null when ha_client.name is NULL and report still succeeds — Req 7.5")
    void generate_tenantNameIsNullWhenNameIsNull() {
        HaClient tenant = buildClient(TENANT_ID, PREFIX, null /* no name */);
        when(haClientRepository.findById(TENANT_ID)).thenReturn(Optional.of(tenant));

        ComplianceReportDto report = service.generate(TENANT_ID);

        assertThat(report.getTenantName()).isNull();
        assertThat(report.getTenantId()).isEqualTo(TENANT_ID);
    }

    // -------------------------------------------------------------------------
    // @JsonProperty keys are exactly "tenantPrefix" and "tenantName" (Requirement 7.4)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("generate: ComplianceReportDto serializes tenantPrefix as JSON key 'tenantPrefix' — Req 7.4")
    void generate_tenantPrefixSerializesWithCorrectJsonKey() throws Exception {
        HaClient tenant = buildClient(TENANT_ID, PREFIX, NAME);
        when(haClientRepository.findById(TENANT_ID)).thenReturn(Optional.of(tenant));

        ComplianceReportDto report = service.generate(TENANT_ID);

        ObjectMapper mapper = new ObjectMapper();
        String json = mapper.writeValueAsString(report);

        assertThat(json)
                .as("JSON must contain exact key 'tenantPrefix'")
                .contains("\"tenantPrefix\":");
        assertThat(json)
                .as("JSON must contain exact key 'tenantName'")
                .contains("\"tenantName\":");
    }

    // -------------------------------------------------------------------------
    // haClientRepository.findById is called with the supplied tenantId
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("generate: HaClientRepository.findById is called exactly once with the tenantId")
    void generate_haClientRepositoryCalledWithTenantId() {
        HaClient tenant = buildClient(TENANT_ID, PREFIX, NAME);
        when(haClientRepository.findById(TENANT_ID)).thenReturn(Optional.of(tenant));

        service.generate(TENANT_ID);

        verify(haClientRepository, times(1)).findById(TENANT_ID);
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private static HaClient buildClient(Long id, String clientPrefix, String name) {
        HaClient c = new HaClient();
        c.setId(id);
        c.setClientPrefix(clientPrefix);
        c.setName(name);
        return c;
    }
}
