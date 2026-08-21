//go:build !linux

package serv

// EnsureLinuxTelemetryEnvironment is a no-op off Linux.
func EnsureLinuxTelemetryEnvironment() error {
	return nil
}
