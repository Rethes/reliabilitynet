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

export default function SentimentBadge({ modelSentiment, confidence, probs }) {
  const modelValue = modelSentiment ?? null;
  const modelMeta = getSentimentMeta(modelValue);
  const modelPctStr = getProbabilityLabel(modelValue, probs, confidence);

  const titleStr = [];
  if (modelValue) titleStr.push(`Model Sentiment: ${modelValue}`);
  if (probs) {
    for (const label of ['positive', 'neutral', 'negative']) {
      if (typeof probs[label] === 'number') {
        titleStr.push(`${label}: ${(probs[label] * 100).toFixed(2)}%`);
      }
    }
  }

  return (
    <div className={styles.group} title={titleStr.join('\n')}>
      <span className={`${styles.badge} ${modelMeta?.cls || styles.neutral}`}>
        Sentiment: {modelMeta ? `${modelMeta.label}${modelPctStr}` : 'Unavailable'}
      </span>
    </div>
  );
}
