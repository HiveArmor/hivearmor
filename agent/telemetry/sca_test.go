package telemetry

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSSHDirectiveIgnoresComments(t *testing.T) {
	content := "# PermitRootLogin yes\nPermitRootLogin prohibit-password\n"
	got, found := sshDirective(content, "PermitRootLogin")
	require.True(t, found)
	assert.Equal(t, "prohibit-password", got)
}

func TestCountUID0(t *testing.T) {
	passwd := "root:x:0:0:root:/root:/bin/bash\nnobody:x:65534:65534::/nonexistent:/usr/sbin/nologin\n"
	assert.Equal(t, 1, countUID0(passwd))
	assert.Equal(t, 2, countUID0(passwd+"toor:x:0:0::/root:/bin/sh\n"))
}

func TestBuildObservedSCAFromFiles(t *testing.T) {
	files := map[string]string{
		sshConfigPath: "PermitRootLogin yes\nPasswordAuthentication no\n",
		loginDefsPath: "PASS_MAX_DAYS 99999\n",
		passwdPath:    "root:x:0:0:root:/root:/bin/bash\n",
	}
	read := func(path string) ([]byte, error) {
		return []byte(files[path]), nil
	}
	tenant := int64(1)
	payload := linuxObservedSCA("42", "host-a", &tenant, read)
	assert.Equal(t, observedSSHPackID, payload.PackID)
	assert.Equal(t, "1", payload.PackVersion)
	assert.Equal(t, int64(1), *payload.TenantID)

	byID := map[string]ScaResult{}
	for _, r := range payload.Results {
		byID[r.CheckID] = r
	}
	assert.Equal(t, "FAIL", byID["HA-SSH-01"].Status)
	assert.Equal(t, "yes", byID["HA-SSH-01"].ObservedValue)
	assert.Equal(t, "PASS", byID["HA-SSH-02"].Status)
	assert.Equal(t, "FAIL", byID["HA-LOGIN-01"].Status)
	assert.Equal(t, "PASS", byID["HA-USER-01"].Status)
}

func TestBuildObservedSCAMissingSSHIsError(t *testing.T) {
	read := func(path string) ([]byte, error) {
		return nil, osErr("missing")
	}
	payload := linuxObservedSCA("1", "h", nil, read)
	require.Equal(t, "ERROR", payload.Results[0].Status)
}

type osErr string

func (e osErr) Error() string { return string(e) }
