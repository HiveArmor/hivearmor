//go:build linux

package ebpf

// RawKernelEvent is the in-kernel struct layout that the BPF program writes
// into the ring buffer.  It must match the C struct event_t defined in
// bpf/events.h exactly (same field order, same padding).
//
// Sizes:
//   Comm:       16 bytes  (TASK_COMM_LEN)
//   Argv:       256 bytes (truncated args)
//   ExePath:    256 bytes
//   FilePath:   256 bytes
//   NewPath:    256 bytes (rename dest)
//   ModuleName: 64 bytes
//
// Total fixed size: see rawKernelEventSize below.
type RawKernelEvent struct {
	EventType   uint32
	PID         uint32
	PPID        uint32
	UID         uint32
	GID         uint32
	RetCode     int32
	Flags       uint32
	ModeOrProt  uint32
	SrcIP       uint32
	DstIP       uint32
	SrcPort     uint16
	DstPort     uint16
	TimestampNs uint64
	Comm        [16]byte
	ExePath     [256]byte
	Argv        [256]byte
	FilePath    [256]byte
	NewPath     [256]byte
	ModuleName  [64]byte
}

// rawKernelEventSize is the expected wire size of RawKernelEvent in bytes.
// Calculated: 10×uint32 (40B) + 2×uint16 (4B) + uint64 (8B) + [16]byte + [256]byte×4 + [64]byte
//           = 40 + 4 + 8 + 16 + 1024 + 64 = 1156
const rawKernelEventSize = 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 2 + 2 + 8 + 16 + 256 + 256 + 256 + 256 + 64

// unmarshalRawKernelEvent deserialises a flat byte slice into a RawKernelEvent.
// All multi-byte integers are little-endian (x86_64 / arm64 default).
func unmarshalRawKernelEvent(b []byte) RawKernelEvent {
	var r RawKernelEvent
	off := 0

	r.EventType = leUint32(b[off:])
	off += 4
	r.PID = leUint32(b[off:])
	off += 4
	r.PPID = leUint32(b[off:])
	off += 4
	r.UID = leUint32(b[off:])
	off += 4
	r.GID = leUint32(b[off:])
	off += 4
	r.RetCode = int32(leUint32(b[off:]))
	off += 4
	r.Flags = leUint32(b[off:])
	off += 4
	r.ModeOrProt = leUint32(b[off:])
	off += 4
	r.SrcIP = leUint32(b[off:])
	off += 4
	r.DstIP = leUint32(b[off:])
	off += 4
	r.SrcPort = leUint16(b[off:])
	off += 2
	r.DstPort = leUint16(b[off:])
	off += 2
	r.TimestampNs = leUint64(b[off:])
	off += 8

	copy(r.Comm[:], b[off:off+16])
	off += 16
	copy(r.ExePath[:], b[off:off+256])
	off += 256
	copy(r.Argv[:], b[off:off+256])
	off += 256
	copy(r.FilePath[:], b[off:off+256])
	off += 256
	copy(r.NewPath[:], b[off:off+256])
	off += 256
	copy(r.ModuleName[:], b[off:off+64])

	return r
}

func leUint16(b []byte) uint16 {
	return uint16(b[0]) | uint16(b[1])<<8
}

func leUint32(b []byte) uint32 {
	return uint32(b[0]) | uint32(b[1])<<8 | uint32(b[2])<<16 | uint32(b[3])<<24
}

func leUint64(b []byte) uint64 {
	return uint64(b[0]) | uint64(b[1])<<8 | uint64(b[2])<<16 | uint64(b[3])<<24 |
		uint64(b[4])<<32 | uint64(b[5])<<40 | uint64(b[6])<<48 | uint64(b[7])<<56
}
