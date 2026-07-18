'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '../../lib/context/UserContext';
import { useCurrency } from '../../lib/context/CurrencyContext';
import { getFavorites, removeFavorite, getSavedLocations, saveLocation, deleteLocation, get2faStatus, setup2fa, enable2fa, disable2fa, setEmail2fa, getAccount, changePassword, resendVerification, setAlerts } from '../../lib/api';
import styles from './page.module.css';

const FUEL_LABELS = { diesel: 'Diesel', sp95: '95', sp98: '98', sp100: '100', diesel_premium: 'Diesel+', lpg: 'LPG' };

function priceColor(p) {
  if (!p) return '';
  if (p <= 1.60) return styles.green;
  if (p <= 1.90) return styles.orange;
  return styles.red;
}

export default function DashboardPage() {
  const { user, loading, logout } = useUser() ?? {};
  const { fmt } = useCurrency();
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [addingLocation, setAddingLocation] = useState(false);
  const [locForm, setLocForm] = useState({ label: 'home', name: '', lat: '', lng: '' });

  // Security card state
  const [security, setSecurity] = useState(null);       // { totpEnabled, backupCodesLeft, hasPassword, googleLinked }
  const [enrollment, setEnrollment] = useState(null);   // { qr, secret } during setup
  const [twoFaCode, setTwoFaCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null); // shown once after enabling
  const [disabling, setDisabling] = useState(false);
  const [twoFaError, setTwoFaError] = useState('');
  const [twoFaBusy, setTwoFaBusy] = useState(false);

  // Account card state
  const [account, setAccount] = useState(null);         // { email, emailVerified, role, plan, createdAt, ... }
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '' });
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [resent, setResent] = useState('');
  const [alertsBusy, setAlertsBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push('/auth/login'); return; }
    if (user) {
      Promise.all([getFavorites(), getSavedLocations(), get2faStatus(), getAccount()])
        .then(([favs, locs, sec, acc]) => { setFavorites(favs); setLocations(locs); setSecurity(sec); setAccount(acc); setLoadingData(false); });
    }
  }, [user, loading, router]);

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError(''); setPwOk(''); setPwBusy(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      setPwOk('Password updated.');
      setChangingPw(false);
      setPwForm({ current: '', next: '' });
    } catch (err) { setPwError(err.message); }
    finally { setPwBusy(false); }
  }

  async function handleResendVerification() {
    setResent('');
    try { await resendVerification(account?.email); setResent('Verification link sent — check your inbox.'); }
    catch (err) { setResent(err.message); }
  }

  async function handleSignOut() {
    await logout?.();
    router.push('/');
  }

  async function handleToggleAlerts() {
    setAlertsBusy(true);
    try {
      const { alertsEnabled } = await setAlerts(!account?.alertsEnabled);
      setAccount(a => ({ ...a, alertsEnabled }));
    } catch {} finally { setAlertsBusy(false); }
  }

  async function startEnrollment() {
    setTwoFaError('');
    setTwoFaBusy(true);
    try {
      const data = await setup2fa();
      setEnrollment(data);
    } catch (err) { setTwoFaError(err.message); }
    finally { setTwoFaBusy(false); }
  }

  async function confirmEnrollment(e) {
    e.preventDefault();
    setTwoFaError('');
    setTwoFaBusy(true);
    try {
      const data = await enable2fa(twoFaCode);
      setBackupCodes(data.backupCodes);
      setEnrollment(null);
      setTwoFaCode('');
      setSecurity(s => ({ ...s, totpEnabled: true, backupCodesLeft: data.backupCodes.length }));
    } catch (err) { setTwoFaError(err.message); }
    finally { setTwoFaBusy(false); }
  }

  async function confirmDisable(e) {
    e.preventDefault();
    setTwoFaError('');
    setTwoFaBusy(true);
    try {
      await disable2fa(twoFaCode);
      setDisabling(false);
      setTwoFaCode('');
      setBackupCodes(null);
      setSecurity(s => ({ ...s, totpEnabled: false, backupCodesLeft: 0 }));
    } catch (err) { setTwoFaError(err.message); }
    finally { setTwoFaBusy(false); }
  }

  async function toggleEmail2fa() {
    setTwoFaError('');
    setTwoFaBusy(true);
    try {
      const next = !security?.emailTwoFactor;
      await setEmail2fa(next);
      setSecurity(s => ({ ...s, emailTwoFactor: next, trustedDevices: next ? s.trustedDevices : 0 }));
    } catch (err) { setTwoFaError(err.message); }
    finally { setTwoFaBusy(false); }
  }

  async function handleRemoveFav(stationId) {
    await removeFavorite(stationId);
    setFavorites(f => f.filter(s => s.id !== stationId));
  }

  async function handleAddLocation(e) {
    e.preventDefault();
    const loc = await saveLocation({ ...locForm, lat: parseFloat(locForm.lat), lng: parseFloat(locForm.lng) });
    setLocations(l => [...l, loc]);
    setAddingLocation(false);
    setLocForm({ label: 'home', name: '', lat: '', lng: '' });
  }

  async function handleDeleteLocation(id) {
    await deleteLocation(id);
    setLocations(l => l.filter(x => x.id !== id));
  }

  if (loading || loadingData) return <div className={styles.page}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.sub}>{user?.email}</p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Account</h2>

        <div className={styles.secRow}>
          <div>
            <div className={styles.secName}>Email address</div>
            <div className={styles.secDetail}>{account?.email}</div>
          </div>
          {account?.emailVerified
            ? <span className={styles.badgeOk}>Verified</span>
            : <button className={styles.addBtn} onClick={handleResendVerification}>Verify email</button>}
        </div>
        {resent && <p className={styles.secDetail} style={{ color: 'var(--green)', paddingBottom: 8 }}>{resent}</p>}

        {account?.role === 'admin' && (
          <div className={styles.secRow}>
            <div>
              <div className={styles.secName}>Account type <span className={styles.badgeAdmin}>Admin</span></div>
              <div className={styles.secDetail}>Full administrator access — users, plans and data sync.</div>
            </div>
            <Link href="/admin" className={styles.addBtn}>Open admin panel</Link>
          </div>
        )}

        <div className={styles.secRow}>
          <div>
            <div className={styles.secName}>Member since</div>
            <div className={styles.secDetail}>
              {account?.createdAt ? new Date(account.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
            </div>
          </div>
        </div>

        <div className={styles.secRow}>
          <div>
            <div className={styles.secName}>Password</div>
            <div className={styles.secDetail}>
              {account?.hasPassword ? 'Change the password you use to sign in.' : 'No password set — you sign in with Google.'}
            </div>
          </div>
          {account?.hasPassword && (
            <button className={styles.addBtn} onClick={() => { setChangingPw(v => !v); setPwError(''); setPwOk(''); }}>
              {changingPw ? 'Close' : 'Change'}
            </button>
          )}
        </div>

        {changingPw && (
          <form onSubmit={handleChangePassword} className={styles.secPanel}>
            <input className={styles.input} type="password" placeholder="Current password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} autoComplete="current-password" required />
            <input className={styles.input} type="password" placeholder="New password (min. 8 characters)" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} minLength={8} autoComplete="new-password" required />
            <div className={styles.locFormBtns}>
              <button className={styles.saveBtn} type="submit" disabled={pwBusy}>{pwBusy ? 'Saving…' : 'Update password'}</button>
              <button type="button" className={styles.cancelBtn} onClick={() => { setChangingPw(false); setPwForm({ current: '', next: '' }); setPwError(''); }}>Cancel</button>
            </div>
            {pwError && <p className={styles.secError}>{pwError}</p>}
          </form>
        )}
        {pwOk && <p className={styles.secDetail} style={{ color: 'var(--green)' }}>{pwOk}</p>}

        <div className={styles.secRow}>
          <div>
            <div className={styles.secName}>Sign out</div>
            <div className={styles.secDetail}>End your session on this device.</div>
          </div>
          <button className={styles.cancelBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Security</h2>
        <div className={styles.secRow}>
          <div>
            <div className={styles.secName}>Two-factor authentication</div>
            <div className={styles.secDetail}>
              {security?.totpEnabled
                ? `On — authenticator app · ${security.backupCodesLeft} backup code${security.backupCodesLeft === 1 ? '' : 's'} left`
                : 'Off — protect your account with an authenticator app (Google Authenticator, Authy, 1Password…)'}
            </div>
          </div>
          {security?.totpEnabled
            ? <button className={styles.cancelBtn} onClick={() => { setDisabling(v => !v); setTwoFaCode(''); setTwoFaError(''); }} disabled={twoFaBusy}>Turn off</button>
            : <button className={styles.addBtn} onClick={startEnrollment} disabled={twoFaBusy || !!enrollment}>{enrollment ? 'Scanning…' : 'Turn on'}</button>}
        </div>

        {enrollment && (
          <form onSubmit={confirmEnrollment} className={styles.secPanel}>
            <p className={styles.secDetail}>1. Scan this QR code with your authenticator app (or enter the key manually):</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qr} alt="Two-factor QR code" className={styles.secQr} width={180} height={180} />
            <code className={styles.secKey}>{enrollment.secret}</code>
            <p className={styles.secDetail}>2. Enter the 6-digit code the app shows:</p>
            <div className={styles.locFormBtns}>
              <input className={styles.input} value={twoFaCode} onChange={e => setTwoFaCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" required />
              <button className={styles.saveBtn} type="submit" disabled={twoFaBusy}>Confirm</button>
              <button type="button" className={styles.cancelBtn} onClick={() => { setEnrollment(null); setTwoFaCode(''); setTwoFaError(''); }}>Cancel</button>
            </div>
            {twoFaError && <p className={styles.secError}>{twoFaError}</p>}
          </form>
        )}

        {disabling && security?.totpEnabled && (
          <form onSubmit={confirmDisable} className={styles.secPanel}>
            <p className={styles.secDetail}>Enter a code from your authenticator app (or a backup code) to turn two-factor off:</p>
            <div className={styles.locFormBtns}>
              <input className={styles.input} value={twoFaCode} onChange={e => setTwoFaCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" required />
              <button className={styles.saveBtn} type="submit" disabled={twoFaBusy}>Turn off</button>
              <button type="button" className={styles.cancelBtn} onClick={() => { setDisabling(false); setTwoFaCode(''); setTwoFaError(''); }}>Cancel</button>
            </div>
            {twoFaError && <p className={styles.secError}>{twoFaError}</p>}
          </form>
        )}

        {backupCodes && (
          <div className={styles.secPanel}>
            <p className={styles.secDetail}><b>Save these backup codes now</b> — each works once if you lose your authenticator. They will not be shown again.</p>
            <div className={styles.secCodes}>
              {backupCodes.map(c => <code key={c}>{c}</code>)}
            </div>
            <div className={styles.locFormBtns}>
              <button type="button" className={styles.saveBtn} onClick={() => navigator.clipboard?.writeText(backupCodes.join('\n'))}>Copy all</button>
              <button type="button" className={styles.cancelBtn} onClick={() => setBackupCodes(null)}>Done — I saved them</button>
            </div>
          </div>
        )}

        <div className={styles.secRow}>
          <div>
            <div className={styles.secName}>Email sign-in codes</div>
            <div className={styles.secDetail}>
              {security?.emailTwoFactor
                ? `On — a code is emailed at sign-in${security.trustedDevices ? ` · ${security.trustedDevices} remembered device${security.trustedDevices === 1 ? '' : 's'}` : ''}`
                : 'Off — email a one-time code at each sign-in (no authenticator app needed)'}
            </div>
          </div>
          <button className={security?.emailTwoFactor ? styles.cancelBtn : styles.addBtn} onClick={toggleEmail2fa} disabled={twoFaBusy}>
            {security?.emailTwoFactor ? 'Turn off' : 'Turn on'}
          </button>
        </div>

        <div className={styles.secRow}>
          <div>
            <div className={styles.secName}>Sign-in methods</div>
            <div className={styles.secDetail}>
              {[security?.hasPassword && 'Password', security?.googleLinked && 'Google'].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Favorite Stations</h2>

        <div className={styles.secRow}>
          <div>
            <div className={styles.secName}>Price-drop alerts</div>
            <div className={styles.secDetail}>
              {!account?.emailVerified
                ? 'Verify your email above to enable daily price-drop emails.'
                : account?.alertsEnabled
                  ? (account?.plan === 'premium'
                      ? 'On — watching all your favorites; you get one digest email on days a price drops.'
                      : 'On — watching your first 3 favorites (Premium watches all).')
                  : 'Get one email a day when a favorite station gets cheaper.'}
            </div>
          </div>
          <button
            className={styles.addBtn}
            disabled={alertsBusy || !account?.emailVerified}
            onClick={handleToggleAlerts}
          >
            {account?.alertsEnabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>

        {favorites.length === 0 && (
          <p className={styles.empty}>No favorites yet. <Link href="/map" className={styles.link}>Open the map</Link> and star stations you visit often.</p>
        )}
        <div className={styles.favList}>
          {favorites.map(s => {
            const dieselPrice = s.prices?.find(p => p.fuelType === 'diesel')?.price;
            return (
              <div key={s.id} className={styles.favItem}>
                <div>
                  <div className={styles.favName}>{s.name}</div>
                  <div className={styles.favCity}>{s.city} · {s.country}</div>
                </div>
                <div className={styles.favRight}>
                  {dieselPrice && <span className={`${styles.price} ${priceColor(dieselPrice)}`}>{fmt(dieselPrice)}</span>}
                  <button className={styles.removeBtn} onClick={() => handleRemoveFav(s.id)} title="Remove favorite">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Saved Locations</h2>
          <button className={styles.addBtn} onClick={() => setAddingLocation(v => !v)}>+ Add</button>
        </div>

        {addingLocation && (
          <form onSubmit={handleAddLocation} className={styles.locForm}>
            <select className={styles.select} value={locForm.label} onChange={e => setLocForm(f => ({ ...f, label: e.target.value }))}>
              <option value="home">Home</option>
              <option value="work">Work</option>
              <option value="other">Other</option>
            </select>
            <input className={styles.input} placeholder="Name (e.g. My House)" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} required />
            <input className={styles.input} placeholder="Latitude" type="number" step="any" value={locForm.lat} onChange={e => setLocForm(f => ({ ...f, lat: e.target.value }))} required />
            <input className={styles.input} placeholder="Longitude" type="number" step="any" value={locForm.lng} onChange={e => setLocForm(f => ({ ...f, lng: e.target.value }))} required />
            <div className={styles.locFormBtns}>
              <button className={styles.saveBtn} type="submit">Save</button>
              <button type="button" className={styles.cancelBtn} onClick={() => setAddingLocation(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div className={styles.locList}>
          {locations.length === 0 && !addingLocation && <p className={styles.empty}>No saved locations.</p>}
          {locations.map(loc => (
            <div key={loc.id} className={styles.locItem}>
              <div className={styles.locIcon}>{loc.label === 'home' ? 'H' : loc.label === 'work' ? 'W' : 'L'}</div>
              <div>
                <div className={styles.locName}>{loc.name}</div>
                <div className={styles.locCoords}>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</div>
              </div>
              <button className={styles.removeBtn} onClick={() => handleDeleteLocation(loc.id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Billing</h2>
        <div className={styles.planCard}>
          <div>
            <div className={styles.planLabel}>Current plan</div>
            <div className={styles.planValue}>{account?.plan === 'premium' ? 'Premium' : 'Free'}</div>
            <div className={styles.secDetail}>
              {account?.plan === 'premium'
                ? 'Thanks for supporting Gasify.'
                : 'You’re on the free plan — everything you need to find cheaper fuel.'}
            </div>
          </div>
          {account?.plan !== 'premium' && (
            <Link href="/pricing" className={styles.upgradeBtn}>See Premium</Link>
          )}
        </div>
        <p className={styles.secDetail} style={{ marginTop: 10 }}>
          No payment method on file. Premium isn’t available for purchase yet — <Link href="/pricing" className={styles.link}>see what’s coming</Link>.
        </p>
      </section>
    </div>
  );
}
