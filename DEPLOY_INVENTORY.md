# ReliabilityNet deployment inventory

Provider-specific findings below have been updated for the FreeNewsApi migration. Unrelated discovery findings remain from the original audit. Secret values are intentionally omitted.

## Checkpoint summary

- Current branch: `deployment` (the requested branch restriction). The deployment plan asks for a new `deploy-cloudflare` branch; that instruction was not followed because the owner explicitly limited work to `deployment`.
- The repository now includes a Cloudflare Worker API, Wrangler configuration, and a D1 migration under `worker/`.
- The production deployment is live:
  - Frontend: Cloudflare Pages (`https://reliabilitynet.pages.dev`)
  - API Gateway: Cloudflare Worker (`https://reliabilitynet-api-production.rethesmutua.workers.dev`)
  - Database: Cloudflare D1 (`reliabilitynet-db`)
  - ML Inference: Hosted on Kaggle GPU (`kaggle-gradio-notebook.ipynb`), downloading models from Hugging Face (`rethes/ReliabilityNet`), and tunneled via static ngrok domain (`https://jockstrap-track-paradox.ngrok-free.dev`)
- Relevant deployment findings:
  - `FREENEWS_API_KEY` is read server-side by the local proxy and Cloudflare Worker; it is sent to FreeNewsApi in the `x-api-key` header and is not included in the browser bundle.
  - The news proxy forwards only supported search parameters, restricts local CORS to the Vite origin, and uses a fixed FreeNewsApi origin.
  - The Express server has a hardcoded fallback JWT signing secret if `JWT_SECRET` is absent; the production Worker requires `JWT_SECRET` as a Cloudflare secret.
  - The Worker relays ML requests (`/api/ml/*`) to `ML_ORIGIN` (`https://jockstrap-track-paradox.ngrok-free.dev`) with an IP rate limit of 30 req/min and CORS enforcement for `https://reliabilitynet.pages.dev`.
  - Existing SQLite data and model artifacts are local and ignored by git. Production user accounts and saved articles reside in Cloudflare D1.
  - `start-all.sh` runs all four local services, but first sends `kill -9` to any process using ports 3131, 4000, 5001, or 5173. This can affect unrelated local processes using those ports.
- The frontend build succeeds. A real 10-article reliability request completed in 11.04 seconds in this environment, well below a 90-second relay timeout; this is a local observation, not a Cloudflare latency guarantee.

## 1. Hardcoded URLs and ports

The source scan excluded `.git`, `node_modules`, `model_env`, `dist`, local environment files, model binaries, and databases. The app uses ports 3131, 4000, 5001, and 5173. No hits were found for 3001, 3002, 8080, or 8787.

| File and lines | URL/port | Purpose |
|---|---|---|
| `src/services/newsApi.js:3` | `http://localhost:3131` | Browser news proxy base and `/ping` health check. |
| `proxy-server.js`; `news-provider.js` | port `3131`; `https://api.freenewsapi.io` | Local proxy listener and FreeNewsApi upstream (`/v1/news`, `/v1/details`). Listener binds to `127.0.0.1`. |
| `src/services/authApi.js:1` | `http://localhost:4000` | Browser auth/saved-articles API base. |
| `server/index.js:9,37,175` | port `4000`; `localhost:5173`, `127.0.0.1:5173`; local URL log | Express listener, its two allowed CORS origins, and startup log. |
| `src/services/clickbaitApi.js:1` | `http://localhost:5001` | Direct browser model-server base. |
| `src/services/reliabilityApi.js:1` | `http://localhost:5001` | Direct browser model-server base. |
| `src/services/sentimentApi.js:1,26` | `http://localhost:5001` | Direct browser model-server base and offline warning. |
| `model_server.py:34,628-629` | `PORT` default `5001`; local startup URL; host `127.0.0.1` | Model-server port, startup log, and loopback binding. |
| `start-all.sh:9-13,18-19,23,25,30,32,41` | ports `3131`, `4000`, `5001`, `5173` | Kills processes on these ports, starts three backends, then starts Vite. |
| `README.md:115-118,150,205,214` | ports `3131`, `4000`, `5001`, `5173` | Local service documentation, frontend URL, proxy check, and curl example. |
| `AUTH_SETUP.md:10-13,35,62,82` | ports `3131`, `4000`, `5001`, `5173` | Local architecture table, startup instructions, and auth endpoint heading. |
| `tests/test_clickbait_server.py:6`; `tests/test_reliability_server.py:6` | `http://localhost:5001` | Test API base URLs. |
| `vite.config.js:4` | `https://vite.dev/config/` | Vite documentation comment. Vite's default development port is 5173; no custom server port is set. |
| `src/index.css:1` | `https://fonts.googleapis.com/...` | External font stylesheet. |
| `src/index.css:42`; `public/favicon.svg:1`; `public/icons.svg:1` | `http://www.w3.org/2000/svg` | SVG namespace identifiers, not service endpoints. |
| `src/App.jsx:117` | `https://nodejs.org` | Node.js help link shown in the local proxy error UI. |

The two dependency lockfiles also contain package registry `resolved` URLs (dependency download metadata, not application endpoints): `package-lock.json` at lines 24, 29, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255, 272, 289, 306, 323, 340, 357, 374, 391, 408, 425, 442, 459, 476, 493, 510, 527, 544, 561, 578, 595, 612, 619, 629, 639, 669, 676, 686, 704, 719, 731, 749, 765, 770, 786, 791, 807, 812, 828, 833, 849, 854, 870, 875, 891, 896, 912, 917, 933, 938, 954, 959, 975, 980, 986, 999, 1010, 1048, 1055, 1063, 1068, 1074, 1078, 1082, 1097, 1106, 1118, 1152, 1158, 1168, 1180, 1185, 1203; and `server/package-lock.json` at lines 20, 33, 39, 44, 48, 52, 59, 73, 84, 93, 104, 128, 133, 137, 141, 152, 158, 167, 180, 191, 196, 202, 214, 223, 232, 238, 250, 255, 264, 274, 279, 288, 297, 307, 316, 330, 339, 345, 354, 363, 372, 381, 393, 399, 408, 417, 458, 463, 469, 487, 496, 505, 511, 515, 520, 539, 544, 557, 563, 570, 575, 582, 587, 599, 614, 619, 631, 636, 640, 644, 651, 657, 663, 672, 694, 700, 711, 721, 727, 733, 739, 745, 751, 757, 763, 772, 781, 785, 790, 799, 811, 820, 832, 839, 844, 848, 853, 859, 865, 871, 880, 892, 901, 912, 921, 928, 933, 945, 954, 963, 969, 996, 1008, 1013, 1023, 1034, 1039, 1048, 1063, 1078, 1092, 1097, 1101, 1105, 1112, 1118, 1130, 1154, 1160, 1175, 1181, 1195, 1200, 1211, 1216, 1229, 1234, 1248, 1253, 1258, 1262, 1266, 1273, 1278, 1282, 1286, 1298, 1307, 1316, 1325, 1337, 1353, 1362, 1374, 1387, 1396, 1402, 1411, 1420.

No client-side router dependency or route usage was found, so the current frontend does not require a Pages SPA `_redirects` file.

## 2. Environment variables

| Variable | Read location | Secret? | Observed use |
|---|---|---|---|
| `FREENEWS_API_KEY` | `proxy-server.js` via `process.env`; `worker/src/index.js` via `c.env`; set in local `.env`, `worker/.dev.vars`, or as a Worker secret | Yes | Sent server-side to FreeNewsApi in the `x-api-key` header. It is not sent to the browser. |
| `VITE_API_BASE` | `src/services/apiConfig.js` via `import.meta.env`; `.env.example` | No | Selects the deployed Worker API origin for the frontend. |
| `VITE_ML_BASE` | `src/services/apiConfig.js` via `import.meta.env`; `.env.example` | No | Optional direct ML server override (takes priority over `VITE_API_BASE` Worker relay). |
| `JWT_SECRET` | `server/index.js:10` via `process.env`; Worker via `c.env.JWT_SECRET` | Yes | Signs and verifies JWTs (fallback in local dev Express, required secret in Cloudflare Worker). |
| `ML_ORIGIN` | `worker/wrangler.jsonc` via `vars.ML_ORIGIN`; `worker/src/ml.js` via `c.env` | No | Origin URL of the ML inference server (set to `https://jockstrap-track-paradox.ngrok-free.dev`). |
| `ML_API_KEY` | `model_server.py`; `worker/src/ml.js` via `c.env.ML_API_KEY` | Yes | API key sent in `X-ML-Key` header between Cloudflare Worker and Flask model server. |
| `SENTIMENT_MODEL_PATH` | `model_server.py:31` via `os.environ.get` | No | Sentiment model directory; default is a local relative path. |
| `CLICKBAIT_MODEL_PATH` | `model_server.py:32` via `os.environ.get` | No | Clickbait model directory; default is a local relative path. |
| `META_MODEL_PATH` | `model_server.py:33` via `os.environ.get` | No | Meta-classifier model directory; default is a local relative path. |
| `PORT` | `model_server.py:34` via `os.environ.get` | No | Flask port; default is 5001. |

The Worker also reads `ALLOWED_ORIGINS`, `JWT_SECRET`, `ML_ORIGIN`, and `ML_API_KEY`, and uses its configured D1 and rate-limit bindings. The local `.env` contains `FREENEWS_API_KEY`; its value is not reproduced here.

## 3. News proxy (`proxy-server.js`)

- Listens on `127.0.0.1:3131`.
- Allows CORS only from `http://localhost:5173`; permits `GET` and `OPTIONS`; answers allowed preflight requests with 204.
- `GET /ping` returns status 200 and `{"ok":true}`.
- News routes call `https://api.freenewsapi.io/v1/news` and `/v1/details`; the API key is sent in the `x-api-key` header and stays server-side.
- The proxy forwards allowlisted title, language, date, and cursor parameters; it adapts FreeNewsApi article details into the article shape used by the frontend.
- Pagination uses the provider cursor through `/api/news/next`; arbitrary upstream URLs are not accepted.
- Upstream calls are paced at 500 ms intervals to respect FreeNewsApi's documented two-requests-per-second limit.
- Upstream status codes are passed through as JSON. Fetch failures return 502 with a generic detail; API keys are redacted from error responses.

## 4. Auth server (`server/index.js`)

### Middleware and token handling

- Express JSON body limit: 2 MB.
- CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`, with credentials enabled.
- Protected routes expect the `Authorization` header with the `Bearer` scheme and JWT. Missing/malformed authorization returns 401 `{"error":"Unauthorized"}`; invalid or expired JWT returns 401 `{"error":"Invalid or expired token"}`.
- JWT payload contains `id` and `email`; jsonwebtoken adds issued-at and expiry claims. Tokens expire after seven days. The default HMAC signing algorithm is used (HS256 for this secret type).
- Passwords use bcrypt with cost 10.
- `JWT_SECRET` currently has a hardcoded fallback if the environment variable is absent.

### Routes

| Method and path | Request and responses |
|---|---|
| `POST /auth/register` | Body `{email,password}`. Missing values: 400 `Email and password are required`; password shorter than six: 400 `Password must be at least 6 characters`; duplicate: 409 `Email already registered`; success 200 `{token,user:{id,email}}`; other registration failures: 500 `Registration failed`. |
| `POST /auth/login` | Body `{email,password}`. Missing values: 400 `Email and password are required`; bad email/password: 401 `Invalid email or password`; success 200 `{token,user:{id,email}}`. |
| `GET /auth/me` | Protected. Success 200 `{user:<JWT payload>}`. |
| `PUT /auth/profile` | Protected; body `{email}`. Missing/blank: 400 `Email is required`; invalid email: 400 `Please enter a valid email address`; missing user: 404 `User not found`; duplicate: 409 `Email already in use`; success 200 `{token,user:{id,email}}`; other update errors: 500 `Failed to update email`. |
| `PUT /auth/password` | Protected; body `{currentPassword,newPassword}`. Missing: 400 `Current and new password are required`; new password shorter than six: 400 `New password must be at least 6 characters`; missing user: 404 `User not found`; wrong current password: 401 `Current password is incorrect`; success 200 `{updated:true}`; other errors: 500 `Failed to update password`. |
| `GET /saves` | Protected. Success 200 `{articles:[...]}`, with stored JSON parsed into objects. |
| `POST /saves` | Protected; body `{article}`. Missing article: 400 `Article is required`; no `uuid` or `url`: 400 `Article must have uuid or url`; success 200 `{saved:true,articleId}`; other write errors: 500 `Failed to save article`. Duplicate `(user_id,article_id)` is ignored. |
| `DELETE /saves/:articleId` | Protected. Deletes only for the authenticated user and returns 200 `{saved:false,articleId}`. |

### SQLite schema

`server/data.db` is opened with `better-sqlite3`; startup sets `journal_mode = WAL`.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE saved_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL,
  article_json TEXT NOT NULL,
  saved_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, article_id)
);
```

There are no explicit `CREATE INDEX` statements. Primary keys and the unique constraints provide implicit indexes. No triggers or explicit foreign-key pragma were found.

## 5. Frontend contract for auth and saved articles

`src/services/authApi.js` uses `http://localhost:4000` and JSON requests. It stores the JWT in `localStorage` under `cn_token`; authenticated requests send it in the `Authorization` header using the `Bearer` scheme. The API helper parses JSON and throws an `Error` from `data.error` for non-2xx responses.

| Frontend operation | Request | Result consumed by frontend |
|---|---|---|
| Register/login | `POST /auth/register` or `/auth/login`, body `{email,password}` | Stores `token`; returns `user` with `id` and `email`. |
| Session bootstrap | `GET /auth/me` | Returns `user`; absent token returns null locally; a failed check removes the local token and returns null. |
| Update email | `PUT /auth/profile`, body `{email}` | Stores replacement `token`; returns updated `user`. |
| Update password | `PUT /auth/password`, body `{currentPassword,newPassword}` | UI expects successful resolution; displays thrown `error` text on failure. |
| Load saved articles | `GET /saves` | Returns `articles` array; context maps by `uuid` or `url`. |
| Save article | `POST /saves`, body `{article}` | Uses response only for success/failure; the UI optimistically updates and rolls back on failure. |
| Unsave article | `DELETE /saves/${encodeURIComponent(articleId)}` | Uses response only for success/failure; the UI optimistically updates and rolls back on failure. |
| Logout | Local-only | Removes `cn_token`; there is no server logout route. |

The application context loads saved articles after login and clears its saved-article state on logout. The auth and save routes above match the frontend calls. `AUTH_SETUP.md` documents only a subset of the implemented auth routes; profile updates are present in code but absent from its endpoint table.

## 6. Model server (`model_server.py`)

- Flask listens on `127.0.0.1`, port 5001 by default; `PORT` can override the port.
- `CORS(app)` enables unrestricted CORS. There is no API-key check or request authentication.
- Model path variables are exactly `SENTIMENT_MODEL_PATH`, `CLICKBAIT_MODEL_PATH`, and `META_MODEL_PATH`.
- All models are loaded at module startup, not on first request. Sentiment loading failure exits the process; clickbait and meta-model loading failures are caught and those capabilities become unavailable.
- Flask debug is explicitly disabled.
- `GET /` returns service information and endpoint descriptions.
- `GET /health` returns `status`, service and endpoint information, model paths, loaded flags, and label maps.
- `GET /predict/sentiment` returns usage instructions and an example payload.
- `POST /predict/sentiment` accepts either `{texts:[...]}` or `{articles:[{title,body?,uuid?,url?}]}`; article requests use the title plus up to 500 body characters. Missing input returns 400. Success returns `{success:true,predictions:[{title,sentiment,confidence,probabilities,index,article_id?}]}`. Inference failures return 500 `{error}`.
- `POST /predict/reliability` accepts the same `texts` or `articles` forms. For article requests, sentiment uses the title plus up to 500 body characters, while clickbait and meta-classifier inputs remain title-based. Missing input returns 400. Success returns `{success:true,predictions:[{uuid,title,text,sentiment,clickbait,reliability,article_id?}]}`; the nested objects carry labels, confidence/probabilities, and reliability availability/score. Inference failures return 500 `{error}`.
- `POST /predict/clickbait` accepts `{titles:[...]}` or `{articles:[{title}]}`. Missing input returns 400; unavailable clickbait model returns 503; success returns `{success:true,predictions:[{clickbait,confidence,probabilities,title}]}`; inference failures return 500 `{error}`.
- The feed currently calls `/health` and `/predict/reliability` directly from the browser, including for logged-out visitors. `predictClickbait` and `batchPredictSentiment` have service implementations but no call sites were found in `src`.
- Model loading emitted scikit-learn `InconsistentVersionWarning` messages: saved estimators report version 1.6.1 while the installed environment reports 1.9.1. Predictions succeeded, but this compatibility warning should be resolved or accepted by the owner before relying on model output.

## 7. Local model latency

Measured after starting the local Flask server. Response bodies were suppressed; all requests returned HTTP 200.

| Request | Wall time |
|---|---:|
| `POST /predict/sentiment`, one text | 2.58 s |
| `POST /predict/clickbait`, one title | 8.66 s |
| `POST /predict/reliability`, one article | 8.86 s |
| `POST /predict/reliability`, ten articles (frontend-sized batch) | 11.04 s |

The slowest measured case was 11.04 seconds. This is one local run and does not guarantee Cloudflare-to-tunnel latency. The locally started model server was stopped after measurement.

## 8. Frontend build

- Command: `npm run build`
- Result: success with Vite 8.3.0; 49 modules transformed.
- Output: `dist/` (`dist/index.html`, `dist/assets/index-*.css`, and `dist/assets/index-*.js`).
- `FREENEWS_API_KEY` is only read by the local proxy and Worker, so it is not embedded in the frontend build.

## 9. Git hygiene

- Current branch was `deployment`; worktree was clean before this report.
- `git ls-files` found no tracked `.env`, `data.db*`, `model_env`, `node_modules`, `dist`, `__pycache__`, or model weight artifacts.
- `.env` exists locally and is ignored; `.env.example` is tracked and currently contains a placeholder variable assignment. A history query across refs found no `.env` or database path commits.
- `server/data.db`, its WAL/SHM sidecars, root and server `node_modules`, `dist`, `model_env`, `__pycache__`, and the local model folders are currently ignored/untracked.
- Model directories currently present: `meta_logistic_regression_model/`, `roberta_sentiment_model/`, and `roberta_large_clickbait_model/`.
- The current `.gitignore` excludes environment files (allowing `.env.example`), `node_modules/`, `dist/`, Python caches/environments, the present model directories, and SQLite `.db`/WAL/SHM files. It does not contain a general `*.joblib`, `.dev.vars`, or `.wrangler/` rule. It has a `package-lock.json` ignore pattern even though the root `package-lock.json` is tracked; `server/package-lock.json` is not tracked.

## Owner checkpoint / decisions required before later phases

1. Confirm this inventory and approve whether to continue with Phase 1 while staying on the `deployment` branch.
2. Confirm domain availability for a named Cloudflare Tunnel or accept a quick tunnel with a changing URL.
3. Choose fresh D1 data or migration of existing local users/saves. The current plan's default is a fresh database.
4. Choose the ML access policy. Current feed predictions are available to logged-out visitors; requiring login would change that behavior. If anonymous access is retained, the plan calls for IP-based rate limiting.
5. Confirm the Cloudflare Workers plan (free, paid, or undecided).
6. Confirm that the discovered model-server port (5001) and startup command (`./model_env/bin/python model_server.py`) are the intended tunnel target.
