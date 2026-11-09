import assert from 'node:assert/strict';
import test from 'node:test';
import { createProxyServer } from '../proxy-server.js';

const WEBZ_ORIGIN = 'https://api.webz.io';
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

test('local proxy keeps Webz credentials server-side and rewrites pagination links', async t => {
  const token = 'server-only-token';
  const calls = [];
  const responses = [
    {
      posts: [{ uuid: 'article-1' }],
      next: `${WEBZ_ORIGIN}/api/news?token=${token}&q=next-page`,
    },
    { posts: [{ uuid: 'article-2' }], next: null },
  ];
  const proxy = await startProxy({
    token,
    fetchImpl: async input => {
      const url = new URL(input);
      calls.push(url);
      return new Response(JSON.stringify(responses[calls.length - 1]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  t.after(proxy.close);

  const firstResponse = await fetch(
    `${proxy.baseURL}/api/news?q=first-page&size=1&token=client-token&ignored=yes`,
    { headers: { Origin: ALLOWED_ORIGIN } },
  );
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
  const firstBody = await firstResponse.json();
  assert.equal(firstBody.posts[0].uuid, 'article-1');
  assert.ok(firstBody.next.startsWith('/api/news/next?'));
  assert.ok(!JSON.stringify(firstBody).includes(token));

  const secondResponse = await fetch(`${proxy.baseURL}${firstBody.next}`);
  assert.equal(secondResponse.status, 200);
  assert.equal((await secondResponse.json()).posts[0].uuid, 'article-2');

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

test('local proxy fails closed without a token and restricts CORS', async t => {
  let upstreamCalled = false;
  const proxy = await startProxy({
    token: '',
    fetchImpl: async () => {
      upstreamCalled = true;
      return new Response('{}');
    },
  });
  t.after(proxy.close);

  const newsResponse = await fetch(`${proxy.baseURL}/api/news?q=test`);
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

test('local proxy maps the legacy route to the current Webz API endpoint', async t => {
  let upstreamURL;
  const proxy = await startProxy({
    token: 'server-only-token',
    fetchImpl: async input => {
      upstreamURL = new URL(input);
      return new Response(JSON.stringify({ posts: [] }), { status: 200 });
    },
  });
  t.after(proxy.close);

  const response = await fetch(`${proxy.baseURL}/api/news/newsApiLite?q=legacy-client`);
  assert.equal(response.status, 200);
  assert.equal(upstreamURL.origin, WEBZ_ORIGIN);
  assert.equal(upstreamURL.pathname, '/api/news');
  assert.equal(upstreamURL.searchParams.get('q'), 'legacy-client');
});

test('local proxy rejects pagination URLs outside Webz', async t => {
  let upstreamCalled = false;
  const proxy = await startProxy({
    token: 'server-only-token',
    fetchImpl: async () => {
      upstreamCalled = true;
      return new Response('{}');
    },
  });
  t.after(proxy.close);

  const next = encodeURIComponent('https://untrusted.example/api/news?token=client-token');
  const response = await fetch(`${proxy.baseURL}/api/news/next?next=${next}`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid next page' });
  assert.equal(upstreamCalled, false);
});
