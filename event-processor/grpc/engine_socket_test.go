package grpc

import (
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSocketPermissions_are0600(t *testing.T) {
	path := filepath.Join(os.TempDir(), "test_hivearmor_auth.sock")
	defer os.Remove(path)

	listener, err := createSocket(path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	got := info.Mode().Perm()
	want := os.FileMode(0o600)
	if got != want {
		t.Errorf("socket permissions: got %04o, want %04o", got, want)
	}
}

func TestSocketHandshake_withCorrectSecret_succeeds(t *testing.T) {
	secret := "test-secret"
	path := filepath.Join(os.TempDir(), "test_hivearmor_hs.sock")
	defer os.Remove(path)

	listener, err := createSocket(path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	done := make(chan error, 1)
	go func() {
		conn, err := net.Dial("unix", path)
		if err != nil {
			done <- err
			return
		}
		conn.SetDeadline(time.Now().Add(5 * time.Second))
		_, err = conn.Write([]byte(secret))
		done <- err
		conn.Close()
	}()

	conn, err := listener.Accept()
	if err != nil {
		t.Fatalf("accept failed: %v", err)
	}
	defer conn.Close()

	if err := checkHandshake(conn, secret); err != nil {
		t.Errorf("expected successful auth, got: %v", err)
	}

	if clientErr := <-done; clientErr != nil {
		t.Errorf("client write error: %v", clientErr)
	}
}

func TestSocketHandshake_withWrongSecret_closes(t *testing.T) {
	path := filepath.Join(os.TempDir(), "test_hivearmor_wrong.sock")
	defer os.Remove(path)

	listener, err := createSocket(path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	go func() {
		conn, err := net.Dial("unix", path)
		if err != nil {
			return
		}
		conn.Write([]byte("wrong-secret-xxxx"))
		conn.Close()
	}()

	conn, err := listener.Accept()
	if err != nil {
		t.Fatalf("accept failed: %v", err)
	}
	defer conn.Close()

	if err := checkHandshake(conn, "correct-secret"); err == nil {
		t.Error("expected auth failure, got success")
	}
}
