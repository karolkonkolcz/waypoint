# Waypoint iOS — build/test helpers tuned for an agentic (CLI) workflow on Apple Silicon.
#
# Why this exists (Air M2 / 16 GB, no GUI Xcode needed while these run):
#   - Pre-boot ONE simulator and reuse it      -> no cold boot per run (the old "hang")
#   - Split build-for-testing / test-without-building with a FIXED DerivedData
#     ($(DERIVED)) -> second phase is incremental, not a full rebuild every time
#   - Stream readable output via xcbeautify     -> you see progress, no `| tail` freeze
#   - Wrap long xcodebuild in gtimeout          -> a stuck run dies instead of hanging
#
# One-time setup:  brew install xcbeautify coreutils
# Everyday use:    make test        (boot + incremental build + run tests)

SCHEME    := WaypointiOS
PROJECT   := WaypointiOS.xcodeproj
SIM_NAME  := iPhone 17
DEST      := platform=iOS Simulator,name=$(SIM_NAME)
DERIVED   := .build
TIMEOUT   := 600

XCB_FLAGS := -scheme $(SCHEME) -project $(PROJECT) -destination '$(DEST)' \
             -derivedDataPath $(DERIVED) -skipMacroValidation

# Pretty-print if xcbeautify is installed, otherwise pass output through unchanged.
PRETTY := $(shell command -v xcbeautify >/dev/null 2>&1 && echo xcbeautify || echo cat)
# Prefix xcodebuild with a hard timeout if coreutils' gtimeout is available.
RUN    := $(shell command -v gtimeout >/dev/null 2>&1 && echo "gtimeout $(TIMEOUT)")

# Fail the recipe if ANY stage of a pipe fails (so xcodebuild errors aren't masked
# by a successful xcbeautify/cat at the tail).
SHELL       := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

.PHONY: help boot build test test-only run clean sims

help: ## Show available targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*## /\t/' | sort

boot: ## Ensure the simulator is booted (no-op if already running)
	@xcrun simctl boot "$(SIM_NAME)" 2>/dev/null || true
	@open -a Simulator

build: ## Incremental build-for-testing (cached in $(DERIVED))
	$(RUN) xcodebuild build-for-testing $(XCB_FLAGS) | $(PRETTY)

test: boot build test-only ## Everyday loop: boot + incremental build + run tests

test-only: ## Run tests against the already-built binary (skips compile)
	$(RUN) xcodebuild test-without-building $(XCB_FLAGS) \
		-only-testing:WaypointiOSTests | $(PRETTY)

run: boot ## Build & launch the app in the simulator
	$(RUN) xcodebuild build $(XCB_FLAGS) | $(PRETTY)

clean: ## Drop the DerivedData cache (forces a full rebuild next time)
	rm -rf $(DERIVED)

sims: ## List booted simulators
	@xcrun simctl list devices booted
