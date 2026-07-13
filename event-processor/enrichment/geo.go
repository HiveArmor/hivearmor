// Package enrichment provides IP geolocation lookup using MaxMind-format CSV data.
// It loads data lazily from $WORK_DIR/geolocation/ on first call.
package enrichment

import (
	"encoding/csv"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GeoResult holds normalized geolocation data for an IP.
type GeoResult struct {
	Country     string  `json:"country"`
	City        string  `json:"city"`
	CountryCode string  `json:"countryCode"`
	ASN         string  `json:"asn"`
	ASO         string  `json:"aso"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Accuracy    int     `json:"accuracy"`
}

var (
	once        sync.Once
	asnV4       []asnBlock
	asnV6       []asnBlock
	cityV4      []cityBlock
	cityV6      []cityBlock
	cityLocations map[uint64]cityLocation
	geoReady    bool
	geoDir      string
)

type asnBlock struct {
	network *net.IPNet
	asn     uint64
	aso     string
}

type cityBlock struct {
	network        *net.IPNet
	geonameID      uint64
	latitude       float64
	longitude      float64
	accuracyRadius int
}

type cityLocation struct {
	geonameID   uint64
	countryCode string
	countryName string
	cityName    string
}

// SetGeoDir sets the directory containing MaxMind CSV files.
func SetGeoDir(dir string) {
	geoDir = dir
}

// InitGeo eagerly loads GeoIP data at startup. Must be called after SetGeoDir.
// Subsequent calls to Geolocate() reuse the already-loaded data.
func InitGeo() {
	once.Do(func() {
		if geoDir == "" {
			return
		}
		loadGeoData()
	})
}

// Geolocate returns geo data for an IP, or nil if not found / private.
func Geolocate(ip string) map[string]any {
	once.Do(func() {
		if geoDir == "" {
			return
		}
		loadGeoData()
	})
	if !geoReady {
		return nil
	}

	parsed := net.ParseIP(ip)
	if parsed == nil {
		return nil
	}
	if isPrivate(parsed) {
		return nil
	}

	result := GeoResult{}

	// ASN lookup
	blocks := asnV4
	if parsed.To4() == nil {
		blocks = asnV6
	}
	for _, b := range blocks {
		if b.network.Contains(parsed) {
			result.ASN = fmt.Sprintf("AS%d", b.asn)
			result.ASO = b.aso
			break
		}
	}

	// City lookup
	cblocks := cityV4
	if parsed.To4() == nil {
		cblocks = cityV6
	}
	for _, b := range cblocks {
		if b.network.Contains(parsed) {
			result.Latitude = b.latitude
			result.Longitude = b.longitude
			result.Accuracy = b.accuracyRadius
			if loc, ok := cityLocations[b.geonameID]; ok {
				result.Country = loc.countryName
				result.CountryCode = loc.countryCode
				result.City = loc.cityName
			}
			break
		}
	}

	if result.Country == "" && result.ASO == "" {
		return nil
	}

	return map[string]any{
		"country":     result.Country,
		"city":        result.City,
		"countryCode": result.CountryCode,
		"asn":         result.ASN,
		"aso":         result.ASO,
		"latitude":    result.Latitude,
		"longitude":   result.Longitude,
		"accuracy":    result.Accuracy,
		"coordinates": map[string]any{
			"lat": result.Latitude,
			"lon": result.Longitude,
		},
	}
}

func loadGeoData() {
	_ = time.Now() // ensure time pkg used
	cityLocations = map[uint64]cityLocation{}

	loadASN(filepath.Join(geoDir, "asn-blocks-v4.csv"), &asnV4)
	loadASN(filepath.Join(geoDir, "asn-blocks-v6.csv"), &asnV6)
	loadCity(filepath.Join(geoDir, "blocks-v4.csv"), &cityV4)
	loadCity(filepath.Join(geoDir, "blocks-v6.csv"), &cityV6)
	loadLocations(filepath.Join(geoDir, "locations-en.csv"))

	if len(asnV4) > 0 || len(cityV4) > 0 || len(cityLocations) > 0 {
		geoReady = true
		log.Printf("[INFO] GeoIP enrichment initialized — country/city lookup active (asnV4=%d cityV4=%d locations=%d)",
			len(asnV4), len(cityV4), len(cityLocations))
	} else {
		log.Printf("[WARN] GeoIP enrichment NOT initialized — %s is empty or files are missing", geoDir)
	}
}

func loadASN(path string, out *[]asnBlock) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.Read() // header
	for {
		row, err := r.Read()
		if err != nil {
			break
		}
		if len(row) < 3 {
			continue
		}
		_, network, err := net.ParseCIDR(row[0])
		if err != nil {
			continue
		}
		asn, _ := strconv.ParseUint(row[1], 10, 64)
		*out = append(*out, asnBlock{network: network, asn: asn, aso: row[2]})
	}
}

func loadCity(path string, out *[]cityBlock) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.Read() // header
	for {
		row, err := r.Read()
		if err != nil {
			break
		}
		if len(row) < 6 {
			continue
		}
		_, network, err := net.ParseCIDR(row[0])
		if err != nil {
			continue
		}
		gid, _ := strconv.ParseUint(row[1], 10, 64)
		lat, _ := strconv.ParseFloat(row[7], 64)
		lon, _ := strconv.ParseFloat(row[8], 64)
		acc, _ := strconv.Atoi(row[9])
		*out = append(*out, cityBlock{network: network, geonameID: gid, latitude: lat, longitude: lon, accuracyRadius: acc})
	}
}

func loadLocations(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.Read() // header
	for {
		row, err := r.Read()
		if err != nil {
			break
		}
		if len(row) < 11 {
			continue
		}
		gid, _ := strconv.ParseUint(row[0], 10, 64)
		cityLocations[gid] = cityLocation{
			geonameID:   gid,
			countryCode: row[4],
			countryName: row[5],
			cityName:    row[10],
		}
	}
}

var privateRanges []*net.IPNet

func init() {
	for _, cidr := range []string{
		"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
		"127.0.0.0/8", "::1/128", "fc00::/7", "fe80::/10",
		"169.254.0.0/16", "100.64.0.0/10",
	} {
		_, network, _ := net.ParseCIDR(cidr)
		privateRanges = append(privateRanges, network)
	}
}

func isPrivate(ip net.IP) bool {
	for _, r := range privateRanges {
		if r.Contains(ip) {
			return true
		}
	}
	return false
}

// EnrichEvent adds geolocation to origin.ip and target.ip in an event data map.
func EnrichEvent(data map[string]any) {
	enrichSide(data, "origin")
	enrichSide(data, "target")
}

func enrichSide(data map[string]any, side string) {
	sideMap, ok := data[side].(map[string]any)
	if !ok {
		return
	}
	ip, _ := sideMap["ip"].(string)
	if ip == "" {
		return
	}
	geo := Geolocate(ip)
	if geo != nil {
		sideMap["geolocation"] = geo
	}
}

func getStr(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// dummy to silence unused import warning in minimal builds
var _ = strings.TrimSpace
