# GreenPulse Islamabad

An API-based Web GIS for exploring parks and green spaces in Islamabad and
Rawalpindi alongside nearby air-quality estimates.

## Run locally

Open this folder in VS Code and use the Live Server extension to serve
`index.html`. A local web server is recommended because browser location access
requires HTTPS or localhost. The app uses plain HTML, CSS and JavaScript; there
is no build step and no API key to configure.

## Features

- Interactive Leaflet map with searchable parks and category filters.
- US AQI, PM2.5 and PM10 from the Open-Meteo Air Quality API.
- Best-air-quality selection, GPS location and the five nearest mapped parks.
- Park details, mapped facilities, approximate area and Google Maps directions.
- Dark/light theme, mobile layout, loading and retry states.

## Data and limitations

Park features are queried from OpenStreetMap through the Overpass API for the
configured Islamabad–Rawalpindi bounding box in `js/config.js`. OSM coverage
depends on community mapping; missing names, boundaries, opening hours or
facilities are shown as unavailable rather than inferred.

Air-quality readings are model-based data fetched from Open-Meteo. Parks are
grouped into nearby zones to limit requests, so a park's AQI is an estimate for
its surrounding area, not an on-site sensor reading, and neighbouring parks
often share the same value. Each zone's reading is cached in the browser for 30
minutes. Both data APIs are public and require no key. Open-Meteo's free API is
for non-commercial use (including educational projects) and is subject to its
published [call limits and terms](https://open-meteo.com/en/terms) and CC BY 4.0
attribution requirement. Overpass public instances are best-effort, enforce
fair-use limits and may shed load. This app uses a bounded query, retries and an
alternate endpoint; it should not be used as a high-traffic public data backend.

Attribution is displayed in the map and page footer:

- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL), via Overpass API.
- Air-quality data from the [Copernicus Atmosphere Monitoring Service (CAMS)](https://atmosphere.copernicus.eu/) via [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).

The map uses the standard OSM tile service; tile use is best-effort and subject
to the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Deploy to Vercel

Import the GitHub repository in Vercel and deploy it as a static site. Keep
`index.html` at the project root; no framework preset, build command or output
directory is needed. GPS functionality on the deployed site requires the HTTPS
URL and the visitor's permission.