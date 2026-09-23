const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'reliabilitynet-dev-secret-change-in-prod';
const DB_PATH = path.join(__dirname, 'data.db');

// ── DB setup ──────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    email     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password  TEXT    NOT NULL,
    created_at TEXT   DEFAULT (datetime('now'))
    
  );

  CREATE TABLE IF NOT EXISTS saved_articles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id  TEXT    NOT NULL,
    article_json TEXT   NOT NULL,
    saved_at    TEXT   DEFAULT (datetime('now')),
    UNIQUE(user_id, article_id)
  );
`);


app.get('/', (req, res) => {
  res.send('Express server is successfully running!');
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔐 ReliabilityNet auth server running on http://localhost:${PORT}\n`);
});
