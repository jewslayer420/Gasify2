'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '../../lib/context/UserContext';
import { getFavorites, removeFavorite, getSavedLocations, saveLocation, deleteLocation } from '../../lib/api';
import styles from './page.module.css';

const FUEL_LABELS = { diesel: 'Diesel', sp95: '95', sp98: '98', sp100: '100', diesel_premium: 'Diesel+', lpg: 'LPG' };

function priceColor(p) {
  if (!p) return '';
  if (p <= 1.60) return styles.green;
  if (p <= 1.90) return styles.orange;
  return styles.red;
}

export default function DashboardPage() {
  const { user, loading } = useUser() ?? {};
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [addingLocation, setAddingLocation] = useState(false);
  const [locForm, setLocForm] = useState({ label: 'home', name: '', lat: '', lng: '' });

  useEffect(() => {
    if (!loading && !user) { router.push('/auth/login'); return; }
    if (user) {
      Promise.all([getFavorites(), getSavedLocations()])
        .then(([favs, locs]) => { setFavorites(favs); setLocations(locs); setLoadingData(false); });
    }
  }, [user, loading, router]);

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
        <h2 className={styles.sectionTitle}>Favorite Stations</h2>
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
                  {dieselPrice && <span className={`${styles.price} ${priceColor(dieselPrice)}`}>€{dieselPrice.toFixed(3)}</span>}
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
    </div>
  );
}
