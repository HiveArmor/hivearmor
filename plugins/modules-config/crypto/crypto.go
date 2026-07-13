package crypto

import (
	"fmt"
	"strings"

	aescrypto "github.com/hivearmor/shared/crypto"
	"github.com/threatwinds/go-sdk/catcher"
	"github.com/hivearmor/plugins/modules-config/config"
)

const (
	confTypePassword = "password"
	confTypeFile     = "file"
	moduleGCP        = "GCP"
)

func DecryptConfigurationSection(section *config.ConfigurationSection, key string) error {
	if section == nil {
		return nil
	}

	for _, group := range section.ModuleGroups {
		decryptGroupConfigurations(section.ModuleName, group, key)
	}

	return nil
}

func DecryptModuleGroup(moduleName string, group *config.ModuleGroup, key string) error {
	if group == nil {
		return nil
	}

	decryptGroupConfigurations(moduleName, group, key)
	return nil
}

func decryptGroupConfigurations(moduleName string, group *config.ModuleGroup, key string) {
	if group == nil {
		return
	}

	for _, cnf := range group.ModuleGroupConfigurations {
		if !shouldDecrypt(moduleName, cnf.ConfDataType, cnf.ConfValue) {
			continue
		}

		plain, err := safeAESDecrypt(cnf.ConfValue, key)
		if err != nil {
			_ = catcher.Error("failed to decrypt configuration value", err, map[string]any{
				"process":      "plugin_com.hivearmor.modules-config",
				"module":       moduleName,
				"groupId":      group.Id,
				"confKey":      cnf.ConfKey,
				"confDataType": cnf.ConfDataType,
			})
			continue
		}

		cnf.ConfValue = plain
	}
}

func safeAESDecrypt(cipherText, key string) (plain string, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("decryption failed (malformed ciphertext or wrong key): %v", r)
		}
	}()
	return aescrypto.AESDecrypt(cipherText, []byte(key))
}

func shouldDecrypt(moduleName, confDataType, confValue string) bool {
	if confValue == "" {
		return false
	}

	dataType := strings.ToLower(strings.TrimSpace(confDataType))
	switch dataType {
	case confTypePassword:
		return true
	case confTypeFile:
		return strings.EqualFold(moduleName, moduleGCP)
	default:
		return false
	}
}
