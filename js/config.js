const CONFIG = {
    mapCenter: [33.6844, 73.0479],
    defaultZoom: 12,
    studyArea: {
        south: 33.30,
        west: 72.70,
        north: 33.95,
        east: 73.45
    },
    overpassEndpoints: [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
    ],
    nominatimEndpoint: "https://nominatim.openstreetmap.org/search",
    openMeteoEndpoint: "https://air-quality-api.open-meteo.com/v1/air-quality",
    requestTimeoutMs: 35000,
    overpassRequestTimeoutMs: 12000,
    nominatimRequestTimeoutMs: 15000,
    airQualityBatchSize: 35,
    refreshIntervalMs: 60 * 60 * 1000
};
