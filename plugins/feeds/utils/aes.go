package utils

import (
	"github.com/hivearmor/shared/crypto"
	"github.com/threatwinds/go-sdk/plugins"
)

func DecryptValue(encryptedValue string) (string, error) {
	passphrase := plugins.PluginCfg("com.hivearmor").Get("internalKey").String()
	return crypto.AESDecrypt(encryptedValue, []byte(passphrase))
}
