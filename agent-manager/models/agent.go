package models

import (
	"time"

	"gorm.io/gorm"
)

type AgentCommandStatus int32

const (
	Queue    AgentCommandStatus = 1
	Pending  AgentCommandStatus = 2
	Executed AgentCommandStatus = 3
	Error    AgentCommandStatus = 4
)

type Agent struct {
	gorm.Model
	Ip       string
	Hostname string `gorm:"uniqueIndex:idx_hostname_deleted;not null"`
	Os       string
	Platform string
	Version  string
	// AgentKey is retained only to read legacy rows during the dated migration window.
	// New registrations store a one-way hash in AgentKeyHash and leave this empty.
	AgentKey            string     `gorm:"type:string;index"`
	AgentKeyHash        string     `gorm:"type:text"`
	AgentUUID           string     `gorm:"type:varchar(36);uniqueIndex"`
	TenantID            int64      `gorm:"index;not null;default:0"`
	CredentialVersion   uint32     `gorm:"not null;default:1"`
	CredentialRevokedAt *time.Time `gorm:"index"`
	DeletedAt           *time.Time `gorm:"uniqueIndex:idx_hostname_deleted;index:idx_agent_delete"`
	RegisterBy          string     `gorm:"not null"`
	DeletedBy           string
	Mac                 string
	OsMajorVersion      string
	OsMinorVersion      string
	Aliases             string
	Addresses           string
}

// EnrollmentToken stores only a bcrypt hash of the secret. TokenID is the
// non-secret lookup component embedded in the one-time enrollment token.
type EnrollmentToken struct {
	gorm.Model
	TokenID          string    `gorm:"type:varchar(36);uniqueIndex;not null"`
	TokenHash        string    `gorm:"type:text;not null"`
	TenantID         int64     `gorm:"index;not null"`
	PolicyID         string    `gorm:"type:varchar(128);not null"`
	Platform         string    `gorm:"type:varchar(64);not null"`
	ExpiresAt        time.Time `gorm:"index;not null"`
	MaxUses          int32     `gorm:"not null"`
	UseCount         int32     `gorm:"not null;default:0"`
	CreatedBy        string    `gorm:"type:varchar(255);not null"`
	LastUsedAt       *time.Time
	RevokedAt        *time.Time `gorm:"index"`
	RevokedBy        string     `gorm:"type:varchar(255)"`
	RevocationReason string     `gorm:"type:varchar(512)"`
	Version          uint64     `gorm:"not null;default:1"`
}

// EnrollmentAuditEvent is an append-only security ledger. It deliberately
// contains only safe identifiers and lifecycle metadata; authentication
// material, verifier hashes, hostnames, MAC addresses and IP addresses are
// never persisted here. Database migration installs an UPDATE/DELETE guard.
type EnrollmentAuditEvent struct {
	ID                string    `gorm:"type:varchar(36);primaryKey"`
	TenantID          int64     `gorm:"index;not null"`
	EventType         string    `gorm:"type:varchar(64);index;not null"`
	Actor             string    `gorm:"type:varchar(255);not null"`
	Reason            string    `gorm:"type:varchar(512);not null"`
	TokenID           string    `gorm:"type:varchar(36);index"`
	AgentID           uint32    `gorm:"index"`
	AgentUUID         string    `gorm:"type:varchar(36);index"`
	PolicyID          string    `gorm:"type:varchar(128)"`
	Platform          string    `gorm:"type:varchar(64)"`
	CredentialVersion uint32    `gorm:"not null;default:0"`
	EnrollmentVersion uint64    `gorm:"not null;default:0"`
	OccurredAt        time.Time `gorm:"index;not null"`
}

type AgentCommand struct {
	gorm.Model
	AgentID       uint
	Command       string
	CommandStatus AgentCommandStatus
	Result        string
	ExecutedBy    string `gorm:"not null"`
	CmdId         string `gorm:"not null"`
	OriginType    string `gorm:"not null"`
	OriginId      string `gorm:"not null"`
	Reason        string `gorm:"not null"`
}
