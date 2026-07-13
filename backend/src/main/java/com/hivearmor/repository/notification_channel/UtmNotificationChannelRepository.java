package com.hivearmor.repository.notification_channel;

import com.hivearmor.domain.notification_channel.UtmNotificationChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface UtmNotificationChannelRepository extends JpaRepository<UtmNotificationChannel, Long> {
    List<UtmNotificationChannel> findAllByOrderByCreatedAtDesc();
    List<UtmNotificationChannel> findByChannelTypeOrderByNameAsc(String channelType);
    List<UtmNotificationChannel> findByEnabledTrue();
}
