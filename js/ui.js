class UIManager {
    constructor() {
        this.parksListEl = document.getElementById("parks-list");
        this.totalParksEl = document.getElementById("total-parks");
        this.avgAqiEl = document.getElementById("avg-aqi");
        this.cleanestNameEl = document.getElementById("cleanest-name");
        this.cleanestAqiEl = document.getElementById("cleanest-aqi");
        this.searchInput = document.getElementById("search-input");
        this.searchSuggestions = document.getElementById("search-suggestions");
        this.activeSuggestionIndex = -1;
        this.resultCount = document.getElementById("result-count");
        this.placesTitle = document.getElementById("places-title");
        this.placesCount = document.getElementById("places-count");
        this.chips = document.querySelectorAll(".chip");
        this.drawer = document.getElementById("detail-drawer");
        this.closeDrawerBtn = document.getElementById("close-drawer");
        this.dataStatus = document.getElementById("data-status");
        this.statusMessage = document.getElementById("status-message");
        this.refreshButton = document.getElementById("btn-refresh");
    }

    renderParksList(parks, onSelectCallback, category) {
        this.parksListEl.replaceChildren();
        this.resultCount.textContent = `${parks.length} ${parks.length === 1 ? "place" : "places"}`;
        this.placesTitle.textContent = this.getCategoryTitle(category);
        this.placesCount.textContent = parks.length.toLocaleString();

        if (parks.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No mapped places match this search. Try another name or category.";
            this.parksListEl.appendChild(empty);
            return;
        }

        parks.forEach((park) => {
            this.parksListEl.appendChild(this.createParkItem(park, onSelectCallback));
        });
    }

    updateCategoryCounts(parks) {
        const counts = parks.reduce((result, park) => {
            result[park.type] = (result[park.type] || 0) + 1;
            return result;
        }, {});

        this.chips.forEach((chip) => {
            const category = chip.dataset.filter;
            const count = category === "all" ? parks.length : counts[category] || 0;
            chip.querySelector(".chip-count").textContent = count.toLocaleString();
        });
    }

    setCategoryCountsUnavailable() {
        this.resultCount.textContent = "Data unavailable";
        this.placesCount.textContent = "--";
        this.chips.forEach((chip) => {
            chip.querySelector(".chip-count").textContent = "--";
        });
    }

    getCategoryTitle(category) {
        return {
            all: "Parks & green spaces",
            park: "Parks",
            garden: "Gardens",
            playground: "Playgrounds",
            forest: "Forests"
        }[category] || "Parks & green spaces";
    }

    renderSearchSuggestions(parks, onSelectCallback, isLoaded, isLoading) {
        this.searchSuggestions.replaceChildren();
        this.activeSuggestionIndex = -1;

        if (!isLoaded) {
            const message = isLoading
                ? "Loading mapped places from OpenStreetMap…"
                : "Places could not be loaded. Check your connection and refresh.";
            this.searchSuggestions.appendChild(this.createSuggestionMessage(message));
            this.setSearchExpanded(true);
            return;
        }

        const heading = document.createElement("div");
        heading.className = "suggestion-heading";
        heading.setAttribute("role", "presentation");
        heading.textContent = parks.length
            ? `${parks.length} MAPPED ${parks.length === 1 ? "PLACE" : "PLACES"}`
            : "NO MATCHING PLACES";
        this.searchSuggestions.appendChild(heading);

        if (parks.length === 0) {
            this.searchSuggestions.appendChild(this.createSuggestionMessage("Try another name or choose a different category."));
            this.setSearchExpanded(true);
            return;
        }

        parks.forEach((park, index) => {
            const item = this.createParkItem(park, (selectedPark) => {
                this.closeSearchSuggestions();
                onSelectCallback(selectedPark);
            }, true);
            item.id = `search-suggestion-${index}`;
            item.addEventListener("pointerdown", (event) => event.preventDefault());
            this.searchSuggestions.appendChild(item);
        });

        this.setSearchExpanded(true);
    }

    createParkItem(park, onSelectCallback, isSuggestion = false) {
        const item = document.createElement(isSuggestion ? "div" : "button");
        item.className = isSuggestion ? "park-item suggestion-item" : "park-item";
        if (isSuggestion) {
            item.setAttribute("role", "option");
            item.setAttribute("aria-selected", "false");
            item.tabIndex = -1;
        } else {
            item.type = "button";
            item.setAttribute("aria-label", `${park.name}, ${park.type}, ${park.aqi === null ? "AQI unavailable" : `AQI ${park.aqi}`}`);
        }

        const symbol = document.createElement("span");
        symbol.className = "park-symbol";
        symbol.setAttribute("aria-hidden", "true");
        symbol.textContent = this.getTypeSymbol(park.type);

        const copy = document.createElement("span");
        copy.className = "park-item-copy";
        const title = document.createElement("span");
        title.className = "park-item-title";
        title.textContent = park.name;
        const meta = document.createElement("span");
        meta.className = "park-item-meta";
        const type = document.createElement("span");
        type.textContent = park.type;
        meta.appendChild(type);
        if (park.location) {
            const location = document.createElement("span");
            location.textContent = park.location;
            meta.appendChild(location);
        }
        copy.append(title, meta);

        const aqi = document.createElement("span");
        aqi.className = "park-aqi";
        aqi.style.color = this.getAQIColorCode(park.aqi);
        const value = document.createElement("span");
        value.textContent = park.aqi === null ? "--" : park.aqi;
        const label = document.createElement("small");
        label.textContent = park.aqi === null ? "NO DATA" : "EU AQI";
        aqi.append(value, label);

        item.append(symbol, copy, aqi);
        item.addEventListener("click", () => onSelectCallback(park));
        return item;
    }

    createSuggestionMessage(message) {
        const item = document.createElement("p");
        item.className = "suggestion-message";
        item.textContent = message;
        return item;
    }

    setActiveSuggestion(index) {
        const options = this.searchSuggestions.querySelectorAll('[role="option"]');
        if (options.length === 0) return;

        this.activeSuggestionIndex = ((index % options.length) + options.length) % options.length;
        options.forEach((option, optionIndex) => {
            const isActive = optionIndex === this.activeSuggestionIndex;
            option.setAttribute("aria-selected", String(isActive));
            if (isActive) {
                this.searchInput.setAttribute("aria-activedescendant", option.id);
                option.scrollIntoView({ block: "nearest" });
            }
        });
    }

    selectActiveSuggestion() {
        if (this.activeSuggestionIndex < 0) return false;
        this.searchSuggestions.querySelectorAll('[role="option"]')[this.activeSuggestionIndex]?.click();
        return true;
    }

    closeSearchSuggestions() {
        this.searchSuggestions.classList.add("hidden");
        this.searchInput.setAttribute("aria-expanded", "false");
        this.searchInput.removeAttribute("aria-activedescendant");
        this.activeSuggestionIndex = -1;
    }

    setSearchExpanded(isExpanded) {
        this.searchSuggestions.classList.toggle("hidden", !isExpanded);
        this.searchInput.setAttribute("aria-expanded", String(isExpanded));
    }

    updateStats(parks, mapManager) {
        this.totalParksEl.textContent = parks.length.toLocaleString();
        const available = parks.filter((park) => Number.isFinite(park.aqi));
        if (available.length === 0) {
            this.avgAqiEl.textContent = "--";
            this.cleanestNameEl.textContent = "No readings available";
            this.cleanestAqiEl.textContent = "Air quality service did not return data";
            return;
        }

        const average = available.reduce((sum, park) => sum + park.aqi, 0) / available.length;
        this.avgAqiEl.textContent = Math.round(average);
        const cleanest = available.reduce((best, park) => park.aqi < best.aqi ? park : best);
        this.cleanestNameEl.textContent = cleanest.name;
        this.cleanestAqiEl.textContent = `European AQI ${cleanest.aqi} · ${mapManager.getStatusText(cleanest.aqi)}`;
    }

    openDrawer(park, mapManager) {
        document.getElementById("drawer-title").textContent = park.name;
        document.getElementById("drawer-type").textContent = park.type.replace("_", " ");
        const locationRow = document.getElementById("drawer-location-row");
        if (park.location) {
            document.getElementById("drawer-location").textContent = park.location;
            locationRow.classList.remove("hidden");
        } else {
            locationRow.classList.add("hidden");
        }
        const osmLink = document.getElementById("drawer-osm-link");
        const osmRow = document.getElementById("drawer-osm-row");
        if (park.osmType && park.osmId) {
            osmLink.href = `https://www.openstreetmap.org/${park.osmType}/${park.osmId}`;
            osmLink.textContent = `${park.osmType} ${park.osmId}`;
            osmRow.classList.remove("hidden");
        } else {
            osmRow.classList.add("hidden");
        }

        const aqi = document.getElementById("drawer-aqi");
        aqi.textContent = park.aqi === null ? "--" : park.aqi;
        const color = mapManager.getAQIColor(park.aqi);
        aqi.style.color = color;
        document.querySelector(".aqi-ring").style.setProperty("--aqi-color", color);
        document.getElementById("drawer-status").textContent = mapManager.getStatusText(park.aqi);
        document.getElementById("drawer-pm25").textContent = this.formatReading(park.pm25);
        document.getElementById("drawer-pm10").textContent = this.formatReading(park.pm10);
        document.getElementById("drawer-access").textContent = park.access;
        document.getElementById("drawer-coords").textContent = `${park.lat.toFixed(4)}, ${park.lon.toFixed(4)}`;

        const areaRow = document.getElementById("drawer-area-row");
        if (park.area) {
            document.getElementById("drawer-area").textContent = `${park.area} ha`;
            areaRow.classList.remove("hidden");
        } else {
            areaRow.classList.add("hidden");
        }

        document.getElementById("drawer-facilities").textContent = this.getFacilities(park.tags);
        document.getElementById("drawer-reading-time").textContent = park.aqiTime
            ? `Model time: ${new Date(park.aqiTime).toLocaleString()}`
            : "Air quality timestamp unavailable";
        document.getElementById("drawer-directions").href =
            `https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lon}`;
        this.drawer.classList.remove("hidden");
    }

    getFacilities(tags) {
        const facilityLabels = {
            toilets: "Toilets",
            drinking_water: "Drinking water",
            wheelchair: "Wheelchair access",
            bench: "Benches",
            playground: "Playground",
            sport: "Sports"
        };
        const facilities = Object.entries(facilityLabels)
            .filter(([key]) => ["yes", "designated", "public"].includes(tags[key]))
            .map(([, label]) => label);
        return facilities.length ? facilities.join(", ") : "No details listed in OpenStreetMap";
    }

    formatReading(value) {
        return Number.isFinite(value) ? value.toFixed(1) : "--";
    }

    getTypeSymbol(type) {
        return { park: "✳", garden: "❋", playground: "⌁", forest: "♧" }[type] || "✳";
    }

    getAQIColorCode(aqi) {
        return aqi === null || !Number.isFinite(aqi) ? "#8c9991"
            : aqi <= 20 ? "#cdf36b"
                : aqi <= 40 ? "#9fcf91"
                    : aqi <= 60 ? "#edbd73"
                        : aqi <= 80 ? "#ec8d78" : "#bd9bd9";
    }

    setStatus(message, state = "success") {
        this.statusMessage.textContent = message;
        this.dataStatus.dataset.state = state;
    }

    setLoading(isLoading) {
        this.refreshButton.disabled = isLoading;
        this.refreshButton.classList.toggle("is-loading", isLoading);
        if (isLoading) this.setStatus("Fetching live open data…", "loading");
    }

    showLoadError(message, onRetry) {
        this.setStatus(message, "error");
        this.setCategoryCountsUnavailable();
        this.parksListEl.replaceChildren();
        const error = document.createElement("div");
        error.className = "empty-state";
        error.textContent = message;
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "retry-button";
        retry.textContent = "Try again";
        retry.addEventListener("click", onRetry);
        error.appendChild(document.createElement("br"));
        error.appendChild(retry);
        this.parksListEl.appendChild(error);
    }

    setLastUpdated(timestamp, timezone) {
        const date = timestamp ? timestamp.replace("T", " ") : null;
        const zone = timezone ? timezone.split("/").pop().replaceAll("_", " ") : null;
        document.getElementById("last-updated").textContent = date
            ? `Model update · ${date}${zone ? ` ${zone}` : ""}`
            : "Model timestamp unavailable";
    }

    closeDrawer() {
        this.drawer.classList.add("hidden");
    }
}
