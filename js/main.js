/* Application state and user interactions. */
(() => {
  "use strict";

  const state = {
    parks: [],
    query: "",
    category: "all",
    selectedId: null,
    nearbyFrom: null,
    loading: false,
  };

  function selectedPark() {
    return state.parks.find((park) => park.id === state.selectedId) || null;
  }

  function visibleParks() {
    const filtered = API.filterParks(state.parks, {
      query: state.query,
      category: state.category,
    });
    if (!state.nearbyFrom) return filtered;
    const { lat, lng } = state.nearbyFrom;
    return filtered.sort((a, b) =>
      API.distanceKm(lat, lng, a.lat, a.lng) - API.distanceKm(lat, lng, b.lat, b.lng)
    ).slice(0, CONFIG.NEARBY_COUNT);
  }

  function selectPark(park, focusMap = true, updateMap = true) {
    state.selectedId = park ? park.id : null;
    UI.renderDetail(park, () => selectPark(null));
    render(updateMap);
    if (park && focusMap) MapView.focusPark(park, false);
  }

  function render(updateMap = true) {
    const parks = visibleParks();
    UI.renderStats(API.computeStats(state.parks));
    UI.renderParks(parks, (park) => selectPark(park), state.selectedId);
    if (updateMap) MapView.render(parks, state.selectedId);
    const selected = selectedPark();
    if (!selected || !parks.some((park) => park.id === selected.id)) {
      UI.renderDetail(null);
      state.selectedId = null;
    }
  }

  async function loadData() {
    if (state.loading) return;
    state.loading = true;
    UI.hideError();
    UI.setLoading(true);
    UI.setStatus("");
    UI.setButtonBusy(UI.byId("btnRetry"), true);
    try {
      const result = await API.loadAll((message) => {
        UI.byId("loaderText").textContent = message;
      });
      state.parks = result.parks;
      state.selectedId = null;
      UI.renderDetail(null);
      render();
      UI.setStatus(
        result.warning || `Updated ${result.fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. AQI readings are approximate nearby estimates.`,
        result.warning ? "warning" : "success"
      );
    } catch (error) {
      console.error("[GreenPulse] Could not load map data:", error);
      const message = error instanceof API.ApiError
        ? error.message
        : "Unexpected error while loading map data. Please retry.";
      UI.showError(message);
      UI.setStatus("Map data could not be loaded.", "warning");
    } finally {
      state.loading = false;
      UI.setLoading(false);
      UI.setButtonBusy(UI.byId("btnRetry"), false);
    }
  }

  function updateCategory(category) {
    state.category = category;
    state.nearbyFrom = null; // category badalne par "Near me" limit hat jaye
    document.querySelectorAll("#categoryChips .chip").forEach((chip) => {
      const active = chip.dataset.cat === category;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
    render();
  }

  function locateUser() {
    const button = UI.byId("btnNear");
    if (!navigator.geolocation) {
      UI.setStatus("This browser does not support location services.", "warning");
      return;
    }
    UI.setButtonBusy(button, true, "Finding location…");
    UI.setStatus("Waiting for location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        state.nearbyFrom = { lat, lng };
        state.query = "";
        state.category = "all";
        UI.byId("searchInput").value = "";
        document.querySelectorAll("#categoryChips .chip").forEach((chip) => {
          const active = chip.dataset.cat === "all";
          chip.classList.toggle("active", active);
          chip.setAttribute("aria-pressed", String(active));
        });
        const nearest = API.nearestParks(state.parks, lat, lng, CONFIG.NEARBY_COUNT);
        render();
        MapView.showUserLocation(lat, lng);
        if (nearest.length) {
          selectPark(nearest[0].park);
          UI.setStatus(`Showing the ${nearest.length} closest parks. Nearest: ${nearest[0].park.name} (${nearest[0].km.toFixed(1)} km).`);
        } else {
          UI.setStatus("No parks are available to compare with your location.", "warning");
        }
        UI.setButtonBusy(button, false, "📍 Near me");
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access in your browser to use Near me."
          : error.code === error.POSITION_UNAVAILABLE
            ? "Your location is currently unavailable. Check your device location settings."
            : "Finding your location timed out. Please try again.";
        UI.setStatus(message, "warning");
        UI.setButtonBusy(button, false, "📍 Near me");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  }

  function showBestPark() {
    const park = API.bestPark(visibleParks());
    if (!park) {
      UI.setStatus("No current AQI readings are available for parks in this view.", "warning");
      return;
    }
    selectPark(park);
    UI.setStatus(`Cleanest available air right now: ${park.name} (US AQI ${park.aqi.usAqi}).`);
  }

  function resetFilters() {
    state.query = "";
    state.category = "all";
    state.nearbyFrom = null;
    UI.byId("searchInput").value = "";
    updateCategory("all");
    selectPark(null);
    UI.setStatus("Filters cleared.");
  }

  function restoreTheme() {
    let saved = "dark";
    try {
      saved = localStorage.getItem("greenpulse_theme") || saved;
    } catch (error) {
      console.warn("[GreenPulse] Theme preference could not be read.", error);
    }
    UI.setTheme(saved);
  }

  function bindEvents() {
    UI.byId("searchInput").addEventListener("input", (event) => {
      state.query = event.target.value;
      state.nearbyFrom = null; // search karne par "Near me" limit hat jaye
      render();
    });
    UI.byId("categoryChips").addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (chip) updateCategory(chip.dataset.cat);
    });
    UI.byId("btnBest").addEventListener("click", showBestPark);
    UI.byId("btnNear").addEventListener("click", locateUser);
    UI.byId("btnReset").addEventListener("click", resetFilters);
    UI.byId("btnRetry").addEventListener("click", loadData);
    UI.byId("btnTheme").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      UI.setTheme(next);
      try {
        localStorage.setItem("greenpulse_theme", next);
      } catch (error) {
        console.warn("[GreenPulse] Theme preference could not be saved.", error);
      }
    });
    UI.byId("btnAbout").addEventListener("click", () => UI.byId("aboutDialog").showModal());
    UI.byId("btnAboutClose").addEventListener("click", () => UI.byId("aboutDialog").close());
    UI.byId("aboutDialog").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    MapView.setOnSelect((park) => selectPark(park, false, false));
  }

  function start() {
    restoreTheme();
    bindEvents();
    try {
      MapView.init();
    } catch (error) {
      console.error("[GreenPulse] Map could not be initialized:", error);
      UI.showError("The interactive map could not start. Check your internet connection and reload the page.");
      UI.setLoading(false);
      return;
    }
    loadData();
  }

  document.addEventListener("DOMContentLoaded", start);
})();