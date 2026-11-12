# WeatherX ML service (optional)

A small FastAPI service used by two WeatherX features. The Node app works without it; the features simply show
"ML service isn't running".

## Run
```bash
pip install -r ml-service/requirements.txt
npm run ml                      # http://127.0.0.1:8001
# server/.env
ML_SERVICE_URL=http://127.0.0.1:8001
```
Tests: `cd ml-service && python3 -m pytest -q` (19 tests).

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, version, features |
| POST | `/v1/anomaly` | JSON `{history:[{date,tmax,tmin}], days:[...]}` -> per-day multivariate anomaly (MinCovDet Mahalanobis, chi-square 2 dof p-value, IsolationForest cross-check; needs >= 60 comparable days within +-7 days of the season) |
| POST | `/v1/sky` | raw image bytes (JPEG/PNG/WebP, <= 5 MB) -> sky label, cloud-cover estimate, colour/texture features |

## Honest limits
* The sky classifier is a **classical computer-vision heuristic** (colour and texture statistics on the upper 60 % of the photo). It is not a trained neural network and was validated only on synthetic images, so treat results as a rough estimate, not an observation.
* The anomaly score compares the forecast with this place's own history; it is not a forecast and not an official warning.
* Photos are analysed in memory and never stored.
