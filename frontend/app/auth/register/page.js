'use client';
import { useState } from 'react';
import Link from 'next/link';
import { register, resendVerification } from '../../../lib/api';
import styles from '../auth.module.css';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState('');

  async function handleResend() {
    setResent('');
    try {
      await resendVerification(email);
      setResent('Sent — check your inbox again.');
    } catch (err) {
      setResent(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✉️</div>
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.sub}>We sent a verification link to <strong>{email}</strong>. Click it to activate your account, then sign in.</p>
          <Link href="/auth/login" className={styles.btn} style={{ textAlign: 'center', marginTop: 24 }}>Back to login</Link>
          <div className={styles.footer}>
            Didn’t get it?{' '}
            <button className={styles.footerLink} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }} onClick={handleResend}>Resend link</button>
          </div>
          {resent && <p className={styles.hint} style={{ textAlign: 'center', color: 'var(--green)' }}>{resent}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create account</h1>
        <p className={styles.sub}>Save favorites and track price trends</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Email
            <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className={styles.label}>
            Password <span className={styles.hint}>(min. 8 characters)</span>
            <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <div className={styles.footer}>
          Already have an account?{' '}
          <Link href="/auth/login" className={styles.footerLink}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
