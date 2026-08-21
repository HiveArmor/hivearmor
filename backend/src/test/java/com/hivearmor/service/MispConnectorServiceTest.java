package com.hivearmor.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hivearmor.config.HaAirGapConfig;
import com.hivearmor.repository.HiveMispFeedRepository;
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
 * HiveArmor unit tests for MispConnectorService type mapping and TLP extraction.
 */
@ExtendWith(MockitoExtension.class)
class MispConnectorServiceTest {

    @Mock
    private HaAirGapConfig haAirGapConfig;

    @Mock
    private HiveMispFeedRepository feedRepository;

    @Mock
    private HiveThreatIocRepository iocRepository;

    @Mock
    private WebClient.Builder webClientBuilder;

    @Mock
    private WebClient webClient;

    private MispConnectorService service;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.when(webClientBuilder.build()).thenReturn(webClient);
        service = new MispConnectorService(haAirGapConfig, feedRepository, iocRepository, webClientBuilder);
    }

    @Test
    void mapMispType_ipDst() {
        Optional<String> result = service.mapMispType("ip-dst");
        assertThat(result).isPresent().contains("ip");
    }

    @Test
    void mapMispType_sha256() {
        Optional<String> result = service.mapMispType("sha256");
        assertThat(result).isPresent().contains("hash");
    }

    @Test
    void mapMispType_unknown() {
        Optional<String> result = service.mapMispType("zeek-conn");
        assertThat(result).isEmpty();
    }

    @Test
    void extractTlpFromTags_amber() {
        ArrayNode tags = objectMapper.createArrayNode();
        ObjectNode tag = objectMapper.createObjectNode();
        tag.put("name", "tlp:amber");
        tags.add(tag);
        String tlp = service.extractTlpFromTags(tags);
        assertThat(tlp).isEqualTo("AMBER");
    }

    @Test
    void extractTlpFromTags_noTag() {
        ArrayNode tags = objectMapper.createArrayNode();
        String tlp = service.extractTlpFromTags(tags);
        assertThat(tlp).isEqualTo("WHITE");
    }

    @Test
    void extractTlpFromTags_caseInsensitive() {
        ArrayNode tags = objectMapper.createArrayNode();
        ObjectNode tag = objectMapper.createObjectNode();
        tag.put("name", "TLP:RED");
        tags.add(tag);
        String tlp = service.extractTlpFromTags(tags);
        assertThat(tlp).isEqualTo("RED");
    }
}
