package crypto

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	b64 "encoding/base64"

	"golang.org/x/crypto/pbkdf2"
)

const iterationCount = 65536
const saltLength = 16
const keyLength = 16

func setKey(key []byte) (cipher.Block, []byte, error) {
	h := sha1.New()
	h.Write(key)
	salt := h.Sum(nil)
	keyEnc := pbkdf2.Key(key, salt, iterationCount, keyLength, sha1.New)
	block, err := aes.NewCipher(keyEnc)
	if err != nil {
		return nil, nil, err
	}
	return block, salt[:saltLength], nil
}

func AESEncrypt(src string, key []byte) (string, error) {
	if len(src) == 0 {
		return "", &invalidEncryptedDataError{"Invalid crypto"}
	}
	blkEncrypt, ivEncrypt, err := setKey(key)
	if err != nil {
		return "", &invalidAESKeyError{"Invalid crypto"}
	}
	ecb := cipher.NewCBCEncrypter(blkEncrypt, ivEncrypt)
	content := []byte(src)
	content = pkcs5Padding(content, blkEncrypt.BlockSize())
	crypted := make([]byte, len(content))
	ecb.CryptBlocks(crypted, content)
	return b64.StdEncoding.EncodeToString(crypted), nil
}

func AESDecrypt(crypt string, key []byte) (string, error) {
	encryptedData, _ := b64.StdEncoding.DecodeString(crypt)
	if len(crypt) == 0 {
		return "", &invalidPassphraseError{"Invalid crypto"}
	}
	blk, iv, err := setKey(key)
	if err != nil {
		return "", &invalidAESKeyError{"Invalid crypto"}
	}
	ecb := cipher.NewCBCDecrypter(blk, iv)
	decrypted := make([]byte, len(encryptedData))
	ecb.CryptBlocks(decrypted, encryptedData)
	return string(pkcs5Trimming(decrypted)), nil
}

func pkcs5Padding(ciphertext []byte, blockSize int) []byte {
	padding := blockSize - len(ciphertext)%blockSize
	padtext := bytes.Repeat([]byte{byte(padding)}, padding)
	return append(ciphertext, padtext...)
}

func pkcs5Trimming(encrypt []byte) []byte {
	padding := encrypt[len(encrypt)-1]
	return encrypt[:len(encrypt)-int(padding)]
}

type invalidPassphraseError struct{ Msg string }

func (e *invalidPassphraseError) Error() string {
	return "Invalid encryption or decryption passphrase: " + e.Msg
}

type invalidEncryptedDataError struct{ Msg string }

func (e *invalidEncryptedDataError) Error() string { return "Invalid encrypted data: " + e.Msg }

type invalidAESKeyError struct{ Msg string }

func (e *invalidAESKeyError) Error() string { return "Invalid AES key: " + e.Msg }
