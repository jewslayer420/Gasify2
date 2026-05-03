'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '../auth.module.css';

function ResetContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: password }),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); setLoading(false); return; }
    setDone(true);
    setLoading(false);
  }

  if (!token) return (
    <>
      <p className={styles.error}>Invalid reset link.</p>
      <Link href="/auth/forgot-password" className={styles.btn} style={{ textAlign: 'center', marginTop: 16 }}>Request new link</Link>
    </>
  );

  if (done) return (
    <>
      <div className={styles.successIcon}>✅</div>
      <h1 className={styles.title}>Password reset!</h1>
      <p className={styles.sub}>Your password has been updated. You can now sign in.</p>
      <Link href="/auth/login" className={styles.btn} style={{ textAlign: 'center', marginTop: 24 }}>Sign in</Link>
    </>
  );

  return (
    <>
      <h1 className={styles.title}>New password</h1>
      <p className={styles.sub}>Choose a strong password for your account</p>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          New password <span className={styles.hint}>(min. 8 characters)</span>
          <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required autoFocus />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btn} type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Suspense fallback={<div className={styles.spinner} />}>
          <ResetContent />
        </Suspense>
      </div>
    </div>
  );
}
