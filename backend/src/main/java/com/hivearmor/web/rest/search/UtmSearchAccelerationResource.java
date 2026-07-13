package com.hivearmor.web.rest.search;

import com.hivearmor.domain.search.UtmSearchAcceleration;
import com.hivearmor.service.search.UtmSearchAccelerationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/search-acceleration")
@RequiredArgsConstructor
@Slf4j
public class UtmSearchAccelerationResource {

    private final UtmSearchAccelerationService accelerationService;

    /** GET /api/search-acceleration — list all settings */
    @GetMapping
    public ResponseEntity<List<UtmSearchAcceleration>> listSettings() {
        return ResponseEntity.ok(accelerationService.listSettings());
    }

    /** PUT /api/search-acceleration/{key} — update a single setting */
    @PutMapping("/{key}")
    public ResponseEntity<UtmSearchAcceleration> updateSetting(
            @PathVariable String key,
            @RequestBody Map<String, String> body) {
        String value = body.get("value");
        if (value == null || value.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(accelerationService.updateSetting(key, value));
    }

    /** PUT /api/search-acceleration — bulk update settings */
    @PutMapping
    public ResponseEntity<List<UtmSearchAcceleration>> updateAll(
            @RequestBody Map<String, String> keyValueMap) {
        return ResponseEntity.ok(accelerationService.updateAll(keyValueMap));
    }

    /** POST /api/search-acceleration/apply — push settings to OpenSearch cluster */
    @PostMapping("/apply")
    public ResponseEntity<Map<String, Object>> applyToOpenSearch() {
        Map<String, Object> result = accelerationService.applyToOpenSearch();
        boolean ok = Boolean.TRUE.equals(result.get("ok"));
        return ResponseEntity.status(ok ? 200 : 502).body(result);
    }
}
