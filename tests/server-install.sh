#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
FIXTURE_ROOT=$(mktemp -d)
DASHBOARD_DIR="${FIXTURE_ROOT}/system/dashboard-ui"

cleanup() {
	case "$FIXTURE_ROOT" in
		/tmp/*|*/Temp/*|*/tmp/*) rm -rf -- "$FIXTURE_ROOT" ;;
		*) printf 'Refusing to remove unexpected test path: %s\n' "$FIXTURE_ROOT" >&2 ;;
	esac
}
trap cleanup EXIT HUP INT TERM

mkdir -p "${DASHBOARD_DIR}/home" "${DASHBOARD_DIR}/modules/tabbedview"
cat > "${DASHBOARD_DIR}/index.html" <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta name="application-name" content="Emby">
</head>
<body></body>
</html>
EOF
chmod 0644 "${DASHBOARD_DIR}/index.html"
INDEX_OWNER=$(stat -c '%u:%g' "${DASHBOARD_DIR}/index.html")
printf '%s\n' 'view.classList.add("homeSectionsContainer")' > "${DASHBOARD_DIR}/home/hometab.js"
printf '%s\n' 'const sectionClass = "verticalSection"; const itemClass = "itemsContainer";' > "${DASHBOARD_DIR}/modules/tabbedview/sectionscontroller.js"

sh "${SOURCE_ROOT}/server/install.sh" "$DASHBOARD_DIR"
test "$(stat -c '%a' "${DASHBOARD_DIR}/index.html")" = "644"
test "$(stat -c '%u:%g' "${DASHBOARD_DIR}/index.html")" = "$INDEX_OWNER"
grep -q '<!-- emby-crx-4.9:start -->' "${DASHBOARD_DIR}/index.html"
grep -q 'emby-crx/config.js' "${DASHBOARD_DIR}/index.html"
test -f "${DASHBOARD_DIR}/emby-crx/main.js"
test -f "${DASHBOARD_DIR}/emby-crx/config.js"

CHECKSUM_BEFORE=$(cksum "${DASHBOARD_DIR}/emby-crx/config.js")
sh "${SOURCE_ROOT}/server/install.sh" "$DASHBOARD_DIR"
CHECKSUM_AFTER=$(cksum "${DASHBOARD_DIR}/emby-crx/config.js")
test "$CHECKSUM_BEFORE" = "$CHECKSUM_AFTER"
test "$(grep -c '<!-- emby-crx-4.9:start -->' "${DASHBOARD_DIR}/index.html")" -eq 1

sh "${DASHBOARD_DIR}/emby-crx/uninstall.sh" "$DASHBOARD_DIR"
test "$(stat -c '%a' "${DASHBOARD_DIR}/index.html")" = "644"
test "$(stat -c '%u:%g' "${DASHBOARD_DIR}/index.html")" = "$INDEX_OWNER"
! grep -q 'emby-crx/' "${DASHBOARD_DIR}/index.html"
test ! -d "${DASHBOARD_DIR}/emby-crx"
test -f "${DASHBOARD_DIR}/index.html.emby-crx.backup"

sh "${SOURCE_ROOT}/server/install.sh" "$DASHBOARD_DIR"
sh "${DASHBOARD_DIR}/emby-crx/uninstall.sh" "$DASHBOARD_DIR" --restore-backup
test "$(stat -c '%a' "${DASHBOARD_DIR}/index.html")" = "644"
test "$(stat -c '%u:%g' "${DASHBOARD_DIR}/index.html")" = "$INDEX_OWNER"
cmp "${DASHBOARD_DIR}/index.html" "${DASHBOARD_DIR}/index.html.emby-crx.backup"
test ! -d "${DASHBOARD_DIR}/emby-crx"

printf '%s\n' "Server install/uninstall test passed."
