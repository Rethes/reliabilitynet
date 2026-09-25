import React from 'react';
import styles from './SentimentBadge.module.css';

const map = {
  positive: { label: '↑ Positive', cls: styles.positive },
  negative: { label: '↓ Negative', cls: styles.negative },
  neutral: { label: '• Neutral', cls: styles.neutral },
};

function getSentimentMeta(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return map[normalized] ?? { label: normalized, cls: styles.neutral };
}

function getProbabilityLabel(sentiment, probs, confidence) {
  const normalized = String(sentiment || '').trim().toLowerCase();
  const probability = probs?.[normalized];
  const value = typeof probability === 'number' ? probability : confidence;
  return typeof value === 'number' ? ` (${(value * 100).toFixed(2)}%)` : '';
}

export default function SentimentBadge({ sentiment, apiSentiment, modelSentiment, confidence, probs }) {
  const apiValue = apiSentiment ?? sentiment ?? '';
  const modelValue = modelSentiment ?? sentiment ?? '';
  const apiMeta = getSentimentMeta(apiValue);
  const modelMeta = getSentimentMeta(modelValue);

  if (!apiMeta && !modelMeta) return null;

  const displayModel = modelMeta ?? apiMeta;
  const modelPctStr = getProbabilityLabel(modelValue, probs, confidence);

  let titleStr = [];
 
  if (modelValue) titleStr.push(`Model Sentiment: ${modelValue}`);
  if (apiValue) titleStr.push(`API Sentiment: ${apiValue}`);
  if (probs) {
    titleStr.push(`Positive: ${(Number(probs.positive || 0) * 100).toFixed(2)}%`);
    titleStr.push(`Neutral: ${(Number(probs.neutral || 0) * 100).toFixed(2)}%`);
    titleStr.push(`Negative: ${(Number(probs.negative || 0) * 100).toFixed(2)}%`);
  }

  return (
    <div className={styles.group} title={titleStr.join('\n')}>
      {/* {apiMeta && (
        <span className={`${styles.badge} ${apiMeta.cls}`}>
          API {apiMeta.label}{apiPctStr}
        </span>
      )} */}
      {modelMeta && (
        <span className={`${styles.badge} ${modelMeta.cls}`}>
          Sentiment: {displayModel.label}{modelPctStr}
        </span>
      )}
    </div>
  );
}
