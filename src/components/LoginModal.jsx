import React, { useState, useEffect, useRef } from 'react';
import { login, register } from '../services/authApi';
import { useAppContext } from '../context/AppContext';
import styles from './LoginModal.module.css';

export default function LoginModal() {
  const { setShowLoginModal, handleLogin } = useAppContext();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setShowLoginModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShowLoginModal]);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const fn = mode === 'login' ? login : register;
      const user = await fn(email.trim(), password);
      handleLogin(user);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div className={styles.overlay} onClick={() => setShowLoginModal(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={() => setShowLoginModal(false)} aria-label="Close">×</button>

        <div className={styles.lockIcon}>🔐</div>
        <h2 className={styles.title}>
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h2>
        <p className={styles.subtitle}>
          {mode === 'login'
            ? 'Sign in to save and access your articles across sessions.'
            : 'Save articles, build your reading list, access it anytime.'}
        </p>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              ref={emailRef}
              className={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="email"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <div className={styles.toggle}>
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <button className={styles.toggleLink} onClick={() => { setMode('register'); setError(''); }}>
                Register
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button className={styles.toggleLink} onClick={() => { setMode('login'); setError(''); }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
