import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/index.js';

const MODEL_ORIGIN = 'https://models.example.test';
const CLIENT_IP = '203.0.113.7';
const ML_API_KEY = 'test-ml-api-key';

function makeEnv(overrides = {}) {
  return {
    ALLOWED_ORIGINS: 'http://localhost:5173',
    ML_API_KEY,
    ML_ORIGIN: MODEL_ORIGIN,
    ML_RATE_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    ...overrides,
  };
}

function makeRequestHeaders(overrides = {}) {
  return {
    'cf-connecting-ip': CLIENT_IP,
    ...overrides,
  };
}

async function withMockedFetch(mockFetch, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('ML relay forwards only the allowlisted route, JSON body, and server-side key', async () => {
  const upstreamBody = JSON.stringify({ success: true, predictions: [] });
  let upstreamRequest;

  await withMockedFetch(async (input, init) => {
    upstreamRequest = { url: new URL(input), init };
    return new Response(upstreamBody, {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }, async () => {
    const response = await app.request(
      '/api/ml/predict/reliability?source=test',
      {
        method: 'POST',
        headers: makeRequestHeaders({
          Authorization: 'Bearer browser-token',
          Cookie: 'session=browser-cookie',
          'Content-Type': 'application/json',
          'X-ML-Key': 'browser-supplied-key',
        }),
        body: JSON.stringify({ articles: [{ title: 'A test article' }] }),
      },
      makeEnv(),
    );

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(await response.text(), upstreamBody);
  });

  assert.equal(upstreamRequest.url.origin, MODEL_ORIGIN);
  assert.equal(upstreamRequest.url.pathname, '/predict/reliability');
  assert.equal(upstreamRequest.url.search, '?source=test');
  assert.equal(upstreamRequest.init.method, 'POST');
  assert.equal(
    upstreamRequest.init.headers.get('X-ML-Key'),
    ML_API_KEY,
  );
  assert.equal(upstreamRequest.init.headers.get('Authorization'), null);
  assert.equal(upstreamRequest.init.headers.get('Cookie'), null);
  assert.equal(
    upstreamRequest.init.headers.get('Content-Type'),
    'application/json',
  );
  assert.equal(
    new TextDecoder().decode(upstreamRequest.init.body),
    JSON.stringify({ articles: [{ title: 'A test article' }] }),
  );
  assert.equal(upstreamRequest.init.redirect, 'manual');
  assert.ok(upstreamRequest.init.signal);
});

test('ML relay applies the configured IP limit before calling the model', async () => {
  const limitedKeys = [];
  let upstreamCalled = false;
  const env = makeEnv({
    ML_RATE_LIMITER: {
      async limit({ key }) {
        limitedKeys.push(key);
        return { success: false };
      },
    },
  });

  await withMockedFetch(async () => {
    upstreamCalled = true;
    return new Response('{}');
  }, async () => {
    const response = await app.request(
      '/api/ml/health',
      { headers: makeRequestHeaders() },
      env,
    );
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'Rate limit exceeded' });
  });

  assert.deepEqual(limitedKeys, [`reliabilitynet-ml:${CLIENT_IP}`]);
  assert.equal(upstreamCalled, false);
});

test('ML relay rejects requests without a Cloudflare client IP', async () => {
  let limiterCalled = false;
  const env = makeEnv({
    ML_RATE_LIMITER: {
      async limit() {
        limiterCalled = true;
        return { success: true };
      },
    },
  });
  const originalError = console.error;
  console.error = () => {};

  try {
    const response = await app.request('/api/ml/health', {}, env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Rate limiting unavailable' });
  } finally {
    console.error = originalError;
  }

  assert.equal(limiterCalled, false);
});

test('ML relay rejects oversized request bodies before forwarding', async () => {
  let upstreamCalled = false;
  const body = JSON.stringify({ text: 'a'.repeat(1024 * 1024) });

  await withMockedFetch(async () => {
    upstreamCalled = true;
    return new Response('{}');
  }, async () => {
    const response = await app.request(
      '/api/ml/predict/reliability',
      {
        method: 'POST',
        headers: makeRequestHeaders({ 'Content-Type': 'application/json' }),
        body,
      },
      makeEnv(),
    );
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Request body too large' });
  });

  assert.equal(upstreamCalled, false);
});

test('ML relay rejects non-JSON requests and unknown model routes', async () => {
  let upstreamCalled = false;

  await withMockedFetch(async () => {
    upstreamCalled = true;
    return new Response('{}');
  }, async () => {
    const unsupportedBody = await app.request(
      '/api/ml/predict/reliability',
      {
        method: 'POST',
        headers: makeRequestHeaders({ 'Content-Type': 'text/plain' }),
        body: 'not json',
      },
      makeEnv(),
    );
    assert.equal(unsupportedBody.status, 415);

    const unsupportedRoute = await app.request(
      '/api/ml/admin',
      { headers: makeRequestHeaders() },
      makeEnv(),
    );
    assert.equal(unsupportedRoute.status, 404);
  });

  assert.equal(upstreamCalled, false);
});

test('ML relay fails closed when origin or API key is missing', async () => {
  const originalError = console.error;
  console.error = () => {};

  try {
    for (const overrides of [{ ML_ORIGIN: '' }, { ML_API_KEY: '' }]) {
      const response = await app.request(
        '/api/ml/health',
        { headers: makeRequestHeaders() },
        makeEnv(overrides),
      );
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'Model service unavailable' });
    }
  } finally {
    console.error = originalError;
  }
});

test('ML relay preserves upstream error status and body', async () => {
  const upstreamBody = JSON.stringify({ error: 'Invalid article payload' });

  await withMockedFetch(async () => new Response(upstreamBody, {
    status: 400,
    headers: { 'content-type': 'application/json' },
  }), async () => {
    const response = await app.request(
      '/api/ml/predict/reliability',
      {
        method: 'POST',
        headers: makeRequestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ articles: [] }),
      },
      makeEnv(),
    );
    assert.equal(response.status, 400);
    assert.equal(await response.text(), upstreamBody);
  });
});
