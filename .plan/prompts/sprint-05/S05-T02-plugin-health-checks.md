# S05-T02 — Add Plugin Health Endpoints to Backend UI

**Sprint:** 5 (Reliability + Performance)  
**Severity:** MEDIUM — No visibility into pipeline health  
**Issue ID:** OPS  
**Dependencies:** S05-T01 (supervisord must be running)  
**Estimated time:** 4 hours

---

## Context

There is no way to know from the ArmorSight UI whether the event processor plugins are running, crashed, or processing events. Debugging a missed detection requires SSH access to the container. This task adds plugin health visibility to the backend API and admin UI.

---

## What to Read First

1. `eventprocessor/supervisord.conf` (created in S05-T01) — understand the plugin names
2. `backend/src/main/java/com/nilachakra/web/rest/` — find an appropriate admin controller to add health to
3. `frontend-v2/src/app/(app)/admin/` — find where to add the plugin health section in admin UI

---

## Implementation Steps

### Step 1: Create backend `PluginHealthService`

Create: `backend/src/main/java/com/nilachakra/service/PluginHealthService.java`

```java
@Service
@RequiredArgsConstructor
public class PluginHealthService {

    @Value("${app.eventprocessor.health-url:http://eventprocessor:8094/health}")
    private String eventProcessorHealthUrl;

    private final RestTemplate restTemplate;

    public PluginHealthStatus getStatus() {
        try {
            ResponseEntity<Map> response = restTemplate.getForEntity(
                eventProcessorHealthUrl, Map.class);
            
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return PluginHealthStatus.builder()
                    .reachable(true)
                    .plugins(parsePluginStatuses(response.getBody()))
                    .lastChecked(Instant.now())
                    .build();
            }
        } catch (Exception e) {
            log.warn("Eventprocessor health check failed: {}", e.getMessage());
        }
        
        return PluginHealthStatus.builder()
            .reachable(false)
            .lastChecked(Instant.now())
            .build();
    }

    private List<PluginStatus> parsePluginStatuses(Map body) {
        // Parse supervisord status from the health endpoint response
        List<Map<String, Object>> plugins = (List<Map<String, Object>>) body.get("plugins");
        if (plugins == null) return Collections.emptyList();
        
        return plugins.stream()
            .map(p -> PluginStatus.builder()
                .name((String) p.get("name"))
                .state((String) p.get("state"))  // RUNNING, STOPPED, FATAL
                .uptime((Integer) p.get("uptime"))
                .restartCount((Integer) p.get("restartCount"))
                .build())
            .collect(Collectors.toList());
    }
}
```

### Step 2: Add health endpoint to the eventprocessor

In the compliance orchestrator (or a new health plugin), expose plugin status:

```go
// In eventprocessor or compliance-orchestrator health.go:
func handleHealth(w http.ResponseWriter, r *http.Request) {
    // Query supervisord via supervisorctl or XML-RPC
    plugins := getSupervisordStatus()
    
    resp := map[string]interface{}{
        "status":  "ok",
        "plugins": plugins,
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(resp)
}

func getSupervisordStatus() []map[string]interface{} {
    // Execute supervisorctl status and parse output
    cmd := exec.Command("supervisorctl", "-c", "/etc/supervisord.conf", "status")
    output, err := cmd.Output()
    if err != nil {
        return nil
    }
    
    var statuses []map[string]interface{}
    for _, line := range strings.Split(string(output), "\n") {
        parts := strings.Fields(line)
        if len(parts) >= 2 {
            statuses = append(statuses, map[string]interface{}{
                "name":  parts[0],
                "state": parts[1],
            })
        }
    }
    return statuses
}
```

### Step 3: Create backend REST endpoint

Create: `backend/src/main/java/com/nilachakra/web/rest/admin/PluginHealthResource.java`

```java
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PluginHealthResource {

    private final PluginHealthService pluginHealthService;

    @GetMapping("/plugin-health")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<PluginHealthStatus> getPluginHealth() {
        return ResponseEntity.ok(pluginHealthService.getStatus());
    }
}
```

### Step 4: Add Plugin Health section to Admin UI

In `frontend-v2/src/app/(app)/admin/page.tsx` (or create a dedicated page), add a plugin health card:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface PluginStatus {
    name: string;
    state: 'RUNNING' | 'STOPPED' | 'FATAL' | 'STARTING';
    uptime?: number;
    restartCount?: number;
}

interface PluginHealth {
    reachable: boolean;
    plugins: PluginStatus[];
    lastChecked: string;
}

export function PluginHealthCard() {
    const [health, setHealth] = useState<PluginHealth | null>(null);

    useEffect(() => {
        const load = async () => {
            const r = await apiClient.get<PluginHealth>('/api/plugin-health');
            setHealth(r.data);
        };
        load();
        const interval = setInterval(load, 30000);  // refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (!health) return <div>Loading plugin health...</div>;

    return (
        <div className="border rounded p-4">
            <h3 className="font-semibold mb-3">Event Processor Plugins</h3>
            {!health.reachable && (
                <div className="text-destructive">⚠ Event processor unreachable</div>
            )}
            <div className="space-y-2">
                {health.plugins.map(plugin => (
                    <div key={plugin.name} className="flex justify-between text-sm">
                        <span>{plugin.name}</span>
                        <span className={
                            plugin.state === 'RUNNING' ? 'text-green-600' :
                            plugin.state === 'FATAL' ? 'text-red-600' : 'text-yellow-600'
                        }>
                            {plugin.state}
                            {plugin.restartCount && plugin.restartCount > 0 && 
                                ` (${plugin.restartCount} restarts)`}
                        </span>
                    </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
                Last checked: {new Date(health.lastChecked).toLocaleTimeString()}
            </p>
        </div>
    );
}
```

### Step 5: Write tests

```java
@WebMvcTest(PluginHealthResource.class)
class PluginHealthResourceTest {

    @Autowired MockMvc mvc;
    @MockBean PluginHealthService pluginHealthService;

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void getPluginHealth_returnsStatus() throws Exception {
        PluginHealthStatus status = PluginHealthStatus.builder()
            .reachable(true)
            .plugins(List.of(PluginStatus.builder().name("inputs").state("RUNNING").build()))
            .build();
        when(pluginHealthService.getStatus()).thenReturn(status);
        
        mvc.perform(get("/api/plugin-health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reachable").value(true))
            .andExpect(jsonPath("$.plugins[0].name").value("inputs"));
    }

    @Test
    @WithMockUser(authorities = "ROLE_USER")
    void getPluginHealth_forbiddenForNonAdmin() throws Exception {
        mvc.perform(get("/api/plugin-health"))
            .andExpect(status().isForbidden());
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw compile -q
./mvnw test -Dtest=PluginHealthResourceTest -DfailIfNoTests=false

# Manual test:
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/plugin-health" | jq '.'
# Expected: { "reachable": true, "plugins": [{"name": "inputs", "state": "RUNNING"}, ...] }

# Open http://localhost:3000/admin → should show plugin health card
```

---

## Acceptance Criteria

- [ ] `GET /api/plugin-health` returns plugin statuses (ADMIN only)
- [ ] Backend periodically queries the eventprocessor health endpoint
- [ ] Admin UI shows plugin names and RUNNING/STOPPED/FATAL status
- [ ] Status auto-refreshes every 30 seconds
- [ ] When eventprocessor is unreachable, shows clear warning
- [ ] Backend tests pass
