# ReliabilityNet

ReliabilityNet is a full-stack news intelligence app that combines live article discovery with AI-powered reliability scoring. It pulls headlines from Webz.io, runs sentiment and misinformation checks through local transformer models, and presents the results in a React UI for browsing, filtering, saving, and reviewing articles.

## Overview

The project is split into three runtime services:

- Frontend: React + Vite app in the root project and `src/` directory
- Auth backend: Express app in `server/` for login, profile management, and saved articles
- ML backend: Flask service in `model_server.py` for sentiment, fake-news, and clickbait predictions
- News proxy: lightweight Node service that forwards Webz.io requests

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
├── proxy-server.js                # Local Webz.io proxy for fetching news
├── model_server.py                # Flask ML API for sentiment, fake news, and clickbait
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
├── roberta_large_fake_news_model/ # Local fake-news detection model checkpoint
├── roberta_large_clickbait_model/ # Local clickbait detection model checkpoint
├── model_env/                     # Python virtual environment for model inference
├── test_clickbait_server.py       # Smoke test for clickbait endpoint
├── test_fake_news_server.py       # Smoke test for fake-news endpoint
├── test_reliability_server.py     # Smoke test for reliability endpoint
├── test_sentiment_server.py       # Smoke test for sentiment endpoint
└── node_modules/                  # Installed frontend dependencies
```

## Prerequisites

- Node.js 18+
- Python 3.10+
- A Webz.io API key
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

- Replace the `VITE_API_KEY` placeholder in `.env` with your Webz.io API key. It is required for live news fetching.
- Vite loads `VITE_API_KEY` from the project-root `.env` file. Restart the frontend after changing it.
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
- fake-news detection
- clickbait detection
- meta-classification aggregation

Key endpoints include:

- `GET /`
- `GET /health`
- `POST /predict/sentiment`
- `POST /predict/fake-news`
- `POST /predict/clickbait`
- `POST /predict/reliability`

The frontend relies on this service to enrich article cards with reliability signals.

## Auth and saved articles

The backend in `server/index.js` provides:

- user registration and login
- JWT-based session management
- profile email and password updates
- SQLite-backed storage for saved articles

## Features

### News discovery

- live news feed from Webz.io
- keyword search
- category, language, date, and source filtering
- sorting by newest, oldest, and source

### Reliability signals

- sentiment classification
- fake-news detection
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
