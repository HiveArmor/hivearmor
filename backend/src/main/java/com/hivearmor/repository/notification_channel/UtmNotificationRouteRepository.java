package com.hivearmor.repository.notification_channel;

import com.hivearmor.domain.notification_channel.UtmNotificationRoute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface UtmNotificationRouteRepository extends JpaRepository<UtmNotificationRoute, Long> {
    List<UtmNotificationRoute> findAllByOrderByCreatedAtDesc();
    List<UtmNotificationRoute> findByChannelIdOrderByNameAsc(Long channelId);
    List<UtmNotificationRoute> findByEnabledTrue();
}
