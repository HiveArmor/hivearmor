package config

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/shared/fs"
	"gopkg.in/yaml.v3"
)

const credentialEnvelopePrefix = "ha_cfg_v2:"

type InstallationUUID struct {
	UUID string `yaml:"uuid"`
}

// AgentMode controls which subsystems the agent starts.
// "log"  — platform log collection only (default, lower footprint).
// "edr"  — full log collection plus EDR telemetry (process, file, network events).
type AgentMode string

const (
	AgentModeLog AgentMode = "log"
	AgentModeEDR AgentMode = "edr"
)

type Config struct {
	Server             string    `yaml:"server"`
	AgentID            uint      `yaml:"agent-id"`
	AgentKey           string    `yaml:"agent-key"`
	SkipCertValidation bool      `yaml:"insecure"`
	Mode               AgentMode `yaml:"mode"`
}

// IsEDR returns true when the agent is configured for EDR mode.
func (c *Config) IsEDR() bool {
	return c.Mode == AgentModeEDR
}

var (
	cnf                = Config{}
	confOnce           sync.Once
	installationId     = ""
	installationIdOnce sync.Once
)

func GetCurrentConfig() (*Config, error) {
	var errR error
	confOnce.Do(func() {
		var encryptConfig Config
		if err := fs.ReadYAML(ConfigurationFile, &encryptConfig); err != nil {
			errR = fmt.Errorf("error reading config file: %v", err)
			return
		}

		id, err := GetUUID()
		if err != nil {
			errR = fmt.Errorf("failed to get uuid: %v", err)
			return
		}

		agentKey, err := decryptAgentCredential(encryptConfig.AgentKey, REPLACE_KEY, id)
		if err != nil {
			errR = fmt.Errorf("error decrypting agent key: %v", err)
			return
		}

		cnf.Server = encryptConfig.Server
		cnf.AgentID = encryptConfig.AgentID
		cnf.AgentKey = agentKey
		cnf.SkipCertValidation = encryptConfig.SkipCertValidation
		cnf.Mode = encryptConfig.Mode
		if cnf.Mode == "" {
			cnf.Mode = AgentModeLog
		}
	})
	if errR != nil {
		return nil, errR
	}
	return &cnf, nil
}

func SaveConfig(cnf *Config) error {
	id, err := getOrCreateUUID()
	if err != nil {
		return fmt.Errorf("failed to generate uuid: %v", err)
	}

	agentKey, err := encryptAgentCredential(cnf.AgentKey, REPLACE_KEY, id)
	if err != nil {
		return fmt.Errorf("error encrypting agent key: %v", err)
	}

	encryptConf := &Config{
		Server:             cnf.Server,
		AgentID:            cnf.AgentID,
		AgentKey:           agentKey,
		SkipCertValidation: cnf.SkipCertValidation,
		Mode:               cnf.Mode,
	}

	if err := writeProtectedYAML(ConfigurationFile, encryptConf); err != nil {
		return err
	}
	return nil
}

func getOrCreateUUID() (string, error) {
	if fs.Exists(UUIDFileName) {
		var existing InstallationUUID
		if err := fs.ReadYAML(UUIDFileName, &existing); err != nil {
			return "", fmt.Errorf("read installation uuid: %w", err)
		}
		if _, err := uuid.Parse(existing.UUID); err != nil {
			return "", fmt.Errorf("installation uuid is invalid: %w", err)
		}
		return existing.UUID, nil
	}
	return GenerateNewUUID()
}

func GenerateNewUUID() (string, error) {
	id, err := uuid.NewRandom()
	if err != nil {
		return "", fmt.Errorf("failed to generate uuid: %v", err)
	}

	InstallationUUID := InstallationUUID{
		UUID: id.String(),
	}

	if err = writeProtectedYAML(UUIDFileName, InstallationUUID); err != nil {
		return "", fmt.Errorf("error writing uuid file: %v", err)
	}

	return InstallationUUID.UUID, nil
}

func GetUUID() (string, error) {
	var errR error
	installationIdOnce.Do(func() {
		var id = InstallationUUID{}
		if err := fs.ReadYAML(UUIDFileName, &id); err != nil {
			errR = fmt.Errorf("error reading uuid file: %v", err)
			return
		}

		installationId = id.UUID
	})

	if errR != nil {
		return "", errR
	}

	return installationId, nil
}

func deriveCredentialKey(baseKey, installationID string) ([]byte, error) {
	if strings.TrimSpace(baseKey) == "" {
		return nil, fmt.Errorf("agent credential wrapping key is not configured")
	}
	if _, err := uuid.Parse(installationID); err != nil {
		return nil, fmt.Errorf("installation uuid is invalid: %w", err)
	}
	return hkdf.Key(sha256.New, []byte(baseKey), []byte(installationID), "hivearmor:agent-config:v2", 32)
}

func encryptAgentCredential(plaintext, baseKey, installationID string) (string, error) {
	if plaintext == "" {
		return "", fmt.Errorf("agent credential is empty")
	}
	key, err := deriveCredentialKey(baseKey, installationID)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create credential cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create credential envelope: %w", err)
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("generate credential nonce: %w", err)
	}
	sealed := aead.Seal(nil, nonce, []byte(plaintext), []byte(credentialEnvelopePrefix))
	payload := append(nonce, sealed...)
	return credentialEnvelopePrefix + base64.RawURLEncoding.EncodeToString(payload), nil
}

func decryptAgentCredential(envelope, baseKey, installationID string) (string, error) {
	if !strings.HasPrefix(envelope, credentialEnvelopePrefix) {
		// Read-only compatibility for configurations written before the v2
		// authenticated envelope. Every subsequent save upgrades the value.
		return utils.DecryptAES(envelope, baseKey, installationID)
	}
	key, err := deriveCredentialKey(baseKey, installationID)
	if err != nil {
		return "", err
	}
	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(envelope, credentialEnvelopePrefix))
	if err != nil {
		return "", fmt.Errorf("decode credential envelope: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create credential cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create credential envelope: %w", err)
	}
	if len(payload) < aead.NonceSize()+aead.Overhead() {
		return "", fmt.Errorf("credential envelope is truncated")
	}
	nonce, ciphertext := payload[:aead.NonceSize()], payload[aead.NonceSize():]
	plaintext, err := aead.Open(nil, nonce, ciphertext, []byte(credentialEnvelopePrefix))
	if err != nil {
		return "", fmt.Errorf("authenticate credential envelope: %w", err)
	}
	return string(plaintext), nil
}

func writeProtectedYAML(path string, value any) error {
	content, err := yaml.Marshal(value)
	if err != nil {
		return fmt.Errorf("marshal protected yaml: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return fmt.Errorf("create protected config directory: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".hivearmor-config-*")
	if err != nil {
		return fmt.Errorf("create protected config file: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return fmt.Errorf("protect config file: %w", err)
	}
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return fmt.Errorf("write protected config file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync protected config file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close protected config file: %w", err)
	}
	if err := replaceProtectedFile(temporaryPath, path); err != nil {
		return fmt.Errorf("replace protected config file: %w", err)
	}
	return nil
}
