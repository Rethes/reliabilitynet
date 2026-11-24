import assert from 'node:assert/strict';
import test from 'node:test';
import { createProxyServer } from '../proxy-server.js';

const API_ORIGIN = 'https://api.freenewsapi.io';
const API_KEY = 'server-only-key';
const ALLOWED_ORIGIN = 'http://localhost:5173';

async function startProxy(options) {
  const server = createProxyServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    baseURL: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections?.();
    }),
  };
}

function listResponse(uuid, hasMore, cursor) {
  return {
    data: [{ uuid, title: `Title ${uuid}`, published_at: '2026-11-17T10:00:00Z', publisher: 'Publisher' }],
    meta: { has_more: hasMore, next_cursor: cursor },
  };
}

function detailResponse(uuid) {
  return {
    data: {
      uuid,
      title: `Title ${uuid}`,
      thumbnail: 'https://images.example/article.jpg',
      publisher: 'Publisher',
      authors: ['Reporter'],
      topics: ['world'],
      languages: ['en'],
      published_at: '2026-11-17T10:00:00Z',
      original_url: `https://publisher.example/${uuid}`,
      incipit: 'Article summary',
      body: 'a'.repeat(5_000),
    },
  };
}

test('local proxy fetches FreeNewsApi details, protects the key, and paginates by cursor', async t => {
  const calls = [];
  const proxy = await startProxy({
    apiKey: API_KEY,
    fetchImpl: async (input, options) => {
      const url = new URL(input);
      calls.push({ url, headers: options.headers });
      let body;
      if (url.pathname === '/v1/news') {
        body = url.searchParams.has('cursor')
          ? listResponse('article-2', false, null)
          : listResponse('article-1', true, 'cursor-next');
      } else {
        body = detailResponse(url.searchParams.get('uuid'));
      }
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });
  t.after(proxy.close);

  const firstResponse = await fetch(
    `${proxy.baseURL}/api/news?in_title=first+page&language=en&token=client-key&ignored=yes`,
    { headers: { Origin: ALLOWED_ORIGIN } },
  );
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
  const firstBody = await firstResponse.json();
  assert.equal(firstBody.posts[0].uuid, 'article-1');
  assert.equal(firstBody.posts[0].text.length, 4_000);
  assert.equal(firstBody.posts[0].body, undefined);
  assert.equal(firstBody.posts[0].url, 'https://publisher.example/article-1');
  assert.equal(firstBody.posts[0].author, 'Reporter');
  assert.equal(firstBody.posts[0].thread.main_image, 'https://images.example/article.jpg');
  assert.ok(firstBody.next.startsWith('/api/news/next?'));
  assert.ok(!JSON.stringify(firstBody).includes(API_KEY));

  const secondResponse = await fetch(`${proxy.baseURL}${firstBody.next}`);
  assert.equal(secondResponse.status, 200);
  const secondBody = await secondResponse.json();
  assert.equal(secondBody.posts[0].uuid, 'article-2');
  assert.equal(secondBody.next, null);

  assert.equal(calls.length, 4);
  assert.equal(calls[0].url.origin, API_ORIGIN);
  assert.equal(calls[0].url.pathname, '/v1/news');
  assert.equal(calls[0].url.searchParams.get('in_title'), 'first page');
  assert.equal(calls[0].url.searchParams.get('language'), 'en');
  assert.equal(calls[0].url.searchParams.get('order_by'), 'recent');
  assert.equal(calls[0].url.searchParams.has('ignored'), false);
  assert.equal(calls[0].headers['x-api-key'], API_KEY);
  assert.equal(calls[1].url.pathname, '/v1/details');
  assert.equal(calls[1].url.searchParams.get('uuid'), 'article-1');
  assert.equal(calls[1].headers['x-api-key'], API_KEY);
  assert.equal(calls[2].url.searchParams.get('cursor'), 'cursor-next');
  assert.equal(calls[3].url.pathname, '/v1/details');
});

test('local proxy retries a rate-limited FreeNewsApi request when retry timing is provided', async t => {
  let newsAttempts = 0;
  const proxy = await startProxy({
    apiKey: API_KEY,
    fetchImpl: async input => {
      if (new URL(input).pathname !== '/v1/news') {
        return new Response('{}', { status: 500 });
      }
      newsAttempts += 1;
      if (newsAttempts === 1) {
        return new Response(JSON.stringify({
          error: 'Too Many Requests',
          retry_after_ms: 0,
        }), { status: 429 });
      }
      return new Response(JSON.stringify({
        data: [],
        meta: { has_more: false, next_cursor: null },
      }), { status: 200 });
    },
  });
  t.after(proxy.close);

  const response = await fetch(`${proxy.baseURL}/api/news?language=en`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    posts: [],
    next: null,
    more_results_available: 0,
  });
  assert.equal(newsAttempts, 2);
});

test('local proxy fails closed without an API key and restricts CORS', async t => {
  let upstreamCalled = false;
  const proxy = await startProxy({
    apiKey: '',
    fetchImpl: async () => {
      upstreamCalled = true;
      return new Response('{}');
    },
  });
  t.after(proxy.close);

  const newsResponse = await fetch(`${proxy.baseURL}/api/news?language=en`);
  assert.equal(newsResponse.status, 503);
  assert.deepEqual(await newsResponse.json(), { error: 'News service unavailable' });

  const allowedPreflight = await fetch(`${proxy.baseURL}/api/news`, {
    method: 'OPTIONS',
    headers: {
      Origin: ALLOWED_ORIGIN,
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(allowedPreflight.status, 204);
  assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);

  const rejectedPreflight = await fetch(`${proxy.baseURL}/api/news`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://untrusted.example',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(rejectedPreflight.status, 403);
  assert.equal(rejectedPreflight.headers.get('access-control-allow-origin'), null);
  assert.equal(upstreamCalled, false);
});

test('local proxy does not accept WEBZ_TOKEN as the news API key', async () => {
  const previousApiKey = process.env.FREENEWS_API_KEY;
  const previousLegacyToken = process.env.WEBZ_TOKEN;
  process.env.FREENEWS_API_KEY = '';
  process.env.WEBZ_TOKEN = 'legacy-token';

  const proxy = await startProxy({
    fetchImpl: async () => new Response('{}'),
  });
  try {
    const response = await fetch(`${proxy.baseURL}/api/news?language=en`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'News service unavailable' });
  } finally {
    await proxy.close();
    if (previousApiKey === undefined) delete process.env.FREENEWS_API_KEY;
    else process.env.FREENEWS_API_KEY = previousApiKey;
    if (previousLegacyToken === undefined) delete process.env.WEBZ_TOKEN;
    else process.env.WEBZ_TOKEN = previousLegacyToken;
  }
});

test('local proxy maps the legacy route to the FreeNewsApi endpoint', async t => {
  let upstreamURL;
  const proxy = await startProxy({
    apiKey: API_KEY,
    fetchImpl: async input => {
      upstreamURL = new URL(input);
      const body = upstreamURL.pathname === '/v1/news'
        ? listResponse('legacy-article', false, null)
        : detailResponse(upstreamURL.searchParams.get('uuid'));
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });
  t.after(proxy.close);

  const response = await fetch(`${proxy.baseURL}/api/news/newsApiLite?in_title=legacy`);
  assert.equal(response.status, 200);
  assert.equal(upstreamURL.origin, API_ORIGIN);
  assert.equal(upstreamURL.pathname, '/v1/details');
});

test('local proxy rejects next-page requests without a cursor', async t => {
  let upstreamCalled = false;
  const proxy = await startProxy({
    apiKey: API_KEY,
    fetchImpl: async () => {
      upstreamCalled = true;
      return new Response('{}');
    },
  });
  t.after(proxy.close);

  const response = await fetch(`${proxy.baseURL}/api/news/next?next=https://untrusted.example`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid next page' });
  assert.equal(upstreamCalled, false);
});
