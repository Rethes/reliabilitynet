import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNewsURL, fetchNewsPage } from './news-provider.js';

const PORT = 3131;
const NEWS_PATH = '/api/news';
const LEGACY_NEWS_PATH = '/newsApiLite';
const ALLOWED_ORIGIN = 'http://localhost:5173';

function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function fetchNews(res, url, apiKey, fetchImpl) {
  let result;
  try {
    result = await fetchNewsPage(url, apiKey, fetchImpl);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error('[proxy] Upstream request failed:', errorName);
    const detail = errorName === 'TimeoutError'
      ? 'Upstream request timed out'
      : 'Upstream request failed';
    sendJSON(res, 502, { error: 'Upstream failed', detail });
    return;
  }
  sendJSON(res, result.status, result.body);
}

export function createProxyServer({
  apiKey = process.env.FREENEWS_API_KEY,
  fetchImpl = fetch,
} = {}) {
  const newsApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin === ALLOWED_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(origin && origin !== ALLOWED_ORIGIN ? 403 : 204);
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      sendJSON(res, 405, { error: 'Method not allowed' });
      return;
    }

    let requestURL;
    try {
      requestURL = new URL(req.url || '/', 'http://localhost');
    } catch {
      sendJSON(res, 400, { error: 'Invalid request URL' });
      return;
    }

    if (requestURL.pathname === '/ping' || requestURL.pathname === '/api/news/ping') {
      sendJSON(res, 200, { ok: true });
      return;
    }
    if (requestURL.pathname === '/api/health') {
      sendJSON(res, 200, { status: 'ok' });
      return;
    }

    const isNewsRequest = requestURL.pathname === NEWS_PATH
      || requestURL.pathname === LEGACY_NEWS_PATH
      || requestURL.pathname === `/api/news${LEGACY_NEWS_PATH}`;
    const isNextPageRequest = requestURL.pathname === '/api/news/next';
    if (!isNewsRequest && !isNextPageRequest) {
      sendJSON(res, 404, { error: 'Not found' });
      return;
    }
    if (!newsApiKey) {
      console.error('[proxy] FREENEWS_API_KEY is not configured');
      sendJSON(res, 503, { error: 'News service unavailable' });
      return;
    }

    if (isNextPageRequest && !requestURL.searchParams.get('cursor')) {
      sendJSON(res, 400, { error: 'Invalid next page' });
      return;
    }

    const upstreamURL = buildNewsURL(requestURL.searchParams);
    if (!isNextPageRequest) upstreamURL.searchParams.set('order_by', 'recent');
    await fetchNews(res, upstreamURL, newsApiKey, fetchImpl);
  });
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const server = createProxyServer();
  if (!process.env.FREENEWS_API_KEY?.trim()) {
    console.warn('[proxy] FREENEWS_API_KEY is not set; news requests will return 503');
  }
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  ReliabilityNet local news proxy → http://localhost:${PORT}`);
    console.log('  → FreeNewsApi credentials are kept server-side');
    console.log('  → Ctrl+C to stop\n');
  });
}
