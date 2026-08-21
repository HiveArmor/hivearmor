package utils

import (
	"net"
	"time"
)

// AirGapCheck returns true if the given URL is safely reachable (not air-gapped),
// false if the environment is air-gapped or the URL cannot be reached.
//
// In air-gap mode, all external network calls must be skipped before they are
// attempted. This function is the standard guard used by any HiveArmor Go service
// that needs to decide whether to make an outbound call.
//
// Note: AirGapCheck alone is not sufficient — the HIVEARMOR_AIR_GAP environment
// variable should be checked first. This function is a runtime fallback for services
// that detect air-gap dynamically by probing connectivity.
//
// Returns:
//   - true:  URL is reachable, environment is NOT air-gapped
//   - false: URL is unreachable, or the check times out / errors
func AirGapCheck(url string, timeout time.Duration) bool {
	return CheckConnectivity(url, timeout) == nil
}

// IsPrivateHost returns true if the hostname in addr (host:port or host) resolves
// only to private/loopback/link-local IP addresses. Returns false if the host
// resolves to any public IP, or if resolution fails, or if no IPs were resolved.
//
// Use this to decide whether an SMTP relay, Ollama endpoint, or other configured
// URL is a local service (allowed in air-gap mode) vs. an external service
// (must be blocked in air-gap mode).
func IsPrivateHost(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		// addr might not have a port — try as-is
		host = addr
	}

	ips, err := net.LookupHost(host)
	if err != nil {
		// Cannot resolve — assume external (conservative)
		return false
	}

	for _, rawIP := range ips {
		ip := net.ParseIP(rawIP)
		if ip == nil {
			continue
		}
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() {
			continue
		}
		// At least one resolved IP is public → host is not private
		return false
	}

	// All resolved IPs are private/loopback, or none were parseable.
	// Require at least one resolved IP to consider the host private.
	return len(ips) > 0
}
