package com.hivearmor.domain.sigma;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Entity
@Getter
@Setter
@Table(name = "sigma_sync_config")
public class SigmaSyncConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "sync_url", nullable = false, length = 500)
    private String syncUrl;

    @Column(name = "sync_frequency_hours", nullable = false)
    private int syncFrequencyHours;

    @Column(name = "last_synced_at")
    private Instant lastSyncedAt;

    @Column(name = "last_synced_commit", length = 40)
    private String lastSyncedCommit;

    @Column(name = "auto_activate", nullable = false)
    private boolean autoActivate;

    @Column(name = "category_filter", length = 500)
    private String categoryFilter;
}
