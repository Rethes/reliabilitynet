import React, { useEffect, useState } from 'react';
import styles from './ArticleModal.module.css';
import ReliabilityScore from './ReliabilityScore';
import FakeNewsBadge from './FakeNewsBadge';
import ClickbaitBadge from './ClickbaitBadge';
import SentimentBadge from './SentimentBadge';
import { useAppContext } from '../context/AppContext';
import { getSourceName, getSourceColour, getPublished, formatDate } from '../utils/helpers';

export default function ArticleModal({ article, onClose }) {
  const { state, dispatch, toggleSave } = useAppContext();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!article) return null;

  const id = article.uuid || article.url;
  const src = getSourceName(article);
  const colour = getSourceColour(src);
  const cats = Array.isArray(article.categories) ? article.categories : [];
  const img = article.thread?.main_image || '';
  const snippet = article.highlightText ? article.highlightText.replace(/<[^>]+>/g, '') : '';
  const isSaved = !!state.savedArticles[id];
  const reaction = state.reactions[id] || { likes: 0, dislikes: 0, userReaction: null };

  const handleReact = (type) => dispatch({ type: 'REACT', articleId: id, reaction: type });
  const handleSave = () => toggleSave(article);

  const metaFields = [
    { label: 'Published', value: formatDate(getPublished(article)) },
    { label: 'Publisher', value: src },
    { label: 'Author', value: article.author || '' },
  ].filter(f => f.value);

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.sourceBadge} style={{ background: colour }}>{src}</span>
            {cats.map(c => (
              <span key={c} className={styles.catBadge}>{c}</span>
            ))}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Image */}
        {img && !imgError && (
          <img
            className={styles.heroImg}
            src={img}
            alt=""
            onError={() => setImgError(true)}
          />
        )}

        {/* Body */}
        <div className={styles.body}>
          <h2 className={styles.title}>{article.title || 'Untitled'}</h2>

          {/* Signals */}          
          <div className={styles.signalsRow}>
            <ReliabilityScore article={article} />
            <SentimentBadge
              sentiment={article.sentiment}
              apiSentiment={article.apiSentiment ?? article.sentiment}
              modelSentiment={article.modelSentiment ?? article.sentiment}
              confidence={article.sentimentConfidence}
              probs={article.sentimentProbs}
            />
            <FakeNewsBadge article={article} />
            <ClickbaitBadge article={article} />
            <button
              className={`${styles.reactBtn} ${isSaved ? styles.saved : ''}`}
              onClick={handleSave}
              style={{ marginLeft: 'auto' }}
            >
              {isSaved ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" /></svg>
                  Remove from saved
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" /></svg>
                  Save for later
                </>
              )}
            </button>
          </div>

          {/* Meta grid */}
          <div className={styles.metaGrid}>
            {metaFields.map(f => (
              <div key={f.label} className={styles.metaItem}>
                <span className={styles.metaLabel}>{f.label}</span>
                <span className={styles.metaValue}>{f.value}</span>
              </div>
            ))}
          </div>

          {/* Snippet */}
          {snippet ? (
            <p className={styles.desc}>{snippet}</p>
          ) : (
            <p className={styles.descEmpty}>Full article text is not available in the Webz.io News API Lite plan.</p>
          )}

          {/* CTA */}
          {article.url && (
            <a
              className={styles.cta}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read Full Article →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
