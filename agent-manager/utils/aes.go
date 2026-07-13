package utils

import (
	"github.com/hivearmor/shared/crypto"
)

func DecryptValue(key string, value string) (string, error) {
	return crypto.AESDecrypt(value, []byte(key))
}
