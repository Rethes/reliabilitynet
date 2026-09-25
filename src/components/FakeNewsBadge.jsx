import React from 'react';
import styles from './FakeNewsBadge.module.css';
import { getFakeNewsLabel } from '../utils/helpers';

/**
 * FakeNewsBadge
 * Renders RoBERTa ML model fake news classification ("Fake News" vs "Real News")
 * with model confidence metrics.
 */
export default function FakeNewsBadge({ article }) {
  const label = getFakeNewsLabel(article);
  const isFake = label === 'Fake News';
  const confidence = article?.fakeNewsConfidence;
  const isMl = Boolean(article?.fakeNews || article?.modelFakeNews || confidence);

  const confPct = typeof confidence === 'number' ? (confidence * 100).toFixed(2) : null;
  const tooltipText = isMl
    ? `RoBERTa ML Model: ${label} (${confPct}% confidence)`
    : isFake ? 'Flagged as potential Fake News (heuristic)' : 'Likely Real News (heuristic)';

  return (
    <span
      className={`${styles.badge} ${isFake ? styles.fake : styles.real} ${isMl ? styles.mlBadge : ''}`}
      title={tooltipText}
    >
      {isFake ? '🚨 Fake News' : '✓ Real News'}
      {confPct !== null && (
        <span className={styles.confidence}>
          {confPct}%
        </span>
      )}
    </span>
  );
}
