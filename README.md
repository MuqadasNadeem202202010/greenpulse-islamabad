# GreenPulse — Islamabad Green Space Atlas

A responsive Web GIS for exploring mapped parks, gardens, playgrounds and wooded areas across Islamabad and Rawalpindi, with current model-based European Air Quality Index (AQI), PM2.5 and PM10 estimates.

## Run locally

1. Open this folder in Visual Studio Code.
2. Open `index.html` and choose **Go Live** (Live Server extension).
3. The browser loads the latest data when the page opens. Saving HTML, CSS or JavaScript files refreshes the page through Live Server.

This is a static HTML/CSS/JavaScript application; it does not need a database, backend, API key or build step. Internet access is needed for map tiles and the public data APIs. Browser location access requires a secure context such as `localhost` or HTTPS.

## Features

- Leaflet map with color-coded European AQI markers, map popups and a place-details panel.
- OpenStreetMap search, category filters and mapped access/facility details.
- Current cleanest-air comparison, nearest-place lookup using browser geolocation, and Google Maps directions.
- Dark/light themes, responsive layout, loading states, retry and refresh controls.
- Manual refresh and hourly air-quality refresh; the Overpass study area is queried in four smaller sections and duplicate map features are removed. If both Overpass servers time out, an explicitly labeled, non-exhaustive OpenStreetMap search backup keeps real mapped places visible until Overpass recovers.
- No synthetic or hard-coded park or AQI data. If a service has no reading, the interface says so.

## Data sources and limitations

- **Green-space locations and tags:** [OpenStreetMap Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API). The study-area query covers Islamabad and Rawalpindi and includes mapped parks, gardens, playgrounds, recreational grounds, village greens and forests, including features without a mapped name. Unnamed features are labelled with their OpenStreetMap ID. Results depend on community mapping and are not a complete official inventory.
- **Temporary place-search backup:** [Nominatim](https://nominatim.org/release-docs/latest/api/Search/) is queried only when both Overpass servers fail. Its ranked results are limited and may omit unnamed or less prominent places; the app looks up returned OSM records for names, locality and access tags, and warns that the list is not exhaustive.
- Entry information is shown only when OpenStreetMap provides an access tag. Missing tags are labelled as unlisted, not treated as proof of either public or restricted access; AQI is independent model data.
- **Air quality:** [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api), requested for each mapped feature in coordinate batches. The API describes current conditions as model data; values are estimates, not measurements from sensors located inside each park. Nearby coordinates may share a model grid cell.
- **Map tiles:** OpenStreetMap tiles in both themes; dark mode styles the tiles locally, so no basemap key is needed.

The footer and map controls provide source attribution. OpenStreetMap data is available under the ODbL; consult each provider's current terms and attribution requirements before publishing.

## Publish on Vercel

Import the GitHub repository into Vercel and deploy it as a static site. No environment variables or build command are required. The included `vercel.json` configures static delivery. Test the deployed HTTPS URL and allow network access to the public APIs.
