package com.hivearmor.service;

import com.hivearmor.config.HaAirGapConfig;
import com.hivearmor.repository.HiveTaxiiFeedRepository;
import com.hivearmor.repository.HiveThreatIocRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * HiveArmor unit tests for TaxiiClientService STIX pattern parsing.
 */
@ExtendWith(MockitoExtension.class)
class TaxiiClientServiceTest {

    @Mock
    private HaAirGapConfig haAirGapConfig;

    @Mock
    private HiveTaxiiFeedRepository feedRepository;

    @Mock
    private HiveThreatIocRepository iocRepository;

    @Mock
    private WebClient.Builder webClientBuilder;

    @Mock
    private WebClient webClient;

    private TaxiiClientService service;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.when(webClientBuilder.build()).thenReturn(webClient);
        service = new TaxiiClientService(haAirGapConfig, feedRepository, iocRepository, webClientBuilder);
    }

    @Test
    void parseStixPattern_ipv4() {
        Optional<TaxiiClientService.IocExtract> result =
            service.parseStixPattern("[ipv4-addr:value = '1.2.3.4']", "WHITE");
        assertThat(result).isPresent();
        assertThat(result.get().type()).isEqualTo("ip");
        assertThat(result.get().value()).isEqualTo("1.2.3.4");
        assertThat(result.get().tlp()).isEqualTo("WHITE");
    }

    @Test
    void parseStixPattern_domain() {
        Optional<TaxiiClientService.IocExtract> result =
            service.parseStixPattern("[domain-name:value = 'evil.com']", "WHITE");
        assertThat(result).isPresent();
        assertThat(result.get().type()).isEqualTo("domain");
        assertThat(result.get().value()).isEqualTo("evil.com");
    }

    @Test
    void parseStixPattern_sha256() {
        Optional<TaxiiClientService.IocExtract> result =
            service.parseStixPattern("[file:hashes.SHA256 = 'abc123']", "WHITE");
        assertThat(result).isPresent();
        assertThat(result.get().type()).isEqualTo("hash");
        assertThat(result.get().value()).isEqualTo("abc123");
    }

    @Test
    void parseStixPattern_url() {
        Optional<TaxiiClientService.IocExtract> result =
            service.parseStixPattern("[url:value = 'http://bad.example/']", "WHITE");
        assertThat(result).isPresent();
        assertThat(result.get().type()).isEqualTo("url");
        assertThat(result.get().value()).isEqualTo("http://bad.example/");
    }

    @Test
    void parseStixPattern_unknown() {
        Optional<TaxiiClientService.IocExtract> result =
            service.parseStixPattern("[x-custom:value = 'something']", "WHITE");
        assertThat(result).isEmpty();
    }
}
