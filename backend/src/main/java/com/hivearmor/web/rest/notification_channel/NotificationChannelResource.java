package com.hivearmor.web.rest.notification_channel;

import com.hivearmor.domain.notification_channel.UtmNotificationChannel;
import com.hivearmor.domain.notification_channel.UtmNotificationRoute;
import com.hivearmor.service.notification_channel.NotificationChannelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class NotificationChannelResource {

    private final NotificationChannelService channelService;

    // ── Channels ─────────────────────────────────────────────────────────────

    @GetMapping("/notification-channels")
    public ResponseEntity<List<UtmNotificationChannel>> listChannels() {
        return ResponseEntity.ok(channelService.listChannels());
    }

    @GetMapping("/notification-channels/{id}")
    public ResponseEntity<UtmNotificationChannel> getChannel(@PathVariable Long id) {
        return ResponseEntity.ok(channelService.getChannel(id));
    }

    @PostMapping("/notification-channels")
    public ResponseEntity<UtmNotificationChannel> createChannel(@RequestBody UtmNotificationChannel ch) {
        return ResponseEntity.status(HttpStatus.CREATED).body(channelService.createChannel(ch));
    }

    @PutMapping("/notification-channels/{id}")
    public ResponseEntity<UtmNotificationChannel> updateChannel(@PathVariable Long id,
                                                                 @RequestBody UtmNotificationChannel ch) {
        return ResponseEntity.ok(channelService.updateChannel(id, ch));
    }

    @DeleteMapping("/notification-channels/{id}")
    public ResponseEntity<Void> deleteChannel(@PathVariable Long id) {
        channelService.deleteChannel(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/notification-channels/{id}/test")
    public ResponseEntity<Map<String, Object>> testChannel(@PathVariable Long id) {
        Map<String, Object> result = channelService.testChannel(id);
        boolean ok = Boolean.TRUE.equals(result.get("ok"));
        return ResponseEntity.status(ok ? HttpStatus.OK : HttpStatus.BAD_GATEWAY).body(result);
    }

    // ── Routes ───────────────────────────────────────────────────────────────

    @GetMapping("/notification-routes")
    public ResponseEntity<List<UtmNotificationRoute>> listRoutes() {
        return ResponseEntity.ok(channelService.listRoutes());
    }

    @PostMapping("/notification-routes")
    public ResponseEntity<UtmNotificationRoute> createRoute(@RequestBody UtmNotificationRoute route) {
        return ResponseEntity.status(HttpStatus.CREATED).body(channelService.createRoute(route));
    }

    @PutMapping("/notification-routes/{id}")
    public ResponseEntity<UtmNotificationRoute> updateRoute(@PathVariable Long id,
                                                             @RequestBody UtmNotificationRoute route) {
        return ResponseEntity.ok(channelService.updateRoute(id, route));
    }

    @DeleteMapping("/notification-routes/{id}")
    public ResponseEntity<Void> deleteRoute(@PathVariable Long id) {
        channelService.deleteRoute(id);
        return ResponseEntity.noContent().build();
    }
}
