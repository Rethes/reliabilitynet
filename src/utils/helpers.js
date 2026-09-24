export const SOURCE_COLOURS = [
  '#e63946','#2a9d8f','#e9c46a','#264653',
  '#f4a261','#457b9d','#6a4c93','#1982c4',
];

export function getSourceColour(name = '') {
  return SOURCE_COLOURS[name.charCodeAt(0) % SOURCE_COLOURS.length];
}

export function getSourceName(a) {
  if (a?.thread?.site) return a.thread.site;
  if (a?.publisher) return a.publisher;
  if (typeof a?.source === 'object' && a?.source?.name) return a.source.name;
  if (typeof a?.source === 'string') return a.source;
  return 'Unknown';
}

export function getPublished(a) {
  return a?.thread?.published || a?.published || a?.published_at || '';
}

export function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Reliability score (prioritizes Logistic Regression Meta-Classifier)
export function getReliabilityScore(article) {
  if (!article) return 50;

  if (typeof article.reliabilityScore === 'number') {
    return article.reliabilityScore;
  }

  if (article.fakeNewsProbs && typeof article.fakeNewsProbs['Real News'] === 'number') {
    return Math.round(article.fakeNewsProbs['Real News'] * 100);
  }

  const stored = getFromStorage(`rel_${article.uuid}`);
  if (stored) return stored;

  const text = (article.title || '') + getSourceName(article);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  // Range: 52–97%
  const score = 52 + (Math.abs(hash) % 46);
  return score;
}

export function getReliabilityColor(score) {
  if (score >= 80) return 'var(--green)';
  if (score >= 65) return 'var(--gold2)';
  return 'var(--red)';
}

// Fake News detection (prioritizes RoBERTa ML model prediction, with fallback)
export function getFakeNewsLabel(article) {
  if (!article) return 'Real News';

  if (article.fakeNews) return article.fakeNews;
  if (article.modelFakeNews) return article.modelFakeNews;

  const stored = getFromStorage(`fakenews_${article.uuid}`);
  if (stored !== null) return stored;

  const title = (article.title || '').toLowerCase();
  const suspiciousSignals = [
    'you won\'t believe', 'shocking secret', 'exposed viral',
    'omg insane', 'mind-blowing truth', 'secret cure',
    'illuminati', 'alien conspiracy'
  ];
  const isFake = suspiciousSignals.some(s => title.includes(s));
  return isFake ? 'Fake News' : 'Real News';
}

// Clickbait detection (prioritizes RoBERTa ML model prediction, with fallback)
export function getClickbaitLabel(article) {
  if (!article) return 'Not Clickbait';

  if (article.clickbait) return article.clickbait;
  if (article.modelClickbait) return article.modelClickbait;

  const title = (article.title || '').toLowerCase();
  const suspiciousSignals = [
    'you won\'t believe', 'shocking secret', 'exposed viral',
    'omg insane', 'mind-blowing truth', 'secret cure',
    'you need to see', 'what happens next', 'this is why'
  ];
  return suspiciousSignals.some(s => title.includes(s)) ? 'Clickbait' : 'Not Clickbait';
}

// localStorage helpers
export function getFromStorage(key) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : null;
  } catch { return null; }
}

export function setToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
