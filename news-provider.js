const API_ORIGIN = 'https://api.freenewsapi.io';
const NEWS_PATH = '/v1/news';
const REQUEST_INTERVAL_MS = 750;
const MAX_RETRY_AFTER_MS = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ARTICLE_TEXT_LENGTH = 4_000;
const NEWS_QUERY_PARAMS = [
  'in_title',
  'published_after',
  'published_before',
  'language',
  'country',
  'topic',
  'order_by',
  'cursor',
];

let requestQueue = Promise.resolve();
let lastRequestAt = 0;

export function buildNewsURL(params = new URLSearchParams()) {
  const url = new URL(NEWS_PATH, API_ORIGIN);
  for (const name of NEWS_QUERY_PARAMS) {
    const value = params.get(name);
    if (value) url.searchParams.set(name, value);
  }
  return url;
}

function buildDetailsURL(uuid) {
  const url = new URL('/v1/details', API_ORIGIN);
  url.searchParams.set('uuid', uuid);
  return url;
}

function fetchProvider(url, apiKey, fetchImpl) {
  const request = requestQueue.then(async () => {
    const send = async () => {
      const wait = REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
      if (lastRequestAt && wait > 0) {
        await new Promise(resolve => setTimeout(resolve, wait));
      }
      lastRequestAt = Date.now();
      return fetchImpl(url, {
        headers: {
          'User-Agent': 'ReliabilityNet news proxy',
          Accept: 'application/json',
          'x-api-key': apiKey,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    };

    let response = await send();
    if (response.status === 429) {
      const retryBody = await response.clone().json().catch(() => null);
      const retryAfter = retryBody?.retry_after_ms;
      if (
        typeof retryAfter === 'number'
        && Number.isFinite(retryAfter)
        && retryAfter >= 0
        && retryAfter <= MAX_RETRY_AFTER_MS
      ) {
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        response = await send();
      }
    }
    return response;
  });
  requestQueue = request.then(() => undefined, () => undefined);
  return request;
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

async function readJSON(response) {
  try {
    return JSON.parse(await response.text());
  } catch {
    return null;
  }
}

function toArticle(article) {
  const { body: articleBody, ...metadata } = article;
  const published = article.published_at || '';
  const publisher = article.publisher || '';
  const body = articleBody || '';
  const incipit = article.incipit || '';
  return {
    ...metadata,
    url: article.original_url || '',
    text: (body || incipit).slice(0, MAX_ARTICLE_TEXT_LENGTH),
    highlightText: (incipit || body).slice(0, MAX_ARTICLE_TEXT_LENGTH),
    published,
    author: Array.isArray(article.authors) ? article.authors.join(', ') : '',
    language: Array.isArray(article.languages) ? article.languages[0] || '' : '',
    categories: Array.isArray(article.topics) ? article.topics : [],
    thread: {
      site: publisher,
      published,
      main_image: article.thumbnail || '',
    },
  };
}

export async function fetchNewsPage(url, apiKey, fetchImpl = fetch) {
  const listResponse = await fetchProvider(url, apiKey, fetchImpl);
  const listBody = await readJSON(listResponse);
  if (!listResponse.ok) {
    return {
      status: listResponse.status,
      body: listBody ? redactSecret(listBody, apiKey) : { error: 'Invalid upstream response' },
    };
  }
  if (!listBody || !Array.isArray(listBody.data) || !listBody.meta) {
    return { status: listResponse.status, body: { error: 'Invalid upstream response' } };
  }

  const detailResults = await Promise.all(listBody.data.map(async item => {
    if (typeof item?.uuid !== 'string' || !item.uuid) {
      return { status: 502, body: { error: 'Invalid upstream article' } };
    }
    const response = await fetchProvider(buildDetailsURL(item.uuid), apiKey, fetchImpl);
    const body = await readJSON(response);
    if (!response.ok) {
      return {
        status: response.status,
        body: body ? redactSecret(body, apiKey) : { error: 'Invalid upstream response' },
      };
    }
    if (!body?.data || typeof body.data !== 'object') {
      return { status: response.status, body: { error: 'Invalid upstream response' } };
    }
    return { status: response.status, article: toArticle(body.data) };
  }));
  const failedResult = detailResults.find(result => !result.article);
  if (failedResult) return { status: failedResult.status, body: failedResult.body };

  let next = null;
  if (listBody.meta.has_more && typeof listBody.meta.next_cursor === 'string') {
    const nextParams = new URLSearchParams(url.searchParams);
    nextParams.set('cursor', listBody.meta.next_cursor);
    next = `/api/news/next?${nextParams}`;
  }
  return {
    status: listResponse.status,
    body: {
      posts: detailResults.map(result => result.article),
      next,
      more_results_available: listBody.meta.has_more ? 1 : 0,
    },
  };
}
