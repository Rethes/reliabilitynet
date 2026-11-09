import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3131;
const API_ORIGIN = 'https://api.webz.io';
const NEWS_PATH = '/api/news';
const LEGACY_NEWS_PATH = '/newsApiLite';
const ALLOWED_ORIGIN = 'http://localhost:5173';
const ALLOWED_QUERY_PARAMS = [
  'q',
  'size',
  'highlight',
  'ts',
  'sort',
  'order',
  'webz_reporter',
  'includeSyndicated',
  'allowNewsHistory',
];
const UPSTREAM_TIMEOUT_MS = 10_000;

function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function getUpstreamURL(path, token) {
  let url;

  try {
    url = new URL(path, `${API_ORIGIN}${NEWS_PATH}`);
  } catch {
    return null;
  }

  if (url.origin !== API_ORIGIN || url.pathname !== NEWS_PATH) return null;

  url.searchParams.delete('token');
  url.searchParams.set('token', token);
  return url;
}

function redactSecret(value, secret) {
  if (typeof value === 'string') return value.replaceAll(secret, '[redacted]');
  if (Array.isArray(value)) return value.map(item => redactSecret(item, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSecret(item, secret)]),
    );
  }
  return value;
}

async function fetchNews(res, url, token, fetchImpl) {
  let upstream;
  try {
    upstream = await fetchImpl(url, {
      headers: {
        'User-Agent': 'ReliabilityNet local news proxy',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error('[proxy] Upstream request failed:', errorName);
    const detail = errorName === 'TimeoutError'
      ? 'Upstream request timed out'
      : 'Upstream request failed';
    sendJSON(res, 502, { error: 'Upstream failed', detail });
    return;
  }

  let body;
  try {
    body = JSON.parse(await upstream.text());
  } catch {
    sendJSON(res, upstream.status, { error: 'Invalid upstream response' });
    return;
  }

  const safeBody = redactSecret(body, token);
  if (
    safeBody
    && !Array.isArray(safeBody)
    && typeof safeBody === 'object'
    && typeof safeBody.next === 'string'
  ) {
    const nextURL = getUpstreamURL(safeBody.next, token);
    if (nextURL) {
      nextURL.searchParams.delete('token');
      const next = `${nextURL.pathname}${nextURL.search}`;
      safeBody.next = `/api/news/next?${new URLSearchParams({ next })}`;
    } else {
      safeBody.next = null;
    }
  }

  sendJSON(res, upstream.status, safeBody);
}

export function createProxyServer({ token = process.env.WEBZ_TOKEN, fetchImpl = fetch } = {}) {
  const webzToken = typeof token === 'string' ? token.trim() : '';

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
    if (!webzToken) {
      console.error('[proxy] WEBZ_TOKEN is not configured');
      sendJSON(res, 503, { error: 'News service unavailable' });
      return;
    }

    let upstreamURL;
    if (isNextPageRequest) {
      upstreamURL = getUpstreamURL(requestURL.searchParams.get('next'), webzToken);
      if (!upstreamURL) {
        sendJSON(res, 400, { error: 'Invalid next page' });
        return;
      }
    } else {
      upstreamURL = new URL(NEWS_PATH, API_ORIGIN);
      upstreamURL.searchParams.set('q', '*');
      upstreamURL.searchParams.set('size', '10');
      upstreamURL.searchParams.set('sort', 'crawled');
      upstreamURL.searchParams.set('order', 'desc');
      upstreamURL.searchParams.set('webz_reporter', 'true');
      upstreamURL.searchParams.set('includeSyndicated', 'false');
      upstreamURL.searchParams.set('allowNewsHistory', 'false');
      for (const name of ALLOWED_QUERY_PARAMS) {
        const value = requestURL.searchParams.get(name);
        if (value !== null) upstreamURL.searchParams.set(name, value);
      }
      upstreamURL.searchParams.set('token', webzToken);
    }

    await fetchNews(res, upstreamURL, webzToken, fetchImpl);
  });
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const server = createProxyServer();
  if (!process.env.WEBZ_TOKEN?.trim()) {
    console.warn('[proxy] WEBZ_TOKEN is not set; news requests will return 503');
  }
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  ReliabilityNet local news proxy → http://localhost:${PORT}`);
    console.log('  → Webz.io credentials are kept server-side');
    console.log('  → Ctrl+C to stop\n');
  });
}
