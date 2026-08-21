package com.hivearmor.service;

import com.hivearmor.domain.HiveThreatIoc;
import com.hivearmor.repository.HiveThreatIocRepository;
import com.hivearmor.service.dto.TlpFilteredIocDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * HiveArmor unit tests for ThreatIntelLookupService TLP-aware redaction.
 */
@ExtendWith(MockitoExtension.class)
class ThreatIntelLookupServiceTest {

    @Mock
    private HiveThreatIocRepository iocRepository;

    private ThreatIntelLookupService service;

    @BeforeEach
    void setUp() {
        service = new ThreatIntelLookupService(iocRepository);
    }

    // ---- lookupIOCForUser TLP tests ----

    @Test
    void lookupIOCForUser_whiteIoc_visibleToAll() {
        HiveThreatIoc ioc = buildIoc("ip", "1.2.3.4", "WHITE");
        when(iocRepository.findFirstByIocValueAndActiveTrue("1.2.3.4")).thenReturn(Optional.of(ioc));

        Optional<TlpFilteredIocDTO> result = service.lookupIOCForUser("1.2.3.4", List.of("ROLE_USER"));

        assertThat(result).isPresent();
        assertThat(result.get().getIocValue()).isEqualTo("1.2.3.4");
        assertThat(result.get().isRestricted()).isFalse();
    }

    @Test
    void lookupIOCForUser_redIoc_restrictedForNonPrivileged() {
        HiveThreatIoc ioc = buildIoc("ip", "9.9.9.9", "RED");
        when(iocRepository.findFirstByIocValueAndActiveTrue("9.9.9.9")).thenReturn(Optional.of(ioc));

        Optional<TlpFilteredIocDTO> result = service.lookupIOCForUser("9.9.9.9", List.of("ROLE_USER"));

        assertThat(result).isPresent();
        assertThat(result.get().getIocValue()).isNull();
        assertThat(result.get().isRestricted()).isTrue();
    }

    @Test
    void lookupIOCForUser_redIoc_visibleForAdmin() {
        HiveThreatIoc ioc = buildIoc("ip", "9.9.9.9", "RED");
        when(iocRepository.findFirstByIocValueAndActiveTrue("9.9.9.9")).thenReturn(Optional.of(ioc));

        Optional<TlpFilteredIocDTO> result = service.lookupIOCForUser("9.9.9.9", List.of("ROLE_ADMIN"));

        assertThat(result).isPresent();
        assertThat(result.get().getIocValue()).isEqualTo("9.9.9.9");
        assertThat(result.get().isRestricted()).isFalse();
    }

    @Test
    void lookupIOCForUser_amberIoc_redactedForNonPrivileged() {
        HiveThreatIoc ioc = buildIoc("ip", "1.2.3.4", "AMBER");
        when(iocRepository.findFirstByIocValueAndActiveTrue("1.2.3.4")).thenReturn(Optional.of(ioc));

        Optional<TlpFilteredIocDTO> result = service.lookupIOCForUser("1.2.3.4", List.of("ROLE_USER"));

        assertThat(result).isPresent();
        assertThat(result.get().getIocValue()).isEqualTo("1.2.3.*");
        assertThat(result.get().isRestricted()).isFalse();
    }

    @Test
    void lookupIOCForUser_amberIoc_visibleForThreatAnalyst() {
        HiveThreatIoc ioc = buildIoc("ip", "1.2.3.4", "AMBER");
        when(iocRepository.findFirstByIocValueAndActiveTrue("1.2.3.4")).thenReturn(Optional.of(ioc));

        Optional<TlpFilteredIocDTO> result = service.lookupIOCForUser("1.2.3.4", List.of("ROLE_THREAT_ANALYST"));

        assertThat(result).isPresent();
        assertThat(result.get().getIocValue()).isEqualTo("1.2.3.4");
        assertThat(result.get().isRestricted()).isFalse();
    }

    // ---- redact method tests ----

    @Test
    void redact_ip() {
        assertThat(service.redact("1.2.3.4", "ip")).isEqualTo("1.2.3.*");
    }

    @Test
    void redact_domain() {
        assertThat(service.redact("evil.example.com", "domain")).isEqualTo("evil.example.*");
    }

    @Test
    void redact_url() {
        assertThat(service.redact("https://a.b/c", "url")).isEqualTo("https://[REDACTED]/c");
    }

    @Test
    void redact_email() {
        assertThat(service.redact("a@b.com", "email")).isEqualTo("a@[REDACTED]");
    }

    // ---- helpers ----

    private static HiveThreatIoc buildIoc(String type, String value, String tlp) {
        HiveThreatIoc ioc = new HiveThreatIoc();
        ioc.setId(1L);
        ioc.setIocType(type);
        ioc.setIocValue(value);
        ioc.setTlp(tlp);
        ioc.setConfidence(80);
        ioc.setActive(true);
        return ioc;
    }
}
