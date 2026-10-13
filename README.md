# Aquifer Atlas

A free, static groundwater data and scenario-exploration prototype focused on the Thane region of Maharashtra.

## Included pages

- **Overview** — sample summary, schematic study-area view, interactive conceptual 3D watershed surface, median trend chart, and sample table.
- **Well Explorer** — search, filter, sort, inspect, import a dated CSV, and export records.
- **Forecast** — adjust rainfall, pumping, and recharge assumptions and export the illustrative projection.
- **Scenarios** — use presets, save scenarios in this browser, compare against a baseline, and export results.
- **Evidence** — source links, method, citation, and limitations.

All features are available without a paid tier. The app makes no paid API calls. Imported data and saved scenarios stay in the browser's local storage; nothing is uploaded by the app. Public fonts load from Google Fonts when a network connection is available, with system-font fallbacks.

## Data and limitations

The bundled sample contains 15 station rows and three observation rounds (August 2021, November 2021, and January 2022) transcribed from the Central Ground Water Board's *Ground Water Year Book of Maharashtra and UT of Dadra and Nagar Haveli, 2021–22*. Units are metres below ground level (m bgl); missing source readings remain blank. The report's district label is shown as printed. The sample does not include surveyed coordinates or elevation measurements, so the map markers are schematic and the 3D watershed surface is procedurally illustrated; neither is navigational or a representation of measured Thane terrain.

The 12-month output is a transparent, deterministic scenario calculation using bounded historical slope plus explicit rainfall, pumping, and recharge sensitivity assumptions. It is not machine-learning output, a calibrated hydrological forecast, a current groundwater stress rating, or allocation advice. Review the source notes in the Evidence page before using values in planning.

Sources:
- [CGWB yearbook PDF](https://cgwb.gov.in/cgwbpnm/public/uploads/documents/16877723471125377693file.pdf)
- [CGWB groundwater monitoring](https://cgwb.gov.in/hi/ground-water-level-monitoring)
- [Maharashtra GSDA resource estimation reports](https://gsda.maharashtra.gov.in/en-groundwater-resource-estimation/)
- [India-WRIS](https://indiawris.gov.in/)

## Run locally

Open `index.html` in a modern browser. There is no build step or package installation. The sample data and core pages work offline after the files are available locally; Google Fonts may fall back to system fonts offline.

## Deploy with GitHub and Netlify

1. Extract the ZIP and create a GitHub repository.
2. Upload the files inside the `GroundwaterAtlas` folder to the repository root (so `index.html` is at the root), or upload the folder contents using Git.
3. In Netlify, choose **Add new site → Import an existing project**, connect the repository, and use these settings:
   - Build command: leave blank
   - Publish directory: `.`
4. Deploy. No environment variables or API keys are required.

The included `netlify.toml` sets the static publish directory.

## Deploy with Vercel

1. Import the GitHub repository in Vercel.
2. Select **Other** as the framework preset.
3. Leave Build Command and Output Directory blank (or set Output Directory to `.`).
4. Deploy. No environment variables or API keys are required.

The included `vercel.json` configures clean static output and page fallback behavior.

## CSV import format

Use the Well Explorer's template download. Required column headers are `name,date,depth_m_bgl`. Use one observation per row, for example:

```csv
name,date,depth_m_bgl
Sample well,2024-05-01,4.25
```

Imported records are saved only in the current browser profile. Export a copy before clearing browser storage if you need to preserve them.
