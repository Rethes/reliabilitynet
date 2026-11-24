# ReliabilityNet

ReliabilityNet is a full-stack news intelligence app that combines live article discovery with AI-powered reliability scoring. It pulls headlines from FreeNewsApi, runs sentiment and misinformation checks through local transformer models, and presents the results in a React UI for browsing, filtering, saving, and reviewing articles.

## Overview

The project can be run in two modes:

### Local Development Mode
- **Frontend**: React + Vite app in the root project and `src/` directory (http://localhost:5173)
- **Auth backend**: Express app in `server/` with local SQLite (`data.db`) (http://localhost:4000)
- **ML backend**: Flask service in `model_server.py` for sentiment, clickbait, and reliability predictions (http://localhost:5001)
- **News proxy**: lightweight Node service in `proxy-server.js` that forwards FreeNewsApi requests (http://localhost:3131)

### Production Deployment Mode
- **Frontend**: Hosted on **Cloudflare Pages** at [https://reliabilitynet.pages.dev](https://reliabilitynet.pages.dev)
- **API Gateway & Auth**: Hosted on **Cloudflare Workers** at `https://reliabilitynet-api-production.rethesmutua.workers.dev` with serverless **Cloudflare D1** SQLite database
- **News API**: Server-side proxy on Cloudflare Workers calling FreeNewsApi
- **ML Runtime**: Hosted on **Kaggle GPU** (via `kaggle-gradio-notebook.ipynb`) pulling checkpoints from Hugging Face, exposed via a fixed **ngrok tunnel** (`https://jockstrap-track-paradox.ngrok-free.dev`) and relayed through Cloudflare Workers

## Tech stack

- **Frontend**: React 19, Vite, CSS Modules
- **Backend (Local)**: Node.js, Express, better-sqlite3
- **Backend (Production)**: Cloudflare Workers (Hono), Cloudflare D1 (SQLite), Cloudflare Pages
- **ML Inference**: Python, Flask, Hugging Face Transformers, PyTorch (CUDA / CPU), Scikit-Learn
- **Model Hosting & Compute**: Hugging Face Hub ([rethes/ReliabilityNet](https://huggingface.co/rethes/ReliabilityNet)), Kaggle GPU runtime, ngrok tunnel, Gradio UI
- **News Data**: FreeNewsApi (`api.freenewsapi.io`)

## Repository structure

```bash
ReliabilityNet/
├── README.md                      # Project overview and setup instructions
├── LICENSE.md                     # MIT License
├── AUTH_SETUP.md                  # Auth backend setup details
├── DEPLOY_INVENTORY.md            # Deployment audit and route inventory
├── .gitignore                     # Files ignored by Git
├── .env.example                   # Template for local environment variables
├── model-server.env.example       # Template for model server local key configuration
├── package.json                   # Frontend app scripts and dependencies
├── vite.config.js                 # Vite frontend config
├── index.html                     # Main HTML shell for the React app
├── news-provider.js               # Shared FreeNewsApi client and data normalizer
├── proxy-server.js                # Local FreeNewsApi proxy for fetching news
├── model_server.py                # Flask ML API for sentiment, clickbait, and reliability
├── kaggle-gradio-notebook.ipynb   # Kaggle notebook for GPU model inference + ngrok/Gradio
├── requirements.txt               # Python dependencies for the model server
├── start-all.sh                   # Starts proxy, backend, ML API, and frontend together
├── deployment/                    # Cloudflare Tunnel configuration templates
│   └── cloudflared/
│       └── config.yml.example
├── scripts/                       # Startup scripts for model server & tunnels
│   ├── start-model-server.sh      # Starts Flask ML service with API key verification
│   ├── start-model-quick-tunnel.sh # Ephemeral Cloudflare Quick Tunnel for Mac testing
│   └── start-model-tunnel.sh      # Named Cloudflare Tunnel for custom domains
├── server/                        # Local Express auth & SQLite backend
│   ├── index.js                   # Express auth API and saved-article storage
│   ├── package.json               # Backend scripts and dependencies
│   └── data.db                    # SQLite database for users and saved articles
├── src/                           # React frontend application
│   ├── App.jsx                    # Main React app layout and page logic
│   ├── main.jsx                   # React app entry point
│   ├── App.module.css             # App-level styling
│   ├── index.css                  # Global styles and design tokens
│   ├── components/                # Reusable UI elements (cards, modals, badges, etc.)
│   ├── context/                   # Shared app state and auth context
│   ├── hooks/                     # Data-fetching and filtering logic
│   ├── services/                  # API clients (news, reliability, sentiment, auth)
│   └── utils/                     # Helper functions and formatting utilities
├── worker/                        # Cloudflare Worker for production API routing
│   ├── wrangler.jsonc             # Wrangler configuration and bindings
│   ├── package.json               # Worker dependencies and scripts
│   ├── migrations/                # D1 database schema migrations
│   ├── src/                       # Worker routes (news, auth, articles, ML relay)
│   └── test/                      # Worker integration tests
├── meta_logistic_regression_model/ # Meta model used for combined reliability scoring
├── roberta_sentiment_model/       # Local sentiment model checkpoint
├── roberta_large_clickbait_model/ # Local clickbait detection model checkpoint
├── model_env/                     # Python virtual environment for model inference
└── tests/                         # Unit and security test suites
```

## Prerequisites

- Node.js 18+
- Python 3.10+
- A FreeNewsApi API key
- Local model weights in the repository root ([available on Hugging Face](https://huggingface.co/rethes/ReliabilityNet))

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

### 4. Download model weights

The pre-trained model checkpoints are hosted on Hugging Face:
👉 **[https://huggingface.co/rethes/ReliabilityNet](https://huggingface.co/rethes/ReliabilityNet)**

Download or clone the three model directories into the repository root:
- `roberta_sentiment_model/`: Fine-tuned RoBERTa sequence classification checkpoint for sentiment analysis.
- `roberta_large_clickbait_model/`: Fine-tuned RoBERTa Large sequence classification checkpoint for headline sensationalism detection.
- `meta_logistic_regression_model/`: Scikit-learn meta-classifier pipeline for combined reliability scoring.

### 5. Configure environment variables

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

The Python service in `model_server.py` loads the project’s local Hugging Face checkpoints ([hosted on Hugging Face](https://huggingface.co/rethes/ReliabilityNet)) for:

- sentiment detection (RoBERTa)
- clickbait detection (RoBERTa Large)
- meta-classification reliability scoring (Logistic Regression)

Key endpoints include:

- `GET /`: Service information and available routes
- `GET /health`: Health status and model capabilities
- `POST /predict/sentiment`: Predicts sentiment (negative, neutral, positive) using the article title plus up to 500 characters of the body.
- `POST /predict/clickbait`: Predicts clickbait status specifically for article titles.
- `POST /predict/reliability`: Runs all three inference steps in sequence. Sentiment uses the title plus up to 500 body characters, while clickbait and the meta-classifier evaluate the title. The response echoes the article `text` matching the input JSON payload.

Sentiment predictions for article objects use the headline plus up to 500 characters of the article body (falling back to `description` or `text` if `body` is not provided). The React UI modal (`ArticleModal.jsx`) displays the exact 500-character body analyzed by the model, formatted with paragraph line breaks and an ellipsis (`...`) when truncated, ensuring inputs can be cleanly replicated in Postman. Raw `texts` array requests remain supported for backwards compatibility.

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

## Production Cloudflare & Kaggle deployment

The production architecture runs entirely on free-tier cloud infrastructure:

- **Frontend**: Cloudflare Pages at [https://reliabilitynet.pages.dev](https://reliabilitynet.pages.dev)
- **API Gateway**: Cloudflare Worker at `https://reliabilitynet-api-production.rethesmutua.workers.dev`
- **Database**: Cloudflare D1 serverless SQLite (`reliabilitynet-db`)
- **ML Inference**: Kaggle GPU (Tesla T4) running `kaggle-gradio-notebook.ipynb`, downloading weights from Hugging Face (`rethes/ReliabilityNet`), and tunneled via static ngrok domain `https://jockstrap-track-paradox.ngrok-free.dev`

### Cloudflare deployment workflow

1. **Deploy the Worker API**:
   ```bash
   cd worker
   npm install
   npx wrangler d1 migrations apply reliabilitynet-db --remote
   npx wrangler secret put FREENEWS_API_KEY
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put ML_API_KEY
   npx wrangler deploy --env production
   cd ..
   ```
   The Worker is configured in `worker/wrangler.jsonc` with:
   - `ALLOWED_ORIGINS`: `https://reliabilitynet.pages.dev`
   - `ML_ORIGIN`: `https://jockstrap-track-paradox.ngrok-free.dev`
   - `ML_RATE_LIMITER`: 30 requests / 60 seconds per IP

2. **Build and deploy the Frontend (Cloudflare Pages)**:
   ```bash
   # Build with the production Worker API base
   VITE_API_BASE=https://reliabilitynet-api-production.rethesmutua.workers.dev npm run build

   # Deploy to Cloudflare Pages
   ./worker/node_modules/.bin/wrangler pages deploy dist --project-name reliabilitynet --branch deployment
   ```

### Running the ML models on Kaggle

Whenever you want live article scoring on [https://reliabilitynet.pages.dev](https://reliabilitynet.pages.dev):

1. Open `kaggle-gradio-notebook.ipynb` in **Kaggle**.
2. In the right panel under **Session options**:
   - **Internet** ➔ **On** (required for pip, Hugging Face, ngrok, Gradio)
   - **Accelerator** ➔ **GPU** (e.g. GPU T4 x2)
3. Under **Add-ons → Secrets**, ensure the **`NGROK_TOKEN`** secret is checked.
4. Run the notebook cells (Cell 1 through Cell 8).
5. Verify Cell 7 prints:
   ```
   🌍 Public Flask API URL: https://jockstrap-track-paradox.ngrok-free.dev
      Health check: https://jockstrap-track-paradox.ngrok-free.dev/health
   ```
6. Open [https://reliabilitynet.pages.dev](https://reliabilitynet.pages.dev). Because `jockstrap-track-paradox.ngrok-free.dev` is a static domain already configured in the Cloudflare Worker, the app immediately connects and displays live reliability scores, sentiment, and clickbait analysis.

> **Note**: Do not run the Teardown cell while using the app, as it terminates the background Flask server and ngrok tunnel.

---

### Alternative: local development with Cloudflare Tunnels

If you prefer to run models locally on your Mac instead of Kaggle:

1. **Named tunnel**: Use `scripts/start-model-tunnel.sh` and configure `ML_ORIGIN` to your custom hostname.
2. **Quick tunnel**: Use `./scripts/start-model-quick-tunnel.sh` for an ephemeral `trycloudflare.com` tunnel.

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
- The ML model directories (`roberta_sentiment_model/`, `roberta_large_clickbait_model/`, `meta_logistic_regression_model/`) must remain in the repository root (downloadable from [Hugging Face](https://huggingface.co/rethes/ReliabilityNet)) for the app to function correctly.
- Additional auth and runtime details are documented in [AUTH_SETUP.md](AUTH_SETUP.md).
