class MapManager {
    constructor(containerId) {
        this.map = L.map(containerId, { zoomControl: false }).setView(CONFIG.mapCenter, CONFIG.defaultZoom);
        L.control.zoom({ position: "topright" }).addTo(this.map);
        this.tileLayer = L.tileLayer(this.getTileUrl(), {
            maxZoom: 19,
            attribution: this.getAttribution(),
            subdomains: "abc"
        }).addTo(this.map);
        this.markersLayer = L.layerGroup().addTo(this.map);
        this.userLayer = L.layerGroup().addTo(this.map);
    }

    getTileUrl() {
        return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    }

    getAttribution() {
        return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
    }

    setTheme() {
        this.map.invalidateSize();
    }

    renderMarkers(parks, onSelectCallback) {
        this.markersLayer.clearLayers();

        parks.forEach((park) => {
            const color = this.getAQIColor(park.aqi);
            const markerIcon = L.divIcon({
                className: "custom-map-marker",
                html: `<span class="aqi-marker" style="--marker-color:${color}"></span>`,
                iconSize: [21, 21],
                iconAnchor: [10, 10]
            });
            const marker = L.marker([park.lat, park.lon], {
                icon: markerIcon,
                title: park.name,
                alt: `${park.name}, ${park.aqi === null ? "air quality unavailable" : `AQI ${park.aqi}`}`
            });
            const popup = document.createElement("div");
            const title = document.createElement("div");
            title.className = "popup-title";
            title.textContent = park.name;
            const reading = document.createElement("div");
            reading.className = "popup-aqi";
            reading.textContent = park.aqi === null
                ? "Air quality reading unavailable"
                : `${this.getStatusText(park.aqi)} · European AQI ${park.aqi}`;
            popup.append(title, reading);

            marker.bindPopup(popup);
            marker.on("click", () => onSelectCallback(park));
            this.markersLayer.addLayer(marker);
        });
    }

    showUserLocation(lat, lon) {
        this.userLayer.clearLayers();
        const icon = L.divIcon({
            className: "",
            html: '<span class="user-location-marker"></span>',
            iconSize: [15, 15],
            iconAnchor: [7, 7]
        });
        L.marker([lat, lon], { icon, title: "Your location" }).addTo(this.userLayer);
    }

    getAQIColor(aqi) {
        if (aqi === null || !Number.isFinite(aqi)) return "#8c9991";
        if (aqi <= 20) return "#cdf36b";
        if (aqi <= 40) return "#9fcf91";
        if (aqi <= 60) return "#edbd73";
        if (aqi <= 80) return "#ec8d78";
        return "#bd9bd9";
    }

    getStatusText(aqi) {
        if (aqi === null || !Number.isFinite(aqi)) return "Reading unavailable";
        if (aqi <= 20) return "Good air";
        if (aqi <= 40) return "Fair";
        if (aqi <= 60) return "Moderate";
        if (aqi <= 80) return "Poor";
        if (aqi <= 100) return "Very poor";
        return "Extremely poor";
    }

    flyToPark(lat, lon) {
        this.map.flyTo([lat, lon], 16, { duration: 0.8 });
    }
}
