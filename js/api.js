class ApiService {
    static async fetchParks() {
        let overpassError;
        try {
            const elementsByTile = await Promise.all(
                this.splitStudyArea().map((bounds) => this.fetchOverpassTile(bounds))
            );
            const uniqueElements = new Map();

            elementsByTile.flat().forEach((element) => {
                uniqueElements.set(`${element.type}-${element.id}`, element);
            });

            const parks = Array.from(uniqueElements.values())
                .map((element) => this.normalizePark(element))
                .filter(Boolean);
            if (parks.length === 0) {
                throw new Error("OpenStreetMap returned no mappable green spaces.");
            }
            return { parks, source: "overpass" };
        } catch (error) {
            overpassError = error;
        }

        try {
            const fallback = await this.fetchNominatimFallback();
            if (fallback.parks.length === 0) {
                throw new Error("Place search returned no matching green spaces.");
            }
            return { ...fallback, source: "nominatim" };
        } catch (error) {
            throw new Error(
                `Overpass could not load the full map data (${overpassError.message}). ` +
                `The OpenStreetMap search backup also failed (${error.message}).`
            );
        }
    }

    static splitStudyArea() {
        const { south, west, north, east } = CONFIG.studyArea;
        const midLatitude = (south + north) / 2;
        const midLongitude = (west + east) / 2;
        return [
            { south, west, north: midLatitude, east: midLongitude },
            { south, west: midLongitude, north: midLatitude, east },
            { south: midLatitude, west, north, east: midLongitude },
            { south: midLatitude, west: midLongitude, north, east }
        ];
    }

    static async fetchOverpassTile(bounds) {
        const { south, west, north, east } = bounds;
        const query = `
            [out:json][timeout:25];
            (
              nwr["leisure"~"^(park|garden|playground|nature_reserve|common|recreation_ground|village_green)$"](${south},${west},${north},${east});
              nwr["landuse"~"^(forest|recreation_ground)$"](${south},${west},${north},${east});
              nwr["natural"="wood"](${south},${west},${north},${east});
            );
            out center tags;
        `;
        const errors = [];

        for (const endpoint of CONFIG.overpassEndpoints) {
            try {
                const response = await this.fetchWithTimeout(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                    body: `data=${encodeURIComponent(query)}`
                }, CONFIG.overpassRequestTimeoutMs);
                if (!response.ok) {
                    throw new Error(`Overpass returned HTTP ${response.status}`);
                }

                const result = await response.json();
                if (!Array.isArray(result.elements)) {
                    throw new Error("Overpass returned an unexpected response.");
                }
                return result.elements;
            } catch (error) {
                errors.push(error.message);
            }
        }

        throw new Error(`Could not load green spaces from OpenStreetMap. ${errors.join(" ")}`);
    }

    static async fetchNominatimFallback() {
        const { south, west, north, east } = CONFIG.studyArea;
        const searches = [
            { term: "park", categories: ["leisure/park"] },
            { term: "garden", categories: ["leisure/garden"] },
            { term: "playground", categories: ["leisure/playground"] },
            { term: "forest", categories: ["landuse/forest", "natural/wood", "leisure/nature_reserve"] }
        ];
        const resultsById = new Map();

        for (const [index, search] of searches.entries()) {
            if (index > 0) {
                await new Promise((resolve) => setTimeout(resolve, 1100));
            }

            const params = new URLSearchParams({
                format: "jsonv2",
                q: search.term,
                viewbox: `${west},${north},${east},${south}`,
                bounded: "1",
                limit: "50",
                extratags: "1"
            });
            const response = await this.fetchWithTimeout(
                `${CONFIG.nominatimEndpoint}?${params}`,
                {},
                CONFIG.nominatimRequestTimeoutMs
            );
            if (!response.ok) {
                throw new Error(`OpenStreetMap search returned HTTP ${response.status}`);
            }

            const results = await response.json();
            if (!Array.isArray(results)) {
                throw new Error("OpenStreetMap search returned an unexpected response.");
            }

            results.forEach((result) => {
                const categoryKey = `${result.category}/${result.type}`;
                if (!search.categories.includes(categoryKey)) return;

                const lat = Number.parseFloat(result.lat);
                const lon = Number.parseFloat(result.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
                if (lat < south || lat > north || lon < west || lon > east) return;
                const id = `${result.osm_type}-${result.osm_id}`;
                resultsById.set(id, { ...result, lat, lon });
            });
        }

        const results = Array.from(resultsById.values());
        const enrichmentWarnings = [];
        const enrichedResults = [];

        for (let start = 0; start < results.length; start += 50) {
            if (start > 0 || searches.length > 0) {
                await new Promise((resolve) => setTimeout(resolve, 1100));
            }

            const batch = results.slice(start, start + 50);
            const params = new URLSearchParams({
                format: "jsonv2",
                osm_ids: batch.map((result) => `${result.osm_type[0].toUpperCase()}${result.osm_id}`).join(","),
                addressdetails: "1",
                extratags: "1",
                namedetails: "1"
            });

            try {
                const response = await this.fetchWithTimeout(
                    `${CONFIG.nominatimEndpoint.replace(/\/search\/?$/, "")}/lookup?${params}`,
                    {},
                    CONFIG.nominatimRequestTimeoutMs
                );
                if (!response.ok) {
                    throw new Error(`OpenStreetMap lookup returned HTTP ${response.status}`);
                }
                const lookupResults = await response.json();
                if (!Array.isArray(lookupResults)) {
                    throw new Error("OpenStreetMap lookup returned an unexpected response.");
                }
                enrichedResults.push(...lookupResults);
            } catch (error) {
                enrichmentWarnings.push(error.message);
            }
        }

        const enrichedById = new Map(enrichedResults.map((result) => [
            `${result.osm_type}-${result.osm_id}`,
            result
        ]));

        const parks = results.map((result) => {
            const details = enrichedById.get(`${result.osm_type}-${result.osm_id}`) || result;
            const type = result.type === "park"
                ? "park"
                : result.type === "garden"
                    ? "garden"
                    : result.type === "playground"
                        ? "playground"
                        : "forest";
            const categoryLabel = {
                park: "Park",
                garden: "Garden",
                playground: "Playground",
                forest: "Forest"
            }[type];
            const address = details.address || result.address || {};
            const location = address.neighbourhood
                || address.suburb
                || address.village
                || address.town
                || address.city_district
                || address.city
                || address.municipality
                || address.county
                || null;
            const tags = { ...(details.extratags || result.extratags || {}) };
            const name = details.name
                || details.namedetails?.name
                || details.namedetails?.["name:en"]
                || result.name
                || (location ? `${categoryLabel} · ${location}` : `Unnamed ${categoryLabel}`);

            return {
                id: `${result.osm_type}-${result.osm_id}`,
                osmType: result.osm_type,
                osmId: result.osm_id,
                name,
                type,
                lat: result.lat,
                lon: result.lon,
                location,
                access: this.formatAccess(tags.access),
                area: tags["area:ha"] || tags["park:area"] || null,
                tags
            };
        });

        return {
            parks,
            enrichmentWarning: enrichmentWarnings.length ? enrichmentWarnings.join(" ") : null
        };
    }

    static normalizePark(element) {
        const tags = element.tags || {};
        const latitude = element.lat ?? element.center?.lat;
        const longitude = element.lon ?? element.center?.lon;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        let category = tags.leisure || "";
        if (["nature_reserve"].includes(category) || tags.landuse === "forest" || tags.natural === "wood") {
            category = "forest";
        }
        if (tags.landuse === "recreation_ground") category = "park";
        if (["common", "village_green"].includes(category)) category = "park";
        if (!["park", "garden", "playground", "forest"].includes(category)) {
            category = "park";
        }

        const categoryLabel = {
            park: "Park",
            garden: "Garden",
            playground: "Playground",
            forest: "Forest"
        }[category];

        return {
            id: `${element.type}-${element.id}`,
            osmType: element.type,
            osmId: element.id,
            name: tags.name || `Unnamed ${categoryLabel}`,
            type: category,
            lat: latitude,
            lon: longitude,
            location: null,
            access: this.formatAccess(tags.access),
            area: tags["area:ha"] || tags["park:area"] || null,
            tags
        };
    }

    static formatAccess(access) {
        const labels = {
            yes: "Public access",
            public: "Public access",
            permissive: "Public access",
            designated: "Designated access",
            destination: "Destination access only",
            customers: "Customers only",
            private: "Private access",
            no: "No public access"
        };
        return labels[access] || "Not listed in OSM";
    }

    static async fetchAirQuality(parks) {
        const results = new Map();
        const errors = [];

        for (let start = 0; start < parks.length; start += CONFIG.airQualityBatchSize) {
            const batch = parks.slice(start, start + CONFIG.airQualityBatchSize);
            const latitudes = batch.map((park) => park.lat.toFixed(5)).join(",");
            const longitudes = batch.map((park) => park.lon.toFixed(5)).join(",");
            const params = new URLSearchParams({
                latitude: latitudes,
                longitude: longitudes,
                current: "european_aqi,pm2_5,pm10",
                timezone: "auto"
            });
            const url = `${CONFIG.openMeteoEndpoint}?${params}`;

            try {
                const response = await this.fetchWithRetry(url);
                const payload = await response.json();
                const locations = Array.isArray(payload) ? payload : [payload];

                batch.forEach((park, index) => {
                    const current = locations[index]?.current;
                    results.set(park.id, {
                        aqi: this.toNumber(current?.european_aqi),
                        pm25: this.toNumber(current?.pm2_5),
                        pm10: this.toNumber(current?.pm10),
                        aqiTime: current?.time || null,
                        aqiTimezone: locations[index]?.timezone || "Asia/Karachi"
                    });
                });
            } catch (error) {
                errors.push(error.message);
                batch.forEach((park) => results.set(park.id, {
                    aqi: null,
                    pm25: null,
                    pm10: null,
                    aqiTime: null,
                    aqiTimezone: null
                }));
            }
        }

        return { readings: results, errors };
    }

    static toNumber(value) {
        return Number.isFinite(value) ? value : null;
    }

    static async fetchWithRetry(url, options = {}) {
        let lastError;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const response = await this.fetchWithTimeout(url, options);
                if (!response.ok) {
                    throw new Error(`Request returned HTTP ${response.status}`);
                }
                return response;
            } catch (error) {
                lastError = error;
                if (attempt === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 700));
                }
            }
        }
        throw lastError;
    }

    static async fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.requestTimeoutMs) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("The data service took too long to respond.");
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}
