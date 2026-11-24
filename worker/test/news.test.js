import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/index.js';

const API_ORIGIN = 'https://api.freenewsapi.io';

async function withMockedFetch(mockFetch, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function makeEnv(apiKey) {
  return {
    ALLOWED_ORIGINS: 'http://localhost:5173',
    FREENEWS_API_KEY: apiKey,
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

test('news routes keep the FreeNewsApi key server-side and paginate by cursor', async () => {
  const apiKey = 'worker-only-key';
  const clientKey = 'client-key';
  const calls = [];

  await withMockedFetch(async (input, options) => {
    const url = new URL(input);
    calls.push({ url, headers: options.headers });
    const body = url.pathname === '/v1/news'
      ? url.searchParams.has('cursor')
        ? listResponse('article-2', false, null)
        : listResponse('article-1', true, 'cursor-next')
      : detailResponse(url.searchParams.get('uuid'));
    return new Response(JSON.stringify(body), { status: 200 });
  }, async () => {
    const firstResponse = await app.request(
      `/api/news?in_title=first+page&language=en&token=${clientKey}&ignored=yes`,
      {},
      makeEnv(apiKey),
    );
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.posts[0].uuid, 'article-1');
    assert.equal(firstBody.posts[0].text.length, 4_000);
    assert.equal(firstBody.posts[0].body, undefined);
    assert.equal(firstBody.posts[0].url, 'https://publisher.example/article-1');
    assert.equal(firstBody.more_results_available, 1);
    assert.ok(firstBody.next.startsWith('/api/news/next?'));
    assert.ok(!JSON.stringify(firstBody).includes(apiKey));

    const nextResponse = await app.request(firstBody.next, {}, makeEnv(apiKey));
    assert.equal(nextResponse.status, 200);
    const nextBody = await nextResponse.json();
    assert.equal(nextBody.posts[0].uuid, 'article-2');
    assert.equal(nextBody.next, null);
  });

  assert.equal(calls.length, 4);
  assert.equal(calls[0].url.origin, API_ORIGIN);
  assert.equal(calls[0].url.pathname, '/v1/news');
  assert.equal(calls[0].url.searchParams.get('in_title'), 'first page');
  assert.equal(calls[0].url.searchParams.get('language'), 'en');
  assert.equal(calls[0].url.searchParams.get('order_by'), 'recent');
  assert.equal(calls[0].url.searchParams.has('ignored'), false);
  assert.equal(calls[0].headers['x-api-key'], apiKey);
  assert.equal(calls[1].url.pathname, '/v1/details');
  assert.equal(calls[1].headers['x-api-key'], apiKey);
  assert.equal(calls[2].url.searchParams.get('cursor'), 'cursor-next');
});

test('news routes reject next pages without a cursor and fail closed without an API key', async () => {
  let fetchCalled = false;
  const originalError = console.error;
  console.error = () => {};

  try {
    await withMockedFetch(async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    }, async () => {
      const missingKeyResponse = await app.request(
        '/api/news?language=en',
        {},
        { ALLOWED_ORIGINS: 'http://localhost:5173', WEBZ_TOKEN: 'legacy-key' },
      );
      assert.equal(missingKeyResponse.status, 500);
      assert.deepEqual(await missingKeyResponse.json(), { error: 'News service unavailable' });

      const invalidNextResponse = await app.request(
        '/api/news/next?next=https://untrusted.invalid',
        {},
        makeEnv('server-key'),
      );
      assert.equal(invalidNextResponse.status, 400);
      assert.deepEqual(await invalidNextResponse.json(), { error: 'Invalid next page' });
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(fetchCalled, false);
});

test('legacy news route still maps to FreeNewsApi', async () => {
  const apiKey = 'server-key';
  const calls = [];

  await withMockedFetch(async (input, options) => {
    const url = new URL(input);
    calls.push({ url, headers: options.headers });
    const body = url.pathname === '/v1/news'
      ? listResponse('legacy-article', false, null)
      : detailResponse(url.searchParams.get('uuid'));
    return new Response(JSON.stringify(body), { status: 200 });
  }, async () => {
    const response = await app.request(
      '/api/news/newsApiLite?in_title=legacy',
      {},
      makeEnv(apiKey),
    );
    assert.equal(response.status, 200);
  });

  assert.equal(calls[0].url.origin, API_ORIGIN);
  assert.equal(calls[0].url.pathname, '/v1/news');
  assert.equal(calls[0].url.searchParams.get('in_title'), 'legacy');
});

test('upstream errors keep their status and never reflect the FreeNewsApi key', async () => {
  const apiKey = 'key-to-redact';

  await withMockedFetch(async input => {
    const url = new URL(input);
    if (url.pathname === '/v1/news') {
      return new Response(JSON.stringify(listResponse('article-1', false, null)), { status: 200 });
    }
    return new Response(
      JSON.stringify({ error: 'Unauthorized', detail: apiKey }),
      { status: 401 },
    );
  }, async () => {
    const response = await app.request('/api/news?language=en', {}, makeEnv(apiKey));
    assert.equal(response.status, 401);
    const body = await response.text();
    assert.ok(!body.includes(apiKey));
    assert.ok(body.includes('[redacted]'));
  });
});
