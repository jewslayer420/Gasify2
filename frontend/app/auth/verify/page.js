'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '../auth.module.css';

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setError('No token provided.'); return; }
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(r => r.json()).then(data => {
      if (data.error) { setError(data.error); setStatus('error'); }
      else setStatus('success');
    }).catch(() => { setError('Verification failed. Try again.'); setStatus('error'); });
  }, [token]);

  return (
    <div className={styles.card}>
      {status === 'loading' && <><div className={styles.spinner} /><p className={styles.sub}>Verifying your email…</p></>}
      {status === 'success' && (
        <>
          <div className={styles.successIcon}>✅</div>
          <h1 className={styles.title}>Email verified!</h1>
          <p className={styles.sub}>Your account is now active. You can sign in.</p>
          <Link href="/auth/login" className={styles.btn} style={{ textAlign: 'center', marginTop: 24 }}>Sign in</Link>
        </>
      )}
      {status === 'error' && (
        <>
          <div className={styles.successIcon}>❌</div>
          <h1 className={styles.title}>Verification failed</h1>
          <p className={styles.error}>{error}</p>
          <Link href="/auth/register" className={styles.btn} style={{ textAlign: 'center', marginTop: 24 }}>Try again</Link>
        </>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.card}><div className={styles.spinner} /></div>}>
        <VerifyContent />
      </Suspense>
    </div>
  );
}
