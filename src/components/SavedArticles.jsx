import React, { useState } from 'react';
import styles from './SavedArticles.module.css';
import ArticleCard from './ArticleCard';
import ArticleModal from './ArticleModal';
import { useAppContext } from '../context/AppContext';

export default function SavedArticles({ savedArticles }) {
  const [selectedArticle, setSelectedArticle] = useState(null);
  const { user, setShowLoginModal } = useAppContext();
  const articles = Object.values(savedArticles);

  // Guest: prompt to sign in
  if (!user) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🔐</div>
        <div className={styles.emptyTitle}>Sign in to save articles</div>
        <div className={styles.emptyMsg}>
          Create a free account to bookmark articles and access your reading list from anywhere.
        </div>
        <button className={styles.signInBtn} onClick={() => setShowLoginModal(true)}>
          Sign in or Register
        </button>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🔖</div>
        <div className={styles.emptyTitle}>No saved articles yet</div>
        <div className={styles.emptyMsg}>
          Tap the save icon on any article card to bookmark it here for later reading.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.label}>
          <span className={styles.count}>{articles.length}</span> saved article{articles.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className={styles.grid}>
        {articles.map((article, i) => (
          <ArticleCard
            key={article.uuid || article.url || i}
            article={article}
            index={i}
            onOpen={setSelectedArticle}
            isListView={false}
          />
        ))}
      </div>
      {selectedArticle && (
        <ArticleModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
    </div>
  );
}
