package com.hivearmor.web.rest.ueba;

import com.hivearmor.domain.ueba.HaUebaPeerGroup;

/**
 * REST response DTO for a peer-group assignment row.
 *
 * <p>Used by {@code GET /api/ha-ueba/peer-groups} to expose tenant-scoped peer groups.
 */
public record PeerGroupDTO(
    String userId,
    String groupKey,
    String groupSource
) {

    /**
     * Maps a JPA entity to its REST representation.
     */
    public static PeerGroupDTO from(HaUebaPeerGroup p) {
        return new PeerGroupDTO(
            p.getUserId(),
            p.getGroupKey(),
            p.getGroupSource() != null ? p.getGroupSource().name() : null
        );
    }
}
