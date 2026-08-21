package telemetry

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDpkgQuery(t *testing.T) {
	out := "openssl\t3.0.2-0ubuntu1.18\ncurl\t7.81.0-1ubuntu1.20\n"
	pkgs := parseDpkgQuery(out, "ubuntu")
	require.Len(t, pkgs, 2)
	assert.Equal(t, "openssl", pkgs[0].Name)
	assert.Equal(t, "pkg:deb/ubuntu/openssl@3.0.2-0ubuntu1.18", pkgs[0].PURL)
}

func TestParseOSReleaseUbuntu(t *testing.T) {
	info := parseOSRelease("ID=ubuntu\nID_LIKE=debian\nVERSION_ID=\"22.04\"\n")
	assert.Equal(t, "ubuntu", debNamespace(info))
}

func TestBuildCycloneDXIncludesTenant(t *testing.T) {
	tenant := int64(7)
	bom := BuildCycloneDX("99", "box", &tenant, []PackageRecord{{
		Name: "curl", Version: "1.0", PURL: "pkg:deb/debian/curl@1.0",
	}})
	assert.Equal(t, "CycloneDX", bom.BomFormat)
	assert.Equal(t, "1.5", bom.SpecVersion)
	assert.Equal(t, "99", bom.SerialNumber)
	assert.Equal(t, "99", bom.Metadata.Component.SerialNumber)
	require.Len(t, bom.Metadata.Properties, 1)
	assert.Equal(t, "hivearmor:tenantId", bom.Metadata.Properties[0].Name)
	assert.Equal(t, "7", bom.Metadata.Properties[0].Value)
	require.Len(t, bom.Components, 1)
	assert.Equal(t, "pkg:deb/debian/curl@1.0", bom.Components[0].PURL)
}

func TestTelemetryBaseURL(t *testing.T) {
	assert.Equal(t, "https://siem.example", telemetryBaseURL("siem.example"))
	assert.Equal(t, "http://127.0.0.1:8080", telemetryBaseURL("http://127.0.0.1:8080/"))
}
