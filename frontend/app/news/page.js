'use client';
import { useState, useEffect } from 'react';
import { getNews } from '../../lib/api';
import styles from './page.module.css';

const FUEL_LABELS = { diesel: 'Diesel', sp95: '95', sp98: '98', sp100: '100', diesel_premium: 'Diesel+', lpg: 'LPG' };

function arrow(pct) {
  return pct > 0 ? '▲' : '▼';
}

export default function NewsPage() {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNews().then(data => { setChanges(data); setLoading(false); });
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Price Changes</h1>
        <p className={styles.sub}>Stations with significant price moves in the last 24 hours</p>
      </div>

      {loading && <div className={styles.spinner} />}

      {!loading && changes.length === 0 && (
        <div className={styles.empty}>
          <p>No significant price changes in the last 24 hours.</p>
        </div>
      )}

      <div className={styles.list}>
        {changes.map((c, i) => (
          <div key={i} className={styles.item}>
            <div className={styles.itemLeft}>
              <div className={styles.stationName}>{c.station.name}</div>
              <div className={styles.stationCity}>{c.station.city} · {FUEL_LABELS[c.fuelType] ?? c.fuelType}</div>
            </div>
            <div className={styles.itemRight}>
              <div className={`${styles.change} ${c.changePct > 0 ? styles.up : styles.down}`}>
                {arrow(c.changePct)} {Math.abs(c.changePct)}%
              </div>
              <div className={styles.prices}>
                <span className={styles.oldPrice}>€{c.oldPrice.toFixed(3)}</span>
                <span className={styles.arrow}>→</span>
                <span className={styles.newPrice}>€{c.newPrice.toFixed(3)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
