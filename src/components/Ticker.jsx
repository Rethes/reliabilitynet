import React from 'react';
import styles from './Ticker.module.css';

export default function Ticker({ articles }) {
  if (!articles || articles.length === 0) return null;
  const titles = articles.slice(0, 10).map(a => a.title || '').filter(Boolean);
  if (!titles.length) return null;
  const doubled = [...titles, ...titles];

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>Breaking</div>
      <div className={styles.overflow}>
        <div className={styles.content}>
          {doubled.map((t, i) => (
            <span key={i} className={styles.item}>
              <span className={styles.sep}>◆</span> {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
