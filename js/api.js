/* ==========================================================
   GreenPulse Islamabad - API layer
   API 1: OpenStreetMap Overpass  -> parks, gardens, playgrounds, forests
   API 2: Open-Meteo Air Quality  -> US AQI, PM2.5, PM10
   Plain JS (no modules), global object: API
   ========================================================== */

const API = (() => {
  "use strict";

  /* ---------- Utilities ---------- */

  class ApiError extends Error {
    constructor(message, source, details = []) {
      super(message);
      this.name = "ApiError";
      this.source = source;   // "overpass" ya "open-meteo"
      this.details = details; // technical errors (console / report ke liye)
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // fetch() jo timeout par khud cancel ho jaye
  async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /* ==========================================================
     API 1: OVERPASS (parks)
     ========================================================== */

  // Sirf named features mangwate hain (["name"]): data halka, load tez,
  // aur user ke liye search/popup mein asli naam milta hai.
  function buildOverpassQuery() {
    const { south, west, north, east } = CONFIG.BBOX;
    const box = `${south},${west},${north},${east}`;
    return `
      [out:json][timeout:${CONFIG.OVERPASS.timeoutSec}];
      (
        nwr["leisure"="park"]["name"](${box});
        nwr["leisure"="garden"]["name"](${box});
        nwr["leisure"="playground"]["name"](${box});
        nwr["landuse"="forest"]["name"](${box});
        nwr["natural"="wood"]["name"](${box});
      );
      out tags bb;
    `;
  }

  // Server 1 -> retry -> server 2 -> retry ...
  async function overpassRequest(query, onStatus) {
    const { endpoints, retriesPerServer, retryDelayMs, timeoutSec } = CONFIG.OVERPASS;
    const errors = [];

    for (const url of endpoints) {
      const host = new URL(url).hostname;

      for (let attempt = 0; attempt <= retriesPerServer; attempt++) {
        try {
          onStatus(`Contacting ${host}${attempt ? ` (retry ${attempt})` : ""}…`);

          const res = await fetchWithTimeout(
            url,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
              body: "data=" + encodeURIComponent(query),
            },
            (timeoutSec + 10) * 1000
          );

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const json = await res.json();

          // Overpass kabhi kabhi 200 ke saath error remark deta hai
          if (json.remark && /error|timed out|out of memory/i.test(json.remark)) {
            throw new Error(json.remark);
          }
          if (!Array.isArray(json.elements)) throw new Error("Unexpected response format");

          return json;
        } catch (err) {
          const reason = err.name === "AbortError" ? "timeout" : err.message;
          errors.push(`${host}: ${reason}`);
          console.warn(`[Overpass] ${host} failed:`, reason);
          if (attempt < retriesPerServer) await sleep(retryDelayMs);
        }
      }
    }

    throw new ApiError(
      "OpenStreetMap (Overpass) servers are busy or unreachable. Please check your internet and retry.",
      "overpass",
      errors
    );
  }

  /* ---------- Overpass response -> clean park objects ---------- */

  function classify(tags) {
    if (tags.leisure === "playground") return "playground";
    if (tags.leisure === "garden") return "garden";
    if (tags.leisure === "park") return "park";
    if (tags.landuse === "forest" || tags.natural === "wood") return "forest";
    return null;
  }

  // Bounding box se approx area (hectares)
  function approxAreaHa(b, lat) {
    if (!b) return null;
    const wKm = (b.maxlon - b.minlon) * 111.32 * Math.cos((lat * Math.PI) / 180);
    const hKm = (b.maxlat - b.minlat) * 110.57;
    return Math.max(0, wKm * hKm * 100);
  }

  function buildFacilities(t) {
    const f = [];
    if (t.toilets === "yes") f.push("Toilets");
    if (t.drinking_water === "yes") f.push("Drinking water");
    if (t.bench === "yes") f.push("Benches");
    if (t.lit === "yes") f.push("Lit at night");
    if (t.wheelchair === "yes") f.push("Wheelchair accessible");
    if (t.dog === "yes") f.push("Dogs allowed");
    if (t.dog === "no") f.push("No dogs");
    if (t.fee === "yes") f.push("Entry fee");
    if (t.fee === "no") f.push("Free entry");
    return f;
  }

  function normalizeElement(el) {
    const tags = el.tags || {};
    const category = classify(tags);
    if (!category) return null;

    // Private ya band jagah skip
    if (tags.access === "private" || tags.access === "no") return null;

    // Unnamed features skip (safety check, query bhi name filter karti hai)
    const rawName = tags["name:en"] || tags.name || null;
    if (!rawName) return null;

    // Location: node ka lat/lon, way/relation ka bounds center
    let lat, lng;
    if (el.type === "node") {
      lat = el.lat; lng = el.lon;
    } else if (el.bounds) {
      lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
      lng = (el.bounds.minlon + el.bounds.maxlon) / 2;
    }
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    return {
      id: `${el.type[0]}${el.id}`,
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      name: rawName,
      hasName: true,
      category,
      lat,
      lng,
      areaHa: approxAreaHa(el.bounds, lat),
      access: tags.access || null,
      openingHours: tags.opening_hours || null,
      operator: tags.operator || null,
      website: tags.website || tags["contact:website"] || null,
      surface: tags.surface || null,
      facilities: buildFacilities(tags),
      aqi: null, // niche attachAirQuality() bharega
    };
  }

  async function fetchParks(onStatus = () => {}) {
    onStatus("Fetching parks from OpenStreetMap…");
    const json = await overpassRequest(buildOverpassQuery(), onStatus);

    onStatus("Processing park data…");
    const seen = new Set();
    let parks = [];

    for (const el of json.elements) {
      const p = normalizeElement(el);
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      parks.push(p);
    }

    // Bade parks pehle, phir limit
    parks.sort((a, b) => (b.areaHa || 0) - (a.areaHa || 0));
    parks = parks.slice(0, CONFIG.OVERPASS.maxFeatures);

    if (parks.length === 0) {
      throw new ApiError("No named parks were returned for this study area.", "overpass");
    }
    return parks;
  }

  /* ==========================================================
     API 2: OPEN-METEO AIR QUALITY
     ========================================================== */

  // v2: har zone ka apna savedAt timestamp hai (purana v1 cache ignore hoga)
  const CACHE_KEY = "greenpulse_aq_v2";

  function cellOf(lat, lng) {
    const g = CONFIG.AIR_QUALITY.gridSize;
    const cLat = Math.round(lat / g) * g;
    const cLng = Math.round(lng / g) * g;
    return { key: `${cLat.toFixed(2)},${cLng.toFixed(2)}`, lat: +cLat.toFixed(2), lng: +cLng.toFixed(2) };
  }

  // Sirf wo zones wapas dega jo abhi cacheMinutes ke andar save hue hain
  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
      const maxAge = CONFIG.AIR_QUALITY.cacheMinutes * 60 * 1000;
      const fresh = {};
      for (const [key, value] of Object.entries(raw)) {
        if (value && value.savedAt && Date.now() - value.savedAt < maxAge) {
          fresh[key] = value;
        }
      }
      return fresh;
    } catch (_) {
      return {}; // cache optional hai
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (_) { /* ignore */ }
  }

  // JSON fetch with simple retry (Open-Meteo ke liye)
  async function fetchJsonWithRetry(url, tries = 3) {
    const errors = [];
    for (let i = 1; i <= tries; i++) {
      try {
        const res = await fetchWithTimeout(url, {}, 20000);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) {
          throw new Error(json.reason || `HTTP ${res.status}`);
        }
        return json;
      } catch (err) {
        errors.push(err.name === "AbortError" ? "timeout" : err.message);
        if (i < tries) await sleep(1200 * i);
      }
    }
    throw new ApiError("Open-Meteo air quality service is not responding.", "open-meteo", errors);
  }

  async function attachAirQuality(parks, onStatus = () => {}) {
    onStatus("Fetching live air quality from Open-Meteo…");

    // 1) Parks ko grid zones mein group karo (API calls kam)
    const cells = new Map();
    for (const p of parks) {
      const c = cellOf(p.lat, p.lng);
      p.cell = c.key;
      if (!cells.has(c.key)) cells.set(c.key, c);
    }

    // 2) Cache check (sirf fresh zones)
    const result = readCache();
    const missing = [...cells.values()].filter((c) => !result[c.key]);

    // 3) Missing zones ko chunks mein fetch karo (multi-location request)
    const CHUNK = 25;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const part = missing.slice(i, i + CHUNK);
      const params = new URLSearchParams({
        latitude: part.map((c) => c.lat).join(","),
        longitude: part.map((c) => c.lng).join(","),
        current: "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide",
        timezone: "auto",
      });

      const json = await fetchJsonWithRetry(`${CONFIG.AIR_QUALITY.url}?${params}`);
      const list = Array.isArray(json) ? json : [json]; // 1 location = object, many = array

      part.forEach((c, idx) => {
        const cur = list[idx] && list[idx].current;
        if (cur && cur.us_aqi != null) {
          result[c.key] = {
            usAqi: Math.round(cur.us_aqi),
            pm25: cur.pm2_5,
            pm10: cur.pm10,
            ozone: cur.ozone,
            no2: cur.nitrogen_dioxide,
            time: cur.time,
            savedAt: Date.now(),
          };
        }
      });
    }

    // Cache tabhi update karo jab naya data aaya ho (timestamp ghalat refresh na ho)
    if (missing.length) writeCache(result);

    // 4) Har park ko uske zone ka AQI de do
    for (const p of parks) p.aqi = result[p.cell] || null;
    return parks;
  }

  /* ==========================================================
     MAIN LOADER
     ========================================================== */

  // Parks fail hon to error; AQI fail ho to app chalti rahe (warning ke saath)
  async function loadAll(onStatus = () => {}) {
    const parks = await fetchParks(onStatus);
    let warning = null;
    try {
      await attachAirQuality(parks, onStatus);
    } catch (err) {
      console.warn("[Open-Meteo]", err.details || err);
      warning = "Live air quality is unavailable right now. Parks are shown without AQI.";
    }
    return { parks, warning, fetchedAt: new Date() };
  }

  /* ==========================================================
     HELPERS (ui.js / map.js / main.js use karenge)
     ========================================================== */

  function getAqiLevel(aqi) {
    if (aqi == null || Number.isNaN(aqi)) return CONFIG.AQI_UNKNOWN;
    return CONFIG.AQI_LEVELS.find((l) => aqi <= l.max);
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function nearestParks(parks, lat, lng, n = CONFIG.NEARBY_COUNT) {
    return parks
      .map((p) => ({ park: p, km: distanceKm(lat, lng, p.lat, p.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, n);
  }

  // Sab se saaf hawa wala park (tie par bada park)
  function bestPark(parks) {
    const withAqi = parks.filter((p) => p.aqi);
    if (!withAqi.length) return null;
    return withAqi.sort(
      (a, b) => (a.aqi.usAqi - b.aqi.usAqi) || ((b.areaHa || 0) - (a.areaHa || 0))
    )[0];
  }

  function filterParks(parks, { query = "", category = "all" } = {}) {
    const q = query.trim().toLowerCase();
    return parks.filter((p) =>
      (category === "all" || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q))
    );
  }

  function computeStats(parks) {
    const withAqi = parks.filter((p) => p.aqi);
    const avgAqi = withAqi.length
      ? Math.round(withAqi.reduce((s, p) => s + p.aqi.usAqi, 0) / withAqi.length)
      : null;

    // Cleanest zone: sab se kam AQI wala zone, us mein sab se bada park
    let cleanest = null;
    if (withAqi.length) {
      const minAqi = Math.min(...withAqi.map((p) => p.aqi.usAqi));
      const inZone = withAqi
        .filter((p) => p.aqi.usAqi === minAqi)
        .sort((a, b) => (b.areaHa || 0) - (a.areaHa || 0));
      cleanest = { name: inZone[0].name, aqi: minAqi };
    }
    return { total: parks.length, avgAqi, cleanest };
  }

  function directionsUrl(p) {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  }

  return {
    ApiError, fetchParks, attachAirQuality, loadAll,
    getAqiLevel, distanceKm, nearestParks, bestPark,
    filterParks, computeStats, directionsUrl,
  };
})();