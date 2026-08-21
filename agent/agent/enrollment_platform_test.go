package agent

import "testing"

func TestEnrollmentPlatform(t *testing.T) {
	tests := []struct {
		osType   string
		platform string
		want     string
	}{
		{osType: "linux", platform: "ubuntu", want: "linux"},
		{osType: "linux", platform: "debian", want: "linux"},
		{osType: "windows", platform: "windows", want: "windows"},
		{osType: "darwin", platform: "macos", want: "darwin"},
		{osType: "", platform: "linux", want: "linux"},
		{osType: "", platform: "macos", want: "darwin"},
	}
	for _, tt := range tests {
		got := enrollmentPlatform(tt.osType, tt.platform)
		if got != tt.want {
			t.Fatalf("enrollmentPlatform(%q,%q)=%q want %q", tt.osType, tt.platform, got, tt.want)
		}
	}
}
