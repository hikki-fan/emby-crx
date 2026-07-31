#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DASHBOARD_DIR="${1:-/system/dashboard-ui}"

if [ ! -f "${SCRIPT_DIR}/server/install.sh" ]; then
	printf '%s\n' "This adapter must be installed from a complete local checkout." >&2
	printf '%s\n' "Use: sh server/docker-install.sh EmbyServer /system/dashboard-ui" >&2
	exit 1
fi

exec sh "${SCRIPT_DIR}/server/install.sh" "$DASHBOARD_DIR"
