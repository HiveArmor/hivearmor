package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

func main() {
	host := getEnv("OPENSEARCH_HOST", "localhost")
	port := getEnv("OPENSEARCH_PORT", "9200")
	user := getEnv("OPENSEARCH_USER", "admin")
	pass := getEnv("OPENSEARCH_PASSWORD", "LocalDev@2024!")
	base := fmt.Sprintf("https://%s:%s", host, port)

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	templates := []struct {
		name string
		body map[string]any
	}{
		{"hivearmor-log-template", logTemplate()},
		{"hivearmor-alert-template", alertTemplate()},
		{"hivearmor-risk-template", riskTemplate()},
		{"hivearmor-offense-template", offenseTemplate()},
		{"hivearmor-lookup-template", lookupTemplate()},
		{"hivearmor-baseline-template", baselineTemplate()},
	}

	for _, t := range templates {
		if err := putTemplate(client, base, user, pass, t.name, t.body); err != nil {
			fmt.Fprintf(os.Stderr, "FAIL %s: %v\n", t.name, err)
			os.Exit(1)
		}
		fmt.Printf("OK   %s\n", t.name)
	}

	// Also register ISM policy for log retention
	if err := putISMPolicy(client, base, user, pass); err != nil {
		fmt.Fprintf(os.Stderr, "WARN ism policy: %v\n", err)
	} else {
		fmt.Println("OK   hivearmor-ism-policy")
	}

	fmt.Println("\nAll index templates applied successfully.")
}

func putTemplate(client *http.Client, base, user, pass, name string, body map[string]any) error {
	data, _ := json.Marshal(body)
	req, _ := http.NewRequest("PUT", base+"/_index_template/"+name, bytes.NewReader(data))
	req.SetBasicAuth(user, pass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func putISMPolicy(client *http.Client, base, user, pass string) error {
	policy := map[string]any{
		"policy": map[string]any{
			"description": "HiveArmor log lifecycle: hot 7d → warm 30d → delete 90d",
			"default_state": "hot",
			"states": []map[string]any{
				{
					"name": "hot",
					"actions": []map[string]any{},
					"transitions": []map[string]any{
						{
							"state_name": "warm",
							"conditions": map[string]any{"min_index_age": "7d"},
						},
					},
				},
				{
					"name": "warm",
					"actions": []map[string]any{
						{"replica_count": map[string]any{"number_of_replicas": 0}},
					},
					"transitions": []map[string]any{
						{
							"state_name": "delete",
							"conditions": map[string]any{"min_index_age": "90d"},
						},
					},
				},
				{
					"name":    "delete",
					"actions": []map[string]any{{"delete": map[string]any{}}},
					"transitions": []map[string]any{},
				},
			},
			"ism_template": []map[string]any{
				{"index_patterns": []string{"v3-hive-log-*", "v3-hive-alert-*"}},
			},
		},
	}
	data, _ := json.Marshal(policy)
	req, _ := http.NewRequest("PUT", base+"/_plugins/_ism/policies/hivearmor-lifecycle", bytes.NewReader(data))
	req.SetBasicAuth(user, pass)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func geoProperties() map[string]any {
	return map[string]any{
		"country":     kw(),
		"city":        kw(),
		"countryCode": kw(),
		"asn":         kw(),
		"aso":         kw(),
		"accuracy":    intField(),
		"coordinates": map[string]any{"type": "geo_point"},
		"latitude":    map[string]any{"type": "double"},
		"longitude":   map[string]any{"type": "double"},
	}
}

func sideProperties() map[string]any {
	return map[string]any{
		"ip":                    map[string]any{"type": "ip"},
		"port":                  intField(),
		"host":                  kw(),
		"user":                  kwText(),
		"group":                 kw(),
		"domain":                kw(),
		"mac":                   kw(),
		"url":                   kwText(),
		"cidr":                  kw(),
		"bytesSent":             longField(),
		"bytesReceived":         longField(),
		"packagesSent":          longField(),
		"packagesReceived":      longField(),
		"process":               kw(),
		"processState":          kw(),
		"command":               kwText(),
		"file":                  kw(),
		"path":                  kw(),
		"filename":              kw(),
		"sizeInBytes":           longField(),
		"mimeType":              kw(),
		"hash":                  kw(),
		"md5":                   kw(),
		"sha1":                  kw(),
		"sha256":                kw(),
		"sha512":                kw(),
		"email":                 kw(),
		"emailSubject":          kwText(),
		"operatingSystem":       kw(),
		"cpe":                   kw(),
		"cve":                   kw(),
		"malware":               kw(),
		"malwareFamily":         kw(),
		"malwareType":           kw(),
		"ja3Fingerprint":        kw(),
		"jarmFingerprint":       kw(),
		"sshBanner":             kw(),
		"sshFingerprint":        kw(),
		"certificateFingerprint": kw(),
		"geolocation":           map[string]any{"properties": geoProperties()},
	}
}

func logTemplate() map[string]any {
	return map[string]any{
		"index_patterns": []string{"v3-hive-log-*"},
		"priority":       100,
		"template": map[string]any{
			"settings": map[string]any{
				"number_of_shards":                1,
				"number_of_replicas":              0,
				"index.mapping.total_fields.limit": 50000,
				"index.refresh_interval":          "5s",
				"index.codec":                     "best_compression",
			},
			"mappings": map[string]any{
				"dynamic": true,
				"properties": map[string]any{
					"@timestamp":       dateField(),
					"deviceTime":       dateField(),
					"id":               kw(),
					"dataType":         kw(),
					"dataSource":       kw(),
					"tenantId":         kw(),
					"tenantName":       kw(),
					"raw":              map[string]any{"type": "text", "index": false},
					"action":           kw(),
					"actionResult":     kw(),
					"severity":         kw(),
					"statusCode":       intField(),
					"protocol":         kw(),
					"connectionStatus": kw(),
					"origin":           map[string]any{"properties": sideProperties()},
					"target":           map[string]any{"properties": sideProperties()},
					"errors":           kw(),
					// asset enrichment fields
					"asset": map[string]any{
						"properties": map[string]any{
							"hostname":      kw(),
							"criticality":   kw(),
							"businessUnit":  kw(),
							"owner":         kw(),
						},
					},
					// threat intel enrichment
					"threatIntel": map[string]any{
						"properties": map[string]any{
							"matched":  map[string]any{"type": "boolean"},
							"source":   kw(),
							"severity": kw(),
							"category": kw(),
						},
					},
					// anomaly detection
					"anomaly": map[string]any{
						"properties": map[string]any{
							"detected":    map[string]any{"type": "boolean"},
							"baselineMean": map[string]any{"type": "double"},
							"stddev":       map[string]any{"type": "double"},
							"zScore":       map[string]any{"type": "double"},
						},
					},
				},
			},
		},
	}
}

func alertTemplate() map[string]any {
	return map[string]any{
		"index_patterns": []string{"v3-hive-alert-*"},
		"priority":       100,
		"template": map[string]any{
			"settings": map[string]any{
				"number_of_shards":   1,
				"number_of_replicas": 0,
				"index.mapping.total_fields.limit": 10000,
				"index.refresh_interval": "1s",
			},
			"mappings": map[string]any{
				"properties": map[string]any{
					"@timestamp":      dateField(),
					"id":              kw(),
					"parentId":        kw(),
					"offenseId":       kw(),
					"status":          intField(),
					"statusLabel":     kw(),
					"isIncident":      map[string]any{"type": "boolean"},
					"name":            kwText(),
					"category":        kw(),
					"technique":       kw(),
					"severity":        intField(),
					"severityLabel":   kw(),
					"description":     map[string]any{"type": "text", "index": false},
					"solution":        map[string]any{"type": "text", "index": false},
					"reference":       kw(),
					"dataType":        kw(),
					"dataSource":      kw(),
					"tenantId":        kw(),
					"tenantName":      kw(),
					"tags":            kw(),
					"notes":           map[string]any{"type": "text", "index": false},
					"deduplicatedBy":  kw(),
					"groupedBy":       kw(),
					"errors":          kw(),
					"impactScore":     intField(),
					"impact": map[string]any{
						"properties": map[string]any{
							"confidentiality": intField(),
							"integrity":       intField(),
							"availability":    intField(),
						},
					},
					"adversary": map[string]any{"properties": sideProperties()},
					"target":    map[string]any{"properties": sideProperties()},
					// SOC AI
					"gpt_timestamp":      dateField(),
					"gpt_classification": kw(),
					"gpt_reasoning":      map[string]any{"type": "text", "index": false},
					"gpt_next_steps":     map[string]any{"type": "text", "index": false},
				},
			},
		},
	}
}

func riskTemplate() map[string]any {
	return map[string]any{
		"index_patterns": []string{"v3-hive-risk-scores-*"},
		"priority":       100,
		"template": map[string]any{
			"settings": map[string]any{
				"number_of_shards":   1,
				"number_of_replicas": 0,
				"index.refresh_interval": "5s",
			},
			"mappings": map[string]any{
				"properties": map[string]any{
					"@timestamp":  dateField(),
					"entityType":  kw(),
					"entityValue": kw(),
					"score":       map[string]any{"type": "double"},
					"ruleId":      kw(),
					"ruleName":    kw(),
					"dataType":    kw(),
					"dataSource":  kw(),
					"increment":   intField(),
					"threshold":   intField(),
				},
			},
		},
	}
}

func offenseTemplate() map[string]any {
	return map[string]any{
		"index_patterns": []string{"v3-hive-offense-*"},
		"priority":       100,
		"template": map[string]any{
			"settings": map[string]any{
				"number_of_shards":   1,
				"number_of_replicas": 0,
				"index.refresh_interval": "2s",
			},
			"mappings": map[string]any{
				"properties": map[string]any{
					"@timestamp":  dateField(),
					"lastUpdate":  dateField(),
					"id":          kw(),
					"name":        kwText(),
					"status":      kw(),
					"magnitude":   map[string]any{"type": "double"},
					"alertCount":  intField(),
					"dataTypes":   kw(),
					"alerts":      kw(),
					"adversary":   map[string]any{"properties": sideProperties()},
					"target":      map[string]any{"properties": sideProperties()},
					"description": map[string]any{"type": "text", "index": false},
				},
			},
		},
	}
}

func lookupTemplate() map[string]any {
	return map[string]any{
		"index_patterns": []string{"v3-hive-lookup-*"},
		"priority":       100,
		"template": map[string]any{
			"settings": map[string]any{
				"number_of_shards":   1,
				"number_of_replicas": 0,
			},
			"mappings": map[string]any{
				"properties": map[string]any{
					"@timestamp":    dateField(),
					"type":          kw(),
					"ip":            map[string]any{"type": "ip"},
					"hostname":      kw(),
					"mac":           kw(),
					"criticality":   kw(),
					"businessUnit":  kw(),
					"owner":         kw(),
					"department":    kw(),
					"username":      kw(),
					"displayName":   kw(),
					"email":         kw(),
					"accessTier":    kw(),
					"manager":       kw(),
					"domain":        kw(),
					"country":       kw(),
					"notes":         map[string]any{"type": "text", "index": false},
					"tags":          kw(),
					"updatedAt":     dateField(),
					// threat intel
					"malicious":     map[string]any{"type": "boolean"},
					"malwareFamily": kw(),
					"source":        kw(),
					"confidence":    intField(),
					"firstSeen":     dateField(),
					"lastSeen":      dateField(),
				},
			},
		},
	}
}

func baselineTemplate() map[string]any {
	return map[string]any{
		"index_patterns": []string{"v3-hive-baselines-*"},
		"priority":       100,
		"template": map[string]any{
			"settings": map[string]any{
				"number_of_shards":   1,
				"number_of_replicas": 0,
			},
			"mappings": map[string]any{
				"properties": map[string]any{
					"@timestamp":  dateField(),
					"dataSource":  kw(),
					"dataType":    kw(),
					"action":      kw(),
					"hour":        intField(),
					"mean":        map[string]any{"type": "double"},
					"stddev":      map[string]any{"type": "double"},
					"min":         longField(),
					"max":         longField(),
					"sampleCount": intField(),
					"windowDays":  intField(),
					"computedAt":  dateField(),
				},
			},
		},
	}
}

// field type helpers
func kw() map[string]any { return map[string]any{"type": "keyword"} }
func kwText() map[string]any {
	return map[string]any{
		"type":   "text",
		"fields": map[string]any{"keyword": map[string]any{"type": "keyword", "ignore_above": 1024}},
	}
}
func dateField() map[string]any { return map[string]any{"type": "date"} }
func intField() map[string]any  { return map[string]any{"type": "integer"} }
func longField() map[string]any { return map[string]any{"type": "long"} }

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
