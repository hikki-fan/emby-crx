"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

global.__EMBY_CRX_DISABLE_AUTO_START__ = true;
const {
	EmbyCrxHome,
	findLibrarySection,
	isHomeRouteValue,
	mergeConfig,
	sectionContainsLibraries,
} = require("../content/main.js");

function createSection(items, cardTypes) {
	const container = { items: items || [] };
	const cards = (cardTypes || []).map((type) => ({ dataset: { type } }));
	return {
		querySelectorAll(selector) {
			if (selector === ".itemsContainer") return [container];
			if (selector === ".card") return cards;
			return [];
		},
	};
}

test("recognizes both Emby hash variants for the home route", () => {
	assert.equal(isHomeRouteValue("#!/home", "/web/index.html"), true);
	assert.equal(isHomeRouteValue("#/home?serverId=1", "/web/index.html"), true);
	assert.equal(isHomeRouteValue("#!/item?id=1", "/web/index.html"), false);
});

test("finds the media-library section by CollectionFolder items instead of its position", () => {
	const latest = createSection([{ Type: "Movie" }]);
	const libraries = createSection([{ Type: "CollectionFolder" }]);
	const home = {
		querySelectorAll() {
			return [latest, libraries];
		},
	};
	assert.equal(findLibrarySection(home), libraries);
});

test("supports a rendered card fallback when container items are not exposed", () => {
	const section = createSection([], ["CollectionFolder"]);
	assert.equal(sectionContainsLibraries(section), true);
});

test("does not treat the first arbitrary section as a library section", () => {
	const home = {
		querySelectorAll() {
			return [createSection([{ Type: "Movie" }]), createSection([{ Type: "Series" }])];
		},
	};
	assert.equal(findLibrarySection(home), null);
});

test("normalizes unsafe numeric configuration values", () => {
	const config = mergeConfig({
		bannerItemCount: 999,
		rotationIntervalMs: 1,
		initializationTimeoutMs: 1,
		maxImageWidth: 99999,
	});
	assert.equal(config.bannerItemCount, 30);
	assert.equal(config.rotationIntervalMs, 3000);
	assert.equal(config.initializationTimeoutMs, 5000);
	assert.equal(config.maxImageWidth, 6000);
});

test("only builds slides from items that actually have backdrop artwork", async () => {
	const controller = new EmbyCrxHome({ bannerItemCount: 3 });
	const details = {
		withoutBackdrop: { Id: "withoutBackdrop", Name: "No image", BackdropImageTags: [] },
		withBackdrop: { Id: "withBackdrop", Name: "Backdrop", BackdropImageTags: ["tag"] },
		withLegacyTag: { Id: "withLegacyTag", Name: "Legacy", ImageTags: { Backdrop: "tag" } },
	};
	const apiClient = {
		getCurrentUserId: () => "user",
		getItems: async () => ({
			Items: Object.keys(details).map((Id) => ({ Id })),
		}),
		getItem: async (_userId, itemId) => details[itemId],
		getImageUrl: (itemId, options) => `${itemId}/${options.type}`,
	};

	const slides = await controller.loadSlides(apiClient);
	assert.deepEqual(slides.map((slide) => slide.id), ["withBackdrop", "withLegacyTag"]);
});
