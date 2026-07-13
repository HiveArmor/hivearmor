package com.hivearmor.domain.notification_channel;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "hive_notification_route")
@Data
@NoArgsConstructor
public class UtmNotificationRoute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(name = "channel_id", nullable = false)
    private Long channelId;

    @Column(name = "match_severity", length = 200)
    private String matchSeverity;

    @Column(name = "match_source", length = 200)
    private String matchSource;

    @Column(name = "match_type", length = 200)
    private String matchType;

    @Column(nullable = false)
    private Boolean enabled = true;

    @Column(name = "throttle_minutes")
    private Integer throttleMinutes = 0;

    @Column(name = "last_fired_at")
    private Instant lastFiredAt;

    @Column(name = "created_at")
    private Instant createdAt;
}
