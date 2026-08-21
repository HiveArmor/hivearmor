//go:build darwin

// Package esf provides a macOS EndpointSecurity Framework (ESF) based EDR
// telemetry collector.
//
// # Apple System Extension requirements
//
// ESF requires:
//   - The binary must be signed with an Apple Developer ID certificate.
//   - The entitlement com.apple.developer.endpoint-security.client must be
//     present in the .entitlements plist.
//   - On macOS 10.15+ (Catalina) and above.
//   - System Integrity Protection (SIP) must NOT be enabled on the endpoint if
//     running outside a System Extension bundle during development.
//
// For production, the agent must be packaged as a System Extension:
//   Bundle ID: com.hivearmor.agent.systemextension
//   Entitlement: com.apple.developer.endpoint-security.client (value = true)
//
// # Apply for Apple entitlement NOW
//
// This entitlement requires explicit Apple approval.  Submit the request at:
//   https://developer.apple.com/contact/request/system-extension/
// Approval takes 3–6 weeks.  Start this process in Sprint 1 so ESF code
// can be activated by Sprint 9 when the entitlement arrives.
//
// # CGo dependency
//
// The real implementation uses CGo to call the EndpointSecurity C framework.
// Until the entitlement is granted, this package provides a functional stub
// that emits a startup log event and then waits for ctx cancellation.
// When the entitlement is granted, replace loader_darwin.go with the real
// ESF client implementation.
package esf
