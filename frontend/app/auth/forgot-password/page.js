'use client';
import { useState } from 'react';
import Link from 'next/link';
import styles from '../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✉️</div>
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.sub}>If that address is registered, we sent a password reset link.</p>

          <Link href="/auth/login" className={styles.btn} style={{ textAlign: 'center', marginTop: 24 }}>Back to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Reset password</h1>
        <p className={styles.sub}>Enter your email and we&apos;ll send a reset link</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Email
            <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </label>
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <div className={styles.footer}>
          <Link href="/auth/login" className={styles.footerLink}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}
