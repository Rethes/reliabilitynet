import React from 'react';
import styles from './ClickbaitBadge.module.css';
import { getClickbaitLabel } from '../utils/helpers';

export default function ClickbaitBadge({ article }) {
  const label = getClickbaitLabel(article);
  const isClickbait = label === 'Clickbait' || (/clickbait/i.test(label) && !/not/i.test(label));
  const confidence = article?.clickbaitConfidence;
  const isMl = Boolean(article?.clickbait || article?.modelClickbait || confidence);
  const confPct = typeof confidence === 'number' ? (confidence * 100).toFixed(2) : null;
  const tooltipText = isMl
    ? `RoBERTa ML Model: ${label}${confPct !== null ? ` (${confPct}% confidence)` : ''}`
    : isClickbait ? 'Flagged as potential clickbait (heuristic)' : 'Likely not clickbait (heuristic)';

  return (
    <span
      className={`${styles.badge} ${isClickbait ? styles.yes : styles.no} ${isMl ? styles.mlBadge : ''}`}
      title={tooltipText}
    >
      {isClickbait ? '⚠ Clickbait' : '✓ Not Clickbait'}
      {confPct !== null && (
        <span className={styles.confidence}>{confPct}%</span>
      )}
    </span>
  );
}

