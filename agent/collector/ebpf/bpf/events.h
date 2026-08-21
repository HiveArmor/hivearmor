/* SPDX-License-Identifier: Apache-2.0 */
/*
 * events.h — shared kernel event structure for HiveArmor eBPF programs.
 *
 * This header defines the wire format written into the BPF ring buffer.
 * The Go side (wire_linux.go) must have an identical layout.
 *
 * All integers are little-endian (the default on x86_64 and arm64).
 */

#pragma once

#include <linux/types.h>

/* Event type identifiers — keep in sync with eventTypeString() in collector_linux.go */
#define EVENT_EXEC         1
#define EVENT_EXIT         2
#define EVENT_OPEN         3
#define EVENT_CONNECT      4
#define EVENT_ACCEPT       5
#define EVENT_BIND         6
#define EVENT_UNLINK       7
#define EVENT_RENAME       8
#define EVENT_CHMOD        9
#define EVENT_CHOWN        10
#define EVENT_SETUID       11
#define EVENT_SETGID       12
#define EVENT_PTRACE       13
#define EVENT_MMAP_EXEC    14
#define EVENT_MOUNT        15
#define EVENT_INIT_MODULE  16
#define EVENT_FINIT_MODULE 17

#define TASK_COMM_LEN   16
#define ARGV_LEN        256
#define PATH_LEN        256
#define MODULE_NAME_LEN 64

/*
 * event_t — the struct written to the ring buffer by every BPF program.
 *
 * Field order must match RawKernelEvent in wire_linux.go exactly.
 * Padding inserted by the compiler is accounted for by the __u8 _pad fields.
 */
struct event_t {
    __u32 event_type;
    __u32 pid;
    __u32 ppid;
    __u32 uid;
    __u32 gid;
    __s32 ret_code;
    __u32 flags;
    __u32 mode_or_prot;
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u64 timestamp_ns;          /* ktime_get_ns() */
    char  comm[TASK_COMM_LEN];
    char  exe_path[PATH_LEN];
    char  argv[ARGV_LEN];
    char  file_path[PATH_LEN];
    char  new_path[PATH_LEN];    /* rename destination */
    char  module_name[MODULE_NAME_LEN];
} __attribute__((packed));
