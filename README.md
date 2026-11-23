# Sentinel OceanWATCH — Offshore Weather Guideline & Monitoring

Web app (iPad / phone / browser) for **offshore work**: wind, gusts, waves (Hs, Hmax), swell & period, visibility, thunderstorms; 6 wind + 4 wave models side by side with ensembles; **Go / Caution / No-Go for every job** in 3-hour blocks (10 standard jobs + **My jobs**); weather windows; **Continue or demob?** (latest time to start demob, middle of the models with the worst / best model in brackets); MET Malaysia **sea** warnings; A4 PDF (AMT style); **Ask AI** (the app's own guide + a prompt for ChatGPT / Claude / Gemini / Copilot). First location: **Irong Barat**; more can be added in Settings.

Split from *Dashboard Cuaca Aziz* 4.6.0 (offshore part). Land app: **Monsoon EYE** (repo `monsoon-eye`). The original `dashboard-cuaca` is unchanged.

- Address: **https://azizdigital.github.io/oceanwatch/**
- iPad: open it in Safari → Share → **Add to Home Screen**.
- Changes: `PERUBAHAN_1.0.0.txt`. User guide (BM): `PANDUAN.md`.

## Data (free, no API keys)
Open-Meteo (ECMWF, GFS, ICON, JMA, Météo-France, UKMO; ECMWF WAM, GFS Wave, MF Wave, DWD GWAM; ECMWF & GFS ensembles) · MET Malaysia through api.data.gov.my.

## One-time setup (owner)
1. **GitHub Pages:** repo › Settings › Pages › Source: **GitHub Actions**. Every push to `main` publishes `www/`.
2. **Cloudflare relay** (new, OceanWATCH only — for sites that refuse to be shown inside the app, e.g. Windy, MarineTraffic, VesselFinder, and to remove ads): dash.cloudflare.com › Workers & Pages › Create › Hello World › name `oceanwatch-relay` › Deploy. In the app: Settings › Site relay › **Copy relay script** → Cloudflare *Edit code* → paste → Deploy. Fill in the worker address + key in the app → **Test relay**. (No GitHub token needed: OceanWATCH has no JPS mirror.)

## Layout
```
www/index.html            dashboard, Jobs, Models, Sites, Wall, Ask AI, History, Alerts, Settings
www/assets/js/edition.js  this app (made by tools/build-edition.js — do not edit by hand)
www/assets/js/core.js     sources, profiles, settings, alert rules
www/assets/js/app.js      the main page (shared with the original app)
www/assets/js/edition-ui.js  answer box (hero), Jobs today, Models page, import of settings
www/assets/js/advisor.js  Go / Caution / No-Go, My jobs, demob formula (demobPlan), weather windows, prompts
www/assets/js/offshore.js model comparison & A4 PDF
www/assets/js/ask.js      Ask AI: 9 purposes, app guide + prompt
www/assets/js/myjobs.js   Settings › My jobs
tests/                    unit.js, edition.js (Node), web.spec.js (Playwright, no internet)
tools/                    serve.js (local server), build-precache.js, build-edition.js
```

## Development
```
node tools/serve.js 42050          # http://127.0.0.1:42050/?web
node tests/unit.js && node tests/edition.js
npx playwright install chromium && npx playwright test
```

© 2026 Aziz Mohamad
