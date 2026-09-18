"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("prevents the home banner from collapsing inside Emby's flex scroller", () => {
	const css = fs.readFileSync(
		path.join(__dirname, "..", "static", "css", "style.css"),
		"utf8"
	);
	const bannerRule = css.match(/\.misty-banner\s*\{([^}]+)\}/);

	assert.ok(bannerRule, "missing .misty-banner rule");
	assert.match(bannerRule[1], /flex\s*:\s*0\s+0\s+auto\s*;/);
});

test("removes only the active CRX home's header offset", () => {
	const css = fs.readFileSync(
		path.join(__dirname, "..", "static", "css", "style.css"),
		"utf8"
	);

	assert.match(css, /body\.misty-home-header-overlay \.view:not\(\.hide\) \.scrollSlider\.padded-top-page/);
	assert.match(css, /padding-top:\s*0\s*!important/);
});

test("reserves space below the managed library overlay for following home rows", () => {
	const css = fs.readFileSync(
		path.join(__dirname, "..", "static", "css", "style.css"),
		"utf8"
	);

	const managedLibraryRule = css.match(/\.misty-library-section\.misty-library-section-managed\s*\{([^}]+)\}/);
	assert.ok(managedLibraryRule, "missing managed library overlap rule");
	assert.match(managedLibraryRule[1], /display:\s*flex/);
	assert.match(managedLibraryRule[1], /justify-content:\s*flex-end/);
	assert.match(managedLibraryRule[1], /min-height:\s*clamp\(12rem,\s*16vw,\s*20rem\)/);
	assert.match(managedLibraryRule[1], /margin-bottom:\s*0/);
	assert.match(css, /margin-bottom:\s*calc\(-1 \* clamp\(12rem,\s*16vw,\s*20rem\)\)/);
});
