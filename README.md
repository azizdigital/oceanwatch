# Sentinel OceanWATCH — Offshore Weather Guideline & Monitoring

PC app (Windows) and web app (iPad / phone / browser) for **offshore work**: a **Weather** page (all models told as one story: wind, waves, swell, tides, rain & thunderstorms), a **Vessels** page (your own vessels on VesselFinder / MarineTraffic maps), wind, gusts, waves (Hs, Hmax), swell & period, visibility, thunderstorms; 6 wind + 4 wave models side by side with ensembles; **Go / Caution / No-Go for every job** in 3-hour blocks (10 standard jobs + **My jobs**); weather windows; **Continue or demob?** (latest time to start demob, middle of the models with the worst / best model in brackets); MET Malaysia **sea** warnings; A4 PDF (AMT style); **Ask AI** (the app's own guide + a prompt for ChatGPT / Claude / Gemini / Copilot). First location: **Irong Barat**; more can be added in Settings.

Split from *Dashboard Cuaca Aziz* 4.6.0 (offshore part). Land app: **Monsoon EYE** (repo `monsoon-eye`). The original `dashboard-cuaca` is unchanged.

- Address: **https://azizdigital.github.io/oceanwatch/**
- iPad: open it in Safari → Share → **Add to Home Screen**.
- Changes: `PERUBAHAN_1.2.0.txt`, `PERUBAHAN_1.1.2.txt`, `PERUBAHAN_1.1.1.txt`, `PERUBAHAN_1.1.0.txt`, `PERUBAHAN_1.0.0.txt`. User guide (BM): `PANDUAN.md`.

## PC app (Windows)
A full PC app like Dashboard Cuaca's: local server, data collection & alerts in the background (also from the tray when the window is closed), Windows notifications, websites inside the app + ad blocker, PDF, start with Windows.
- **Runs at the same time** as Dashboard Cuaca (port 30040) and Monsoon EYE (30050): own port **30060**, own data folder `%APPDATA%\Sentinel OceanWATCH`, own icon & tray.
- **Import settings:** Settings › Import from Dashboard Cuaca — read straight from the Dashboard Cuaca PC app (`%APPDATA%\Dashboard Cuaca Aziz\config.json`).
- No phone / QR sharing — iPad and phone use the web app (address above).

### Build the .exe (on a Windows PC)
Needs **Node.js 22 LTS** (nodejs.org). In the repo folder (the one with `package.json`):
```
npm install
npm run dist
```
Output in `dist\`: **Sentinel OceanWATCH Setup 1.2.0.exe** (installer) and **Sentinel OceanWATCH 1.2.0.exe** (portable). Try it without building: `npm start`.
If `npm install` fails: check you are in the right folder (`dir package.json`), delete `node_modules`, try again; if it still fails, copy the first `npm error` line.

## Data (free, no API keys)
Open-Meteo (ECMWF, GFS, ICON, JMA, Météo-France, UKMO; ECMWF WAM, GFS Wave, MF Wave, DWD GWAM; ECMWF & GFS ensembles) · MET Malaysia through api.data.gov.my.

## One-time setup (owner)
1. **GitHub Pages:** repo › Settings › Pages › Source: **GitHub Actions**. Every push to `main` publishes `www/`.
2. **Cloudflare relay** (for sites that refuse to be shown inside the app, e.g. Windy, MarineTraffic, VesselFinder, and to remove ads): the existing Dashboard Cuaca relay can be shared — Settings › Site relay › fill in the same **relay address** + type the same **relay key** (your own key: 8-64 characters, letters, numbers, `- _ . ~`) › Save › Test relay. A new relay of its own instead: dash.cloudflare.com › Workers & Pages › Create › Hello World › Deploy; in the app type a key › Save › **Copy relay script** → Cloudflare *Edit code* → delete all → paste → **Deploy** → Test relay.

## Layout
```
main.js, preload.js       PC app (Electron) — edition.json says which app
lib/                      local server, collector, alerts, ad blocker (PC app)
build/                    .exe icon
www/index.html            dashboard, Weather, Vessels, Jobs, Models, Sites, Wall, Ask AI, History, Alerts, Settings
www/assets/js/edition.js  this app (made by tools/build-edition.js — do not edit by hand)
www/assets/js/core.js     sources, profiles, settings, alert rules
www/assets/js/app.js      the main page (shared with the original app)
www/assets/js/edition-ui.js  answer box (hero), Jobs today, Models page, import of settings
www/assets/js/advisor.js  Go / Caution / No-Go, My jobs, demob formula (demobPlan), weather windows, prompts
www/assets/js/offshore.js model comparison & A4 PDF
www/assets/js/ask.js      Ask AI: 9 purposes, app guide + prompt
www/assets/js/myjobs.js   Settings › My jobs
www/assets/js/marine.js   Weather page (all models as one story, 3-hour table, 7-day charts, tides) and Vessels page
tests/                    pc.js (the real PC app, `npm run test:pc`), unit.js, edition.js (Node), web.spec.js (Playwright, no internet)
tools/                    serve.js (local server), build-precache.js, build-edition.js
```

## Development
```
node tools/serve.js 42050          # http://127.0.0.1:42050/?web
node tests/unit.js && node tests/edition.js
npx playwright install chromium && npx playwright test
```

© 2026 Aziz Mohamad
