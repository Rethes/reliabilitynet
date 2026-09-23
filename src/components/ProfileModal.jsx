import React, { useState, useEffect, useRef } from 'react';
import { updateEmail, updatePassword } from '../services/authApi';
import { useAppContext } from '../context/AppContext';
import styles from './ProfileModal.module.css';

export default function ProfileModal() {
  const { user, setShowProfileModal, handleUpdateUser } = useAppContext();

  const [email, setEmail] = useState(user?.email || '');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setShowProfileModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShowProfileModal]);

  const handleEmailSubmit = async () => {
    setEmailError(''); setEmailSuccess('');
    if (!email.trim()) { setEmailError('Email is required.'); return; }
    if (email.trim().toLowerCase() === user.email.toLowerCase()) {
      setEmailError('That is already your current email.'); return;
    }
    setEmailLoading(true);
    try {
      const updatedUser = await updateEmail(email.trim());
      handleUpdateUser(updatedUser);
      setEmailSuccess('Email updated successfully.');
    } catch (err) {
      setEmailError(err.message || 'Something went wrong.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    setPasswordError(''); setPasswordSuccess('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all fields.'); return;
    }
    if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match.'); return; }
    if (newPassword.length < 6) { setPasswordError('New password must be at least 6 characters.'); return; }

    setPasswordLoading(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setPasswordSuccess('Password updated successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Something went wrong.');
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className={styles.overlay} onClick={() => setShowProfileModal(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={() => setShowProfileModal(false)} aria-label="Close">×</button>

        <div className={styles.lockIcon}>👤</div>
        <h2 className={styles.title}>Account settings</h2>
        <p className={styles.subtitle}>Update your email or password.</p>

        {/* Email section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Email address</h3>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                ref={emailRef}
                className={styles.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                autoComplete="email"
              />
            </div>
          </div>
          {emailError && <div className={styles.error}>{emailError}</div>}
          {emailSuccess && <div className={styles.success}>{emailSuccess}</div>}
          <button className={styles.submitBtn} onClick={handleEmailSubmit} disabled={emailLoading}>
            {emailLoading ? 'Saving…' : 'Update email'}
          </button>
        </div>

        <div className={styles.divider} />

        {/* Password section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Change password</h3>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label}>Current password</label>
              <input
                className={styles.input}
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>New password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Confirm new password</label>
              <input
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                autoComplete="new-password"
              />
            </div>
          </div>
          {passwordError && <div className={styles.error}>{passwordError}</div>}
          {passwordSuccess && <div className={styles.success}>{passwordSuccess}</div>}
          <button className={styles.submitBtn} onClick={handlePasswordSubmit} disabled={passwordLoading}>
            {passwordLoading ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}