package entities

import (
	"fmt"
	"net"
	"strings"
)

// ValidateAnyIP validates that value is a syntactically valid IP address (IPv4 or IPv6).
// Unlike ValidateIP, this function accepts RFC1918 private addresses, loopback,
// link-local, and multicast addresses.
//
// Use ValidateAnyIP for SIEM telemetry fields (source IP, destination IP in log events).
// Use ValidateIP for CTI entity records (threat intel should not contain private IPs).
//
// Returns the normalized IP string, its SHA3-256 hash, and an error if the value
// is not a valid IP address.
func ValidateAnyIP(value string) (string, string, error) {
	addr := net.ParseIP(strings.ToLower(strings.TrimSpace(value)))
	if addr == nil {
		return "", "", fmt.Errorf("invalid IP address: %s", value)
	}
	if addr.IsUnspecified() {
		return "", "", fmt.Errorf("cannot accept unspecified IP (0.0.0.0 or ::): %s", value)
	}
	a := addr.String()
	return a, GenerateSHA3256(a), nil
}
