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

export function getReliabilityScore(article) {
  return typeof article?.reliabilityScore === 'number' ? article.reliabilityScore : null;
}

export function getReliabilityColor(score) {
  if (score >= 80) return 'var(--green)';
  if (score >= 65) return 'var(--gold2)';
  return 'var(--red)';
}

export function getClickbaitLabel(article) {
  return article?.modelClickbait ?? null;
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
