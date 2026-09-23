# ReliabilityNet - Local Auth Setup

This project includes a local Express backend for user authentication and server-backed saved articles.
The application also uses a Python model server for sentiment, fake-news, clickbait, and reliability analysis.

## Architecture

| Server | Port | Purpose |
|--------|------|---------|
| Vite dev server | 5173 | React frontend |
| `proxy-server.js` | 3131 | webz.io API proxy (unchanged) |
| `server/index.js` | 4000 | Auth + saved articles |
| `model_server.py` | 5001 | Sentiment, fake-news, clickbait, and reliability predictions |

---

## First-time setup

### 1. Install backend dependencies

```bash
cd server
npm install
cd ..
```

### 2. Start all services

The recommended option is to start the proxy, auth backend, model server, and frontend together:

```bash
./start-all.sh
```

Open http://localhost:5173 once the frontend starts. Press `Ctrl+C` to stop the services.

For manual startup, use four terminals:

**Terminal 1 - webz.io proxy**
```bash
node proxy-server.js
```

**Terminal 2 - Auth backend**
```bash
cd server
npm start
# or for auto-reload during development:
npm run dev
```

**Terminal 3 - Model server**
```bash
./model_env/bin/python model_server.py
```

**Terminal 4 - React frontend**
```bash
npm run dev
```

Open http://localhost:5173

---

## How it works

### Authentication
- JWT-based auth (7-day tokens stored in `localStorage`)
- Passwords hashed with bcrypt
- SQLite database file created automatically at `server/data.db`

### Saving articles
- **Logged in:** Save/unsave calls the backend API. Articles persist in SQLite.
- **Guest:** Clicking "Save" opens the login modal. No articles are saved without an account.

### Reactions (like/dislike)
- Still stored in `localStorage` for all users — no auth required.

---

## Auth API Endpoints (port 4000)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Register with email + password |
| POST | `/auth/login` | — | Login, receive JWT |
| GET | `/auth/me` | ✓ | Verify token, get current user |
| GET | `/saves` | ✓ | List all saved articles |
| POST | `/saves` | ✓ | Save an article |
| DELETE | `/saves/:articleId` | ✓ | Unsave an article |

---

## Files changed / added

### New files
- `server/index.js` — Express backend
- `server/package.json` — Backend dependencies
- `src/services/authApi.js` — Frontend API client
- `src/components/LoginModal.jsx` — Auth modal
- `src/components/LoginModal.module.css` — Modal styles

### Modified files
- `src/context/AppContext.jsx` — Auth state, backend-backed saves
- `src/components/Header.jsx` — Login/logout buttons
- `src/components/SavedArticles.jsx` — Login prompt for guests
- `src/components/ArticleCard.jsx` — Uses `toggleSave` from context
- `src/App.jsx` — Renders `<LoginModal />` when needed
