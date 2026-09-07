# HiveArmor endpoint agent — common build targets (STAGING CANDIDATE).
#
# Flavors (see scripts/build-slim.sh + release/EXTERNAL_WORK.md DEP-SIZE-01):
#   log / edr  → -tags agent_slim,nonetflow  (default Sensors download)
#   netflow    → -tags agent_slim            (keeps netflow collector)

.PHONY: build-slim build-slim-log build-slim-edr build-slim-netflow

FLAVOR ?= log
GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)
OUT_DIR ?= build/slim

build-slim:
	FLAVOR=$(FLAVOR) GOOS=$(GOOS) GOARCH=$(GOARCH) OUT_DIR=$(OUT_DIR) bash scripts/build-slim.sh

build-slim-log:
	$(MAKE) build-slim FLAVOR=log

build-slim-edr:
	$(MAKE) build-slim FLAVOR=edr

build-slim-netflow:
	$(MAKE) build-slim FLAVOR=netflow
