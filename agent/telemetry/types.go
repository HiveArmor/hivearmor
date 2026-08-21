package telemetry

// ScaPayload is the body posted to POST /api/ha-telemetry/sca.
type ScaPayload struct {
	AgentID      string      `json:"agentId"`
	Hostname     string      `json:"hostname"`
	PackID       string      `json:"packId"`
	PackVersion  string      `json:"packVersion"`
	TenantID     *int64      `json:"tenantId,omitempty"`
	Results    []ScaResult `json:"results"`
}

// ScaResult is one observed configuration check. Status is PASS, FAIL, ERROR, or NOT_APPLICABLE.
type ScaResult struct {
	CheckID        string   `json:"checkId"`
	Title          string   `json:"title"`
	Level          string   `json:"level,omitempty"`
	Status         string   `json:"status"`
	ObservedValue  string   `json:"observedValue,omitempty"`
	ExpectedValue  string   `json:"expectedValue,omitempty"`
	Remediation    string   `json:"remediation,omitempty"`
	Mitre          []string `json:"mitre"`
	ComplianceTags []string `json:"complianceTags"`
}

// PackageRecord is one installed package used to build a CycloneDX component.
type PackageRecord struct {
	Name    string
	Version string
	PURL    string
}

const (
	observedSSHPackID = "ha-linux-observed-ssh"
	maxSBOMComponents = 400
)
