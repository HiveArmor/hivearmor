package fim

import (
	"crypto/md5"  //nolint:gosec // MD5 used only for FIM delta diff, not security
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// BaselineEntry holds the persisted state of a single file.
type BaselineEntry struct {
	ID          uint   `gorm:"primaryKey;autoIncrement"`
	Path        string `gorm:"uniqueIndex;not null"`
	SHA256      string `gorm:"not null"`
	MD5         string `gorm:"not null"`    //nolint:gosec
	SizeBytes   int64  `gorm:"not null"`
	Permissions string `gorm:"not null"` // octal string e.g. "0644"
	Owner       string `gorm:"not null"` // "uid:gid" on POSIX; "owner" on Windows
	ModTime     int64  `gorm:"not null"` // UnixNano
}

// BaselineDB wraps a SQLite database for FIM baseline storage.
// A dedicated per-FIM database is used to avoid contention with the main
// agent logs database.
type BaselineDB struct {
	db  *gorm.DB
	mu  sync.RWMutex
}

// openBaselineDB opens (or creates) the SQLite baseline database at dbPath.
func openBaselineDB(dbPath string) (*BaselineDB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, err
	}

	conn, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	if err := conn.AutoMigrate(&BaselineEntry{}); err != nil {
		return nil, err
	}

	return &BaselineDB{db: conn}, nil
}

// close releases database resources.
func (b *BaselineDB) close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	sqlDB, err := b.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// get returns the stored baseline entry for path, or nil if not found.
func (b *BaselineDB) get(path string) (*BaselineEntry, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var entry BaselineEntry
	result := b.db.Where("path = ?", path).First(&entry)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, result.Error
	}
	return &entry, nil
}

// upsert inserts or updates the baseline entry for the given path.
func (b *BaselineDB) upsert(entry *BaselineEntry) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.db.Save(entry).Error
}

// delete removes the baseline entry for path (called on file DELETE events).
func (b *BaselineDB) delete(path string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.db.Where("path = ?", path).Delete(&BaselineEntry{}).Error
}

// computeHashes computes SHA-256 and MD5 of the file at path.
// Returns ("", "", 0, err) if the file cannot be read (e.g. it was deleted
// between the fsnotify event and this call).
func computeHashes(path string) (sha256sum, md5sum string, size int64, err error) {
	f, err := os.Open(path) //nolint:gosec // controlled input from watch rules
	if err != nil {
		return "", "", 0, err
	}
	defer f.Close()

	h256 := sha256.New()
	hMD5 := md5.New() //nolint:gosec

	n, err := io.Copy(io.MultiWriter(h256, hMD5), f)
	if err != nil {
		return "", "", 0, err
	}

	return hex.EncodeToString(h256.Sum(nil)),
		hex.EncodeToString(hMD5.Sum(nil)),
		n,
		nil
}
