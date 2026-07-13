# S01-T10 — Secure Unix Socket Between Inputs and Event-Processor

**Sprint:** 1 (Security-Critical)  
**Severity:** CRITICAL  
**Issue ID:** FLOW-05  
**Dependencies:** None  
**Estimated time:** 2 hours

---

## Context

The `inputs` plugin communicates with the event-processor via a Unix domain socket. This socket has no authentication or access control. Any process running on the same host with filesystem access to the socket path can inject arbitrary events into the SIEM pipeline.

**Affected:** Unix socket path used between `plugins/inputs/` and the event-processor listener.

---

## What to Read First

1. `plugins/inputs/` — find the socket path constant and the connect/write code
2. `eventprocessor/` — find the socket listener/server code
3. Search for the socket path: `grep -r "\.sock\|unix://" /Users/encryptshell/GIT/UTMStack-11/plugins/ /Users/encryptshell/GIT/UTMStack-11/eventprocessor/ --include="*.go"`
4. `eventprocessor/entrypoint.sh` — see how processes are started to understand UID/GID context

---

## Implementation Steps

### Step 1: Find the socket path

After reading the files above, identify:
- The constant or config value for the socket path
- Who creates the socket (inputs or event-processor?)
- What UID runs each process

### Step 2: Set restrictive socket permissions on creation

When the event-processor creates the socket listener, set its permissions to `0600` immediately after creation:

```go
import (
    "net"
    "os"
    "syscall"
)

func createSocket(socketPath string) (net.Listener, error) {
    // Remove stale socket file if it exists
    os.Remove(socketPath)
    
    listener, err := net.Listen("unix", socketPath)
    if err != nil {
        return nil, fmt.Errorf("failed to create unix socket at %s: %w", socketPath, err)
    }
    
    // Restrict to owner read/write only (mode 0600)
    if err := os.Chmod(socketPath, 0600); err != nil {
        listener.Close()
        return nil, fmt.Errorf("failed to set socket permissions: %w", err)
    }
    
    return listener, nil
}
```

### Step 3: Add a shared secret handshake (defence-in-depth)

If processes run under different UIDs (e.g., different containers sharing a volume), filesystem permissions alone won't protect the socket. Add a simple handshake:

```go
// Server side: after accepting a connection, read the handshake
func acceptWithAuth(listener net.Listener, secret string) (net.Conn, error) {
    conn, err := listener.Accept()
    if err != nil {
        return nil, err
    }
    
    conn.SetDeadline(time.Now().Add(5 * time.Second))
    
    buf := make([]byte, len(secret))
    _, err = io.ReadFull(conn, buf)
    if err != nil || string(buf) != secret {
        conn.Close()
        return nil, fmt.Errorf("socket auth failed")
    }
    
    conn.SetDeadline(time.Time{})  // reset deadline
    return conn, nil
}

// Client side: send the handshake immediately on connect
func connectWithAuth(socketPath, secret string) (net.Conn, error) {
    conn, err := net.Dial("unix", socketPath)
    if err != nil {
        return nil, err
    }
    
    _, err = conn.Write([]byte(secret))
    if err != nil {
        conn.Close()
        return nil, err
    }
    
    return conn, nil
}
```

### Step 4: Configure the shared secret via environment variable

```go
type Config struct {
    // ...
    UnixSocketPath   string `env:"INPUTS_SOCKET_PATH" envDefault:"/tmp/armorsight/events.sock"`
    UnixSocketSecret string `env:"INPUTS_SOCKET_SECRET"`
}
```

In `local-dev/docker-compose.yml`, add to both `inputs` and `eventprocessor` services:
```yaml
- INPUTS_SOCKET_SECRET=${INPUTS_SOCKET_SECRET:-change-me-in-production}
```

### Step 5: Unit tests

Create: `plugins/inputs/socket_auth_test.go`

```go
package inputs_test

import (
    "net"
    "os"
    "testing"
    "time"
)

func TestSocketPermissions_are0600(t *testing.T) {
    path := "/tmp/test_armorsight_auth.sock"
    defer os.Remove(path)

    listener, err := createSocket(path)
    if err != nil {
        t.Fatal(err)
    }
    defer listener.Close()

    info, err := os.Stat(path)
    if err != nil {
        t.Fatal(err)
    }

    got := info.Mode().Perm()
    want := os.FileMode(0600)
    if got != want {
        t.Errorf("socket permissions: got %o, want %o", got, want)
    }
}

func TestSocketHandshake_withCorrectSecret_succeeds(t *testing.T) {
    secret := "test-secret"
    path := "/tmp/test_armorsight_hs.sock"
    defer os.Remove(path)

    listener, _ := createSocket(path)
    defer listener.Close()

    go func() {
        conn, _ := connectWithAuth(path, secret)
        if conn != nil {
            conn.Close()
        }
    }()

    conn, err := acceptWithAuth(listener, secret)
    if err != nil {
        t.Errorf("expected successful auth, got: %v", err)
    }
    if conn != nil {
        conn.Close()
    }
}

func TestSocketHandshake_withWrongSecret_closes(t *testing.T) {
    path := "/tmp/test_armorsight_wrong.sock"
    defer os.Remove(path)

    listener, _ := createSocket(path)
    defer listener.Close()

    go func() {
        conn, _ := net.Dial("unix", path)
        if conn != nil {
            conn.Write([]byte("wrong-secret"))
            conn.Close()
        }
    }()

    conn, err := acceptWithAuth(listener, "correct-secret")
    if err == nil {
        if conn != nil { conn.Close() }
        t.Error("expected auth failure, got success")
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/plugins/inputs

go build ./...
go test ./... -v -run TestSocket

# Verify socket permissions in running container:
docker exec -it <eventprocessor_container> ls -la /tmp/armorsight/events.sock
# Should show: srw------- (0600)

# Attempt to connect without auth (should fail):
docker exec -it <eventprocessor_container> \
  /bin/sh -c 'echo "fake-event" | socat - UNIX-CONNECT:/tmp/armorsight/events.sock'
# Should be rejected or produce no output
```

---

## Acceptance Criteria

- [ ] Unix socket is created with permissions `0600`
- [ ] Event-processor rejects connections that fail the secret handshake
- [ ] `INPUTS_SOCKET_SECRET` environment variable controls the shared secret
- [ ] All 3 unit tests pass
- [ ] `go build ./...` succeeds
- [ ] No regression in normal event flow: events sent by the inputs plugin still arrive at the event-processor
