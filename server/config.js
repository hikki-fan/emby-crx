(function (global) {
	"use strict";

	global.EmbyCrxConfig = {
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
	};
})(typeof globalThis !== "undefined" ? globalThis : window);
