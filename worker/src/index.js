import { Hono } from 'hono';
import { cors } from 'hono/cors';
import articles from './articles.js';
import auth from './auth.js';
import { relayML } from './ml.js';

const app = new Hono();

const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
const allowedHeaders = ['Content-Type', 'Authorization'];
const WEBZ_ORIGIN = 'https://api.webz.io';
const NEWS_PATH = '/api/news';
const NEWS_TIMEOUT_MS = 10000;
const NEWS_QUERY_PARAMS = [
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

function getAllowedOrigins(value) {
  return new Set(
    (value || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  );
}

function getUpstreamURL(path, token) {
  let url;

  try {
    url = new URL(path, `${WEBZ_ORIGIN}${NEWS_PATH}`);
  } catch {
    return null;
  }

  if (url.origin !== WEBZ_ORIGIN || url.pathname !== NEWS_PATH) return null;

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

function getToken(c) {
  const token = c.env.WEBZ_TOKEN;
  if (token) return token;

  console.error('WEBZ_TOKEN is not configured');
  return null;
}

async function fetchNews(c, url, token) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(NEWS_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      'Webz upstream request failed:',
      error instanceof Error ? error.name : 'UnknownError',
    );
    const detail = error instanceof Error && error.name === 'TimeoutError'
      ? 'Upstream request timed out'
      : 'Upstream request failed';
    return c.json({ error: 'Upstream failed', detail }, 502);
  }

  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    return c.json({ error: 'Invalid upstream response' }, response.status);
  }

  const safeBody = redactSecret(body, token);
  if (safeBody && !Array.isArray(safeBody) && typeof safeBody === 'object' && typeof safeBody.next === 'string') {
    const nextURL = getUpstreamURL(safeBody.next, token);
    if (nextURL) {
      nextURL.searchParams.delete('token');
      const next = `${nextURL.pathname}${nextURL.search}`;
      safeBody.next = `/api/news/next?${new URLSearchParams({ next })}`;
    } else {
      safeBody.next = null;
    }
  }

  return c.json(safeBody, response.status);
}

app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  const allowedOrigins = getAllowedOrigins(c.env.ALLOWED_ORIGINS);

  if (!origin || !allowedOrigins.has(origin)) {
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    return next();
  }

  return cors({
    origin,
    allowMethods: allowedMethods,
    allowHeaders: allowedHeaders,
    maxAge: 86400,
  })(c, next);
});

app.get('/api/health', c => c.json({ status: 'ok' }));

app.get('/api/news/ping', c => c.json({ ok: true }));

async function handleNewsSearch(c) {
  const token = getToken(c);
  if (!token) return c.json({ error: 'News service unavailable' }, 500);

  const url = new URL(NEWS_PATH, WEBZ_ORIGIN);
  url.searchParams.set('q', '*');
  url.searchParams.set('size', '10');
  url.searchParams.set('sort', 'crawled');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('webz_reporter', 'true');
  url.searchParams.set('includeSyndicated', 'false');
  url.searchParams.set('allowNewsHistory', 'false');
  for (const name of NEWS_QUERY_PARAMS) {
    const value = c.req.query(name);
    if (value !== undefined) url.searchParams.set(name, value);
  }
  url.searchParams.set('token', token);

  return fetchNews(c, url, token);
}

app.get('/api/news', handleNewsSearch);
app.get('/api/news/newsApiLite', handleNewsSearch);

app.get('/api/news/next', async c => {
  const token = getToken(c);
  if (!token) return c.json({ error: 'News service unavailable' }, 500);

  const nextPath = c.req.query('next');
  const url = nextPath ? getUpstreamURL(nextPath, token) : null;
  if (!url) return c.json({ error: 'Invalid next page' }, 400);

  return fetchNews(c, url, token);
});

app.all('/api/ml', relayML);
app.all('/api/ml/*', relayML);

app.route('/api', auth);
app.route('/api', articles);

app.notFound(c => c.json({ error: 'Not found' }, 404));

app.onError((error, c) => {
  console.error('Worker request failed:', error.name);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
