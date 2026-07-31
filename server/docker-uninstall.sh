#!/bin/sh
set -eu

CONTAINER="${1:-EmbyServer}"
DASHBOARD_DIR="${2:-/system/dashboard-ui}"
MODE="${3:-remove}"
DOCKER_USER="${EMBY_CRX_DOCKER_USER:-0}"
UNINSTALLER="${DASHBOARD_DIR}/emby-crx/uninstall.sh"

docker inspect "$CONTAINER" >/dev/null
docker exec --user "$DOCKER_USER" "$CONTAINER" test -f "$UNINSTALLER"
docker exec --user "$DOCKER_USER" "$CONTAINER" sh "$UNINSTALLER" "$DASHBOARD_DIR" "$MODE"
