#!/bin/sh
set -eu

DASHBOARD_DIR="${1:-/system/dashboard-ui}"
INDEX_FILE="${DASHBOARD_DIR}/index.html"
HOME_TAB_FILE="${DASHBOARD_DIR}/home/hometab.js"
SECTIONS_FILE="${DASHBOARD_DIR}/modules/tabbedview/sectionscontroller.js"

fail() {
	printf 'Emby Crx compatibility check failed: %s\n' "$1" >&2
	exit 1
}

[ -d "$DASHBOARD_DIR" ] || fail "dashboard directory does not exist: $DASHBOARD_DIR"
[ -f "$INDEX_FILE" ] || fail "index.html was not found: $INDEX_FILE"
[ -f "$HOME_TAB_FILE" ] || fail "home/hometab.js was not found."
[ -f "$SECTIONS_FILE" ] || fail "modules/tabbedview/sectionscontroller.js was not found."

grep -q 'name="application-name" content="Emby"' "$INDEX_FILE" ||
	fail "index.html is not an Emby dashboard."
grep -q 'homeSectionsContainer' "$HOME_TAB_FILE" ||
	fail "homeSectionsContainer is missing from home/hometab.js."
grep -q 'verticalSection' "$SECTIONS_FILE" ||
	fail "the 4.9 home-section renderer signature is missing."
grep -q 'itemsContainer' "$SECTIONS_FILE" ||
	fail "the home-section items container signature is missing."

if grep -q 'section0' "$HOME_TAB_FILE"; then
	printf '%s\n' "Compatible legacy home layout detected."
else
	printf '%s\n' "Compatible Emby 4.9-style home layout detected (no .section0 dependency)."
fi
