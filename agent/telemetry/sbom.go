package telemetry

import (
	"bufio"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type osRelease struct {
	ID       string
	IDLike   string
	Version  string
}

func parseOSRelease(content string) osRelease {
	info := osRelease{ID: "linux"}
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		val = strings.Trim(val, `"'`)
		switch key {
		case "ID":
			info.ID = strings.ToLower(val)
		case "ID_LIKE":
			info.IDLike = strings.ToLower(val)
		case "VERSION_ID":
			info.Version = val
		}
	}
	return info
}

func debNamespace(info osRelease) string {
	if info.ID == "ubuntu" || strings.Contains(info.IDLike, "ubuntu") {
		return "ubuntu"
	}
	if info.ID == "debian" || strings.Contains(info.IDLike, "debian") {
		return "debian"
	}
	return info.ID
}

func rpmNamespace(info osRelease) string {
	if info.ID != "" {
		return info.ID
	}
	return "rpm"
}

// ListInstalledPackages returns packages from dpkg or rpm. Unknown package managers yield an empty list.
func ListInstalledPackages(read fileReader, run func(name string, args ...string) (string, error)) []PackageRecord {
	if read == nil {
		read = defaultReadFile
	}
	if run == nil {
		run = func(name string, args ...string) (string, error) {
			out, err := exec.Command(name, args...).Output()
			return string(out), err
		}
	}
	if runtime.GOOS != "linux" {
		return nil
	}

	raw, err := read(osReleasePath)
	info := osRelease{ID: "linux"}
	if err == nil {
		info = parseOSRelease(string(raw))
	}

	if _, err := os.Stat("/usr/bin/dpkg-query"); err == nil {
		out, qerr := run("dpkg-query", "-W", "-f=${Package}\t${Version}\n")
		if qerr == nil {
			return parseDpkgQuery(out, debNamespace(info))
		}
	}
	if _, err := os.Stat("/usr/bin/rpm"); err == nil {
		out, qerr := run("rpm", "-qa", "--qf", "%{NAME}\t%{VERSION}-%{RELEASE}\n")
		if qerr == nil {
			return parseRpmQuery(out, rpmNamespace(info))
		}
	}
	return nil
}

func parseDpkgQuery(out, ns string) []PackageRecord {
	var pkgs []PackageRecord
	scanner := bufio.NewScanner(strings.NewReader(out))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		name, ver, ok := strings.Cut(line, "\t")
		if !ok || name == "" || ver == "" {
			continue
		}
		pkgs = append(pkgs, PackageRecord{
			Name:    name,
			Version: ver,
			PURL:    "pkg:deb/" + ns + "/" + name + "@" + ver,
		})
		if len(pkgs) >= maxSBOMComponents {
			break
		}
	}
	return pkgs
}

func parseRpmQuery(out, ns string) []PackageRecord {
	var pkgs []PackageRecord
	scanner := bufio.NewScanner(strings.NewReader(out))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		name, ver, ok := strings.Cut(line, "\t")
		if !ok || name == "" || ver == "" {
			continue
		}
		pkgs = append(pkgs, PackageRecord{
			Name:    name,
			Version: ver,
			PURL:    "pkg:rpm/" + ns + "/" + name + "@" + ver,
		})
		if len(pkgs) >= maxSBOMComponents {
			break
		}
	}
	return pkgs
}

// CycloneDXBOM is a minimal CycloneDX 1.5 document.
type CycloneDXBOM struct {
	BomFormat    string          `json:"bomFormat"`
	SpecVersion  string          `json:"specVersion"`
	SerialNumber string          `json:"serialNumber"`
	Version      int             `json:"version"`
	Metadata     cycloneMetadata `json:"metadata"`
	Components   []cycloneComp   `json:"components"`
}

type cycloneMetadata struct {
	Timestamp  string             `json:"timestamp"`
	Component  cycloneComp        `json:"component"`
	Properties []cycloneProperty  `json:"properties,omitempty"`
}

type cycloneComp struct {
	Type         string `json:"type"`
	Name         string `json:"name"`
	Version      string `json:"version,omitempty"`
	PURL         string `json:"purl,omitempty"`
	SerialNumber string `json:"serialNumber,omitempty"`
}

type cycloneProperty struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// BuildCycloneDX builds a CycloneDX 1.5 SBOM. serialNumber is the agent id.
func BuildCycloneDX(agentID, hostname string, tenantID *int64, pkgs []PackageRecord) CycloneDXBOM {
	comps := make([]cycloneComp, 0, len(pkgs))
	for _, p := range pkgs {
		comps = append(comps, cycloneComp{
			Type:    "library",
			Name:    p.Name,
			Version: p.Version,
			PURL:    p.PURL,
		})
	}
	props := []cycloneProperty{}
	if tenantID != nil {
		props = append(props, cycloneProperty{Name: "hivearmor:tenantId", Value: strconv.FormatInt(*tenantID, 10)})
	}
	return CycloneDXBOM{
		BomFormat:    "CycloneDX",
		SpecVersion:  "1.5",
		SerialNumber: agentID,
		Version:      1,
		Metadata: cycloneMetadata{
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Component: cycloneComp{
				Type:         "device",
				Name:         hostname,
				SerialNumber: agentID,
			},
			Properties: props,
		},
		Components: comps,
	}
}
