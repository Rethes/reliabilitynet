import React from 'react';
import styles from './SkeletonCard.module.css';

export default function SkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.img} />
      <div className={styles.body}>
        <div className={`${styles.line} ${styles.short}`} />
        <div className={`${styles.line} ${styles.medium}`} />
        <div className={styles.line} />
        <div className={`${styles.line} ${styles.short}`} />
      </div>
    </div>
  );
}
