package com.hivearmor.web.rest.util;

import com.hivearmor.service.dto.HaEdrInventoryPageDTO;
import com.hivearmor.service.dto.IsolatedHostDTO;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HaEdrListFreshnessTest {

    @Test
    void okAddsSnapshotAndAsOfFromNewestRow() {
        IsolatedHostDTO older = new IsolatedHostDTO();
        older.setId(1L);
        older.setIsolatedAt(Instant.parse("2026-08-25T01:00:00Z"));

        IsolatedHostDTO newer = new IsolatedHostDTO();
        newer.setId(2L);
        newer.setIsolatedAt(Instant.parse("2026-08-25T03:00:00Z"));

        Instant before = Instant.now();
        ResponseEntity<HaEdrInventoryPageDTO<IsolatedHostDTO>> response = HaEdrListFreshness.ok(
            new PageImpl<>(List.of(older, newer)),
            IsolatedHostDTO::getIsolatedAt
        );
        Instant after = Instant.now();

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        HaEdrInventoryPageDTO<IsolatedHostDTO> body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getContent()).hasSize(2);
        assertThat(body.getTotalElements()).isEqualTo(2);
        assertThat(body.getAsOf()).isEqualTo(Instant.parse("2026-08-25T03:00:00Z"));
        assertThat(body.getSnapshotAt()).isNotNull();
        assertThat(body.getSnapshotAt()).isAfterOrEqualTo(before);
        assertThat(body.getSnapshotAt()).isBeforeOrEqualTo(after);

        assertThat(response.getHeaders().getFirst(HaEdrListFreshness.HEADER_SNAPSHOT_AT))
            .isEqualTo(body.getSnapshotAt().toString());
        assertThat(response.getHeaders().getFirst(HaEdrListFreshness.HEADER_AS_OF))
            .isEqualTo("2026-08-25T03:00:00Z");
        assertThat(response.getHeaders().getFirst("Access-Control-Expose-Headers"))
            .contains(HaEdrListFreshness.HEADER_SNAPSHOT_AT)
            .contains(HaEdrListFreshness.HEADER_AS_OF);
    }

    @Test
    void okLeavesAsOfNullWhenPageEmpty() {
        ResponseEntity<HaEdrInventoryPageDTO<IsolatedHostDTO>> response = HaEdrListFreshness.ok(
            new PageImpl<>(List.of()),
            IsolatedHostDTO::getIsolatedAt
        );

        HaEdrInventoryPageDTO<IsolatedHostDTO> body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getAsOf()).isNull();
        assertThat(body.getSnapshotAt()).isNotNull();
        assertThat(response.getHeaders().getFirst(HaEdrListFreshness.HEADER_AS_OF)).isNull();
        assertThat(response.getHeaders().getFirst(HaEdrListFreshness.HEADER_SNAPSHOT_AT)).isNotBlank();
    }

    @Test
    void parseInstantOrNullIsHonestOnBadInput() {
        assertThat(HaEdrListFreshness.parseInstantOrNull(null)).isNull();
        assertThat(HaEdrListFreshness.parseInstantOrNull("  ")).isNull();
        assertThat(HaEdrListFreshness.parseInstantOrNull("not-an-instant")).isNull();
        assertThat(HaEdrListFreshness.parseInstantOrNull("2026-08-25T04:00:00Z"))
            .isEqualTo(Instant.parse("2026-08-25T04:00:00Z"));
    }
}
