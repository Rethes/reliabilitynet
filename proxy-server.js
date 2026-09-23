/**
 * ReliabilityNet — Local Proxy Server
 * Requires Node.js 18+. No npm install needed.
 * Run: node proxy-server.js
 */

// Disable SSL cert verification for WiFi networks with SSL inspection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const http = require('http');
const url  = require('url');

const PORT     = 3131;
const API_BASE = 'https://api.webz.io';

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age',       '86400');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Only allow /newsApiLite path
  const parsed = url.parse(req.url, true);
  if (!parsed.pathname.startsWith('/newsApiLite')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Token is passed as a query param by the client; proxy forwards the full URL as-is
  const upstream = `${API_BASE}${req.url}`;
  console.log(`[proxy] → ${upstream}`);

  try {
    // Use Node 18+ built-in fetch — handles HTTP/2 automatically
    const upstreamRes = await fetch(upstream, {
      method:  'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept':     'application/json',
      },
    });

    const body = await upstreamRes.text();
    console.log(`[proxy] ← ${upstreamRes.status}  ${body.slice(0, 120)}`);

    res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' });
    res.end(body);

  } catch (err) {
    console.error('[proxy] Error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upstream failed', detail: err.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n  ◉ PULSE Proxy running → http://localhost:' + PORT);
  console.log('  → Using built-in fetch (HTTP/2 compatible)');
  console.log('  → SSL verification disabled (WiFi-compatible)');
  console.log('  → Proxying to api.webz.io/newsApiLite');
  console.log('  → Open news-hub.html in your browser');
  console.log('  → Ctrl+C to stop\n');
});
