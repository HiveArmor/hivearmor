package store

import (
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Instance is a registered HiveArmor deployment.
type Instance struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	APIKey      string    `gorm:"uniqueIndex;not null" json:"-"`
	Name        string    `json:"name"`
	Country     string    `json:"country"`
	Email       string    `json:"email"`
	Version     string    `json:"version"`
	Edition     string    `gorm:"default:community" json:"edition"`
	CurrentIp   string    `json:"current_ip"`
	MappingName string    `json:"mapping_name,omitempty"`
	Tags        string     `json:"tags"`
	LicenseType string     `gorm:"default:community" json:"license_type"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	LastSeenAt  time.Time  `json:"last_seen_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Version is a published software release.
type Version struct {
	ID          uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Component   string    `gorm:"uniqueIndex:idx_comp_tag;not null" json:"component"`
	Tag         string    `gorm:"uniqueIndex:idx_comp_tag;not null" json:"tag"`
	DownloadURL string    `json:"download_url"`
	Signature   string    `json:"signature"`
	Changelog   string    `json:"changelog"`
	Stable      bool      `gorm:"default:true" json:"stable"`
	PublishedAt time.Time `json:"published_at"`
}

// Update tracks a pending software update for a specific instance.
type Update struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	InstanceID  string    `gorm:"index;not null" json:"instance_id"`
	VersionTag  string    `json:"version_tag"`
	Changelog   string    `json:"changelog"`
	UpdateLocks string    `json:"update_locks,omitempty"`
	Approved    bool      `gorm:"default:true" json:"approved"`
	ApproveAt   time.Time `json:"aprove_at"`
	Sent        bool      `gorm:"default:false" json:"sent"`
	CreatedAt   time.Time `json:"created_at"`
}

// AdminAccount holds CI / ops service accounts.
type AdminAccount struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	HashedKey string    `gorm:"not null" json:"-"`
	Role      string    `gorm:"default:ci" json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

func Connect(dsn string) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
}

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(&Instance{}, &Version{}, &Update{}, &AdminAccount{})
}
