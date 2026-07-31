(function (global) {
	"use strict";

	const DEFAULT_CONFIG = Object.freeze({
		enabled: true,
		bannerItemCount: 10,
		rotationIntervalMs: 8000,
		initializationTimeoutMs: 30000,
		moveLibrarySectionOnDesktop: true,
		showOverview: true,
		detailButtonText: "MORE",
		includeItemTypes: "Movie,Series",
		sortBy: "ProductionYear,PremiereDate,SortName",
		sortOrder: "Descending",
		maxImageWidth: 3000,
	});

	function mergeConfig(input) {
		const config = Object.assign({}, DEFAULT_CONFIG, input || {});
		config.bannerItemCount = Math.min(30, Math.max(1, Number(config.bannerItemCount) || DEFAULT_CONFIG.bannerItemCount));
		config.rotationIntervalMs = Math.max(3000, Number(config.rotationIntervalMs) || DEFAULT_CONFIG.rotationIntervalMs);
		config.initializationTimeoutMs = Math.max(5000, Number(config.initializationTimeoutMs) || DEFAULT_CONFIG.initializationTimeoutMs);
		config.maxImageWidth = Math.min(6000, Math.max(640, Number(config.maxImageWidth) || DEFAULT_CONFIG.maxImageWidth));
		return config;
	}

	function isHomeRouteValue(hash, pathname) {
		const route = String(hash || "");
		const path = String(pathname || "");
		return /^(?:#!|#)\/home(?:[/?]|$)/i.test(route) || /\/home(?:\/|\.html)?$/i.test(path);
	}

	function getContainerItems(container) {
		if (!container) return [];
		if (Array.isArray(container.items)) return container.items;
		if (Array.isArray(container.Items)) return container.Items;
		return [];
	}

	function sectionContainsLibraries(section) {
		if (!section || typeof section.querySelectorAll !== "function") return false;

		const containers = section.querySelectorAll(".itemsContainer");
		for (const container of containers) {
			if (getContainerItems(container).some((item) => item && item.Type === "CollectionFolder")) {
				return true;
			}
		}

		const cards = section.querySelectorAll(".card");
		for (const card of cards) {
			const item = card.item || card._item;
			const type = (item && item.Type) || (card.dataset && (card.dataset.type || card.dataset.itemtype));
			if (type === "CollectionFolder") return true;
		}

		return false;
	}

	function findLibrarySection(homeContainer) {
		if (!homeContainer || typeof homeContainer.querySelectorAll !== "function") return null;
		const sections = Array.from(homeContainer.querySelectorAll(":scope > .verticalSection, :scope > .horizontalSection"));
		return sections.find(sectionContainsLibraries) || null;
	}

	function sleep(ms) {
		return new Promise((resolve) => global.setTimeout(resolve, ms));
	}

	function waitFor(check, timeoutMs, intervalMs) {
		const startedAt = Date.now();
		return new Promise((resolve, reject) => {
			const attempt = () => {
				let result;
				try {
					result = check();
				} catch (error) {
					reject(error);
					return;
				}
				if (result) {
					resolve(result);
					return;
				}
				if (Date.now() - startedAt >= timeoutMs) {
					reject(new Error("Timed out while waiting for the Emby home screen."));
					return;
				}
				global.setTimeout(attempt, intervalMs);
			};
			attempt();
		});
	}

	class EmbyCrxHome {
		constructor(config) {
			this.config = mergeConfig(config);
			this.started = false;
			this.mounting = false;
			this.mountToken = 0;
			this.pollTimer = null;
			this.rotationTimer = null;
			this.banner = null;
			this.loading = null;
			this.homeContainer = null;
			this.librarySection = null;
			this.libraryPlacement = null;
			this.activeIndex = 0;
			this.onRouteChanged = this.reconcile.bind(this);
		}

		start() {
			if (this.started || !this.config.enabled) return;
			this.started = true;
			global.addEventListener("hashchange", this.onRouteChanged);
			global.addEventListener("popstate", this.onRouteChanged);
			this.pollTimer = global.setInterval(() => this.reconcile(), 500);
			this.reconcile();
		}

		stop() {
			if (!this.started) return;
			this.started = false;
			global.removeEventListener("hashchange", this.onRouteChanged);
			global.removeEventListener("popstate", this.onRouteChanged);
			global.clearInterval(this.pollTimer);
			this.pollTimer = null;
			this.unmount();
		}

		isHomeRoute() {
			return isHomeRouteValue(global.location && global.location.hash, global.location && global.location.pathname);
		}

		getActiveHomeContainer() {
			const candidates = Array.from(document.querySelectorAll(".homeSectionsContainer"));
			return candidates.find((element) => !element.closest(".hide") && element.isConnected) || null;
		}

		async reconcile() {
			if (!this.started) return;
			if (!this.isHomeRoute()) {
				if (this.banner || this.mounting) this.unmount();
				return;
			}

			const homeContainer = this.getActiveHomeContainer();
			if (!homeContainer) return;
			if (this.banner && this.homeContainer === homeContainer && this.banner.isConnected) return;
			if (this.mounting) return;

			this.mounting = true;
			const token = ++this.mountToken;
			try {
				await this.mount(homeContainer, token);
			} catch (error) {
				if (token === this.mountToken) {
					console.error("[Emby Crx] Home banner initialization failed:", error);
					this.unmount();
				}
			} finally {
				if (token === this.mountToken) this.mounting = false;
			}
		}

		async mount(homeContainer, token) {
			const apiClient = await waitFor(
				() => global.ApiClient && typeof global.ApiClient.getItems === "function" ? global.ApiClient : null,
				this.config.initializationTimeoutMs,
				100
			);
			const serverVersion = typeof apiClient.serverVersion === "function" ? apiClient.serverVersion() : "";
			if (serverVersion && !/^4\.9\./.test(serverVersion)) {
				console.warn(`[Emby Crx] This adapter was tested with Emby 4.9.5.0; detected ${serverVersion}.`);
			}

			const librarySection = await waitFor(
				() => findLibrarySection(homeContainer),
				this.config.initializationTimeoutMs,
				100
			);

			if (token !== this.mountToken || !homeContainer.isConnected || !librarySection.isConnected) return;

			this.showLoading(apiClient);
			const slides = await this.loadSlides(apiClient);
			if (!slides.length) throw new Error("No Movie or Series items with backdrop artwork were found.");
			if (token !== this.mountToken || !homeContainer.isConnected) return;

			this.homeContainer = homeContainer;
			this.librarySection = librarySection;
			this.librarySection.classList.add("misty-library-section");
			this.banner = this.buildBanner(slides);
			homeContainer.prepend(this.banner);

			this.moveLibrarySectionIntoBanner();
			this.activateSlide(0);
			this.animateLibraryCards();
			this.startRotation(slides.length);
			this.hideLoading();
		}

		async loadSlides(apiClient) {
			const query = {
				ImageTypes: "Backdrop",
				EnableImageTypes: "Logo,Backdrop",
				IncludeItemTypes: this.config.includeItemTypes,
				SortBy: this.config.sortBy,
				Recursive: true,
				ImageTypeLimit: 1,
				Limit: this.config.bannerItemCount,
				Fields: "ProductionYear,Overview",
				SortOrder: this.config.sortOrder,
				EnableUserData: false,
				EnableTotalRecordCount: false,
			};
			const userId = apiClient.getCurrentUserId();
			const response = await apiClient.getItems(userId, query);
			const items = response && Array.isArray(response.Items) ? response.Items : [];
			const details = await Promise.all(items.map(async (item) => {
				try {
					return await apiClient.getItem(userId, item.Id);
				} catch (error) {
					console.warn("[Emby Crx] Failed to load item details:", item.Id, error);
					return null;
				}
			}));

			return details
				.filter((item) => item && item.Id && (
					Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length > 0 ||
					item.ImageTags && item.ImageTags.Backdrop
				))
				.map((item) => ({
					id: item.Id,
					name: item.Name || "",
					overview: item.Overview || "",
					backdropUrl: apiClient.getImageUrl(item.Id, {
						type: "Backdrop",
						maxWidth: this.config.maxImageWidth,
					}),
					logoUrl: item.ImageTags && item.ImageTags.Logo ? apiClient.getImageUrl(item.Id, {
						type: "Logo",
						maxWidth: this.config.maxImageWidth,
					}) : null,
				}));
		}

		buildBanner(slides) {
			const banner = document.createElement("section");
			banner.className = "misty-banner";
			banner.dataset.embyCrx = "4.9";

			const body = document.createElement("div");
			body.className = "misty-banner-body";
			const library = document.createElement("div");
			library.className = "misty-banner-library";
			const logos = document.createElement("div");
			logos.className = "misty-banner-logos";
			library.appendChild(logos);

			for (const slide of slides) {
				const item = document.createElement("article");
				item.className = "misty-banner-item";
				item.dataset.itemId = slide.id;

				const cover = document.createElement("img");
				cover.className = "misty-banner-cover";
				cover.src = slide.backdropUrl;
				cover.alt = "";
				cover.draggable = false;
				cover.loading = "eager";
				cover.decoding = "async";
				cover.addEventListener("error", () => item.classList.add("misty-banner-image-error"), { once: true });

				const info = document.createElement("div");
				info.className = "misty-banner-info padded-left padded-right";
				const title = document.createElement("h1");
				title.textContent = slide.name;
				info.appendChild(title);

				if (this.config.showOverview && slide.overview) {
					const overviewWrap = document.createElement("div");
					const overview = document.createElement("p");
					overview.textContent = slide.overview;
					overviewWrap.appendChild(overview);
					info.appendChild(overviewWrap);
				}

				const buttonWrap = document.createElement("div");
				const button = document.createElement("button");
				button.type = "button";
				button.textContent = this.config.detailButtonText;
				button.addEventListener("click", () => this.showItem(slide.id));
				buttonWrap.appendChild(button);
				info.appendChild(buttonWrap);

				item.appendChild(cover);
				item.appendChild(info);
				body.appendChild(item);

				if (slide.logoUrl) {
					const logo = document.createElement("img");
					logo.className = "misty-banner-logo";
					logo.dataset.itemId = slide.id;
					logo.src = slide.logoUrl;
					logo.alt = slide.name;
					logo.draggable = false;
					logo.loading = "lazy";
					logo.decoding = "async";
					logos.appendChild(logo);
				}
			}

			banner.appendChild(body);
			banner.appendChild(library);
			return banner;
		}

		async showItem(itemId) {
			try {
				let router = global.appRouter;
				if (!router && global.Emby && typeof global.Emby.importModule === "function") {
					router = await global.Emby.importModule("./modules/approuter.js");
				}
				if (!router && typeof global.require === "function") {
					const imported = await global.require(["appRouter"]);
					router = imported && (imported.default || imported[0] && (imported[0].default || imported[0]) || imported);
				}
				if (!router || typeof router.showItem !== "function") throw new Error("Emby appRouter is unavailable.");
				router.showItem(itemId);
			} catch (error) {
				console.error("[Emby Crx] Unable to open item:", itemId, error);
			}
		}

		moveLibrarySectionIntoBanner() {
			if (!this.config.moveLibrarySectionOnDesktop || this.isMobile() || !this.librarySection || !this.banner) return;
			const parent = this.librarySection.parentNode;
			this.libraryPlacement = {
				parent,
				nextSibling: this.librarySection.nextSibling,
			};
			const itemsContainer = this.librarySection.querySelector(".itemsContainer");
			const items = getContainerItems(itemsContainer);
			this.banner.querySelector(".misty-banner-library").appendChild(this.librarySection);
			if (itemsContainer && items.length) {
				global.setTimeout(() => {
					if (itemsContainer.isConnected) itemsContainer.items = items;
				}, 0);
			}
		}

		restoreLibrarySection() {
			if (!this.librarySection) return;
			this.librarySection.classList.remove("misty-library-section");
			const placement = this.libraryPlacement;
			if (placement && placement.parent && placement.parent.isConnected && this.librarySection.isConnected) {
				if (placement.nextSibling && placement.nextSibling.parentNode === placement.parent) {
					placement.parent.insertBefore(this.librarySection, placement.nextSibling);
				} else {
					placement.parent.appendChild(this.librarySection);
				}
			}
			this.libraryPlacement = null;
		}

		animateLibraryCards() {
			if (!this.librarySection) return;
			const cards = this.librarySection.querySelectorAll(".card");
			cards.forEach((card, index) => {
				global.setTimeout(() => {
					if (card.isConnected) card.classList.add("misty-banner-library-show");
				}, index * 80);
			});
		}

		activateSlide(index) {
			if (!this.banner) return;
			const items = Array.from(this.banner.querySelectorAll(".misty-banner-item"));
			if (!items.length) return;
			this.activeIndex = ((index % items.length) + items.length) % items.length;
			const body = this.banner.querySelector(".misty-banner-body");
			body.style.left = `${-(this.activeIndex * 100)}%`;
			items.forEach((item, itemIndex) => item.classList.toggle("active", itemIndex === this.activeIndex));
			const activeId = items[this.activeIndex].dataset.itemId;
			this.banner.querySelectorAll(".misty-banner-logo").forEach((logo) => {
				logo.classList.toggle("active", logo.dataset.itemId === activeId);
			});
		}

		startRotation(slideCount) {
			global.clearInterval(this.rotationTimer);
			if (slideCount < 2) return;
			this.rotationTimer = global.setInterval(() => {
				if (!document.hidden && this.isHomeRoute() && this.banner && this.banner.isConnected) {
					this.activateSlide(this.activeIndex + 1);
				}
			}, this.config.rotationIntervalMs);
		}

		showLoading(apiClient) {
			this.hideLoading();
			const loading = document.createElement("div");
			loading.className = "misty-loading";
			const title = document.createElement("h1");
			try {
				const serverName = typeof apiClient.serverName === "function" ? apiClient.serverName() : "Emby";
				title.textContent = typeof serverName === "string" && serverName ? serverName : "Emby";
			} catch (_) {
				title.textContent = "Emby";
			}
			const spinner = document.createElement("div");
			spinner.className = "misty-loading-spinner";
			loading.appendChild(title);
			loading.appendChild(spinner);
			document.body.appendChild(loading);
			global.requestAnimationFrame(() => title.classList.add("active"));
			this.loading = loading;
		}

		hideLoading() {
			if (!this.loading) return;
			const loading = this.loading;
			this.loading = null;
			loading.classList.add("misty-loading-leave");
			global.setTimeout(() => loading.remove(), 300);
		}

		isMobile() {
			return global.matchMedia && global.matchMedia("(max-width: 62.5em)").matches ||
				/Mobi|Android|iPhone|iPad|iPod/i.test(global.navigator && global.navigator.userAgent || "");
		}

		unmount() {
			this.mountToken++;
			this.mounting = false;
			global.clearInterval(this.rotationTimer);
			this.rotationTimer = null;
			this.hideLoading();
			this.restoreLibrarySection();
			if (this.banner) this.banner.remove();
			this.banner = null;
			this.homeContainer = null;
			this.librarySection = null;
			this.activeIndex = 0;
		}
	}

	const exportsForTests = {
		DEFAULT_CONFIG,
		EmbyCrxHome,
		findLibrarySection,
		getContainerItems,
		isHomeRouteValue,
		mergeConfig,
		sectionContainsLibraries,
	};

	global.EmbyCrxHome = EmbyCrxHome;
	if (typeof module !== "undefined" && module.exports) module.exports = exportsForTests;

	if (global.document && !global.__EMBY_CRX_DISABLE_AUTO_START__) {
		const controller = new EmbyCrxHome(global.EmbyCrxConfig);
		global.EmbyCrxController = controller;
		controller.start();
	}
})(typeof globalThis !== "undefined" ? globalThis : window);
