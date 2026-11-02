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
  const probabilityKey = Object.keys(probs || {}).find(
    key => key.trim().toLowerCase() === normalized,
  );
  const probability = probabilityKey ? probs[probabilityKey] : null;
  const value = typeof probability === 'number' ? probability : confidence;
  return typeof value === 'number' ? ` (${formatProbability(value)})` : '';
}

function formatProbability(value) {
  const percentage = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percentage.toFixed(2)}%`;
}

export default function SentimentBadge({
  modelSentiment,
  confidence,
  probs,
  isPending,
}) {
  const modelValue = modelSentiment ?? null;
  const modelMeta = getSentimentMeta(modelValue);
  const modelPctStr = getProbabilityLabel(modelValue, probs, confidence);

  const modelTitle = [];
  if (modelValue) modelTitle.push(`Model Sentiment: ${modelValue}`);
  if (probs) {
    for (const label of ['positive', 'neutral', 'negative']) {
      if (typeof probs[label] === 'number') {
        modelTitle.push(`${label}: ${formatProbability(probs[label])}`);
      }
    }
  }
  return (
    <div className={styles.group}>
      <span
        className={`${styles.badge} ${modelMeta?.cls || styles.neutral}`}
        title={modelTitle.join('\n')}
      >
        Model: {isPending
          ? <span className="model-pending"><span className="model-pending-spinner" />Analyzing</span>
          : modelMeta ? `${modelMeta.label}${modelPctStr}` : 'Unavailable'}
          
      </span>

      {/*
        <button
          type="button"
          className={`${styles.badge} ${styles.apiBadge} ${getSentimentMeta(apiSentiment)?.cls || styles.neutral}`}
        >
          API: {apiSentiment || 'Unavailable'}
        </button>
      */}
    </div>
  );
}
