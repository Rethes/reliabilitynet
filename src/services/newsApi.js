import { batchPredictReliability } from './reliabilityApi';

const PROXY_BASE = 'http://localhost:3131';
const DEFAULT_Q = 'news';
const TARGET_ARTICLES = 100;
const BATCH_SIZE = 10;

export async function checkProxy() {
  try {
    const r = await fetch(`${PROXY_BASE}/ping`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function proxyFetch(apiKey, params = {}) {
  const qs = new URLSearchParams({ token: apiKey, ...params }).toString();
  const url = `${PROXY_BASE}/newsApiLite?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function proxyFetchNext(nextPath) {
  const url = `${PROXY_BASE}${nextPath}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchNews(apiKey, filters = {}, onProgress) {
  if (!apiKey) throw new Error('NO_API_KEY');

  const q = filters.search || DEFAULT_Q;
  const params = { q, size: BATCH_SIZE, highlight: false };
  if (filters.dateFrom) params.ts = new Date(filters.dateFrom).getTime();

  let collected = [];
  onProgress?.({ text: `Fetching articles… 0 / ${TARGET_ARTICLES}`, pct: 0 });

  let json = await proxyFetch(apiKey, params);
  if (!Array.isArray(json.posts)) return [];
  collected.push(...json.posts);
  onProgress?.({ text: `Fetching articles… ${collected.length} / ${TARGET_ARTICLES}`, pct: (collected.length / TARGET_ARTICLES) * 100 });

  while (collected.length < TARGET_ARTICLES && json.next && json.moreResultsAvailable > 0) {
    json = await proxyFetchNext(json.next);
    if (!Array.isArray(json.posts) || json.posts.length === 0) break;
    collected.push(...json.posts);
    const pct = Math.min((collected.length / TARGET_ARTICLES) * 100, 100);
    onProgress?.({ text: `Fetching articles… ${collected.length} / ${TARGET_ARTICLES}`, pct });
  }

  onProgress?.({ text: 'Running analysis…', pct: 95 });
  const enrichedArticles = await batchPredictReliability(collected);

  onProgress?.(null);
  return enrichedArticles;
}

