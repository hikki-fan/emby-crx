#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
DASHBOARD_DIR="${1:-/system/dashboard-ui}"
INDEX_FILE="${DASHBOARD_DIR}/index.html"
TARGET_DIR="${DASHBOARD_DIR}/emby-crx"
BACKUP_FILE="${INDEX_FILE}.emby-crx.backup"
START_MARKER='<!-- emby-crx-4.9:start -->'
END_MARKER='<!-- emby-crx-4.9:end -->'
VERSION=$(tr -d '\r\n' < "${SOURCE_ROOT}/VERSION")
TMP_CLEAN=""
TMP_INDEX=""

cleanup() {
	[ -z "$TMP_CLEAN" ] || rm -f -- "$TMP_CLEAN"
	[ -z "$TMP_INDEX" ] || rm -f -- "$TMP_INDEX"
}
trap cleanup EXIT HUP INT TERM

fail() {
	printf 'Emby Crx installation failed: %s\n' "$1" >&2
	exit 1
}

sh "${SCRIPT_DIR}/check-compatibility.sh" "$DASHBOARD_DIR"

[ -f "${SOURCE_ROOT}/content/main.js" ] || fail "content/main.js is missing from the installation source."
[ -f "${SOURCE_ROOT}/static/css/style.css" ] || fail "static/css/style.css is missing from the installation source."
[ -f "${SOURCE_ROOT}/server/config.js" ] || fail "server/config.js is missing from the installation source."
[ -f "${SOURCE_ROOT}/server/uninstall.sh" ] || fail "server/uninstall.sh is missing from the installation source."
[ -w "$DASHBOARD_DIR" ] || fail "dashboard directory is not writable: $DASHBOARD_DIR"
[ -w "$INDEX_FILE" ] || fail "index.html is not writable: $INDEX_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
	cp -p -- "$INDEX_FILE" "$BACKUP_FILE"
	printf 'Created backup: %s\n' "$BACKUP_FILE"
fi

mkdir -p -- "$TARGET_DIR"
cp -- "${SOURCE_ROOT}/content/main.js" "${TARGET_DIR}/main.js"
cp -- "${SOURCE_ROOT}/static/css/style.css" "${TARGET_DIR}/style.css"
cp -- "${SOURCE_ROOT}/server/config.js" "${TARGET_DIR}/config.default.js"
cp -- "${SOURCE_ROOT}/server/uninstall.sh" "${TARGET_DIR}/uninstall.sh"
cp -- "${SOURCE_ROOT}/VERSION" "${TARGET_DIR}/VERSION"
if [ ! -f "${TARGET_DIR}/config.js" ]; then
	cp -- "${SOURCE_ROOT}/server/config.js" "${TARGET_DIR}/config.js"
	printf 'Created editable configuration: %s\n' "${TARGET_DIR}/config.js"
else
	printf 'Preserved existing configuration: %s\n' "${TARGET_DIR}/config.js"
fi

TMP_CLEAN=$(mktemp "${DASHBOARD_DIR}/.emby-crx-clean.XXXXXX")
TMP_INDEX=$(mktemp "${DASHBOARD_DIR}/.emby-crx-index.XXXXXX")

awk -v start="$START_MARKER" -v end="$END_MARKER" '
	index($0, start) { skipping = 1; next }
	index($0, end) { skipping = 0; next }
	skipping { next }
	/emby-crx\/(style\.css|common-utils\.js|jquery-3\.6\.0\.min\.js|md5\.min\.js|config\.js|main\.js)/ { next }
	{ print }
	END {
		if (skipping) exit 42
	}
' "$INDEX_FILE" > "$TMP_CLEAN" || fail "the existing injection block is incomplete."

awk -v version="$VERSION" '
	/<\/head>/ && !inserted {
		print "    <!-- emby-crx-4.9:start -->"
		print "    <link rel=\"stylesheet\" href=\"emby-crx/style.css?v=" version "\">"
		print "    <script defer src=\"emby-crx/config.js?v=" version "\"></script>"
		print "    <script defer src=\"emby-crx/main.js?v=" version "\"></script>"
		print "    <!-- emby-crx-4.9:end -->"
		inserted = 1
	}
	{ print }
	END {
		if (!inserted) exit 43
	}
' "$TMP_CLEAN" > "$TMP_INDEX" || fail "the closing </head> tag was not found."

mv -- "$TMP_INDEX" "$INDEX_FILE"
TMP_INDEX=""
rm -f -- "$TMP_CLEAN"
TMP_CLEAN=""

printf 'Installed Emby Crx %s into %s\n' "$VERSION" "$DASHBOARD_DIR"
printf '%s\n' "Restart Emby Server, then hard-refresh the Web client."
