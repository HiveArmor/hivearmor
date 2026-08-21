package com.hivearmor.domain.ueba;

/**
 * Enumeration of peer-group source types used by the UEBA baseline engine.
 *
 * <p>Determines how a user was assigned to their peer group:
 * <ul>
 *   <li>{@link #AD_DEPT} — user was clustered by Active Directory department attribute.</li>
 *   <li>{@link #SUBNET24} — user was clustered by the IPv4 /24 subnet of their most recent source IP.</li>
 * </ul>
 *
 * <p>Persisted as the string value in column {@code group_source} of table {@code ha_ueba_peer_group}.
 */
public enum GroupSource {

    /** Peer group derived from the user's Active Directory department. */
    AD_DEPT,

    /** Peer group derived from the user's most recent source IPv4 /24 subnet. */
    SUBNET24
}
