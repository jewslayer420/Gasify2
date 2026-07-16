'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import styles from './page.module.css';

const MapPreview = dynamic(() => import('../components/MapPreview/MapPreview'), {
  ssr: false,
  loading: () => <div className={styles.shotLoading} />,
});

const FLAGS = {
  SI: '🇸🇮', FR: '🇫🇷', AT: '🇦🇹', HU: '🇭🇺', DE: '🇩🇪', CZ: '🇨🇿', SK: '🇸🇰',
  NL: '🇳🇱', BE: '🇧🇪', CH: '🇨🇭', PL: '🇵🇱', RO: '🇷🇴', HR: '🇭🇷', RS: '🇷🇸',
  ES: '🇪🇸', IT: '🇮🇹', PT: '🇵🇹', LU: '🇱🇺', BG: '🇧🇬', GR: '🇬🇷', BA: '🇧🇦',
  ME: '🇲🇪', MK: '🇲🇰', AL: '🇦🇱', XK: '🇽🇰', GB: '🇬🇧', DK: '🇩🇰',
  FI: '🇫🇮', IE: '🇮🇪', LV: '🇱🇻', LT: '🇱🇹', EE: '🇪🇪', TR: '🇹🇷',
  AU: '🇦🇺', IS: '🇮🇸', MX: '🇲🇽', TW: '🇹🇼',
  MY: '🇲🇾', TH: '🇹🇭', NZ: '🇳🇿', CA: '🇨🇦',
  CL: '🇨🇱', BR: '🇧🇷', US: '🇺🇸', ZA: '🇿🇦',
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
  DK: 'Denmark', FI: 'Finland', IE: 'Ireland',
  LV: 'Latvia', LT: 'Lithuania', EE: 'Estonia', TR: 'Turkey', AU: 'Australia',
  IS: 'Iceland', MX: 'Mexico', TW: 'Taiwan',
  MY: 'Malaysia', TH: 'Thailand', NZ: 'New Zealand', CA: 'Canada',
  CL: 'Chile', BR: 'Brazil', US: 'United States', ZA: 'South Africa',
  CY: 'Cyprus', MT: 'Malta', AE: 'UAE', SA: 'Saudi Arabia', KE: 'Kenya',
  DO: 'Dominican Rep.', UY: 'Uruguay', QA: 'Qatar', KW: 'Kuwait', OM: 'Oman',
  BH: 'Bahrain', BN: 'Brunei', EC: 'Ecuador', VN: 'Vietnam', EG: 'Egypt',
  JO: 'Jordan', TN: 'Tunisia', MA: 'Morocco', ID: 'Indonesia', IN: 'India',
  MD: 'Moldova', IL: 'Israel', PK: 'Pakistan', JP: 'Japan', BD: 'Bangladesh',
  LK: 'Sri Lanka', NP: 'Nepal', CR: 'Costa Rica', PA: 'Panama',
  AZ: 'Azerbaijan', DZ: 'Algeria',
};

const TOTEM_FUELS = [
  { key: 'diesel', tab: 'Diesel', label: 'Diesel' },
  { key: 'sp95', tab: '95', label: 'Petrol 95' },
  { key: 'sp98', tab: '98', label: 'Petrol 98' },
  { key: 'sp100', tab: '100', label: 'Petrol 100' },
  { key: 'lpg', tab: 'LPG', label: 'LPG' },
];

export default function LandingPage() {
  const [counts, setCounts] = useState({});
  const [fuel, setFuel] = useState('diesel');
  const [leagues, setLeagues] = useState({}); // fuel key -> top-10 rows, cached per visit

  useEffect(() => {
    fetch('/api/stations/counts')
      .then(r => r.ok ? r.json() : {})
      .then(d => setCounts(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (leagues[fuel]) return;
    fetch(`/api/stations/country-meta?fuel=${fuel}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setLeagues(prev => ({
        ...prev,
        [fuel]: d.filter(m => m.median != null && FLAGS[m.country])
          .sort((a, b) => a.median - b.median)
          .slice(0, 10),
      })))
      .catch(() => {});
  }, [fuel, leagues]);

  const league = leagues[fuel] ?? [];
  const fuelMeta = TOTEM_FUELS.find(f => f.key === fuel);

  const covered = Object.keys(FLAGS).filter(c => counts[c] > 0);
  const totalStations = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <main className={styles.landing}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.headline}>Every station.<br />One map.</h1>
          <p className={styles.sub}>
            Live fuel prices from {totalStations ? `${Math.round(totalStations / 1000).toLocaleString()},000+` : 'hundreds of thousands of'} stations
            in {covered.length || 'dozens of'} countries — straight from official sources.
          </p>
          <div className={styles.cta}>
            <Link href="/map" className={styles.btnPrimary}>Open the map</Link>
            <Link href="/auth/register" className={styles.linkQuiet}>Create an account →</Link>
          </div>
        </div>

        {Object.keys(leagues).length > 0 && (
          <figure className={styles.totem}>
            <div className={styles.totemHead}>{fuelMeta.label} — cheapest today</div>
            <div className={styles.totemTabs} role="tablist" aria-label="Fuel type">
              {TOTEM_FUELS.map(f => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={fuel === f.key}
                  className={`${styles.totemTab} ${fuel === f.key ? styles.totemTabActive : ''}`}
                  onClick={() => setFuel(f.key)}
                >
                  {f.tab}
                </button>
              ))}
            </div>
            {league.slice(0, 5).map((m, i) => (
              <Link key={m.country} href="/map" className={styles.totemRow}>
                <span className={styles.totemLabel}>{COUNTRY_NAMES[m.country] ?? m.country}</span>
                <span className={styles.ledPrice} style={{ animationDelay: `${i * 130}ms` }}>{m.median.toFixed(3)}</span>
              </Link>
            ))}
            {leagues[fuel] === undefined && (
              <div className={styles.totemEmpty}>Reading the sign…</div>
            )}
            {leagues[fuel]?.length === 0 && (
              <div className={styles.totemEmpty}>No live {fuelMeta.label} medians right now.</div>
            )}
            <div className={styles.totemFoot}>EUR / LITRE · LIVE</div>
            <figcaption className={styles.totemCaption}>
              The five cheapest countries for {fuelMeta.key === 'lpg' ? 'LPG' : fuelMeta.label.toLowerCase()}, right now.
            </figcaption>
          </figure>
        )}
      </section>

      <section className={styles.shot}>
        <h2 className={styles.countriesTitle}>See every price on one map</h2>
        <div className={styles.shotFrame}>
          <MapPreview />
        </div>
      </section>

      <section className={styles.countries}>
        <h2 className={styles.countriesTitle}>Where Gasify works</h2>
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

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerBrand}>Gasify<span className={styles.footerDot}>.</span></span>
          <div className={styles.footerLinks}>
            <Link href="/map">Map</Link>
            <Link href="/news">News</Link>
            <Link href="/credits">Data sources</Link>
            <Link href="/auth/login">Login</Link>
          </div>
          <span className={styles.footerNote}>
            Official sources only — every price comes from a government ministry, energy regulator
            or state oil company. <Link href="/credits" className={styles.footerNoteLink}>See every source</Link>
            <br />Map data © OpenStreetMap contributors · © MapTiler
          </span>
        </div>
      </footer>
    </main>
  );
}
