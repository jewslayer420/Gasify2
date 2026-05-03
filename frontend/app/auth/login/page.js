'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { login } from '../../../lib/api';
import { useUser } from '../../../lib/context/UserContext';
import styles from '../auth.module.css';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useUser() ?? {};
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      setUser?.(data.user);
      router.push('/map');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.sub}>Sign in to your Gasify account</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Email
            <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className={styles.label}>
            Password
            <input className={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className={styles.footer}>
          <Link href="/auth/forgot-password" className={styles.footerLink}>Forgot password?</Link>
          <span className={styles.footerSep}>·</span>
          <Link href="/auth/register" className={styles.footerLink}>Create account</Link>
        </div>
      </div>
    </div>
  );
}
