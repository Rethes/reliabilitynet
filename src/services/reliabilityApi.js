const RELIABILITY_API = 'http://localhost:5001';
const ANALYSIS_BATCH_SIZE = 10;

export function attachModelSentiment(article, pred) {
  if (!article || !pred) return article;

  const apiSentiment = article.apiSentiment ?? article.sentiment ?? '';
  const updated = { ...article };
  const sentimentPrediction = pred.sentiment && typeof pred.sentiment === 'object'
    ? pred.sentiment
    : pred;
  const sentimentLabel = typeof pred.sentiment === 'string'
    ? pred.sentiment
    : sentimentPrediction.label;

  if (sentimentLabel) {
    updated.apiSentiment = apiSentiment;
    updated.modelSentiment = sentimentLabel;
    updated.sentiment = sentimentLabel;
    updated.sentimentConfidence = sentimentPrediction.confidence;
    updated.sentimentProbs = sentimentPrediction.probabilities;
  }

  return updated;
}

function attachModelReliability(article, pred) {
  if (!article || !pred) return article;

  const updated = { ...article };
  const fakeNewsPrediction = pred.fakeNews && typeof pred.fakeNews === 'object'
    ? pred.fakeNews
    : pred;
  const fakeNewsLabel = typeof pred.fakeNews === 'string'
    ? pred.fakeNews
    : fakeNewsPrediction.label;
  if (fakeNewsLabel) {
    updated.fakeNews = fakeNewsLabel;
    updated.modelFakeNews = fakeNewsLabel;
    updated.fakeNewsConfidence = fakeNewsPrediction.confidence ?? pred.fakeNewsConfidence;
    updated.fakeNewsProbs = fakeNewsPrediction.probabilities ?? pred.fakeNewsProbs;
    updated.isFakeNews = fakeNewsLabel === 'Fake News';
  }

  const clickbaitPrediction = pred.clickbait && typeof pred.clickbait === 'object'
    ? pred.clickbait
    : pred;
  const clickbaitLabel = typeof pred.clickbait === 'string'
    ? pred.clickbait
    : pred.modelClickbait || clickbaitPrediction.label;
  if (clickbaitLabel) {
    updated.clickbait = clickbaitLabel;
    updated.modelClickbait = clickbaitLabel;
    updated.clickbaitConfidence = clickbaitPrediction.confidence ?? pred.clickbaitConfidence;
    updated.clickbaitProbs = clickbaitPrediction.probabilities ?? pred.clickbaitProbs;
    updated.isClickbait = clickbaitLabel === 'Clickbait';
  }

  const reliabilityPrediction = pred.reliability && typeof pred.reliability === 'object'
    ? pred.reliability
    : pred;
  if (typeof reliabilityPrediction.reliabilityScore === 'number') {
    updated.reliabilityScore = reliabilityPrediction.reliabilityScore;
    updated.truthfulnessLabel = reliabilityPrediction.truthfulnessLabel;
    updated.metaProbs = reliabilityPrediction.probabilities ?? pred.metaProbs;
  }

  return updated;
}

export async function batchPredictReliability(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return articles;

  try {
    const response = await fetch(`${RELIABILITY_API}/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok || (await response.json()).status !== 'healthy') {
      console.warn('[Reliability API] Model server is offline. Skipping reliability analysis.');
      return articles;
    }

    const enriched = [];
    for (let start = 0; start < articles.length; start += ANALYSIS_BATCH_SIZE) {
      const batch = articles.slice(start, start + ANALYSIS_BATCH_SIZE);
      const payload = batch.map(article => ({
        uuid: article.uuid || article.url,
        title: article.title || '',
        description: article.text || article.highlightText || article.thread?.title || '',
      }));

      try {
        const predictionResponse = await fetch(`${RELIABILITY_API}/predict/reliability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articles: payload }),
          signal: AbortSignal.timeout(60000),
        });

        if (!predictionResponse.ok) {
          console.error(`[Reliability API] HTTP error ${predictionResponse.status}`);
          enriched.push(...batch);
          continue;
        }

        const data = await predictionResponse.json();
        if (!data.success || !Array.isArray(data.predictions)) {
          enriched.push(...batch);
          continue;
        }

        const predictionsById = new Map(
          data.predictions
            .filter(prediction => prediction?.article_id !== undefined && prediction?.article_id !== null)
            .map(prediction => [String(prediction.article_id), prediction]),
        );

        enriched.push(...batch.map((article, index) => {
          const articleId = article.uuid || article.url;
          const prediction = predictionsById.get(String(articleId)) || data.predictions[index];
          return attachModelReliability(attachModelSentiment(article, prediction), prediction);
        }));
      } catch (err) {
        console.error('[Reliability API] Failed to analyze batch:', err.message);
        enriched.push(...batch);
      }
    }

    return enriched;
  } catch (err) {
    console.error('[Reliability API] Failed to analyze articles:', err.message);
    return articles;
  }
}