'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../lib/context/UserContext';
import { getAccount, adminOverview, adminSyncStatus, adminUsers, adminUpdateUser, adminDeleteUser } from '../../lib/api';
import { COUNTRY_NAMES, flagOf } from '../../lib/countries';
import styles from './page.module.css';

const HOUR = 3600 * 1000;

function ago(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))}m ago`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)}h ago`;
  return `${Math.round(ms / (24 * HOUR))}d ago`;
}

// Sync cadence is 6h (fast) / 24h (slow), so <26h is healthy and <50h is one
// missed daily run; anything older means the pipeline needs a look.
function syncState(lastSyncAt) {
  if (!lastSyncAt) return { label: 'No record', cls: 'dotGray', rank: 1 };
  const age = Date.now() - new Date(lastSyncAt).getTime();
  if (age < 26 * HOUR) return { label: 'OK', cls: 'dotGreen', rank: 3 };
  if (age < 50 * HOUR) return { label: 'Late', cls: 'dotAmber', rank: 2 };
  return { label: 'Stale', cls: 'dotRed', rank: 0 };
}

export default function AdminPage() {
  const { user, loading } = useUser() ?? {};
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [overview, setOverview] = useState(null);
  const [sync, setSync] = useState([]);
  const [userList, setUserList] = useState({ total: 0, users: [] });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selfId, setSelfId] = useState('');

  const loadUsers = useCallback((q = '') => {
    adminUsers(q).then(setUserList).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/auth/login'); return; }
    getAccount().then(acc => {
      if (!acc || acc.role !== 'admin') { router.replace('/dashboard'); return; }
      setAllowed(true);
      setSelfId(user.id);
      adminOverview().then(setOverview).catch(e => setError(e.message));
      adminSyncStatus()
        .then(rows => setSync([...rows].sort((a, b) =>
          syncState(a.lastSyncAt).rank - syncState(b.lastSyncAt).rank
          || (new Date(a.lastSyncAt ?? 0)) - (new Date(b.lastSyncAt ?? 0)))))
        .catch(e => setError(e.message));
      adminUsers().then(setUserList).catch(e => setError(e.message));
    });
  }, [user, loading, router]);

  async function patchUser(id, patch) {
    setBusyId(id); setError('');
    try {
      const updated = await adminUpdateUser(id, patch);
      setUserList(l => ({ ...l, users: l.users.map(u => u.id === id ? { ...u, ...updated } : u) }));
    } catch (e) { setError(e.message); }
    finally { setBusyId(''); }
  }

  async function removeUser(id, email) {
    if (!window.confirm(`Delete ${email}? This removes their favorites, locations and sign-in methods permanently.`)) return;
    setBusyId(id); setError('');
    try {
      await adminDeleteUser(id);
      setUserList(l => ({ total: l.total - 1, users: l.users.filter(u => u.id !== id) }));
    } catch (e) { setError(e.message); }
    finally { setBusyId(''); }
  }

  if (!allowed) return <div className={styles.page}><p className={styles.muted}>Checking access…</p></div>;

  const staleCount = sync.filter(s => syncState(s.lastSyncAt).rank < 2).length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin</h1>
        <p className={styles.sub}>Signed in as {user?.email}</p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.section}>
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Users</div>
            <div className={styles.tileValue}>{overview ? overview.users.total.toLocaleString() : '…'}</div>
            {overview && <div className={styles.tileSub}>{overview.users.verified} verified · {overview.users.twoFa} with 2FA · +{overview.users.newLast7d} this week</div>}
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Stations</div>
            <div className={styles.tileValue}>{overview ? overview.stations.toLocaleString() : '…'}</div>
            {overview && <div className={styles.tileSub}>across {sync.length || overview.countries} countries</div>}
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Live prices</div>
            <div className={styles.tileValue}>{overview ? `~${overview.prices.toLocaleString()}` : '…'}</div>
            {overview && <div className={styles.tileSub}>~{overview.historyRows.toLocaleString()} history rows</div>}
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Sync health</div>
            <div className={styles.tileValue} style={{ color: staleCount ? 'var(--red)' : 'var(--green)' }}>
              {sync.length ? (staleCount ? `${staleCount} stale` : 'All fresh') : '…'}
            </div>
            {sync.length > 0 && <div className={styles.tileSub}>{sync.length} countries tracked</div>}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Data sync</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Country</th><th>Status</th><th>Last sync</th><th>Fetched</th><th>Stations</th><th>Prices</th><th>Freshest price</th></tr>
            </thead>
            <tbody>
              {sync.map(s => {
                const st = syncState(s.lastSyncAt);
                return (
                  <tr key={s.country}>
                    <td className={styles.countryCell}>{flagOf(s.country)} {COUNTRY_NAMES[s.country] ?? s.country}</td>
                    <td><span className={`${styles.dot} ${styles[st.cls]}`} />{st.label}</td>
                    <td>{ago(s.lastSyncAt)}</td>
                    <td>{s.fetched?.toLocaleString() ?? '—'}</td>
                    <td>{s.stations.toLocaleString()}</td>
                    <td>{s.prices.toLocaleString()}</td>
                    <td>{ago(s.freshestPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Users {userList.total ? `(${userList.total})` : ''}</h2>
        <form className={styles.searchRow} onSubmit={e => { e.preventDefault(); loadUsers(query); }}>
          <input className={styles.input} placeholder="Search by email…" value={query} onChange={e => setQuery(e.target.value)} />
          <button className={styles.searchBtn} type="submit">Search</button>
          {query && <button type="button" className={styles.clearBtn} onClick={() => { setQuery(''); loadUsers(''); }}>Clear</button>}
        </form>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Email</th><th>Joined</th><th>Role</th><th>Plan</th><th>Flags</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {userList.users.map(u => (
                <tr key={u.id}>
                  <td className={styles.emailCell}>{u.email}{u.id === selfId && <span className={styles.youTag}>you</span>}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>{u.role === 'admin' ? <span className={styles.roleAdmin}>admin</span> : 'user'}</td>
                  <td>{u.plan}</td>
                  <td className={styles.flagsCell}>
                    {u.emailVerified ? '✓ verified' : '✗ unverified'}
                    {u.twoFa ? ' · 2FA' : ''}
                    {u.googleLinked ? ' · Google' : ''}
                    {u.favorites > 0 ? ` · ${u.favorites}★` : ''}
                  </td>
                  <td className={styles.actionsCell}>
                    <button
                      className={styles.actionBtn}
                      disabled={busyId === u.id || u.id === selfId}
                      title={u.id === selfId ? 'You cannot change your own role' : ''}
                      onClick={() => patchUser(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}
                    >
                      {u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                    </button>
                    <button
                      className={styles.actionBtn}
                      disabled={busyId === u.id}
                      onClick={() => patchUser(u.id, { plan: u.plan === 'premium' ? 'free' : 'premium' })}
                    >
                      {u.plan === 'premium' ? 'Set free' : 'Set premium'}
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.dangerBtn}`}
                      disabled={busyId === u.id || u.id === selfId}
                      onClick={() => removeUser(u.id, u.email)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
