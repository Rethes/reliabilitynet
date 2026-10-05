import { batchPredictReliability, markModelPending } from './reliabilityApi';

const PROXY_BASE = 'http://localhost:3131';
const DEFAULT_Q = 'news';
const TARGET_ARTICLES = 100;
const BATCH_SIZE = 10;

function isEnglishArticle(article) {
  const language = String(article?.language || '').trim().toLowerCase();
  return language === 'english'
    || language === 'en'
    || language === 'eng'
    || language.startsWith('en-');
}

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

export async function fetchNews(apiKey, filters = {}, onProgress, onArticlesBatch) {
  if (!apiKey) throw new Error('NO_API_KEY');

  const q = filters.search || DEFAULT_Q;
  const params = { q, size: BATCH_SIZE, highlight: false };
  if (filters.dateFrom) params.ts = new Date(filters.dateFrom).getTime();

  let collected = [];
  let analyzedArticles = [];
  let analyzedCount = 0;
  let analysisQueue = Promise.resolve();
  onProgress?.({ text: `Fetching articles… 0 / ${TARGET_ARTICLES}`, pct: 0 });

  const queueAnalysis = (posts) => {
    onArticlesBatch?.(posts.map(markModelPending));
    analysisQueue = analysisQueue.then(async () => {
      const predictions = await batchPredictReliability(posts);
      const completedBatch = predictions.map(article => ({
        ...article,
        modelAnalysisStatus: 'complete',
      }));
      analyzedArticles.push(...completedBatch);
      analyzedCount += completedBatch.length;
      onArticlesBatch?.(completedBatch);
      onProgress?.({
        text: `Analyzed ${analyzedCount} of ${collected.length} fetched articles`,
        pct: 95,
      });
    });
  };

  let json = await proxyFetch(apiKey, params);
  if (!Array.isArray(json.posts)) return [];
  const englishPosts = json.posts.filter(isEnglishArticle);
  collected.push(...englishPosts);
  queueAnalysis(englishPosts);
  onProgress?.({ text: `Fetching articles… ${collected.length} / ${TARGET_ARTICLES}`, pct: (collected.length / TARGET_ARTICLES) * 100 });

  while (collected.length < TARGET_ARTICLES && json.next && json.moreResultsAvailable > 0) {
    json = await proxyFetchNext(json.next);
    if (!Array.isArray(json.posts) || json.posts.length === 0) break;
    const englishPage = json.posts.filter(isEnglishArticle);
    collected.push(...englishPage);
    queueAnalysis(englishPage);
    const pct = Math.min((collected.length / TARGET_ARTICLES) * 100, 100);
    onProgress?.({ text: `Fetching articles… ${collected.length} / ${TARGET_ARTICLES}`, pct });
  }

  onProgress?.({ text: `Analyzing ${analyzedCount} of ${collected.length} articles…`, pct: 95 });
  await analysisQueue;

  onProgress?.(null);
  return analyzedArticles;
}

