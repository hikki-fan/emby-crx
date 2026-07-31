#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$SCRIPT_DIR" in
	*/emby-crx) DEFAULT_DASHBOARD_DIR=$(dirname -- "$SCRIPT_DIR") ;;
	*) DEFAULT_DASHBOARD_DIR=/system/dashboard-ui ;;
esac

DASHBOARD_DIR="${1:-$DEFAULT_DASHBOARD_DIR}"
MODE="${2:-remove}"
INDEX_FILE="${DASHBOARD_DIR}/index.html"
TARGET_DIR="${DASHBOARD_DIR}/emby-crx"
BACKUP_FILE="${INDEX_FILE}.emby-crx.backup"
START_MARKER='<!-- emby-crx-4.9:start -->'
END_MARKER='<!-- emby-crx-4.9:end -->'
TMP_INDEX=""

cleanup() {
	[ -z "$TMP_INDEX" ] || rm -f -- "$TMP_INDEX"
}
trap cleanup EXIT HUP INT TERM

fail() {
	printf 'Emby Crx uninstallation failed: %s\n' "$1" >&2
	exit 1
}

[ -f "$INDEX_FILE" ] || fail "index.html was not found: $INDEX_FILE"
[ -w "$INDEX_FILE" ] || fail "index.html is not writable: $INDEX_FILE"

if [ "$MODE" = "--restore-backup" ]; then
	[ -f "$BACKUP_FILE" ] || fail "backup does not exist: $BACKUP_FILE"
	cp -p -- "$BACKUP_FILE" "$INDEX_FILE"
	printf 'Restored backup: %s\n' "$BACKUP_FILE"
else
	TMP_INDEX=$(mktemp "${DASHBOARD_DIR}/.emby-crx-uninstall.XXXXXX")
	awk -v start="$START_MARKER" -v end="$END_MARKER" '
		index($0, start) { skipping = 1; next }
		index($0, end) { skipping = 0; next }
		skipping { next }
		/emby-crx\/(style\.css|common-utils\.js|jquery-3\.6\.0\.min\.js|md5\.min\.js|config\.js|main\.js)/ { next }
		{ print }
		END {
			if (skipping) exit 42
		}
	' "$INDEX_FILE" > "$TMP_INDEX" || fail "the injection block is incomplete."
	mv -- "$TMP_INDEX" "$INDEX_FILE"
	TMP_INDEX=""
	printf '%s\n' "Removed Emby Crx references from index.html."
fi

case "$TARGET_DIR" in
	"$DASHBOARD_DIR"/emby-crx) rm -rf -- "$TARGET_DIR" ;;
	*) fail "refusing to remove unexpected target directory: $TARGET_DIR" ;;
esac

printf '%s\n' "Emby Crx was uninstalled. Restart Emby Server and hard-refresh the Web client."
