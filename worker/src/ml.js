const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const ML_TIMEOUT_MS = 90_000;

const ENDPOINTS = new Map([
  ['GET /api/ml', '/'],
  ['GET /api/ml/', '/'],
  ['GET /api/ml/health', '/health'],
  ['GET /api/ml/predict/sentiment', '/predict/sentiment'],
  ['POST /api/ml/predict/sentiment', '/predict/sentiment'],
  ['POST /api/ml/predict/clickbait', '/predict/clickbait'],
  ['POST /api/ml/predict/reliability', '/predict/reliability'],
]);

const ENDPOINT_PATHS = new Set(
  [...ENDPOINTS.keys()].map(endpoint => endpoint.slice(endpoint.indexOf(' ') + 1)),
);

function getModelOrigin(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function readLimitedBody(request) {
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    await request.body?.cancel();
    return null;
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function relayML(c) {
  const method = c.req.method;
  const path = c.req.path;
  const upstreamPath = ENDPOINTS.get(`${method} ${path}`);

  if (!upstreamPath) {
    const status = ENDPOINT_PATHS.has(path) ? 405 : 404;
    return c.json({ error: status === 405 ? 'Method not allowed' : 'Not found' }, status);
  }

  const ipAddress = c.req.header('cf-connecting-ip');
  if (!ipAddress) {
    console.error('cf-connecting-ip is not available for ML rate limiting');
    return c.json({ error: 'Rate limiting unavailable' }, 503);
  }

  if (!c.env.ML_RATE_LIMITER) {
    console.error('ML_RATE_LIMITER is not configured');
    return c.json({ error: 'Model service unavailable' }, 503);
  }

  const { success } = await c.env.ML_RATE_LIMITER.limit({
    key: `reliabilitynet-ml:${ipAddress}`,
  });
  if (!success) return c.json({ error: 'Rate limit exceeded' }, 429);

  const modelOrigin = getModelOrigin(c.env.ML_ORIGIN);
  const apiKey = c.env.ML_API_KEY;
  if (!modelOrigin || !apiKey) {
    console.error('ML_ORIGIN or ML_API_KEY is not configured correctly');
    return c.json({ error: 'Model service unavailable' }, 503);
  }

  const headers = new Headers({ Accept: 'application/json', 'X-ML-Key': apiKey });
  if (method === 'POST') {
    const contentType = c.req.header('content-type') || '';
    const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/json' && !mediaType.endsWith('+json')) {
      return c.json({ error: 'Content-Type must be application/json' }, 415);
    }
    headers.set('Content-Type', contentType);
  }

  const body = method === 'POST' ? await readLimitedBody(c.req.raw) : undefined;
  if (body === null) return c.json({ error: 'Request body too large' }, 413);

  const target = new URL(upstreamPath, modelOrigin);
  target.search = new URL(c.req.url).search;

  let response;
  try {
    response = await fetch(target, {
      method,
      headers,
      body: method === 'POST' ? body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error('ML upstream request failed:', errorName);
    const detail = errorName === 'TimeoutError'
      ? 'Model request timed out'
      : 'Model service unavailable';
    return c.json({ error: 'Model service unavailable', detail }, 502);
  }

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get('content-type');
  if (responseContentType) responseHeaders.set('content-type', responseContentType);
  if ([204, 205, 304].includes(response.status)) {
    return new Response(null, { status: response.status, headers: responseHeaders });
  }
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
