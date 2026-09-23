const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 4000;

app.get('/', (req, res) => {
  res.send('Express server is successfully running!');
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔐 ReliabilityNet auth server running on http://localhost:${PORT}\n`);
});
