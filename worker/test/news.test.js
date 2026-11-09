import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import app from '../src/index.js';

const WEBZ_ORIGIN = 'https://api.webz.io';

async function withMockedFetch(mockFetch, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function makeEnv(token) {
  return {
    ALLOWED_ORIGINS: 'http://localhost:5173',
    WEBZ_TOKEN: token,
  };
}

test('news pagination keeps the Webz token server-side', async () => {
  const token = randomUUID();
  const clientToken = randomUUID();
  const calls = [];

  await withMockedFetch(async input => {
    const url = new URL(input);
    calls.push(url);
    const body = calls.length === 1
      ? {
          posts: [{ uuid: 'article-1' }],
          next: `${WEBZ_ORIGIN}/api/news?token=${encodeURIComponent(token)}&q=next-page`,
          more_results_available: 1,
        }
      : { posts: [{ uuid: 'article-2' }], next: null, more_results_available: 0 };
    return new Response(JSON.stringify(body), { status: 200 });
  }, async () => {
    const firstResponse = await app.request(
      `/api/news?q=first-page&size=1&token=${clientToken}&ignored=yes`,
      {},
      makeEnv(token),
    );
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.deepEqual(firstBody.posts, [{ uuid: 'article-1' }]);
    assert.equal(firstBody.more_results_available, 1);
    assert.ok(firstBody.next.startsWith('/api/news/next?'));
    assert.ok(!JSON.stringify(firstBody).includes(token));

    const nextResponse = await app.request(firstBody.next, {}, makeEnv(token));
    assert.equal(nextResponse.status, 200);
    assert.deepEqual((await nextResponse.json()).posts, [{ uuid: 'article-2' }]);
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].origin, WEBZ_ORIGIN);
  assert.equal(calls[0].pathname, '/api/news');
  assert.equal(calls[0].searchParams.get('token'), token);
  assert.equal(calls[0].searchParams.get('q'), 'first-page');
  assert.equal(calls[0].searchParams.get('sort'), 'crawled');
  assert.equal(calls[0].searchParams.get('order'), 'desc');
  assert.equal(calls[0].searchParams.get('webz_reporter'), 'true');
  assert.equal(calls[0].searchParams.get('includeSyndicated'), 'false');
  assert.equal(calls[0].searchParams.get('allowNewsHistory'), 'false');
  assert.equal(calls[0].searchParams.has('ignored'), false);
  assert.equal(calls[1].searchParams.get('token'), token);
  assert.equal(calls[1].searchParams.get('q'), 'next-page');
  assert.equal(calls[1].pathname, '/api/news');
});

test('news pagination rejects links outside the Webz API host', async () => {
  const token = randomUUID();
  let fetchCalled = false;

  await withMockedFetch(async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  }, async () => {
    const next = encodeURIComponent('https://untrusted.invalid/api/news?token=ignored');
    const response = await app.request(
      `/api/news/next?next=${next}`,
      {},
      makeEnv(token),
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid next page' });
  });

  assert.equal(fetchCalled, false);
});

test('legacy news route uses the current Webz API endpoint', async () => {
  const token = randomUUID();
  let upstreamURL;

  await withMockedFetch(async input => {
    upstreamURL = new URL(input);
    return new Response(JSON.stringify({ posts: [] }), { status: 200 });
  }, async () => {
    const response = await app.request(
      '/api/news/newsApiLite?q=legacy-client',
      {},
      makeEnv(token),
    );
    assert.equal(response.status, 200);
  });

  assert.equal(upstreamURL.origin, WEBZ_ORIGIN);
  assert.equal(upstreamURL.pathname, '/api/news');
  assert.equal(upstreamURL.searchParams.get('q'), 'legacy-client');
  assert.equal(upstreamURL.searchParams.get('token'), token);
});

test('news routes fail closed when WEBZ_TOKEN is missing', async () => {
  let fetchCalled = false;
  const originalError = console.error;
  console.error = () => {};

  try {
    await withMockedFetch(async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    }, async () => {
      const response = await app.request(
        '/api/news?q=test',
        {},
        { ALLOWED_ORIGINS: 'http://localhost:5173' },
      );
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'News service unavailable' });
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(fetchCalled, false);
});

test('upstream errors keep their status and never reflect the Webz token', async () => {
  const token = randomUUID();

  await withMockedFetch(async () => new Response(
    JSON.stringify({ error: 'Unauthorized', detail: token }),
    { status: 401 },
  ), async () => {
    const response = await app.request(
      '/api/news?q=test',
      {},
      makeEnv(token),
    );
    assert.equal(response.status, 401);
    const body = await response.text();
    assert.ok(!body.includes(token));
    assert.ok(body.includes('[redacted]'));
  });
});
