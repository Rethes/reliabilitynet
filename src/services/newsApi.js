import { batchPredictReliability, markModelPending } from './reliabilityApi';
import { newsApiBase, newsApiOrigin, newsHealthUrl } from './apiConfig';

const DEFAULT_Q = '*';
const TARGET_ARTICLES = 10;
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
    const r = await fetch(newsHealthUrl, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function proxyFetch(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${newsApiBase}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function proxyFetchNext(nextPath) {
  const url = `${newsApiOrigin}${nextPath}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchNews(filters = {}, onProgress, onArticlesBatch) {
  const q = filters.search || DEFAULT_Q;
  const params = {
    q,
    size: BATCH_SIZE,
    highlight: false,
    sort: 'crawled',
    order: 'desc',
    webz_reporter: true,
    includeSyndicated: false,
    allowNewsHistory: false,
  };
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
