# ReliabilityNet

ReliabilityNet is a full-stack news intelligence app that combines live article discovery with AI-powered reliability scoring. It pulls headlines from FreeNewsApi, runs sentiment and misinformation checks through local transformer models, and presents the results in a React UI for browsing, filtering, saving, and reviewing articles.

## Overview

The project is split into three runtime services:

- Frontend: React + Vite app in the root project and `src/` directory
- Auth backend: Express app in `server/` for login, profile management, and saved articles
- ML backend: Flask service in `model_server.py` for sentiment, clickbait, and reliability predictions
- News proxy: lightweight Node service that forwards FreeNewsApi requests

## Tech stack

- Frontend: React, Vite
- Backend: Node.js, Express
- ML inference: Python, Flask, Hugging Face Transformers
- Database: SQLite for saved articles and user auth data
- Models: local RoBERTa checkpoints and a meta-classifier stored in the repo

## Repository structure

```bash
ReliabilityNet/
├── README.md                      # Project overview and setup instructions
├── LICENSE.md                     # MIT License
├── AUTH_SETUP.md                  # Auth backend setup details
├── .gitignore                     # Files ignored by Git
├── .env.example                   # Template for local environment variables
├── package.json                   # Frontend app scripts and dependencies
├── vite.config.js                 # Vite frontend config
├── index.html                     # Main HTML shell for the React app
├── proxy-server.js                # Local FreeNewsApi proxy for fetching news
├── model_server.py                # Flask ML API for sentiment, clickbait, and reliability
├── requirements.txt               # Python dependencies for the model server
├── start-all.sh                   # Starts proxy, backend, ML API, and frontend together
├── server/
│   ├── index.js                   # Express auth API and saved-article storage
│   ├── package.json               # Backend scripts and dependencies
│   └── data.db                    # SQLite database for users and saved articles
├── src/
│   ├── App.jsx                    # Main React app layout and page logic
│   ├── main.jsx                   # React app entry point
│   ├── App.module.css             # App-level styling
│   ├── index.css                  # Global styles and design tokens
│   ├── components/                # Reusable UI elements (cards, modals, badges, etc.)
│   ├── context/                   # Shared app state and auth context
│   ├── hooks/                     # Data-fetching and filtering logic
│   ├── services/                  # API calls for news and auth
│   └── utils/                     # Helper functions and formatting utilities
├── meta_logistic_regression_model/ # Meta model used for combined reliability scoring
├── roberta_sentiment_model/       # Local sentiment model checkpoint
├── roberta_large_clickbait_model/ # Local clickbait detection model checkpoint
├── model_env/                     # Python virtual environment for model inference
├── tests/                         # Smoke test for flask endpoint
└── node_modules/                  # Installed frontend dependencies
```

## Prerequisites

- Node.js 18+
- Python 3.10+
- A FreeNewsApi API key
- Local model artifacts in the repo root

## Setup

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Install backend dependencies

```bash
cd server
npm install
cd ..
```

### 3. Install Python dependencies

```bash
python -m venv model_env
source model_env/bin/activate
pip install -r requirements.txt
```

### 4. Configure environment variables

Copy the example file to create a local `.env` file:

```bash
cp .env.example .env
```

Notes:
- Set `FREENEWS_API_KEY` in `.env` for the local news proxy. It is read only by the proxy process and is never sent to the browser.

- Leave `VITE_API_BASE` empty for local development. For a deployed frontend, set it to the Worker origin (for example, `https://api.example.com`) and rebuild.
- The auth server reads `JWT_SECRET` from its process environment; it does not load the root `.env` file. To override the local development default, export `JWT_SECRET` in the terminal before starting the services.

## Run the app

### Option A: use the bundled startup script

```bash
./start-all.sh
```

This script launches:

- proxy server on http://localhost:3131
- auth backend on http://localhost:4000
- Python model service on http://localhost:5001
- Vite frontend on http://localhost:5173

### Option B: run each service manually

Open multiple terminals.

Terminal 1 - proxy:

```bash
set -a
. ./.env
set +a
node proxy-server.js
```

Terminal 2 - auth backend:

```bash
cd server
npm start
```

Terminal 3 - ML model server:

```bash
source model_env/bin/activate
python model_server.py
```

Terminal 4 - frontend:

```bash
npm run dev
```

Then open http://localhost:5173

## Model server

The Python service in `model_server.py` loads the project’s local Hugging Face checkpoints for:

- sentiment detection
- clickbait detection
- meta-classification aggregation

Key endpoints include:

- `GET /`
- `GET /health`
- `POST /predict/sentiment`
- `POST /predict/clickbait`
- `POST /predict/reliability`

Sentiment predictions for article objects use the title plus up to 500
characters of the article body. Raw `texts` requests remain supported.

The frontend relies on this service to enrich article cards with reliability signals.
In local development, the frontend talks directly to this service. With
`VITE_API_BASE` set, it uses the Cloudflare Worker ML relay instead.

News retrieval uses FreeNewsApi's `/v1/news` and `/v1/details` endpoints. The
local proxy and production Worker keep `FREENEWS_API_KEY` server-side and
translate cursor pagination into same-origin app routes. Article requests are
throttled to FreeNewsApi's documented two requests per second.

For local development, the model server defaults to allowing browser requests from
`http://localhost:5173`. If `ML_API_KEY` is unset, direct local API requests remain
available and the server prints a warning. For deployment, set `ML_API_KEY` on the
model server and configure the same value as the Worker secret; the Worker sends it
as `X-ML-Key` and does not expose it to browsers. Set `ALLOWED_ORIGINS` to a
comma-separated list of exact frontend origins. The Worker limits ML requests to
30 per IP per minute, with a 1 MiB request-body cap and a 90-second upstream
timeout. Cloudflare applies approximate per-location limits, so people sharing an
IP address may share a quota. Before deployment, verify the Worker rate-limit
namespace ID in `worker/wrangler.jsonc` is unique within the Cloudflare account.

To test the Worker relay locally, copy `worker/.env.example` to
`worker/.dev.vars`, set `FREENEWS_API_KEY` and a random `ML_API_KEY` there, and
set the same ML key in the model server environment before starting it. For
production, configure the news key with `npx wrangler secret put FREENEWS_API_KEY`
from the `worker/` directory. The model server does not load an environment file
automatically. `.dev.vars` is ignored by Git.

## Named Cloudflare model tunnel

The model service remains bound to loopback on port 5001. To expose it through a
named Cloudflare Tunnel on macOS:

1. Install `cloudflared` with `brew install cloudflared`, then authenticate with
   `cloudflared tunnel login`.
2. Create the named tunnel and route a hostname in your Cloudflare-managed zone:

   ```bash
   cloudflared tunnel create reliabilitynet-model
   cloudflared tunnel route dns reliabilitynet-model ml.yourdomain.com
   ```

3. Copy `deployment/cloudflared/config.yml.example` to
   `~/.cloudflared/reliabilitynet-model.yml`. Replace the tunnel UUID, credentials
   file path, and hostname with the values for your account.
4. Start the model server with `ML_API_KEY` set, export the same key in the shell
   that runs the tunnel, then run `scripts/start-model-tunnel.sh`. The script
   validates the tunnel ingress and checks that the loopback model server responds.
5. Configure the Worker `ML_ORIGIN` as `https://ml.yourdomain.com` and store the
   same `ML_API_KEY` as a Worker secret. Do not copy tunnel credentials or keys
   into the repository.

## Cloudflare deployment without a custom domain

The production frontend and API can use Cloudflare-provided subdomains when you
do not control a custom domain:

- Pages: `https://reliabilitynet.pages.dev`
- Worker: `https://reliabilitynet-api-production.rethesmutua.workers.dev`

The production Worker allows the Pages origin and uses its `workers.dev`
hostname. Build the frontend with `VITE_API_BASE` set to the deployed Worker URL,
then deploy the `dist` directory to the `reliabilitynet` Pages project. Do not
include a trailing slash in `VITE_API_BASE`.

The ML relay remains unavailable until the model service has a stable HTTPS
hostname. For temporary end-to-end testing against models running on your Mac,
use the protected Cloudflare Quick Tunnel scripts below. Quick Tunnel URLs are
ephemeral and require your Mac, model server, and tunnel process to stay online;
they are not a reliable production hosting option.

### Temporary model Quick Tunnel

On the `deployment` branch, from the repository root, open two Terminal windows:

1. Start the model server with its local key:

   ```bash
   ./scripts/start-model-server.sh
   ```

   The script reads `ML_API_KEY` from the ignored `model-server.env`, tightens
   the file permissions, and refuses to start if the key is missing. Keep this
   terminal open.
2. In the second terminal, start the Quick Tunnel:

   ```bash
   ./scripts/start-model-quick-tunnel.sh
   ```

   This verifies that the local model server requires the key, checks that the
   production Worker has its matching `ML_API_KEY` secret, starts `cloudflared`,
   and redeploys the Worker with the newly issued tunnel URL. It then checks the
   Worker-to-model health route. Keep this terminal open too.
3. Open `https://reliabilitynet.pages.dev` and verify article predictions. Press
   Ctrl+C in the tunnel terminal to stop it.

The Quick Tunnel URL changes when recreated. Run both scripts again after
restarting the tunnel; the second script updates the Worker automatically. Never
put model keys or tunnel URLs in frontend environment variables or commit them.

## Auth and saved articles

The backend in `server/index.js` provides:

- user registration and login
- JWT-based session management
- profile email and password updates
- SQLite-backed storage for saved articles

## Features

### News discovery

- live news feed from FreeNewsApi
- keyword search
- category, language, date, and source filtering
- sorting by newest, oldest, and source

### Reliability signals

- sentiment classification
- clickbait detection
- reliability scores on article cards

### User experience

- responsive article layout
- saved article dashboard
- login and profile modals
- pagination and filtering controls

## Troubleshooting

### Proxy errors

The frontend checks the proxy at `http://localhost:3131/ping` before fetching news. If it displays “Start the proxy server first,” start the proxy in a terminal and leave that terminal open:

```bash
node proxy-server.js
```

Verify the proxy is responding from another terminal:

```bash
curl http://localhost:3131/ping
```

The response should be `{"ok":true}`. Then click **Retry** in the frontend.

### Model server errors

If the ML endpoint is unavailable, verify the virtual environment and local model files exist:

```bash
source model_env/bin/activate
python model_server.py
```

### Auth server not responding

Start it explicitly:

```bash
cd server
npm start
```

## Notes

- The project expects Node.js 18+ and a local Python environment for model inference.
- The ML model directories must remain in the repository root for the app to function correctly.
- Additional auth and runtime details are documented in [AUTH_SETUP.md](AUTH_SETUP.md).
