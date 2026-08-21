//go:build linux

package ebpf

import (
	"fmt"
	"io"
	"time"
)

// RingBufReader is the interface that the event loop uses to read from the
// kernel ring buffer.  In production this is backed by cilium/ebpf's
// ringbuf.Reader; in tests it can be replaced with a channel-backed mock.
type RingBufReader interface {
	// ReadWithDeadline returns one raw event record.  Returns io.EOF when
	// the underlying map is closed, and a timeout error when no event
	// arrives within the deadline.
	ReadWithDeadline(deadline time.Time) ([]byte, error)
	// Close releases kernel resources.
	Close() error
}

// BPFObjects is the interface wrapping all loaded BPF maps and programs.
// In production this is backed by the cilium/ebpf generated struct.
type BPFObjects interface {
	// Close detaches all programs and frees all maps.
	Close()
}

// loadAndAttach loads the compiled BPF object, attaches all tracepoints, and
// returns an event ring buffer reader.
//
// Implementation notes:
//
//   When github.com/cilium/ebpf is added to go.mod (Sprint 6 of the roadmap),
//   replace the body of this function with:
//
//       objs := &bpfObjects{}
//       if err := loadBpfObjects(objs, nil); err != nil {
//           return nil, nil, fmt.Errorf("load BPF objects: %w", err)
//       }
//
//       // Attach tracepoints
//       tpExec, _ := link.Tracepoint("syscalls", "sys_enter_execve", objs.TraceExecve, nil)
//       tpExit, _ := link.Tracepoint("syscalls", "sys_exit_execve", objs.TraceExecveExit, nil)
//       tpOpen, _ := link.Tracepoint("syscalls", "sys_enter_openat", objs.TraceOpenat, nil)
//       tpConn, _ := link.Tracepoint("syscalls", "sys_enter_connect", objs.TraceConnect, nil)
//       tpModule, _ := link.Tracepoint("syscalls", "sys_enter_init_module", objs.TraceInitModule, nil)
//       // ... attach remaining tracepoints
//
//       rd, err := ringbuf.NewReader(objs.Events)
//       if err != nil { return nil, nil, err }
//
//       // Wrap rd in a productionRingBufReader{} that implements RingBufReader
//       return &productionBPFObjects{objs, tpExec, tpExit, ...}, &productionRingBufReader{rd}, nil
//
//   The stub below returns ErrBTFNotAvailable so the agent falls through to
//   the auditd path until the real implementation is wired in.
func loadAndAttach() (BPFObjects, RingBufReader, error) {
	// Real implementation requires:
	//   go get github.com/cilium/ebpf@v0.17.0
	// and the compiled BPF object embedded via go:generate / bpf2go.
	//
	// Return BTF-not-available so the caller falls back to auditd.
	return nil, nil, fmt.Errorf("%w: cilium/ebpf not yet linked (run: go get github.com/cilium/ebpf@v0.17.0 and regenerate BPF objects)", ErrBTFNotAvailable)
}

// noopBPFObjects satisfies BPFObjects for tests and the stub path.
type noopBPFObjects struct{}

func (n *noopBPFObjects) Close() {}

// noopRingBuf satisfies RingBufReader and immediately returns io.EOF.
type noopRingBuf struct{}

func (n *noopRingBuf) ReadWithDeadline(_ time.Time) ([]byte, error) {
	return nil, io.EOF
}

func (n *noopRingBuf) Close() error { return nil }
