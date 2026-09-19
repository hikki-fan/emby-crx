"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

global.__EMBY_CRX_DISABLE_AUTO_START__ = true;
const {
	EmbyCrxHome,
	findLibrarySection,
	getLibraryCardId,
	isHomeRouteValue,
	mergeConfig,
	normalizeIdList,
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

test("library overlay preserves native parent and state, measures height and restores styles", () => {
	const previous = [global.getComputedStyle, global.addEventListener, global.removeEventListener, global.ResizeObserver];
	const values = new Map([["margin-top", "4px"]]);
	const style = { getPropertyValue: k => values.get(k) || "", getPropertyPriority: () => "",
		setProperty: (k,v) => values.set(k,v), removeProperty: k => values.delete(k) };
	let callback, disconnected = false, height = 180;
	const parent = {}, nativeState = { items: [{ Id: "library", ServerId: "server" }] };
	const row = { parentNode: parent, style, nativeState, getBoundingClientRect: () => ({ height }),
		classList: { remove() {} }, querySelectorAll: () => [] };
	const overlay = { style: { removeProperty() {} } };
	global.getComputedStyle = () => ({ paddingBottom: "24px" });
	global.addEventListener = () => {};
	global.removeEventListener = () => {};
	global.ResizeObserver = class { constructor(fn) { callback = fn; } observe() {} disconnect() { disconnected = true; } };
	try {
		const controller = new EmbyCrxHome();
		controller.isMobile = () => false;
		controller.librarySection = row;
		controller.banner = { querySelector: () => overlay };
		controller.moveLibrarySectionIntoBanner();
		assert.equal(row.parentNode, parent);
		assert.equal(row.nativeState, nativeState);
		assert.equal(values.get("margin-top"), "-204px");
		assert.equal(values.get("margin-bottom"), "24px");
		// The row and its margins add zero height after the hero, just as before.
		assert.equal(height + parseFloat(values.get("margin-top")) + parseFloat(values.get("margin-bottom")), 0);
		height = 240; callback();
		assert.equal(values.get("margin-top"), "-264px");
		controller.restoreLibrarySection();
		assert.equal(disconnected, true);
		assert.equal(values.get("margin-top"), "4px");
		assert.equal(values.has("position"), false);
	} finally {
		[global.getComputedStyle, global.addEventListener, global.removeEventListener, global.ResizeObserver] = previous;
	}
});

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

test("finds the first populated row inside the Emby 4.9.5 verticalSections wrapper", () => {
	const hidden = {
		classList: { contains: (name) => name === "hide" },
		querySelector: () => ({ dataset: { id: "hidden" } }),
		querySelectorAll: () => [],
	};
	const libraries = {
		classList: { contains: () => false },
		querySelector: (selector) => selector === ".itemsContainer .card[data-id]"
			? { dataset: { id: "3" } }
			: null,
		querySelectorAll: () => [],
	};
	const home = {
		querySelectorAll(selector) {
			if (selector.startsWith(":scope > .verticalSections")) return [hidden, libraries];
			return [];
		},
	};

	assert.equal(findLibrarySection(home), libraries);
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
		visibleLibraryIds: [3, "11708", "3", ""],
		bannerLibraryIds: "12083, 3,12083",
	});
	assert.equal(config.bannerItemCount, 30);
	assert.equal(config.rotationIntervalMs, 3000);
	assert.equal(config.initializationTimeoutMs, 5000);
	assert.equal(config.maxImageWidth, 6000);
	assert.deepEqual(config.visibleLibraryIds, ["3", "11708"]);
	assert.deepEqual(config.bannerLibraryIds, ["12083", "3"]);
});

test("normalizes missing and invalid media-library ID lists to all libraries", () => {
	assert.deepEqual(normalizeIdList(undefined), []);
	assert.deepEqual(normalizeIdList({ id: 3 }), []);
});

test("reads the media-library ID from an Emby 4.9 card", () => {
	assert.equal(getLibraryCardId({ dataset: { id: "12083" } }), "12083");
	assert.equal(getLibraryCardId({ item: { Id: 3 } }), "3");
});

test("filters media-library cards by visibleLibraryIds and restores them on cleanup", () => {
	function createCard(id) {
		const classes = new Set();
		return {
			dataset: { id },
			classList: {
				contains: (name) => classes.has(name),
				toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
				remove: (name) => classes.delete(name),
			},
		};
	}
	const cards = [createCard("3"), createCard("11708"), createCard("12083")];
	const controller = new EmbyCrxHome({ visibleLibraryIds: ["3", "11708"] });
	controller.librarySection = { querySelectorAll: () => cards };

	controller.applyLibraryCardFilter();
	assert.equal(cards[0].classList.contains("misty-library-filtered"), false);
	assert.equal(cards[1].classList.contains("misty-library-filtered"), false);
	assert.equal(cards[2].classList.contains("misty-library-filtered"), true);

	controller.clearLibraryCardFilter();
	assert.equal(cards[2].classList.contains("misty-library-filtered"), false);
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

test("loads banner items only from configured libraries and combines them fairly", async () => {
	const controller = new EmbyCrxHome({
		bannerItemCount: 3,
		bannerLibraryIds: ["3", "11708"],
	});
	const queries = [];
	const groups = {
		3: [{ Id: "anime-1" }, { Id: "anime-2" }],
		11708: [{ Id: "other-1" }, { Id: "anime-2" }],
	};
	const apiClient = {
		getCurrentUserId: () => "user",
		getItems: async (_userId, query) => {
			queries.push(query);
			return { Items: groups[query.ParentId] || [] };
		},
		getItem: async (_userId, itemId) => ({
			Id: itemId,
			Name: itemId,
			BackdropImageTags: ["tag"],
		}),
		getImageUrl: (itemId, options) => `${itemId}/${options.type}`,
	};

	const slides = await controller.loadSlides(apiClient);
	assert.deepEqual(queries.map((query) => query.ParentId), ["3", "11708"]);
	assert.deepEqual(slides.map((slide) => slide.id), ["anime-1", "other-1", "anime-2"]);
});
