//go:build windows

package tamper

import (
	"fmt"
	"unsafe"

	"github.com/hivearmor/agent/utils"
	"golang.org/x/sys/windows"
)

// HardenWindowsService sets a DACL on the Windows service control manager entry
// for the HiveArmor agent service so that only SYSTEM and Administrators can
// stop/delete it.  Standard Users and even Power Users will be denied.
//
// This must be called from the agent service startup with SeSecurityPrivilege.
func HardenWindowsService(serviceName string) {
	if err := hardenService(serviceName); err != nil {
		utils.Logger.ErrorF("tamper: Windows service DACL hardening failed: %v (continuing without protection)", err)
	} else {
		utils.Logger.Info("tamper: service DACL hardened for %s", serviceName)
	}
}

// hardenService sets a restrictive DACL on the named Windows service.
//
// The SDDL grants:
//   FA = Full Access to SYSTEM (SY) and Administrators (BA)
//   0x00010000 = SERVICE_QUERY_STATUS to Authenticated Users (AU)
func hardenService(serviceName string) error {
	// SDDL: Full access to SYSTEM + Built-in Admins; query-only for Authenticated Users.
	sddl := "D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x00010000;;;AU)"

	// Convert SDDL to a binary security descriptor using ConvertStringSecurityDescriptorToSecurityDescriptor.
	advapi32 := windows.NewLazySystemDLL("advapi32.dll")
	convertSDtoSD := advapi32.NewProc("ConvertStringSecurityDescriptorToSecurityDescriptorW")
	getSDDACL := advapi32.NewProc("GetSecurityDescriptorDacl")
	setServiceSec := advapi32.NewProc("SetServiceObjectSecurity")

	sddlPtr, err := windows.UTF16PtrFromString(sddl)
	if err != nil {
		return fmt.Errorf("UTF16PtrFromString SDDL: %w", err)
	}

	const SDDL_REVISION_1 = 1
	var sd uintptr
	var sdSize uint32
	ret, _, e := convertSDtoSD.Call(
		uintptr(unsafe.Pointer(sddlPtr)),
		SDDL_REVISION_1,
		uintptr(unsafe.Pointer(&sd)),
		uintptr(unsafe.Pointer(&sdSize)),
	)
	if ret == 0 {
		return fmt.Errorf("ConvertStringSecurityDescriptorToSecurityDescriptor: %w", e)
	}
	defer windows.LocalFree(windows.Handle(sd))

	// Extract DACL from the security descriptor.
	var daclPresent int32
	var dacl uintptr
	var daclDefaulted int32
	ret, _, e = getSDDACL.Call(
		sd,
		uintptr(unsafe.Pointer(&daclPresent)),
		uintptr(unsafe.Pointer(&dacl)),
		uintptr(unsafe.Pointer(&daclDefaulted)),
	)
	if ret == 0 {
		return fmt.Errorf("GetSecurityDescriptorDacl: %w", e)
	}
	if daclPresent == 0 || dacl == 0 {
		return fmt.Errorf("SDDL did not produce a DACL")
	}

	// Open SCM and the service.
	scm, err := windows.OpenSCManager(nil, nil, windows.SC_MANAGER_ALL_ACCESS)
	if err != nil {
		return fmt.Errorf("OpenSCManager: %w", err)
	}
	defer windows.CloseServiceHandle(scm)

	svcNamePtr, err := windows.UTF16PtrFromString(serviceName)
	if err != nil {
		return fmt.Errorf("UTF16PtrFromString service: %w", err)
	}
	svc, err := windows.OpenService(scm, svcNamePtr, windows.SERVICE_ALL_ACCESS)
	if err != nil {
		return fmt.Errorf("OpenService %s: %w", serviceName, err)
	}
	defer windows.CloseServiceHandle(svc)

	// Set DACL on the service object.
	const DACL_SECURITY_INFORMATION = 0x4
	ret, _, e = setServiceSec.Call(
		uintptr(svc),
		DACL_SECURITY_INFORMATION,
		sd,
	)
	if ret == 0 {
		return fmt.Errorf("SetServiceObjectSecurity: %w", e)
	}
	return nil
}

// HardenCurrentBinary is a no-op on Windows; service DACL is the primary mechanism.
func HardenCurrentBinary() {
	// Windows tamper protection is via service DACL (hardenService above) and
	// optionally a kernel PPL (Protected Process Light) driver — Phase D future work.
	utils.Logger.Info("tamper: Windows binary hardening not implemented (use service DACL protection)")
}
