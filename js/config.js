/* ==========================================================
   GreenPulse Islamabad - Configuration
   Saari settings yahan hain, taake baaqi files saaf rahein.
   Koi API key nahi chahiye (dono APIs free aur keyless hain).
   ========================================================== */

const CONFIG = {
  APP_NAME: "GreenPulse Islamabad",

  // Map ka starting view (Islamabad centre)
  MAP: {
    center: [33.6844, 73.0479],
    zoom: 11,
    minZoom: 9,
    maxZoom: 18,
  },

  // Study area: Islamabad + Rawalpindi (south, west, north, east)
  BBOX: { south: 33.45, west: 72.85, north: 33.82, east: 73.25 },

  // API 1: OpenStreetMap Overpass (primary + backup server)
  OVERPASS: {
    endpoints: [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ],
    timeoutSec: 40,       // query timeout
    retriesPerServer: 1,  // har server par extra try
    retryDelayMs: 2000,   // retry se pehle wait
    maxFeatures: 500,     // zyada parks ho to map slow na ho
  },

  // API 2: Open-Meteo Air Quality
  AIR_QUALITY: {
    url: "https://air-quality-api.open-meteo.com/v1/air-quality",
    // Sirf API calls kam karne ke liye parks ko zones mein group karte hain.
    // Ye data ki asal resolution nahi hai (model ki resolution isse coarse hai).
    gridSize: 0.05,
    cacheMinutes: 30,     // har zone ka data itni der cache rehta hai
  },

  // US AQI categories (Midnight Forest palette: mint -> amber -> coral -> violet)
  AQI_LEVELS: [
    { max: 50,  key: "good",           label: "Good",                           color: "#4ADE9A" },
    { max: 100, key: "moderate",       label: "Moderate",                       color: "#FFB547" },
    { max: 150, key: "sensitive",      label: "Unhealthy for Sensitive Groups", color: "#FF9A3C" },
    { max: 200, key: "unhealthy",      label: "Unhealthy",                      color: "#FF6B5B" },
    { max: 300, key: "very-unhealthy", label: "Very Unhealthy",                 color: "#A855F7" },
    { max: Infinity, key: "hazardous", label: "Hazardous",                      color: "#7C3AED" },
  ],
  AQI_UNKNOWN: { key: "unknown", label: "No data", color: "#7C8F8A" },

  // Park categories (filter ke liye)
  CATEGORIES: {
    park:       { label: "Park",       icon: "🌳" },
    garden:     { label: "Garden",     icon: "🌸" },
    playground: { label: "Playground", icon: "🛝" },
    forest:     { label: "Forest",     icon: "🌲" },
  },

  // Attribution (assignment requirement)
  ATTRIBUTION: {
    osm: "© OpenStreetMap contributors",
    meteo: "Air quality data by Open-Meteo.com (Copernicus CAMS)",
  },

  // Near me ke liye
  NEARBY_COUNT: 5,
};