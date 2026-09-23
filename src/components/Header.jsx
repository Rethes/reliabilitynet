import React from 'react';
import styles from './Header.module.css';
import { useAppContext } from '../context/AppContext';

export default function Header({ totalCount, sourceCount, searchValue, onSearchChange, onMenuToggle, menuOpen }) {
  const { state, dispatch, user, authLoading, setShowLoginModal, setShowProfileModal, handleLogout } = useAppContext();
  const savedCount = Object.keys(state.savedArticles).length;
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <header className={styles.header}>
      <div className={`${styles.inner} ${state.activeView === 'saved' ? styles.savedInner : ''}`}>
        <a href="#" className={styles.logo}>
          <span className={styles.logoDot} />
          ReliabilityNet
        </a>
        <span className={styles.liveBadge}>Live</span>
        <button className={styles.hamburger} onClick={onMenuToggle} title="Filters">
          {menuOpen ? '✕' : '☰'}
        </button>

        <button className={styles.searchToggle} onClick={() => setSearchOpen(o => !o)} title="Search">
          🔍
        </button>

        {searchOpen && (
          <div className={styles.searchOverlay} onClick={() => setSearchOpen(false)}>
            <div className={styles.searchModal} onClick={e => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Search headlines, topics, sources…"
                autoComplete="off"
                value={searchValue}
                onChange={onSearchChange}
                autoFocus
                className={styles.searchModalInput}
              />
              <button className={styles.searchClose} onClick={() => setSearchOpen(false)}>✕</button>
            </div>
          </div>
        )}

        <nav className={styles.navLinks}>
  <button
    className={`${styles.navBtn} ${state.activeView === 'feed' ? styles.navActive : ''}`}
    onClick={() => dispatch({ type: 'SET_VIEW', view: 'feed' })}
  >
    Feed
  </button>
  {user && (
    <button
      className={`${styles.navBtn} ${state.activeView === 'saved' ? styles.navActive : ''}`}
      onClick={() => dispatch({ type: 'SET_VIEW', view: 'saved' })}
    >
      Saved
      {savedCount > 0 && <span className={styles.savedBadge}>{savedCount}</span>}
    </button>
  )}
</nav>

        {state.activeView === 'feed' && (
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <div className={styles.statLabel}>Articles</div>
              <div className={styles.statValue}>{totalCount || '—'}</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statLabel}>Sources</div>
              <div className={styles.statValue}>{sourceCount || '—'}</div>
            </div>
          </div>
        )}

        {/* Auth area */}
        {!authLoading && (
          user ? (
            <div className={styles.authArea}>
              <span className={styles.userEmail} title={user.email}>
                {user.email.split('@')[0]}
              </span>
              <button className={styles.logoutBtn} onClick={() => setShowProfileModal(true)} title="Account settings">
                  Profile
              </button>
              <button className={styles.logoutBtn} onClick={handleLogout} title="Sign out">
                Sign out
              </button>
            </div>
          ) : (
            <button
              className={styles.loginBtn}
              onClick={() => setShowLoginModal(true)}
            >
              Sign in
            </button>
          )
        )}
      </div>
    </header>
  );
}
