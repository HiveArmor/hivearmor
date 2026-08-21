package geo

import (
	"net"
	"os"
	"sync"

	"github.com/hivearmor/sdk/catcher"
	"github.com/oschwald/maxminddb-golang"
)

// Location holds geo-enrichment data for an IP address.
type Location struct {
	Country     string
	CountryCode string
	City        string
	Latitude    float64
	Longitude   float64
}

var (
	db *maxminddb.Reader
	mu sync.RWMutex
)

// Init opens the MMDB file at dbPath. It never aborts event-processor startup.
// For empty, missing, or invalid dbPath values it logs a warning and returns nil,
// leaving db == nil so that every subsequent Lookup returns the Unknown stub.
func Init(dbPath string) error {
	if dbPath == "" {
		catcher.Warn("mmdb disabled", map[string]any{"path": dbPath, "reason": "GEOIP_DB_PATH unset or empty"})
		return nil
	}

	if _, err := os.Stat(dbPath); err != nil {
		catcher.Warn("mmdb disabled", map[string]any{"path": dbPath, "reason": "file not found"})
		return nil
	}

	reader, err := maxminddb.Open(dbPath)
	if err != nil {
		catcher.Warn("mmdb disabled", map[string]any{"path": dbPath, "reason": err.Error()})
		return nil
	}

	mu.Lock()
	db = reader
	mu.Unlock()

	catcher.Log("mmdb geo fallback loaded", map[string]any{"path": dbPath})
	return nil
}

// Lookup is a total function. For every string input it returns a Location.
// It never panics. Any error path (nil db, unparseable IP, lookup error)
// returns Location{Country: "Unknown", CountryCode: "XX"}.
func Lookup(ipStr string) Location {
	stub := Location{Country: "Unknown", CountryCode: "XX"}

	mu.RLock()
	reader := db
	mu.RUnlock()

	if reader == nil {
		return stub
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return stub
	}

	var record struct {
		Country struct {
			Names   map[string]string `maxminddb:"names"`
			ISOCode string            `maxminddb:"iso_code"`
		} `maxminddb:"country"`
		City struct {
			Names map[string]string `maxminddb:"names"`
		} `maxminddb:"city"`
		Location struct {
			Latitude  float64 `maxminddb:"latitude"`
			Longitude float64 `maxminddb:"longitude"`
		} `maxminddb:"location"`
	}

	if err := reader.Lookup(ip, &record); err != nil {
		return stub
	}

	if record.Country.ISOCode == "" {
		return stub
	}

	return Location{
		Country:     record.Country.Names["en"],
		CountryCode: record.Country.ISOCode,
		City:        record.City.Names["en"],
		Latitude:    record.Location.Latitude,
		Longitude:   record.Location.Longitude,
	}
}

// Close is idempotent. It releases the MMDB reader if one was successfully loaded.
// It is nil-safe — calling Close when no db was loaded is a no-op.
func Close() {
	mu.Lock()
	defer mu.Unlock()

	if db != nil {
		_ = db.Close()
		db = nil
	}
}
