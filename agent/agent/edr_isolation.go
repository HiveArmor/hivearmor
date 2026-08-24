package agent

import (
	"net"
	"strings"
)

// edrFirewallRulePrefix is the shared prefix for all Windows isolation rules
// created by applyWindowsIsolation (loopback + management/caller allowlists).
const edrFirewallRulePrefix = "EDR_"

// isFullIsolation reports whether isoType requests full network cutover.
// Matching is case-insensitive; empty defaults to non-FULL (safer for remediability).
func isFullIsolation(isoType string) bool {
	return strings.EqualFold(strings.TrimSpace(isoType), "FULL")
}

// isEdrFirewallRuleName reports whether name is an agent-owned isolation rule.
func isEdrFirewallRuleName(name string) bool {
	return strings.HasPrefix(strings.TrimSpace(name), edrFirewallRulePrefix)
}

// extractEdrFirewallRuleNames parses `netsh advfirewall firewall show rule name=all`
// output and returns unique rule names owned by the agent (prefix EDR_).
//
// The previous lift path piped show-output through findstr and fed whole lines
// (e.g. "Rule Name:  EDR_ALLOWED_1.2.3.4") into delete, so allowlist rules
// survived a successful lift. Parsing the Rule Name field avoids that.
func extractEdrFirewallRuleNames(showOutput string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0)

	for _, raw := range strings.Split(showOutput, "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(raw, "\r"))
		if line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if !strings.HasPrefix(lower, "rule name:") {
			continue
		}
		_, after, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		name := strings.TrimSpace(after)
		if !isEdrFirewallRuleName(name) {
			continue
		}
		if _, dup := seen[name]; dup {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out
}

// windowsFirewallPolicy returns the netsh advfirewall firewallpolicy value.
// FULL blocks inbound+outbound (management/caller allow rules carve exceptions).
// Non-FULL blocks inbound only so outbound gRPC to agent-manager stays remediable.
func windowsFirewallPolicy(isoType string) string {
	if isFullIsolation(isoType) {
		return "blockinbound,blockoutbound"
	}
	return "blockinbound,allowoutbound"
}

// mergeIsolationAllowlist prepends addresses derived from the agent management
// host (cnf.Server) to any caller-supplied allowlist, de-duplicated and trimmed.
// managementHost may be a hostname or IP; hostnames are resolved when possible.
func mergeIsolationAllowlist(managementHost string, callerIPs []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(callerIPs)+4)

	add := func(raw string) {
		ip := strings.TrimSpace(raw)
		if ip == "" {
			return
		}
		key := strings.ToLower(ip)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, ip)
	}

	for _, ip := range resolveManagementAllowIPs(managementHost) {
		add(ip)
	}
	for _, ip := range callerIPs {
		add(ip)
	}
	return out
}

// resolveManagementAllowIPs turns an agent config Server value into firewall
// allowlist entries (IPs preferred; hostname retained if DNS fails).
func resolveManagementAllowIPs(host string) []string {
	host = strings.TrimSpace(host)
	if host == "" {
		return nil
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if host == "" {
		return nil
	}

	if parsed := net.ParseIP(host); parsed != nil {
		return []string{normalizeAllowIP(parsed)}
	}

	addrs, err := net.LookupIP(host)
	if err != nil || len(addrs) == 0 {
		// Keep hostname so netsh/iptables may still match if resolvable later.
		return []string{host}
	}

	seen := make(map[string]struct{}, len(addrs))
	out := make([]string, 0, len(addrs))
	for _, addr := range addrs {
		s := normalizeAllowIP(addr)
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func normalizeAllowIP(ip net.IP) string {
	if v4 := ip.To4(); v4 != nil {
		return v4.String()
	}
	return ip.String()
}
