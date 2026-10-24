/* GreenPulse Leaflet map and park markers. */
const MapView = (() => {
  "use strict";

  let map;
  let markers;
  let userMarker;
  let markersById = new Map();
  let onSelect = () => {};
  let selectedId = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function popupContent(park) {
    const level = API.getAqiLevel(park.aqi && park.aqi.usAqi);
    const reading = park.aqi ? `${park.aqi.usAqi} · ${level.label}` : "No reading available";
    return `<div class="map-popup">
      <h4>${escapeHtml(park.name)}</h4>
      <span>${escapeHtml(CONFIG.CATEGORIES[park.category].label)}</span>
      <p>US AQI: <b>${escapeHtml(reading)}</b></p>
      <button class="popup-action" type="button">View details</button>
    </div>`;
  }

  function markerFor(park) {
    const level = API.getAqiLevel(park.aqi && park.aqi.usAqi);
    const icon = L.divIcon({
      className: "",
      html: `<div class="gp-marker${park.id === selectedId ? " selected" : ""}" style="background:${level.color}"><span>${escapeHtml(CONFIG.CATEGORIES[park.category].icon)}</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 24],
      popupAnchor: [0, -22],
    });
    const marker = L.marker([park.lat, park.lng], {
      icon,
      title: park.name,
      alt: `${park.name}, ${level.label} air quality`,
      riseOnHover: true,
    });
    marker.bindPopup(popupContent(park));
    marker.on("click", () => {
      selectedId = park.id;
      onSelect(park);
    });
    marker.on("popupopen", (event) => {
      const button = event.popup.getElement().querySelector(".popup-action");
      if (button) button.addEventListener("click", () => onSelect(park));
    });
    return marker;
  }

  function init() {
    map = L.map("map", {
      center: CONFIG.MAP.center,
      zoom: CONFIG.MAP.zoom,
      minZoom: CONFIG.MAP.minZoom,
      maxZoom: CONFIG.MAP.maxZoom,
      zoomControl: false,
      scrollWheelZoom: true,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
    return map;
  }

  function render(parks, activeId = selectedId) {
    if (!map) return;
    selectedId = activeId;
    markersById.clear();
    markers.clearLayers();
    parks.forEach((park) => {
      const marker = markerFor(park);
      markersById.set(park.id, marker);
      markers.addLayer(marker);
    });
  }

  function setOnSelect(callback) {
    onSelect = callback;
  }

  function focusPark(park, openPopup = true) {
    if (!map || !park) return;
    selectedId = park.id;
    const marker = markersById.get(park.id);
    map.flyTo([park.lat, park.lng], Math.max(map.getZoom(), 14), { duration: 0.55 });
    if (openPopup && marker) marker.openPopup();
  }

  function showUserLocation(lat, lng) {
    if (!map) return;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([lat, lng], {
      radius: 8,
      className: "user-dot",
      color: "#FFFFFF",
      fillColor: "#3B9CFF",
      fillOpacity: 1,
      weight: 3,
    }).addTo(map).bindPopup("Your location");
    map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }

  return { init, render, setOnSelect, focusPark, showUserLocation };
})();