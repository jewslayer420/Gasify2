'use client';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { login, twoFactorLogin } from '../../../lib/api';
import { useUser } from '../../../lib/context/UserContext';
import styles from '../auth.module.css';

const OAUTH_ERRORS = {
  'google-not-configured': 'Google sign-in is not set up yet on this server.',
  'google-state-mismatch': 'Google sign-in was interrupted — please try again.',
  'google-exchange-failed': 'Google sign-in failed — please try again.',
  'google-bad-audience': 'Google sign-in failed — please try again.',
  'google-bad-issuer': 'Google sign-in failed — please try again.',
  'google-email-unverified': 'Your Google account email is unverified — verify it with Google first.',
  'google-signin-failed': 'Google sign-in failed — please try again.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useUser() ?? {};
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState(null); // non-null → show the code step
  const [code, setCode] = useState('');

  // Arriving from Google with 2FA enabled (?mfa=…) or with an OAuth error (?error=…)
  useEffect(() => {
    const mfa = params.get('mfa');
    const err = params.get('error');
    if (mfa) setMfaToken(mfa);
    if (err) setError(OAUTH_ERRORS[err] ?? 'Sign-in failed — please try again.');
  }, [params]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.requires2fa) {
        setMfaToken(data.mfaToken);
        return;
      }
      setUser?.(data.user);
      router.push('/map');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await twoFactorLogin(mfaToken, code);
      setUser?.(data.user);
      router.push('/map');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (mfaToken) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Two-factor code</h1>
          <p className={styles.sub}>Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
          <form onSubmit={handleCodeSubmit} className={styles.form}>
            <input
              className={`${styles.input} ${styles.codeInput}`}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="123 456"
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
              required
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Checking…' : 'Verify'}
            </button>
          </form>
          <div className={styles.footer}>
            <button className={styles.footerLink} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
              onClick={() => { setMfaToken(null); setCode(''); setError(''); }}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.sub}>Sign in to your Gasify account</p>

        <a className={styles.googleBtn} href="/api/auth/google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </a>

        <div className={styles.divider}><span>or</span></div>

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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.spinner} /></div>}>
      <LoginForm />
    </Suspense>
  );
}
