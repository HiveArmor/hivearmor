package updater

// license.go — Community edition stub
//
// The original implementation used github.com/hivearmor/license-manager-sdk to decrypt
// and verify a signed license payload from HiveArmor's Customer Manager API. That SDK is
// a private repository belonging to the original HiveArmor organisation and is not
// available to forks.
//
// This project is an independent fork. The license system has been replaced with a
// community-edition stub that:
//   - Keeps the same method signatures so no other files need to change
//   - Always treats the installation as community edition
//   - Skips the Customer Manager license endpoint call entirely
//   - Writes "community" as the edition in the version file on every check cycle
//
// If you want to implement your own licensing system, replace this file with your own
// implementation of LicenseProcess() and CheckLicense(). The LicenseEncrypted schema
// is defined in schemas.go and can be reused.

import (
	"time"

	"github.com/hivearmor/installer/config"
)

// LicenseProcess runs the license check loop. In community edition this is a no-op
// that periodically confirms the edition as "community" in the version file.
func (c *UpdaterClient) LicenseProcess() {
	ticker := time.NewTicker(config.CheckUpdatesEvery)
	defer ticker.Stop()

	for range ticker.C {
		if IsInMaintenanceWindow() {
			if err := c.CheckLicense(); err != nil {
				config.Logger().ErrorF("license check error: %v", err)
			}
		}
	}
}

// CheckLicense confirms community edition. No external calls are made.
// Replace this method to implement your own licensing logic.
func (c *UpdaterClient) CheckLicense() error {
	// Community edition: always active, no expiry, no external validation.
	// Ensure the version file records "community" so the UI shows the correct edition.
	if err := SaveVersion("", "community", ""); err != nil {
		return err
	}
	return nil
}
