//go:build !windows

package config

import "os"

func replaceProtectedFile(source, destination string) error {
	return os.Rename(source, destination)
}
