<div align="center">

<img src="client/public/favicon.svg" alt="WeatherX" width="72" height="72" />

# WeatherX

**AI-powered weather intelligence, air quality and live maps for every town and village in India.**

![Node](https://img.shields.io/badge/Node-22-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209-47A248?logo=mongodb&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-AI-4285F4?logo=googlegemini&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-ML%20service-009688?logo=fastapi&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-agents-1c3c3c)
![License](https://img.shields.io/badge/license-MIT-0a1520)

</div>

---

## Overview

WeatherX is a full-stack (MERN) weather platform for India. It answers the questions people actually ask: do I need an umbrella, when is the air safe for a run, how does the week look. It works for any place, from a metro to a village, and can follow your live location.

All figures come from real forecast and air-quality models. Estimates such as air quality, advisories and comfort scores are labelled as guidance.

## Features

- **Today:** live conditions, hourly forecast, rain outlook, visibility with fog windows, UV protection window, air quality, sun and moon.
- **Outlook:** 72-hour charts, 7 or 14-day temperature range, day-by-day cards.
- **Insights:** outdoor score, best hours and activities, lifestyle tips, heat stress, rain totals.
- **Atlas:** live map with temperature, rain, wind, cloud and pressure layers, plus a city board and air-quality ranking.
- **Benchmark:** compare up to four places side by side.
- **Locations:** saved places with live conditions.
- **Alerts:** in-app, push, email, SMS and WhatsApp notifications.
- **Accounts:** sign-in with secure sessions; every data route requires it.
- **AI Dashboard:** one hub for everything AI: what is switched on, your automations and memory, and recent activity.
- **AI Assistant:** ask in English or Hindi, by typing or voice. Answers are grounded in the real forecast, cite their sources and fall back to built-in rules without an API key.
- **AI Agent Center:** a LangGraph supervisor routes your goal to specialist agents (weather, intelligence, air, travel, research) and shows its working.
- **Weather Intelligence:** heatwave risk, anomalies and sudden changes against ten years of climate normals, with an optional ML cross-check.
- **Air Quality Intelligence:** hour-by-hour NAQI, the cleanest window and sensitive-group advice.
- **AI Travel Planner:** compare destinations and nights by weather, scored with reasons.
- **Smart Alerts:** background automations (heatwave, rain, air, temperature, sudden change, anomaly, daily briefing), at most one notification per day each.
- **Weather Research (RAG):** cited answers from a curated safety guide library, plus notes the assistant remembers.
- **Sky Check:** photograph the sky and compare it with the forecast cloud cover (needs the optional ML service).
- **AI Analytics:** speed, errors, tokens and safety-guard activity for your own usage. No question or answer text is stored.
- **Liquid Glass interface:** translucent, blurred surfaces over an ambient colour field in light and dark, with solid fallbacks for reduced transparency and forced colours.

## Tech stack

| Layer | Tools |
| --- | --- |
| Client | React 19, Vite, React Router, Recharts, Leaflet, Tailwind CSS v4, Liquid Glass CSS, Web Speech API |
| Server | Node 22, Express 4, Mongoose 9, JWT (access token and refresh cookie), node-cron |
| AI | Google Gemini (REST, tool calling, embeddings), LangGraph agents, RAG with vector search, Model Context Protocol server |
| ML service | Python, FastAPI, scikit-learn (MinCovDet, IsolationForest), Pillow, NumPy |
| Quality | node:test (150+ tests), pytest, offline evaluation suite, prompt-injection and leak guards |
| Deploy | Docker, docker-compose, single Node service (API plus built client) |
| Data | Open-Meteo, OpenStreetMap (Photon, Nominatim), OpenWeather map tiles |

## Getting started

Requires Node 22+ and a MongoDB database (local or Atlas).

```bash
npm run setup                          # installs server and client dependencies
cp server/.env.example server/.env     # then fill in the values
npm run dev                            # starts the API and the client together
```

Run the tests with `npm test`.

## Configuration

Settings live in `server/.env` (template: `server/.env.example`).

| Variable | Purpose |
| --- | --- |
| `DB` | MongoDB connection string (required). |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Long random strings used to sign sessions (required). |
| `CLIENT_URL` | Allowed browser origin(s), comma separated (required). |
| `OPENWEATHER_API_KEY` | Enables the coloured map overlay. |
| `ANTHROPIC_API_KEY` | Optional. AI weather briefing and answers. |
| `VAPID_*` | Optional. Web push (`npm run vapid` generates keys). |
| `EMAIL_SMTP_*`, `TWILIO_*` | Optional. Email, SMS and WhatsApp alerts. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional. Gemini powers the AI Assistant, Agent Center, Research answers and photo description; built-in rules answer without it. |
| `ML_SERVICE_URL` | Optional. Python ML service (see `ml-service/README.md`). |

### Setting up the weather overlay

1. Add `OPENWEATHER_API_KEY=your_32_character_key` to `server/.env` (no quotes or spaces) and restart.
2. Open `/api/weather/map/status`. It makes one real request and reports `ok`, `missing`, `rejected`, `rate_limited` or `unreachable`, with a fix for each.
3. New OpenWeather keys can take up to a couple of hours to activate. The free plan allows 60 calls per minute; tiles are cached for ten minutes to stay within it.

## API reference

Every endpoint except `/api/auth/*` and `GET /api/push/key` requires a signed-in user (`Authorization: Bearer <access token>`). Map tiles load in `<img>` requests, so `GET /api/weather/map/status` also returns a short-lived tile token that is passed as `?t=`.

| Endpoint | Description |
| --- | --- |
| `GET /api/weather/overview?lat&lon` | Current, hourly, daily, astronomy, air quality, insights, advisories and intelligence. |
| `GET /api/weather/multi?points=lat,lon\|lat,lon` | Compact data for up to five places. |
| `GET /api/weather/grid?south&west&north&east` | Live values on a 7 by 5 grid, used by the map. |
| `GET /api/weather/map/status` | Diagnoses the OpenWeather key. |
| `GET /api/weather/map/:layer/:z/:x/:y?t=` | Cached OpenWeather tile proxy (tile token required). |
| `GET /api/geo/search?q&scope=india\|world` | Place suggestions. |
| `GET /api/geo/reverse?lat&lon` | Name for a coordinate. |
| `GET /api/ai/briefing?lat&lon&name&unit` | Plain-language briefing and the engine that wrote it. |
| `POST /api/ai/ask` | Answer a question about a place's forecast. |
| `POST /api/assistant/chat`, `GET /api/assistant/status` | Weather Assistant chat (Gemini with rule-engine fallback). |
| `GET /api/prediction/analysis?lat&lon&name&unit&language` | Trend, anomaly, rain, sudden-change and heatwave analysis with a plain-language explanation. |
| `POST /api/research/ask`, `GET /api/research/status` | Answers from the safety knowledge base, with numbered sources. |
| `GET/POST /api/memory`, `DELETE /api/memory/:id` | What WeatherX remembers about the user (list, add, delete). |
| `GET /api/agents`, `POST /api/agents/run`, `GET /api/agents/runs` | Multi-agent runs (LangGraph): registry and stats, run a goal, recent traces. |
| `GET /api/air/analysis?lat&lon&name` | Air quality intelligence: NAQI now, 48 h series, cleanest window, advice. |
| `POST /api/travel/plan` | Day-by-day travel weather scores for up to 3 destinations. |
| `GET/POST /api/automation/workflows`, `PATCH/DELETE .../:id`, `POST .../:id/test`, `GET /api/automation/templates` | Smart Alerts automations (create, pause, dry-run, delete). |
| `GET /api/push/key`, `POST/DELETE /api/push/subscribe` | Web Push registration. |
| `/api/auth`, `/api/locations`, `/api/preferences`, `/api/alerts`, `/api/notifications`, `/api/analytics` | Accounts and personalisation. |

Values on the wire are metric; the client converts to the user's units. Interactive docs are served at `/api-docs`.

## Project structure

```
server/
  api/           Express routers
  providers/     Open-Meteo and geocoding clients
  services/      overviewModel, intelligenceModel, notificationModel, aiService, forecastService
  jobs/          weather-watch, daily-digest, notification processing
  scheduler/     Cron registration
  models/        Mongoose models
  config/        Environment loading and key diagnostics
  tests/         node:test suites and a local mock of the upstream APIs
client/src/
  pages/         Home, Forecast (Outlook), Planner (Insights), Map (Atlas), Compare (Benchmark), Places (Locations), Alerts, Analytics, Settings
  components/    layout, weather, map, charts, ui
  context/       Settings, Places, Auth
  styles/        Design tokens, base, premium typography, map, Tailwind v4 layer
```

## Design system

- **Type:** Bricolage Grotesque for place names, titles and large numerals; Hanken Grotesk for everything functional. Sizes follow a 1.2 scale; numerals are tabular.
- **Colour:** deep ink and mist neutrals with a single brass accent, defined as CSS custom properties for light and dark. Tailwind v4 utilities read the same tokens, so both stay in step.
- **Motion:** used where it carries meaning (weather scenes, wind flow, hero depth) and switched off for reduced-motion users.

## Testing

```bash
npm test
```

145 unit, API and evaluation tests (plus 19 Python tests in `ml-service/`, run with `python3 -m pytest`) run against a local mock of Open-Meteo, Photon and Nominatim, so they need neither network access nor real credentials. `npm run eval` runs the offline AI evaluation. `npm run mock` starts that mock on port 4010 for offline development.

## Deployment

```bash
npm run setup && npm run build         # build command
NODE_ENV=production npm start          # start command
```

Express serves both the API and the built client, so a single Node service is enough (Render, Railway, a VPS). Set the environment variables above on the host, with `NODE_ENV=production`. Health check: `/health`. Connect the GitHub repository to the host and every push to `main` redeploys automatically.

### Troubleshooting

- **"Route not found: GET /api/ai-ops/overview" (or `/api/agents`, `/api/air`, ...)**: the page is new but the API is old. Open `<your-api>/health`; a current build lists `features` (and `build`, the commit, on Render). If it does not, redeploy the backend: check that the latest deploy succeeded and, if needed, use "Clear build cache & deploy". When the frontend is on Netlify, `client/public/_redirects` forwards `/api/*` to the API host, so both must run the same commit.
- **Gemini shows "Fallback" on `/ai`**: set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in the environment of the process that serves the API, then restart it.

## Data sources

Weather and air quality by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, non-commercial use). Place search and base maps by © OpenStreetMap contributors. Weather overlay by OpenWeather.

## How the assistant stays accurate

- Gemini never sees raw guesses: it can only call one tool, `get_weather`, which returns the real forecast, air quality and a yesterday comparison for a place. Differences and "tomorrow" hours are computed in code, not by the model.
- It must call the tool before answering; an answer given without data is rejected and retried. If Gemini fails, times out or hits a quota, the rule engine answers instead.
- History sent to the model is limited to the last 8 messages, 500 characters each. The conversation is stored only in your browser.
- Yesterday's figures are model reanalysis, not station readings. Hindi answers from the rule engine are shorter than Gemini's.

## How the prediction and anomaly analysis works

The **Prediction & anomalies** panel (Insights page) is computed with statistics, not by Gemini.

- **Forecast** comes from Open-Meteo (NWP models). **"Usual" weather** is the mean and 10th/90th percentile of the same time of year (±7 days) over the previous ~10 years of ERA5 reanalysis (`OPEN_METEO_ARCHIVE_URL`, cached 24 h). **Recent history** is the last 30 days.
- **Unusual temperature / anomaly**: z-score against that normal; |z| ≥ 1.5 is unusual, ≥ 2 extreme, with a minimum 2°C departure so calm climates are not over-flagged.
- **Trend**: last 7 days vs the week before, and the forecast week vs the recent week (threshold 1.5°C).
- **Rain probability**: chance of any rain in the week is 1 - product(1 - p) over days (an approximation that assumes independent days), plus wetter/drier than the climatological rain frequency and weekly total.
- **Sudden changes (next 48 h)**: temperature swings measured against the typical swing for that hour (so the normal day/night cycle is not flagged), pressure falls, gust jumps, rain onset and thunderstorm codes.
- **Heatwave risk**: IMD-style rule. Plains: Tmax >= 40°C and >= 4.5°C above normal, or >= 45°C; hills (>= 1000 m): >= 30°C and >= 4.5°C above normal. Levels: watch, heatwave (2+ days), severe.
- **Gemini only explains**. Its text is rejected if it contains a number that is not in the findings, and the rule-based explanation (English/Hindi) is used instead. Without `GEMINI_API_KEY` the rule-based text is always used.

These are statistical estimates, not official warnings. "Normal" is a 10-year mean, not a 30-year WMO normal, and ERA5 trails real time by a few days.

## Research (RAG) and memory

- **Knowledge base**: 16 short guides (heat stroke, heatwave rules, lightning, floods, AQI categories, masks, UV, cold, fog, storms, reading forecasts). They are summaries of public guidance, labelled with their source, and are not official advisories or medical advice.
- **Retrieval**: each question and guide becomes a vector (Gemini `gemini-embedding-001` when a key is set, otherwise offline keyword vectors) and the closest guides are found by cosine similarity. Vectors from different embedders are never compared. Offline retrieval needs a shared word, so it is weaker than Gemini's semantic search.
- **Answers**: Gemini may only phrase an answer from the retrieved passages and must cite them as [1], [2]. An answer with missing or out-of-range citations is rejected and the passage itself is shown. If nothing relevant is found the app says so instead of guessing.
- **Memory**: facts the user states plainly ("I have asthma", "I commute by bike", "remember that ...") are saved per user (max 40), shown on the Research page and deletable. They reach the model as labelled data, never as instructions. Health notes are always offered to safety answers.
- Vectors are stored in MongoDB and compared in Node, which is fine at this scale. Switch to Atlas Vector Search if the knowledge base grows to thousands of documents.

## Agents, air quality and travel (AI section)

- **Agent Center** (`/ai/agents`): a LangGraph `StateGraph` runs `supervisor -> specialist agents in parallel -> synthesizer`. Agents: Weather, Intelligence (prediction analysis), Air Quality, Travel and Research (RAG). Every agent calls real data tools; each step's status, time and result is shown as a trace. One agent failing does not stop the others and is reported in the answer.
- **Supervisor**: Gemini picks the agents when a key is set; its JSON is validated against the agent whitelist (max 4 agents, max 3 places, max 7 nights) and anything unusable falls back to the keyword router.
- **Synthesizer**: with one agent the agent's own summary is returned. With several, Gemini may merge them but is rejected if it introduces a number not in the findings; then the summaries are returned as they are.
- **Air Quality Intelligence** (`/ai/air`): Indian NAQI from modelled pollutants, trend over 24 h, cleanest and worst hours, longest clean window, dominant pollutant. Health notes saved in memory switch the limit to the stricter sensitive-group threshold (NAQI 100 instead of 200).
- **Travel Planner** (`/ai/travel`): each day scores 0-100 from fixed rules (rain, thunderstorms, heat, cold, gusts, UV, and NAQI for the first ~3 days) with the reasons listed, plus best day and packing list. Compare up to 3 destinations.
- Agent run history is in memory and clears on server restart. Hindi replies come from Gemini; without a key, Air, Travel and Research summaries are in English.

## Smart Alerts, background jobs and the MCP server

- **Automations** (`/ai/alerts`): up to 8 per user. Types: heatwave risk, rain ahead, poor air quality, hot days, sudden weather change, unusually hot or cold, and a daily morning briefing written by the agent team. The `automation-workflows` job (`WORKFLOW_CRON`, default every 30 minutes) evaluates each enabled automation against real forecast data and notifies through the channels the user enabled in Settings (in-app, email, push, ...). Each automation sends at most one notification per local day (de-duplicated). Health notes in memory lower the air-quality limit to NAQI 100.
- **Test now** does a dry run on live data: it shows what would be sent, sends nothing and saves nothing. A triggered automation with no enabled channel says so instead of failing silently.
- Triggers are deterministic code (thresholds, IMD-style heatwave levels, statistical anomalies); the only model use is the optional briefing text, produced by the Phase 3 agent team.
- **MCP server** (`npm run mcp`): five read-only tools (`get_weather`, `get_air_quality`, `get_weather_analysis`, `plan_trip`, `search_safety_guidance`) over stdio for Claude Desktop or any MCP client. No database, no user data and no API key are needed. Example Claude Desktop config:

```json
{ "mcpServers": { "weatherx": { "command": "node", "args": ["/absolute/path/to/weatherx/server/mcp/server.js"] } } }
```

## ML service, Sky Check and voice (Phase 5)

* **Python ML service** (`ml-service/`, FastAPI): multivariate temperature anomaly check (shown as an "ML cross-check" line in the Planner prediction panel) and a classical-CV **Sky Check** (`/ai/sky`) that compares a photo of the sky with the forecast cloud cover. Optional: set `ML_SERVICE_URL=http://127.0.0.1:8001` in `server/.env`, run `pip install -r ml-service/requirements.txt` and `npm run ml`. See `ml-service/README.md`.
* **Gemini photo description** is opt-in per upload (checkbox) because it sends the photo to Google.
* **Voice assistant**: a mic button and "read answers aloud" toggle in the Weather Assistant, using the browser's Web Speech API (en-IN / hi-IN). Shown only where the browser supports it (Chrome/Edge/Safari); the browser vendor's speech service processes the audio, WeatherX stores none. No new API key needed.

## AI Dashboard, Analytics, evaluation and security (Phase 6)

* **AI Dashboard** (`/ai`): what is switched on (Gemini, search embeddings, ML service), your automation and memory counts, shortcuts to every AI section and recent AI activity.
* **AI Analytics** (`/ai/analytics`): requests per day, typical and slowest response times, error rate, Gemini share, token counts and what the safety guards caught. Backed by `GET /api/ai-ops/overview?days=7`.
* **Monitoring**: every AI route writes one event (feature, latency, status, Gemini calls and tokens, guard flags). Events hold **no question or answer text**, are scoped to the signed-in user, and are stored in MongoDB for 30 days (in memory before the database connects, or if it fails). Token counts come from Gemini's usage report; cost is not computed because prices change. Agent run traces are still in memory only.
* **AI security** (`server/services/security/guard.js`): instruction-like inputs are flagged; saved notes that read like instructions are never sent to the model; any model reply that echoes our prompts or contains a key/URI/JWT shape is discarded and the built-in rules answer instead; links are stripped from assistant replies. These are heuristics on top of the structural defences (read-only tools, numbers checked against the forecast, per-route rate limits, auth on everything). `Permissions-Policy` now allows the microphone for the voice assistant.
* **Evaluation**: `npm run eval` scores the deterministic parts offline (supervisor routing, RAG retrieval with local embeddings, injection detection, number-grounding, leak guard) and exits non-zero below the thresholds in `server/eval/run.js`. Add cases in `server/eval/cases.js`. It cannot judge Gemini's own wording. Known misses are printed, not hidden (for example "best time of day to go for a run" does not find the run-timing guide with local embeddings).
* **Docker**: `docker compose up --build` starts the app (client + API), MongoDB and the ML service; secrets come from `server/.env`. See `Dockerfile`, `ml-service/Dockerfile`, `docker-compose.yml`. These files were written but not built in the authoring sandbox (no Docker daemon).
* **Dependencies**: `npm audit --omit=dev` is clean on the client; the server has 3 moderate findings, all through `swagger-jsdoc` (API docs generator), whose fix is a breaking change.

## Limitations

- Advisories are derived from forecast thresholds, not official warnings. For those, see the [India Meteorological Department](https://mausam.imd.gov.in/).
- Air quality is modelled with CPCB breakpoints, not measured by ground stations.
- Forecasts for small places come from a roughly 10 km grid and describe the area, not the exact spot.

## Security

Secrets live only in `server/.env`, which is git-ignored. Rotate any credential that has ever been shared in an archive, chat or repository.

## Author

Built by **Shah Ahmad Raza** · [GitHub](https://github.com/ahmad2techmaestro) · [LinkedIn](https://www.linkedin.com/in/shah-ahmad-raza-62a72722b)

Released under the [MIT License](LICENSE).
### Troubleshooting: "Weather isn't available" on a hosted backend

Open-Meteo's free tier rate-limits (HTTP 429) the shared IPs of hosts like Render. WeatherX handles this in three layers:
the browser fetches the data from the visitor's own IP and relays it to the server (cached per user for 30 min), a circuit
breaker (`UPSTREAM_COOLDOWN_MS`, default 30 s) makes failures fast instead of slow, and setting `OPEN_METEO_API_KEY`
(a paid Open-Meteo plan) removes the limit entirely. AI pages (Agent Center, Travel, Air Quality, Smart Alerts) use the same relay.
