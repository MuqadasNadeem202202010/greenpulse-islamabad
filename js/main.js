let allParks = [];
let mapManager;
let uiManager;
let currentFilter = "all";
let isLoading = false;
let hasLoadedPlaces = false;

document.addEventListener("DOMContentLoaded", async () => {
    mapManager = new MapManager("map");
    uiManager = new UIManager();
    bindControls();
    await refreshPlaces();
    window.setInterval(refreshAirQuality, CONFIG.refreshIntervalMs);
});

function bindControls() {
    uiManager.closeDrawerBtn.addEventListener("click", () => uiManager.closeDrawer());
    uiManager.refreshButton.addEventListener("click", refreshPlaces);
    uiManager.searchInput.addEventListener("input", updateView);
    uiManager.searchInput.addEventListener("focus", updateView);
    uiManager.searchInput.addEventListener("click", updateView);
    uiManager.searchInput.addEventListener("keydown", handleSearchKeydown);
    document.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".search-control")) {
            uiManager.closeSearchSuggestions();
        }
    });

    uiManager.chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            uiManager.chips.forEach((item) => item.classList.remove("active"));
            chip.classList.add("active");
            uiManager.chips.forEach((item) => item.setAttribute("aria-pressed", String(item === chip)));
            currentFilter = chip.dataset.filter;
            updateView();
        });
    });

    document.getElementById("btn-best-park").addEventListener("click", showCleanestPark);
    document.getElementById("btn-near-me").addEventListener("click", showNearestPark);
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
    document.addEventListener("keydown", (event) => {
        if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
            event.preventDefault();
            uiManager.searchInput.focus();
        }
        if (event.key === "Escape") uiManager.closeDrawer();
    });
}

async function refreshPlaces() {
    if (isLoading) return;
    isLoading = true;
    uiManager.setLoading(true);

    try {
        const { parks, source, enrichmentWarning } = await ApiService.fetchParks();
        hasLoadedPlaces = true;
        allParks = parks.map((park) => ({
            ...park,
            aqi: null,
            pm25: null,
            pm10: null,
            aqiTime: null,
            aqiTimezone: null
        }));
        updateView();
        uiManager.updateStats(allParks, mapManager);
        const isSearchFallback = source === "nominatim";
        const enrichmentNotice = enrichmentWarning
            ? ` Some names/access details could not be verified: ${enrichmentWarning}`
            : "";
        uiManager.setStatus(
            isSearchFallback
                ? `Overpass is unavailable. Loading ${parks.length} real OSM search results; this backup is not exhaustive.${enrichmentNotice} Fetching air quality…`
                : `Loaded ${parks.length} mapped places. Fetching air quality…`,
            isSearchFallback ? "error" : "loading"
        );

        const { readings, errors } = await ApiService.fetchAirQuality(parks);
        allParks = parks.map((park) => ({
            ...park,
            ...(readings.get(park.id) || { aqi: null, pm25: null, pm10: null, aqiTime: null, aqiTimezone: null })
        }));

        updateView();
        uiManager.updateStats(allParks, mapManager);
        updateReadingTime();

        const withoutReadings = allParks.filter((park) => park.aqi === null).length;
        if (errors.length > 0) {
            uiManager.setStatus(
                `${isSearchFallback ? "Backup place list is not exhaustive. " : ""}` +
                `Air quality service issue: ${errors[0]}${withoutReadings ? ` · ${withoutReadings} places have no reading` : ""}${enrichmentNotice}`,
                "error"
            );
        } else if (allParks.length === 0) {
            uiManager.setStatus("No mapped green spaces found in this OpenStreetMap area.", "error");
        } else if (withoutReadings > 0) {
            uiManager.setStatus(
                `${isSearchFallback ? "Backup place list is not exhaustive. " : ""}` +
                `Open-Meteo has no current reading for ${withoutReadings} ${withoutReadings === 1 ? "place" : "places"}.${enrichmentNotice}`,
                "error"
            );
        } else if (isSearchFallback) {
            uiManager.setStatus(
                `Loaded ${allParks.length} real OSM search results. This backup is not exhaustive; retry later for the full Overpass map data.${enrichmentNotice}`,
                "error"
            );
        } else {
            uiManager.setStatus(`OpenStreetMap places and ${allParks.length} modelled AQI readings loaded.`, "success");
        }
    } catch (error) {
        console.error("GreenPulse data refresh failed:", error);
        if (allParks.length === 0) {
            uiManager.showLoadError(error.message, refreshPlaces);
        } else {
            uiManager.setStatus(`Refresh failed: ${error.message}`, "error");
        }
    } finally {
        isLoading = false;
        uiManager.setLoading(false);
        if (hasLoadedPlaces) updateView();
    }
}

async function refreshAirQuality() {
    if (isLoading || allParks.length === 0) return;
    isLoading = true;
    uiManager.setLoading(true);
    try {
        const { readings, errors } = await ApiService.fetchAirQuality(allParks);
        allParks = allParks.map((park) => ({
            ...park,
            ...(readings.get(park.id) || { aqi: null, pm25: null, pm10: null, aqiTime: null, aqiTimezone: null })
        }));
        updateView();
        uiManager.updateStats(allParks, mapManager);
        updateReadingTime();

        const unavailable = allParks.filter((park) => park.aqi === null).length;
        if (errors.length > 0) {
            uiManager.setStatus(`Automatic air quality refresh failed: ${errors[0]}`, "error");
        } else if (unavailable > 0) {
            uiManager.setStatus(`Updated. ${unavailable} places have no current AQI reading.`, "error");
        } else {
            uiManager.setStatus("Air quality readings refreshed from Open-Meteo.", "success");
        }
    } catch (error) {
        console.error("GreenPulse air quality refresh failed:", error);
        uiManager.setStatus(`Air quality refresh failed: ${error.message}`, "error");
    } finally {
        isLoading = false;
        uiManager.setLoading(false);
        updateView();
    }
}

function getVisibleParks() {
    const query = normalizeSearchText(uiManager.searchInput.value);
    const terms = query.split(/\s+/).filter(Boolean);
    return allParks
        .filter((park) => {
            const matchesCategory = currentFilter === "all" || park.type === currentFilter;
            const searchFields = [
                park.name,
                park.type,
                park.access,
                park.location,
                ...Object.values(park.tags || {})
            ].map(normalizeSearchText);
            const matchesSearch = terms.every((term) =>
                searchFields.some((field) => field.includes(term))
            );
            return matchesCategory && matchesSearch;
        })
        .sort((left, right) => {
            if (terms.length > 0) {
                const leftRank = getSearchRank(left, query);
                const rightRank = getSearchRank(right, query);
                if (leftRank !== rightRank) return leftRank - rightRank;
            }
            return left.name.localeCompare(right.name);
        });
}

function normalizeSearchText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .trim();
}

function getSearchRank(park, query) {
    const name = normalizeSearchText(park.name);
    if (name === query) return 0;
    if (name.startsWith(query)) return 1;
    if (name.includes(query)) return 2;
    if (normalizeSearchText(park.type) === query) return 3;
    return 4;
}

function updateView() {
    const visibleParks = getVisibleParks();
    uiManager.updateCategoryCounts(allParks);
    uiManager.renderParksList(visibleParks, handleParkSelect, currentFilter);
    mapManager.renderMarkers(visibleParks, handleParkSelect);
    if (uiManager.searchInput.getAttribute("aria-expanded") === "true"
        || document.activeElement === uiManager.searchInput) {
        uiManager.renderSearchSuggestions(visibleParks, selectSearchSuggestion, hasLoadedPlaces, isLoading);
    }
}

function selectSearchSuggestion(park) {
    uiManager.searchInput.value = "";
    updateView();
    uiManager.closeSearchSuggestions();
    handleParkSelect(park);
}

function handleSearchKeydown(event) {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = uiManager.activeSuggestionIndex < 0 ? 0 : uiManager.activeSuggestionIndex + 1;
        uiManager.setActiveSuggestion(nextIndex);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const lastIndex = uiManager.searchSuggestions.querySelectorAll('[role="option"]').length - 1;
        const nextIndex = uiManager.activeSuggestionIndex < 0 ? lastIndex : uiManager.activeSuggestionIndex - 1;
        uiManager.setActiveSuggestion(nextIndex);
    } else if (event.key === "Enter" && uiManager.selectActiveSuggestion()) {
        event.preventDefault();
    } else if (event.key === "Escape") {
        uiManager.closeSearchSuggestions();
    }
}

function handleParkSelect(park) {
    mapManager.flyToPark(park.lat, park.lon);
    uiManager.openDrawer(park, mapManager);
    if (window.matchMedia("(max-width: 780px)").matches) {
        document.querySelector(".map-workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function showCleanestPark() {
    const cleanest = allParks
        .filter((park) => Number.isFinite(park.aqi))
        .reduce((best, park) => !best || park.aqi < best.aqi ? park : best, null);
    if (!cleanest) {
        uiManager.setStatus("No current AQI readings are available to compare.", "error");
        return;
    }
    handleParkSelect(cleanest);
}

function showNearestPark() {
    if (!navigator.geolocation) {
        uiManager.setStatus("Location is not supported by this browser.", "error");
        return;
    }
    if (allParks.length === 0) {
        uiManager.setStatus("Load green spaces before searching near your location.", "error");
        return;
    }

    uiManager.setStatus("Waiting for your location permission…", "loading");
    navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
            const closest = allParks.reduce((nearest, park) => {
                const distance = distanceInKm(coords.latitude, coords.longitude, park.lat, park.lon);
                return !nearest || distance < nearest.distance ? { park, distance } : nearest;
            }, null);

            mapManager.showUserLocation(coords.latitude, coords.longitude);
            if (closest) {
                handleParkSelect(closest.park);
                uiManager.setStatus(`Nearest mapped green space is ${closest.distance.toFixed(1)} km away.`, "success");
            }
        },
        (error) => {
            const message = error.code === error.PERMISSION_DENIED
                ? "Location permission was denied. Allow location access and try again."
                : error.code === error.TIMEOUT
                    ? "Location request timed out. Please try again."
                    : "Your location is unavailable. Try again or check browser permissions.";
            uiManager.setStatus(message, "error");
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
}

function distanceInKm(lat1, lon1, lat2, lon2) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(lat2 - lat1);
    const longitudeDelta = radians(lon2 - lon1);
    const value = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function updateReadingTime() {
    const latest = allParks.find((park) => park.aqiTime);
    uiManager.setLastUpdated(latest?.aqiTime, latest?.aqiTimezone);
}

function toggleTheme() {
    const root = document.documentElement;
    const switchToLight = root.dataset.theme !== "light";
    root.dataset.theme = switchToLight ? "light" : "dark";
    const button = document.getElementById("theme-toggle");
    button.setAttribute("aria-label", switchToLight ? "Switch to dark theme" : "Switch to light theme");
    button.querySelector("span").textContent = switchToLight ? "☾" : "☼";
    mapManager.setTheme();
}
