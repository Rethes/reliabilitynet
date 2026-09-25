const SENTIMENT_API = 'http://localhost:5001';
const ANALYSIS_BATCH_SIZE = 10;
import { attachModelSentiment } from './reliabilityApi.js';

export async function checkSentimentServer() {
  try {
    const res = await fetch(`${SENTIMENT_API}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Sends a batch of articles to the local RoBERTa Python model server
 * and attaches sentiment predictions to each article.
 */
export async function batchPredictSentiment(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return articles;

  try {
    const isAvailable = await checkSentimentServer();
    if (!isAvailable) {
      console.warn('[Sentiment API] Model server at http://localhost:5001 is offline. Skipping ML analysis.');
      return articles;
    }

    const enriched = [];

    for (let start = 0; start < articles.length; start += ANALYSIS_BATCH_SIZE) {
      const batch = articles.slice(start, start + ANALYSIS_BATCH_SIZE);
      const payload = batch.map(a => ({
        uuid: a.uuid || a.url,
        title: a.title || '',
        description: a.text || a.highlightText || a.thread?.title || ''
      }));

      try {
        const response = await fetch(`${SENTIMENT_API}/predict/sentiment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articles: payload }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          console.error(`[Sentiment API] HTTP error ${response.status}`);
          enriched.push(...batch);
          continue;
        }

        const data = await response.json();
        if (!data.success || !Array.isArray(data.predictions)) {
          enriched.push(...batch);
          continue;
        }

        const predictionsById = new Map(
          data.predictions
            .filter(prediction => prediction?.article_id !== undefined && prediction?.article_id !== null)
            .map(prediction => [String(prediction.article_id), prediction]),
        );

        enriched.push(...batch.map((article, idx) => {
          const articleId = article.uuid || article.url;
          const prediction = predictionsById.get(String(articleId)) || data.predictions[idx];
          return attachModelSentiment(article, prediction);
        }));
      } catch (err) {
        console.error('[Sentiment API] Failed to analyze batch:', err.message);
        enriched.push(...batch);
      }
    }

    return enriched;
  } catch (err) {
    console.error('[Sentiment API] Failed to analyze articles:', err.message);
    return articles;
  }
}

