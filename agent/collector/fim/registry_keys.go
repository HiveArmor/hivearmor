package fim

// defaultRegistryKeys lists high-value HKLM keys to monitor for integrity.
// Used on Windows only; non-Windows registry FIM is a no-op.
var defaultRegistryKeys = []string{
	`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`,
	`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options`,
	`SYSTEM\CurrentControlSet\Services`,
	`SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
	`SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`,
	`SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Run`,
	`SYSTEM\CurrentControlSet\Control\Lsa`,
	`SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\InstalledSDB`,
}
