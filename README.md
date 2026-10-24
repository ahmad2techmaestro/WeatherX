<div align="center">

<img src="client/public/favicon.svg" alt="WeatherX" width="72" height="72" />

# WeatherX

**Precise weather, air quality and live maps for every town and village in India.**

![Node](https://img.shields.io/badge/Node-22-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209-47A248?logo=mongodb&logoColor=white)
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

## Tech stack

| Layer | Tools |
| --- | --- |
| Client | React 19, Vite, React Router, Recharts, Leaflet, Tailwind CSS v4 |
| Server | Node 22, Express 4, Mongoose 9, JWT (access token and refresh cookie) |
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

## Deployment

```bash
npm run setup && npm run build         # build command
NODE_ENV=production npm start          # start command
```

Express serves both the API and the built client, so a single Node service is enough (Render, Railway, a VPS). Set the environment variables above on the host, with `NODE_ENV=production`. Health check: `/health`. Connect the GitHub repository to the host and every push to `main` redeploys automatically.

## Data sources

Weather and air quality by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, non-commercial use). Place search and base maps by © OpenStreetMap contributors. Weather overlay by OpenWeather.

## Limitations

- Advisories are derived from forecast thresholds, not official warnings. For those, see the [India Meteorological Department](https://mausam.imd.gov.in/).
- Air quality is modelled with CPCB breakpoints, not measured by ground stations.
- Forecasts for small places come from a roughly 10 km grid and describe the area, not the exact spot.

## Security

Secrets live only in `server/.env`, which is git-ignored. Rotate any credential that has ever been shared in an archive, chat or repository.

## Author

Built by **Shah Ahmad Raza** · [GitHub](https://github.com/ahmad2techmaestro) · [LinkedIn](https://www.linkedin.com/in/shah-ahmad-raza-62a72722b)

Released under the [MIT License](LICENSE).