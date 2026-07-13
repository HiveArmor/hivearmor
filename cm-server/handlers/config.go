package handlers

import "gorm.io/gorm"

// Config holds shared dependencies injected into all handlers.
type Config struct {
	DB            *gorm.DB
	EncryptSalt   string // CM_ENCRYPT_SALT — used to verify agent registration HMACs
	SignPublicKey string  // CM_SIGN_PUBLIC_KEY — PEM RSA public key for version signature verification
}
