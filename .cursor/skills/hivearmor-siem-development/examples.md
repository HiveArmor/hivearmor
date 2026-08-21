# HiveArmor Development Examples

## Example Session Workflows

### Example 1: Frontend-v3 Component Implementation

**Scenario:** Implementing S07 - Alert Detail Panel from frontend-v3 spec

**Workflow:**
```bash
# 1. Load session context
cat .plan/frontend-v3-spec/00-SDD-GUIDE.md
cat .plan/frontend-v3-spec/03-ANALYST-QUEUE.md

# 2. Read existing code structure  
ls frontend-v3/src/pages/alerts/
cat frontend-v3/src/components/ha-ui/HaCard.tsx

# 3. Implement exactly what spec describes
# ... code implementation ...

# 4. Run all gates
cd frontend-v3
npm run lint      # Gate 1 - must pass
npm run type-check # Gate 2 - must pass  
npm run test      # Gate 3 - must pass
npm run build     # Gate 4 - must pass

# 5. Session ends when all gates pass
```

**Key Points:**
- Only implement what S07 spec section describes
- Use existing HaCard, HaButton, HaTable components
- Import severity helpers from `@/lib/severity`
- Follow design token system for colors/spacing

### Example 2: Backend API Implementation  

**Scenario:** Implementing F-02 Reports Generation backend endpoints

**Workflow:**
```bash
# 1. Read feature specification
cat .plan/features/F-02-reports.md

# 2. Check existing REST pattern
ls backend/src/main/java/com/hivearmor/web/rest/
cat backend/src/main/java/com/hivearmor/web/rest/AlertResource.java

# 3. Create new REST controller following pattern
# File: HaReportResource.java
```

**Example implementation:**
```java
@RestController
@RequestMapping("/api/ha-reports")
@PreAuthorize("hasRole('ANALYST')") // Required security
public class HaReportResource {
    
    @GetMapping("")
    public ResponseEntity<List<Report>> getAllReports(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
        // Implementation using existing pagination pattern
    }
    
    @PostMapping("")
    public ResponseEntity<Report> createReport(@RequestBody CreateReportRequest request) {
        // Implementation with input validation
    }
}
```

**Database migration:**
```bash  
# Create new changeset
# File: backend/src/main/resources/config/liquibase/changelog/20260731001_add_reports_table.xml

# Add to master.xml
# Validate before commit
mvn -s settings.xml liquibase:validate
```

### Example 3: Security Fix Implementation

**Scenario:** Fixing SEC-02 JWT Signing Key in Database

**Current problem:**
```java
// TokenProvider.java - INSECURE
@Component  
public class TokenProvider {
    private Key key; // Persisted in database - WRONG
    
    @PostConstruct
    public void init() {
        this.key = loadKeyFromDatabase(); // Security vulnerability
    }
}
```

**Secure fix:**
```java
// TokenProvider.java - SECURE
@Component
public class TokenProvider {
    private Key key; // Ephemeral, generated on startup
    
    @PostConstruct  
    public void init() {
        // Generate new key on every startup - invalidates old sessions
        this.key = Keys.secretKeyFor(SignatureAlgorithm.HS512);
        log.info("Generated new JWT signing key - all existing sessions invalidated");
    }
}
```

**Validation:**
```bash
# Test auth flow still works
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")

curl -H "Authorization: Bearer $TOKEN" http://localhost:8088/api/account
# Should return user profile, not 401
```

### Example 4: Go Agent Plugin Development

**Scenario:** Creating a new correlation plugin

**Directory setup:**
```bash
mkdir plugins/threat-intel-correlator
cd plugins/threat-intel-correlator

# Initialize Go module
go mod init github.com/hivearmor/plugins/threat-intel-correlator
```

**Plugin structure:**
```go
// main.go
package main

import (
    "context"
    "fmt"
    "github.com/hivearmor/shared/events"
    "github.com/hivearmor/shared/plugin"
)

type ThreatIntelCorrelator struct {
    // Plugin state
}

func (t *ThreatIntelCorrelator) Name() string {
    return "threat-intel-correlator"
}

func (t *ThreatIntelCorrelator) ProcessEvent(ctx context.Context, event *events.Event) (*events.Event, error) {
    // Correlation logic
    enrichedEvent := t.enrichWithThreatIntel(event)
    return enrichedEvent, nil
}

func main() {
    plugin.Serve(&ThreatIntelCorrelator{})
}
```

**Build:**
```bash
# Build with exact naming convention
go build -o com.hivearmor.threatintel.plugin .

# Verify binary name (critical for event-processor loading)
ls -la com.hivearmor.threatintel.plugin
```

**Integration:**
```dockerfile
# event_processor.Dockerfile
COPY plugins/threat-intel-correlator/com.hivearmor.threatintel.plugin /plugins/
```

### Example 5: Full Feature End-to-End Implementation

**Scenario:** F-01 Live Alert Streaming (Frontend + Backend coordination)

**Phase 1: Backend SSE Endpoint**
```java
// AlertStreamResource.java
@RestController
public class AlertStreamResource {
    
    @GetMapping(value = "/api/alerts/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("hasRole('ANALYST')")
    public SseEmitter streamAlerts() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        // SSE implementation
        return emitter;
    }
}
```

**Phase 2: Frontend SSE Hook**
```typescript
// src/hooks/useAlertStream.ts
import { useEffect, useState } from 'react'

export function useAlertStream() {
  const [newAlertCount, setNewAlertCount] = useState(0)
  const [latestAlert, setLatestAlert] = useState<Alert | null>(null)
  
  useEffect(() => {
    const eventSource = new EventSource('/api/alerts/stream')
    
    eventSource.onmessage = (event) => {
      const alert = JSON.parse(event.data) as Alert
      setLatestAlert(alert)
      setNewAlertCount(prev => prev + 1)
    }
    
    return () => eventSource.close()
  }, [])
  
  return { newAlertCount, latestAlert, clearCount: () => setNewAlertCount(0) }
}
```

**Phase 3: UI Integration**
```typescript
// src/components/status-dock/StatusDock.tsx  
import { useAlertStream } from '@/hooks/useAlertStream'

export function StatusDock() {
  const { newAlertCount } = useAlertStream()
  
  return (
    <div className="status-dock">
      {newAlertCount > 0 && (
        <div className="new-alert-badge">
          {newAlertCount} new alerts
        </div>
      )}
    </div>
  )
}
```

**Validation:**
```bash  
# Test SSE endpoint
curl -N -H "Authorization: Bearer $TOKEN" \
  http://localhost:8088/api/alerts/stream

# Frontend gates
cd frontend-v3
npm run lint && npm run type-check && npm run test && npm run build
```

## Pattern Templates

### REST Controller Template
```java
@RestController
@RequestMapping("/api/ha-{resource}")  
@PreAuthorize("hasRole('ANALYST')") // Or appropriate role
public class Ha{Resource}Resource {
    
    private final {Resource}Service {resource}Service;
    
    @GetMapping("")
    public ResponseEntity<Page<{Resource}>> getAll(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(defaultValue = "createdAt") String sort) {
        // Paginated list with X-Total-Count header
    }
    
    @PostMapping("")  
    public ResponseEntity<{Resource}> create(@Valid @RequestBody Create{Resource}Request request) {
        // Input validation, business logic delegation
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<{Resource}> getById(@PathVariable Long id) {
        // Single resource retrieval  
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<{Resource}> update(@PathVariable Long id, 
                                           @Valid @RequestBody Update{Resource}Request request) {
        // Resource modification
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        // Soft delete preferred
    }
}
```

### Frontend Service Template  
```typescript
// src/services/{resource}.service.ts
import { apiClient } from './api-client'

export interface {Resource} {
  id: number
  name: string  
  createdAt: string
  updatedAt: string
}

export interface Create{Resource}Request {
  name: string
}

export const {resource}Service = {
  async getAll(page = 0, size = 20): Promise<{Resource}[]> {
    const response = await apiClient.get(`/ha-{resource}s`, {
      params: { page, size }
    })
    return response.data
  },
  
  async create(data: Create{Resource}Request): Promise<{Resource}> {
    const response = await apiClient.post('/ha-{resource}s', data)
    return response.data  
  },
  
  async getById(id: number): Promise<{Resource}> {
    const response = await apiClient.get(`/ha-{resource}s/${id}`)
    return response.data
  },
  
  async delete(id: number): Promise<void> {
    await apiClient.delete(`/ha-{resource}s/${id}`)
  }
}
```

### React Hook Template
```typescript  
// src/hooks/use{Resource}.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { {resource}Service } from '@/services/{resource}.service'

export function use{Resource}List() {
  return useQuery({
    queryKey: ['{resource}s'],
    queryFn: () => {resource}Service.getAll()
  })
}

export function useCreate{Resource}() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: {resource}Service.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['{resource}s'] })
    }
  })
}