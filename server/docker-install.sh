#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
CONTAINER="${1:-EmbyServer}"
DASHBOARD_DIR="${2:-/system/dashboard-ui}"
DOCKER_USER="${EMBY_CRX_DOCKER_USER:-0}"
REMOTE_ROOT="/tmp/emby-crx-adapter-$$"

cleanup() {
	docker exec --user "$DOCKER_USER" "$CONTAINER" rm -rf -- "$REMOTE_ROOT" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

docker inspect "$CONTAINER" >/dev/null
docker exec --user "$DOCKER_USER" "$CONTAINER" mkdir -p \
	"${REMOTE_ROOT}/content" \
	"${REMOTE_ROOT}/static/css" \
	"${REMOTE_ROOT}/server"

docker cp "${SOURCE_ROOT}/content/main.js" "${CONTAINER}:${REMOTE_ROOT}/content/main.js"
docker cp "${SOURCE_ROOT}/static/css/style.css" "${CONTAINER}:${REMOTE_ROOT}/static/css/style.css"
docker cp "${SOURCE_ROOT}/server/config.js" "${CONTAINER}:${REMOTE_ROOT}/server/config.js"
docker cp "${SOURCE_ROOT}/server/check-compatibility.sh" "${CONTAINER}:${REMOTE_ROOT}/server/check-compatibility.sh"
docker cp "${SOURCE_ROOT}/server/install.sh" "${CONTAINER}:${REMOTE_ROOT}/server/install.sh"
docker cp "${SOURCE_ROOT}/server/uninstall.sh" "${CONTAINER}:${REMOTE_ROOT}/server/uninstall.sh"
docker cp "${SOURCE_ROOT}/VERSION" "${CONTAINER}:${REMOTE_ROOT}/VERSION"

docker exec --user "$DOCKER_USER" "$CONTAINER" chmod +x \
	"${REMOTE_ROOT}/server/check-compatibility.sh" \
	"${REMOTE_ROOT}/server/install.sh" \
	"${REMOTE_ROOT}/server/uninstall.sh"
docker exec --user "$DOCKER_USER" "$CONTAINER" sh "${REMOTE_ROOT}/server/install.sh" "$DASHBOARD_DIR"
