import React from 'react';
import styles from './ReliabilityScore.module.css';
import { getReliabilityScore, getReliabilityColor } from '../utils/helpers';

/**
 * ReliabilityScore
 * Uses the Logistic Regression meta-classifier score when article enrichment
 * has completed, with the existing local fallback for unavailable predictions.
 */
export default function ReliabilityScore({ article }) {
  const score = getReliabilityScore(article);
  const available = score !== null;
  const pending = article?.modelAnalysisStatus === 'pending';
  const color = available ? getReliabilityColor(score) : 'var(--text3)';
  const probabilityDetails = Object.entries(article?.metaProbs || {})
    .filter(([, probability]) => typeof probability === 'number')
    .map(([label, probability]) => {
      const percent = Math.abs(probability) <= 1 ? probability * 100 : probability;
      return `${label}: ${percent.toFixed(2)}%`;
    });
  const tooltipLines = pending
    ? ['Reliability model is analyzing this article']
    : [
      `Reliability model: ${available ? `${score}%` : 'Unavailable'}`,
      `Truthfulness: ${article?.truthfulnessLabel || 'Unavailable'}`,
      ...probabilityDetails,
    ];
  const tooltip = tooltipLines.join('\n');

  return (
    <div className={styles.wrap} title={tooltip} aria-label={tooltip}>
      <svg className={styles.ring} viewBox="0 0 36 36">
        <circle className={styles.ringBg} cx="18" cy="18" r="15.9" />
        <circle
          className={styles.ringFill}
          cx="18"
          cy="18"
          r="15.9"
          style={{
            stroke: color,
            strokeDasharray: `${score ?? 0} ${100 - (score ?? 0)}`,
          }}
        />
      </svg>
      <div className={styles.label}>
        <span className={styles.pct} style={{ color }}>
          {pending ? <span className="model-pending"><span className="model-pending-spinner" />Analyzing</span> : available ? `${score}%` : 'Unavailable'}
        </span>
        <span className={styles.txt}>Reliability</span>
      </div>
    </div>
  );
}
