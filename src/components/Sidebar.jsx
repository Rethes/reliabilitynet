import React from 'react';
import styles from './Sidebar.module.css';
import { getSourceName } from '../utils/helpers';

function getCategoryOptions(articles) {
  const categories = new Set();

  articles.forEach(article => {
    const primaryCategory = Array.isArray(article.categories) ? article.categories[0] : '';
    if (typeof primaryCategory === 'string' && primaryCategory.trim()) {
      categories.add(primaryCategory.trim());
    }
  });

  return [
    { label: 'All', value: '' },
    ...[...categories]
      .sort((a, b) => a.localeCompare(b))
      .map(category => ({ label: category, value: category })),
  ];
}

// const LANGUAGES = [
//   { label: 'All Languages', value: '' },
//   { label: 'English', value: 'english' },
//   { label: 'Spanish', value: 'spanish' },
//   { label: 'French', value: 'french' },
//   { label: 'German', value: 'german' },
//   { label: 'Italian', value: 'italian' },
//   { label: 'Portuguese', value: 'portuguese' },
//   { label: 'Russian', value: 'russian' },
//   { label: 'Chinese', value: 'chinese' },
//   { label: 'Arabic', value: 'arabic' },
//   { label: 'Japanese', value: 'japanese' },
// ];

export default function Sidebar({
  filters,
  onFilterChange,
  allArticles,
  selectedSources,
  onToggleSource,
  onClearSources,
  onClearDateRange,
  isOpen,
}) {
  const categoryOptions = getCategoryOptions(allArticles);
  const sourceMap = {};
  allArticles.forEach(a => {
    const src = getSourceName(a);
    if (src) sourceMap[src] = (sourceMap[src] || 0) + 1;
  });
  const sortedSources = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 20);

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
      {/* Category */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Category</span>
          <button className={styles.clearBtn} onClick={() => onFilterChange('category', '')}>Clear</button>
        </div>
        <div className={`${styles.sectionBody} ${styles.filterScroll}`}>
          <div className={styles.catGrid}>
            {categoryOptions.map(cat => (
              <button
                key={cat.value}
                className={`${styles.catPill} ${filters.category === cat.value ? styles.catActive : ''}`}
                onClick={() => onFilterChange('category', cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sort */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Sort By</span>
        </div>
        <div className={`${styles.sectionBody} ${styles.filterScroll}`}>
          <select
            className={styles.select}
            value={filters.sort}
            onChange={e => onFilterChange('sort', e.target.value)}
          >
            <option value="">Latest First</option>
            <option value="oldest">Oldest First</option>
            <option value="source">By Source</option>
          </select>
        </div>
      </div>

      {/* Language */}
      {/* <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Language</span>
        </div>
        <div className={styles.sectionBody}>
          <select
            className={styles.select}
            value={filters.language}
            onChange={e => onFilterChange('language', e.target.value)}
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </div> */}

      {/* Date Range */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Date Range</span>
          <button
            className={styles.clearBtn}
            onClick={onClearDateRange}
          >
            Clear
          </button>
        </div>
        <div className={`${styles.sectionBody} ${styles.filterScroll}`}>
          <div className={styles.dateInputs}>
            <div>
              <div className={styles.dateLabel}>From</div>
              <input
                type="date"
                className={styles.dateInput}
                value={filters.dateFrom}
                onChange={e => onFilterChange('dateFrom', e.target.value)}
              />
            </div>
            <div>
              <div className={styles.dateLabel}>To</div>
              <input
                type="date"
                className={styles.dateInput}
                value={filters.dateTo}
                onChange={e => onFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sources */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Sources</span>
          <button className={styles.clearBtn} onClick={onClearSources}>Clear</button>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.sourceList}>
            {sortedSources.length === 0 ? (
              <div className={styles.sourceEmpty}>Loading sources…</div>
            ) : sortedSources.map(([name, count]) => (
              <label key={name} className={styles.sourceItem}>
                <input
                  type="checkbox"
                  checked={selectedSources.has(name)}
                  onChange={e => onToggleSource(name, e.target.checked)}
                />
                <span className={styles.sourceName}>{name}</span>
                <span className={styles.sourceCount}>{count}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

    </aside>
  );
}
