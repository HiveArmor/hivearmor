package telemetry

import (
	"bufio"
	"strings"
)

// sshDirective returns the first uncommented value for key (case-insensitive).
func sshDirective(content, key string) (string, bool) {
	scanner := bufio.NewScanner(strings.NewReader(content))
	want := strings.ToLower(strings.TrimSpace(key))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		if strings.ToLower(fields[0]) == want {
			return fields[1], true
		}
	}
	return "", false
}

func loginDefsValue(content, key string) (string, bool) {
	scanner := bufio.NewScanner(strings.NewReader(content))
	want := strings.ToLower(strings.TrimSpace(key))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		if strings.ToLower(fields[0]) == want {
			return fields[1], true
		}
	}
	return "", false
}

func countUID0(passwd string) int {
	n := 0
	scanner := bufio.NewScanner(strings.NewReader(passwd))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, ":")
		if len(parts) < 3 {
			continue
		}
		if parts[2] == "0" {
			n++
		}
	}
	return n
}
