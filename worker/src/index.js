import { Hono } from 'hono';
import { cors } from 'hono/cors';
import articles from './articles.js';
import auth from './auth.js';
import { relayML } from './ml.js';
import { buildNewsURL, fetchNewsPage } from '../../news-provider.js';

const app = new Hono();

const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
const allowedHeaders = ['Content-Type', 'Authorization'];
function getAllowedOrigins(value) {
  return new Set(
    (value || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  );
}

function getNewsApiKey(c) {
  const apiKey = c.env.FREENEWS_API_KEY;
  if (apiKey) return apiKey;

  console.error('FREENEWS_API_KEY is not configured');
  return null;
}

async function fetchNews(c, url, apiKey) {
  let result;
  try {
    result = await fetchNewsPage(url, apiKey);
  } catch (error) {
    console.error(
      'FreeNewsApi upstream request failed:',
      error instanceof Error ? error.name : 'UnknownError',
    );
    const detail = error instanceof Error && error.name === 'TimeoutError'
      ? 'Upstream request timed out'
      : 'Upstream request failed';
    return c.json({ error: 'Upstream failed', detail }, 502);
  }

  return c.json(result.body, result.status);
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
  const apiKey = getNewsApiKey(c);
  if (!apiKey) return c.json({ error: 'News service unavailable' }, 500);

  const url = buildNewsURL(new URL(c.req.url).searchParams);
  url.searchParams.set('order_by', 'recent');

  return fetchNews(c, url, apiKey);
}

app.get('/api/news', handleNewsSearch);
app.get('/api/news/newsApiLite', handleNewsSearch);

app.get('/api/news/next', async c => {
  const apiKey = getNewsApiKey(c);
  if (!apiKey) return c.json({ error: 'News service unavailable' }, 500);

  if (!c.req.query('cursor')) return c.json({ error: 'Invalid next page' }, 400);
  const url = buildNewsURL(new URL(c.req.url).searchParams);

  return fetchNews(c, url, apiKey);
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
