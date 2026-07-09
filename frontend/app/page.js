'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const FLAGS = {
  SI: '🇸🇮', FR: '🇫🇷', AT: '🇦🇹', HU: '🇭🇺', DE: '🇩🇪', CZ: '🇨🇿', SK: '🇸🇰',
  NL: '🇳🇱', BE: '🇧🇪', CH: '🇨🇭', PL: '🇵🇱', RO: '🇷🇴', HR: '🇭🇷', RS: '🇷🇸',
  ES: '🇪🇸', IT: '🇮🇹', PT: '🇵🇹', LU: '🇱🇺', BG: '🇧🇬', GR: '🇬🇷', BA: '🇧🇦',
  ME: '🇲🇪', MK: '🇲🇰', AL: '🇦🇱', XK: '🇽🇰', GB: '🇬🇧', DK: '🇩🇰', NO: '🇳🇴',
  SE: '🇸🇪', FI: '🇫🇮', IE: '🇮🇪', LV: '🇱🇻', LT: '🇱🇹', EE: '🇪🇪', TR: '🇹🇷',
  AU: '🇦🇺', IS: '🇮🇸', MX: '🇲🇽', TW: '🇹🇼',
  MY: '🇲🇾', TH: '🇹🇭', NZ: '🇳🇿', KR: '🇰🇷', CA: '🇨🇦',
  CL: '🇨🇱', BR: '🇧🇷', AR: '🇦🇷', US: '🇺🇸', ZA: '🇿🇦',
  CY: '🇨🇾', MT: '🇲🇹', AE: '🇦🇪', SA: '🇸🇦', KE: '🇰🇪', DO: '🇩🇴', UY: '🇺🇾',
  QA: '🇶🇦', KW: '🇰🇼', OM: '🇴🇲', BH: '🇧🇭', BN: '🇧🇳', EC: '🇪🇨',
  VN: '🇻🇳', EG: '🇪🇬', JO: '🇯🇴', TN: '🇹🇳', MA: '🇲🇦', ID: '🇮🇩', IN: '🇮🇳',
  MD: '🇲🇩', IL: '🇮🇱', PK: '🇵🇰', JP: '🇯🇵', BD: '🇧🇩', LK: '🇱🇰', NP: '🇳🇵',
  CR: '🇨🇷', PA: '🇵🇦', AZ: '🇦🇿', DZ: '🇩🇿',
};

const COUNTRY_NAMES = {
  SI: 'Slovenia', FR: 'France', AT: 'Austria', HU: 'Hungary', DE: 'Germany',
  CZ: 'Czechia', SK: 'Slovakia', NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland',
  PL: 'Poland', RO: 'Romania', HR: 'Croatia', RS: 'Serbia', ES: 'Spain', IT: 'Italy',
  PT: 'Portugal', LU: 'Luxembourg', BG: 'Bulgaria', GR: 'Greece', BA: 'Bosnia',
  ME: 'Montenegro', MK: 'N. Macedonia', AL: 'Albania', XK: 'Kosovo', GB: 'UK',
  DK: 'Denmark', NO: 'Norway', SE: 'Sweden', FI: 'Finland', IE: 'Ireland',
  LV: 'Latvia', LT: 'Lithuania', EE: 'Estonia', TR: 'Turkey', AU: 'Australia',
  IS: 'Iceland', MX: 'Mexico', TW: 'Taiwan',
  MY: 'Malaysia', TH: 'Thailand', NZ: 'New Zealand', KR: 'South Korea', CA: 'Canada',
  CL: 'Chile', BR: 'Brazil', AR: 'Argentina', US: 'United States', ZA: 'South Africa',
  CY: 'Cyprus', MT: 'Malta', AE: 'UAE', SA: 'Saudi Arabia', KE: 'Kenya',
  DO: 'Dominican Rep.', UY: 'Uruguay', QA: 'Qatar', KW: 'Kuwait', OM: 'Oman',
  BH: 'Bahrain', BN: 'Brunei', EC: 'Ecuador', VN: 'Vietnam', EG: 'Egypt',
  JO: 'Jordan', TN: 'Tunisia', MA: 'Morocco', ID: 'Indonesia', IN: 'India',
  MD: 'Moldova', IL: 'Israel', PK: 'Pakistan', JP: 'Japan', BD: 'Bangladesh',
  LK: 'Sri Lanka', NP: 'Nepal', CR: 'Costa Rica', PA: 'Panama',
  AZ: 'Azerbaijan', DZ: 'Algeria',
};

export default function LandingPage() {
  const [counts, setCounts] = useState({});
  const [league, setLeague] = useState([]);

  useEffect(() => {
    fetch('/api/stations/counts')
      .then(r => r.ok ? r.json() : {})
      .then(d => setCounts(d))
      .catch(() => {});
    fetch('/api/stations/country-meta?fuel=diesel')
      .then(r => r.ok ? r.json() : [])
      .then(d => setLeague(
        d.filter(m => m.median != null && FLAGS[m.country])
          .sort((a, b) => a.median - b.median)
          .slice(0, 10)
      ))
      .catch(() => {});
  }, []);

  const covered = Object.keys(FLAGS).filter(c => counts[c] > 0);
  const totalStations = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <main className={styles.landing}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>
            {covered.length > 0 ? `${covered.length} countries · ${totalStations.toLocaleString()}+ stations` : 'Real-time fuel prices worldwide'}
          </span>
          <h1 className={styles.headline}>
            Find the <span className={styles.accent}>cheapest fuel</span><br />near you
          </h1>
          <p className={styles.sub}>
            Real-time prices from gas stations across Europe, Australia, Mexico and more — no account required.
          </p>
          <div className={styles.cta}>
            <Link href="/map" className={styles.btnPrimary}>Open Map</Link>
            <Link href="/auth/register" className={styles.btnSecondary}>Create Account</Link>
          </div>
        </div>
      </section>

      {league.length > 0 && (
        <section className={styles.countries}>
          <h2 className={styles.countriesTitle}>Cheapest diesel right now</h2>
          <div className={styles.leagueList}>
            {league.map((m, i) => (
              <Link key={m.country} href="/map" className={styles.leagueRow}>
                <span className={styles.leagueRank}>{i + 1}</span>
                <span className={styles.leagueFlag}>{FLAGS[m.country]}</span>
                <span className={styles.leagueName}>{COUNTRY_NAMES[m.country] ?? m.country}</span>
                <span className={styles.leaguePrice}>€{m.median.toFixed(3)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={styles.countries}>
        <h2 className={styles.countriesTitle}>Covered Countries</h2>
        <div className={styles.countryGrid}>
          {Object.entries(FLAGS).map(([code, flag]) => {
            const count = counts[code];
            return (
              <div key={code} className={`${styles.countryCard} ${count ? styles.countryCardActive : styles.countryCardInactive}`}>
                <span className={styles.countryFlag}>{flag}</span>
                <span className={styles.countryName}>{COUNTRY_NAMES[code]}</span>
                {count > 0 && (
                  <span className={styles.countryCount}>{count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.features}>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>📍</div>
          <h3>GPS Location</h3>
          <p>Share your location to instantly find the cheapest station within reach.</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>🗺️</div>
          <h3>Interactive Map</h3>
          <p>Browse stations on the map, color-coded by price. Tap for full details.</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>⭐</div>
          <h3>Save Favorites</h3>
          <p>Log in to save your favorite stations and home/work locations.</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>📈</div>
          <h3>Price Trends</h3>
          <p>Track price history and get notified when prices drop significantly.</p>
        </div>
      </section>
    </main>
  );
}
