import { batchPredictReliability, markModelPending } from './reliabilityApi';
import { newsApiBase, newsApiOrigin, newsHealthUrl } from './apiConfig';

const DEFAULT_Q = '*';
const TARGET_ARTICLES = 10;

function isEnglishArticle(article) {
  const language = String(article?.language || '').trim().toLowerCase();
  return language === 'english'
    || language === 'en'
    || language === 'eng'
    || language.startsWith('en-');
}

export async function checkProxy() {
  try {
    const r = await fetch(newsHealthUrl, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function proxyFetch(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${newsApiBase}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const error = new Error(body?.error || `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function proxyFetchNext(nextPath) {
  const url = `${newsApiOrigin}${nextPath}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const error = new Error(body?.error || `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function fetchNews(filters = {}, onProgress, onArticlesBatch) {
  const search = filters.search?.trim();
  const params = {
    language: 'en',
    order_by: 'recent',
  };
  if (search && search !== DEFAULT_Q) params.in_title = search;
  if (filters.dateFrom) {
    params.published_after = new Date(`${filters.dateFrom}T00:00:00`).toISOString();
  }
  if (filters.dateTo) {
    params.published_before = new Date(`${filters.dateTo}T23:59:59.999`).toISOString();
  }

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

  let json = await proxyFetch(params);
  if (!Array.isArray(json.posts)) return [];
  const englishPosts = json.posts.filter(isEnglishArticle);
  collected.push(...englishPosts);
  queueAnalysis(englishPosts);
  onProgress?.({ text: `Fetching articles… ${collected.length} / ${TARGET_ARTICLES}`, pct: (collected.length / TARGET_ARTICLES) * 100 });

  const hasMoreResults = () => (
    (json.more_results_available ?? json.moreResultsAvailable ?? 0) > 0
  );
  while (collected.length < TARGET_ARTICLES && json.next && hasMoreResults()) {
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
