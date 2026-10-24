/* DOM rendering helpers for GreenPulse. */
const UI = (() => {
  "use strict";

  const byId = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function setLoading(active, message = "Loading map data…") {
    const loader = byId("loader");
    byId("loaderText").textContent = message;
    loader.classList.toggle("done", !active);
    loader.setAttribute("aria-hidden", String(!active));
  }

  function setStatus(message, kind = "") {
    const status = byId("appStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `app-status${kind ? ` ${kind}` : ""}`;
  }

  function showError(message) {
    byId("errorText").textContent = message;
    byId("errorBox").classList.remove("hidden");
  }

  function hideError() {
    byId("errorBox").classList.add("hidden");
  }

  function setTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    const button = byId("btnTheme");
    button.textContent = next === "dark" ? "☀️" : "🌙";
    button.setAttribute("aria-label", `Switch to ${next === "dark" ? "light" : "dark"} theme`);
    button.title = `Switch to ${next === "dark" ? "light" : "dark"} theme`;
  }

  function renderStats(stats) {
    byId("statTotal").textContent = stats.total.toLocaleString();
    byId("statAvg").textContent = stats.avgAqi == null ? "—" : stats.avgAqi;
    byId("statClean").textContent = stats.cleanest ? stats.cleanest.name : "—";
    byId("statClean").title = stats.cleanest ? `${stats.cleanest.name} · AQI ${stats.cleanest.aqi}` : "No air-quality readings";
  }

  function createParkItem(park, onSelect, activeId) {
    const category = CONFIG.CATEGORIES[park.category];
    const level = API.getAqiLevel(park.aqi && park.aqi.usAqi);
    const item = document.createElement("li");
    item.className = `park-item${park.id === activeId ? " active" : ""}`;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `${park.name}, ${category.label}, ${park.aqi ? `AQI ${park.aqi.usAqi}` : "air quality unavailable"}`);

    const icon = document.createElement("span");
    icon.className = "park-icon";
    icon.textContent = category.icon;

    const info = document.createElement("span");
    info.className = "park-info";
    const name = document.createElement("span");
    name.className = "park-name";
    name.textContent = park.name;
    const meta = document.createElement("span");
    meta.className = "park-meta";
    const area = park.areaHa ? ` · ${park.areaHa.toFixed(1)} ha` : "";
    meta.textContent = `${category.label}${area}`;
    info.append(name, meta);

    const badge = document.createElement("span");
    badge.className = "aqi-badge";
    badge.style.backgroundColor = level.color;
    badge.textContent = park.aqi ? park.aqi.usAqi : "—";
    badge.title = park.aqi ? `${level.label} · US AQI` : "No AQI data";

    item.append(icon, info, badge);
    const select = () => onSelect(park);
    item.addEventListener("click", select);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
    return item;
  }

  function renderParks(parks, onSelect, activeId = null) {
    const list = byId("parkList");
    const fragment = document.createDocumentFragment();
    byId("resultCount").textContent = parks.length.toLocaleString();
    if (!parks.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No parks match these filters. Try another search or category.";
      fragment.appendChild(empty);
    } else {
      parks.forEach((park) => fragment.appendChild(createParkItem(park, onSelect, activeId)));
    }
    list.replaceChildren(fragment);
  }

  function renderDetail(park, onClose) {
    const panel = byId("detailPanel");
    if (!park) {
      panel.classList.add("hidden");
      panel.replaceChildren();
      return;
    }
    const category = CONFIG.CATEGORIES[park.category];
    const level = API.getAqiLevel(park.aqi && park.aqi.usAqi);
    const metrics = park.aqi
      ? [
          ["PM2.5", park.aqi.pm25, "µg/m³"],
          ["PM10", park.aqi.pm10, "µg/m³"],
          ["Ozone", park.aqi.ozone, "µg/m³"],
          ["Nitrogen dioxide", park.aqi.no2, "µg/m³"],
        ]
      : [];
    const facilities = park.facilities && park.facilities.length
      ? park.facilities
      : ["Facility details not mapped"];
    const areaText = park.areaHa ? `${park.areaHa.toFixed(1)} ha (approx.)` : "Not mapped";
    const accessText = park.access || "Public / unspecified";
    const hoursText = park.openingHours || "Not mapped";
    const updatedText = park.aqi && park.aqi.time ? park.aqi.time.replace("T", " ") : "Unavailable";

    panel.innerHTML = `
      <button class="detail-close" type="button" aria-label="Close park details">×</button>
      <span class="detail-type">${escapeHtml(category.icon)} ${escapeHtml(category.label)}</span>
      <h3>${escapeHtml(park.name)}</h3>
      <div class="aqi-hero" style="background:${level.color}">
        <div class="aqi-num">${park.aqi ? escapeHtml(park.aqi.usAqi) : "—"}</div>
        <div class="aqi-label">${escapeHtml(level.label)} · US AQI</div>
      </div>
      <div class="detail-grid">
        ${metrics.map(([label, value, unit]) => `<div><small>${escapeHtml(label)}</small><b>${value == null ? "—" : escapeHtml(Number(value).toFixed(1))} ${escapeHtml(unit)}</b></div>`).join("")}
        <div><small>Approx. area</small><b>${escapeHtml(areaText)}</b></div>
        <div><small>Access</small><b>${escapeHtml(accessText)}</b></div>
        <div><small>Opening hours</small><b>${escapeHtml(hoursText)}</b></div>
        <div><small>Reading time</small><b>${escapeHtml(updatedText)}</b></div>
      </div>
      <div class="tag-list">${facilities.map((facility) => `<span class="tag">${escapeHtml(facility)}</span>`).join("")}</div>
      <p class="detail-note">Air quality is estimated from a nearby Open-Meteo grid cell, not measured by a sensor inside this park.</p>
      <a class="btn btn-primary directions-link" href="${escapeHtml(API.directionsUrl(park))}" target="_blank" rel="noopener noreferrer">Get directions ↗</a>
      <a class="source-link" href="${escapeHtml(park.osmUrl)}" target="_blank" rel="noopener noreferrer">View OpenStreetMap feature ↗</a>
    `;
    panel.classList.remove("hidden");
    panel.querySelector(".detail-close").addEventListener("click", onClose);
  }

  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    if (label) button.textContent = label;
  }

  return {
    byId, setLoading, setStatus, showError, hideError, setTheme,
    renderStats, renderParks, renderDetail, setButtonBusy,
  };
})();