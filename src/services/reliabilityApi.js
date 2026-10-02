const RELIABILITY_API = 'http://localhost:5001';
const ANALYSIS_BATCH_SIZE = 10;

function withEmptyModelOutputs(article) {
  return {
    ...article,
    apiSentiment: article.apiSentiment ?? article.sentiment ?? null,
    sentiment: null,
    modelSentiment: null,
    sentimentConfidence: null,
    sentimentProbs: null,
    clickbait: null,
    modelClickbait: null,
    clickbaitConfidence: null,
    clickbaitProbs: null,
    isClickbait: null,
    reliabilityScore: null,
    truthfulnessLabel: null,
    metaProbs: null,
    reliabilityAvailable: false,
  };
}

export function attachModelSentiment(article, pred) {
  if (!article) return article;

  const updated = withEmptyModelOutputs(article);
  if (!pred) return updated;

  const sentimentPrediction = pred.sentiment && typeof pred.sentiment === 'object'
    ? pred.sentiment
    : pred;
  const sentimentLabel = typeof pred.sentiment === 'string'
    ? pred.sentiment
    : sentimentPrediction.label;

  if (sentimentLabel) {
    updated.modelSentiment = sentimentLabel;
    updated.sentiment = sentimentLabel;
    updated.sentimentConfidence = sentimentPrediction.confidence ?? null;
    updated.sentimentProbs = sentimentPrediction.probabilities ?? null;
  }

  return updated;
}

function attachModelReliability(article, pred) {
  if (!article) return article;

  const updated = { ...article };
  if (!pred) return updated;
  const clickbaitPrediction = pred.clickbait && typeof pred.clickbait === 'object'
    ? pred.clickbait
    : pred;
  const clickbaitLabel = typeof pred.clickbait === 'string'
    ? pred.clickbait
    : pred.modelClickbait || clickbaitPrediction.label;
  if (clickbaitLabel) {
    updated.clickbait = clickbaitLabel;
    updated.modelClickbait = clickbaitLabel;
    updated.clickbaitConfidence = clickbaitPrediction.confidence ?? pred.clickbaitConfidence ?? null;
    updated.clickbaitProbs = clickbaitPrediction.probabilities ?? pred.clickbaitProbs ?? null;
    updated.isClickbait = clickbaitLabel === 'Clickbait';
  }

  const reliabilityPrediction = pred.reliability && typeof pred.reliability === 'object'
    ? pred.reliability
    : pred;
  updated.reliabilityScore = typeof reliabilityPrediction.reliabilityScore === 'number'
    ? reliabilityPrediction.reliabilityScore
    : null;
  updated.truthfulnessLabel = reliabilityPrediction.truthfulnessLabel ?? null;
  updated.metaProbs = reliabilityPrediction.probabilities ?? pred.metaProbs ?? null;
  updated.reliabilityAvailable = reliabilityPrediction.available === true
    && updated.reliabilityScore !== null;

  return updated;
}

export async function batchPredictReliability(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return articles;

  try {
    const response = await fetch(`${RELIABILITY_API}/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok || (await response.json()).status !== 'healthy') {
      console.warn('[Reliability API] Model server is offline. Skipping reliability analysis.');
      return articles.map(withEmptyModelOutputs);
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
          enriched.push(...batch.map(withEmptyModelOutputs));
          continue;
        }

        const data = await predictionResponse.json();
        if (!data.success || !Array.isArray(data.predictions)) {
          enriched.push(...batch.map(withEmptyModelOutputs));
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
        enriched.push(...batch.map(withEmptyModelOutputs));
      }
    }

    return enriched;
  } catch (err) {
    console.error('[Reliability API] Failed to analyze articles:', err.message);
    return articles.map(withEmptyModelOutputs);
  }
}