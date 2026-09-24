import React, { useState } from 'react';
import styles from './ArticleCard.module.css';
import ReliabilityScore from './ReliabilityScore';
import FakeNewsBadge from './FakeNewsBadge';
import ClickbaitBadge from './ClickbaitBadge';
import SentimentBadge from './SentimentBadge';
import { useAppContext } from '../context/AppContext';
import { getSourceName, getSourceColour, getTimeAgo, getPublished } from '../utils/helpers';

export default function ArticleCard({ article, index, onOpen, isListView, selectedCategory }) {
  const { state, dispatch, toggleSave } = useAppContext();
  const [imgError, setImgError] = useState(false);

  const id = article.uuid || article.url;
  const src = getSourceName(article);
  const colour = getSourceColour(src);
  const timeAgo = getTimeAgo(getPublished(article));
  const cats = Array.isArray(article.categories) ? article.categories : [];
  const normalizedSelectedCategory = (selectedCategory || '').trim().toLowerCase();
  const matchingCategory = cats.find(cat => (
    typeof cat === 'string' && cat.trim().toLowerCase() === normalizedSelectedCategory
  ));
  const category = matchingCategory ? selectedCategory : cats[0] || '';
  const img = article.thread?.main_image || '';
  const sentiment = article.modelSentiment || article.sentiment || '';

  const reaction = state.reactions[id] || { likes: 0, dislikes: 0, userReaction: null };
  const isSaved = !!state.savedArticles[id];

  const handleReact = (e, type) => {
    e.stopPropagation();
    dispatch({ type: 'REACT', articleId: id, reaction: type });
  };

  const handleSave = (e) => {
    e.stopPropagation();
    toggleSave(article);
  };

  const sentimentColor = sentiment === 'positive'
    ? 'var(--green)' : sentiment === 'negative'
      ? 'var(--red)' : 'var(--text3)';

  return (
    <article
      className={`${styles.card} ${isListView ? styles.listCard : ''}`}
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={() => onOpen(article)}
    >
      {/* Image */}
      {img && !imgError ? (
        <img
          className={styles.image}
          src={img}
          alt=""
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={styles.placeholder}
          style={{ background: `${colour}22`, borderBottom: `3px solid ${colour}` }}
        >
          <span style={{ color: colour }}>{src.charAt(0).toUpperCase()}</span>
        </div>
      )}

      <div className={styles.body}>
        {/* Meta row */}
        <div className={styles.meta}>
          <span className={styles.sourceBadge} style={{ background: colour }}>
            {src}
          </span>
          {category && <span className={styles.catBadge}>{category}</span>}
          <span className={styles.timeBadge}>{timeAgo}</span>
        </div>

        {/* Reliability + Sentiment + Fake News row */}
        <div className={styles.signalsContainer}>
          <div className={styles.signalsRow}>
            <ReliabilityScore article={article} />
          </div>
          <div className={styles.signalsRow}>
            <SentimentBadge
              sentiment={sentiment}
              apiSentiment={article.apiSentiment}
              modelSentiment={article.modelSentiment || article.sentiment}
              confidence={article.sentimentConfidence}
              probs={article.sentimentProbs}
            />
            <FakeNewsBadge article={article} />
            <ClickbaitBadge article={article} />
          </div>
        </div>

        {/* Title */}
        <div className={styles.title}>{article.title || 'Untitled'}</div>

        {/* Footer */}
        <div className={styles.footer}>
          {article.author && (
            <div className={styles.authorChip}>
              <div className={styles.authorAvatar}>{article.author.charAt(0).toUpperCase()}</div>
              <span className={styles.authorName}>{article.author}</span>
            </div>
          )}
          <div className={styles.actions}>
            {/* Like */}
            {/* <button
              className={`${styles.actionBtn} ${reaction.userReaction === 'like' ? styles.liked : ''}`}
              onClick={e => handleReact(e, 'like')}
              title="Like"
            >
              <span className={styles.actionIcon}>👍</span>
              {reaction.likes > 0 && <span className={styles.actionCount}>{reaction.likes}</span>}
            </button> */}
            {/* Dislike */}
            {/* <button
              className={`${styles.actionBtn} ${reaction.userReaction === 'dislike' ? styles.disliked : ''}`}
              onClick={e => handleReact(e, 'dislike')}
              title="Dislike"
            >
              <span className={styles.actionIcon}>👎</span>
              {reaction.dislikes > 0 && <span className={styles.actionCount}>{reaction.dislikes}</span>}
            </button> */}
            {/* Save */}
            <button
              className={`${styles.actionBtn} ${isSaved ? styles.saved : ''}`}
              onClick={handleSave}
              title={isSaved ? 'Unsave' : 'Save article'}
            >
              {isSaved
  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z"/></svg>
  : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z"/></svg>
}
            </button>
            <span className={styles.readLink}>Details →</span>
          </div>
        </div>
      </div>
    </article>
  );
}
