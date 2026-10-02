import React from 'react';
import styles from './ClickbaitBadge.module.css';
import { getClickbaitLabel } from '../utils/helpers';

export default function ClickbaitBadge({ article }) {
  const label = getClickbaitLabel(article);
  const isPending = article?.modelAnalysisStatus === 'pending';
  const isAvailable = typeof label === 'string' && label.length > 0;
  const isClickbait = isAvailable && (label === 'Clickbait' || (/clickbait/i.test(label) && !/not/i.test(label)));
  const confidence = article?.clickbaitConfidence;
  const probabilities = article?.clickbaitProbs;
  const isMl = isAvailable;
  const confPct = typeof confidence === 'number' ? (confidence * 100).toFixed(2) : null;
  const tooltipLines = [isPending
    ? 'Clickbait model is analyzing this article'
    : isAvailable
    ? `RoBERTa ML Model: ${label}${confPct !== null ? ` (${confPct}% confidence)` : ''}`
    : 'Clickbait model: Unavailable'];

  if (typeof probabilities?.Clickbait === 'number') {
    tooltipLines.push(`Clickbait: ${(probabilities.Clickbait * 100).toFixed(2)}%`);
  }
  if (typeof probabilities?.['Not Clickbait'] === 'number') {
    tooltipLines.push(`Not Clickbait: ${(probabilities['Not Clickbait'] * 100).toFixed(2)}%`);
  }
  const tooltipText = tooltipLines.join('\n');

  return (
    <span
      className={`${styles.badge} ${isAvailable ? (isClickbait ? styles.yes : styles.no) : styles.unavailable} ${isMl ? styles.mlBadge : ''}`}
      title={tooltipText}
    >
      {isPending
        ? <>Clickbait: <span className="model-pending"><span className="model-pending-spinner" />Analyzing</span></>
        : isAvailable ? (isClickbait ? '⚠ Clickbait' : '✓ Not Clickbait') : 'Clickbait: Unavailable'}
      {isAvailable && confPct !== null && (
        <span className={styles.confidence}>{confPct}%</span>
      )}
    </span>
  );
}

