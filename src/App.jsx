import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import Header from './components/Header';
import Ticker from './components/Ticker';
import Sidebar from './components/Sidebar';
import ArticleCard from './components/ArticleCard';
import ArticleModal from './components/ArticleModal';
import SkeletonCard from './components/SkeletonCard';
import Pagination from './components/Pagination';
import SavedArticles from './components/SavedArticles';
import { filterArticles, useNews } from './hooks/useNews';
import LoginModal from './components/LoginModal';
import ProfileModal from './components/ProfileModal';
import styles from './App.module.css';

const SOURCE_COLOURS = ['#e63946','#2a9d8f','#e9c46a','#264653','#f4a261','#457b9d','#6a4c93','#1982c4'];

function getSourceCount(articles) {
  const set = new Set(articles.map(a => a?.thread?.site || a?.publisher || 'Unknown'));
  return set.size;
}

function AppInner() {
  const { state, showLoginModal, showProfileModal } = useAppContext();
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({
    search: '', category: '', language: '', sort: '', dateFrom: '', dateTo: '',
  });

  const searchTimer = useRef(null);

  const {
    allArticles,
    filteredArticles,
    currentPage,
    isLoading,
    error,
    progress,
    selectedSources,
    loadNews,
    updateFilters,
    toggleSource,
    clearSources,
    setCurrentPage,
  } = useNews();

  const displayedArticles = filterArticles(allArticles, filters, selectedSources);
  const displayedPageArticles = displayedArticles.slice(
    (currentPage - 1) * 12,
    currentPage * 12,
  );

  // Initial load
  useEffect(() => {
    loadNews(filters);
  }, []); // eslint-disable-line

  // Search with debounce
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchInput(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const newFilters = { ...filters, search: value.trim() };
      setFilters(newFilters);
      loadNews(newFilters);
    }, 600);
  }, [filters, loadNews]);

  // Non-search filter changes
  const handleFilterChange = useCallback((key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);

    // dateFrom triggers a re-fetch; others just re-filter
    if (key === 'dateFrom') {
      loadNews(newFilters);
    } else {
      updateFilters(newFilters, allArticles, selectedSources);
    }
  }, [filters, allArticles, selectedSources, loadNews, updateFilters]);

  const handleToggleSource = useCallback((name, checked) => {
    toggleSource(name, checked, allArticles);
  }, [toggleSource, allArticles]);

  const handleClearSources = useCallback(() => {
    clearSources(allArticles);
  }, [clearSources, allArticles]);

  const handleClearDateRange = useCallback(() => {
    const newFilters = { ...filters, dateFrom: '', dateTo: '' };
    setFilters(newFilters);
    loadNews(newFilters);
  }, [filters, loadNews]);

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setCurrentPage]);

  // Error states
  const renderError = () => {
    if (error === 'proxy') return (
      <div className={styles.stateBox}>
        <div className={styles.stateIcon}>🚦</div>
        <div className={styles.stateTitle}>Start the proxy server first</div>
        <div className={styles.stateMsg}>
          <strong>1.</strong> Install <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" style={{color:'var(--accent)'}}>Node.js</a> if needed.<br />
          <strong>2.</strong> Open a terminal in the same folder as these files.<br />
          <strong>3.</strong> Run: <code style={{color:'var(--accent)',background:'var(--surface3)',padding:'2px 8px',borderRadius:'4px'}}>node proxy-server.js</code><br />
          <strong>4.</strong> Keep terminal open, then click Retry.
        </div>
        <button className={styles.retryBtn} onClick={() => loadNews(filters)}>↺ Retry</button>
      </div>
    );

    if (error === 'api_key') return (
      <div className={styles.stateBox}>
        <div className={styles.stateIcon}>🔑</div>
        <div className={styles.stateTitle}>API Token Required</div>
        <div className={styles.stateMsg}>
          Open <code style={{color:'var(--accent)'}}>src/hooks/useNews.js</code> and set your API key from{' '}
          <a href="https://webz.io/products/news-api#lite" target="_blank" rel="noopener noreferrer" style={{color:'var(--accent)'}}>webz.io</a>.
        </div>
      </div>
    );

    if (error === 'auth') return (
      <div className={styles.stateBox}>
        <div className={styles.stateIcon}>⚠️</div>
        <div className={styles.stateTitle}>Couldn't load news</div>
        <div className={styles.stateMsg}>Token rejected (401/403). Check your token at webz.io.</div>
        <button className={styles.retryBtn} onClick={() => loadNews(filters)}>↺ Retry</button>
      </div>
    );

    if (error) return (
      <div className={styles.stateBox}>
        <div className={styles.stateIcon}>⚠️</div>
        <div className={styles.stateTitle}>Couldn't load news</div>
        <div className={styles.stateMsg}>Request failed. Check the proxy terminal for details.</div>
        <button className={styles.retryBtn} onClick={() => loadNews(filters)}>↺ Retry</button>
      </div>
    );

    return null;
  };

  const isSavedView = state.activeView === 'saved';

  return (
    <div>
      <Header
        totalCount={displayedArticles.length || null}
        sourceCount={displayedArticles.length ? getSourceCount(displayedArticles) : null}
        searchValue={searchInput}
        onSearchChange={handleSearchChange}
        onMenuToggle={() => setMenuOpen(o => !o)}
        menuOpen={menuOpen}
      />

      {allArticles.length > 0 && <Ticker articles={allArticles} />}

      <div className={`${styles.mainWrap} ${isSavedView ? styles.savedWrap : ''}`}>
        {!isSavedView && menuOpen && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setMenuOpen(false)}
          />
        )}
        {!isSavedView && (
          <Sidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            allArticles={allArticles}
            selectedSources={selectedSources}
            onToggleSource={handleToggleSource}
            onClearSources={handleClearSources}
            onClearDateRange={handleClearDateRange}
            isOpen={menuOpen}
          />
        )}

        {/* Content area */}
        {isSavedView ? (
          <SavedArticles savedArticles={state.savedArticles} />
        ) : (
          <div className={styles.contentArea}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
              <span className={styles.resultsLabel}>
                {isLoading
                  ? 'Loading…'
                  : error
                  ? 'Error'
                  : <><span className={styles.resultsCount}>{displayedArticles.length}</span> articles found</>
                }
              </span>
            </div>

            {/* Progress bar */}
            {progress && (
              <div className={styles.progressWrap}>
                <span className={styles.progressText}>{progress.text}</span>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress.pct}%` }} />
                </div>
              </div>
            )}

            {/* Grid / error / skeletons */}
            <div className={styles.grid}>
              {isLoading && !progress && Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
              {progress && Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
              {!isLoading && error && renderError()}
              {!isLoading && !error && displayedPageArticles.length === 0 && allArticles.length > 0 && (
                <div className={styles.stateBox}>
                  <div className={styles.stateIcon}>🔍</div>
                  <div className={styles.stateTitle}>No articles found</div>
                  <div className={styles.stateMsg}>Try different keywords, filters, or a broader date range.</div>
                </div>
              )}
              {!isLoading && !error && displayedPageArticles.map((article, i) => (
                <ArticleCard
                  key={`${filters.category}:${article.uuid || article.url || i}`}
                  article={article}
                  index={i}
                  onOpen={setSelectedArticle}
                  isListView={false}
                  selectedCategory={filters.category}
                />
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(displayedArticles.length / 12)}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      {selectedArticle && (
        <ArticleModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
      {showLoginModal && <LoginModal />}
      {showProfileModal && <ProfileModal />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
