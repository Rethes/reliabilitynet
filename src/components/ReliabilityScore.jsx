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
  const color = getReliabilityColor(score);
  const metaLabel = article?.truthfulnessLabel ? ` (${article.truthfulnessLabel})` : '';
  const tooltip = `Logistic Regression Meta-Classifier Reliability: ${score}%${metaLabel}`;

  return (
    <div className={styles.wrap} title={tooltip}>
      <svg className={styles.ring} viewBox="0 0 36 36">
        <circle className={styles.ringBg} cx="18" cy="18" r="15.9" />
        <circle
          className={styles.ringFill}
          cx="18"
          cy="18"
          r="15.9"
          style={{
            stroke: color,
            strokeDasharray: `${score} ${100 - score}`,
          }}
        />
      </svg>
      <div className={styles.label}>
        <span className={styles.pct} style={{ color }}>{score}%</span>
        <span className={styles.txt}>Reliability</span>
      </div>
    </div>
  );
}
