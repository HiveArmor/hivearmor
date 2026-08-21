//go:build windows

package fim

import "golang.org/x/sys/windows"

// Windows API procedure handles loaded lazily via windows.NewLazySystemDLL.
var (
	modAdvapi32 = windows.NewLazySystemDLL("advapi32.dll")
	modKernel32 = windows.NewLazySystemDLL("kernel32.dll")

	procRegNotifyChangeKeyValue = modAdvapi32.NewProc("RegNotifyChangeKeyValue")
	procWaitForSingleObject     = modKernel32.NewProc("WaitForSingleObject")
)
