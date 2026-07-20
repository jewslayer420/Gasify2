'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useUser } from '../lib/context/UserContext';
import styles from './page.module.css';

const MapPreview = dynamic(() => import('../components/MapPreview/MapPreview'), {
  ssr: false,
  loading: () => <div className={styles.plateLoading} />,
});

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

// EN 16942 pump labels: petrol lives in a circle, diesel in a square,
// gaseous fuels in a diamond — the board's fuel selector reuses that geometry.
const FUELS = [
  { key: 'diesel', name: 'Diesel', label: 'B7', shape: 'square' },
  { key: 'sp95', name: 'Petrol 95', label: 'E10', shape: 'circle' },
  { key: 'sp98', name: 'Petrol 98', label: 'E5', shape: 'circle' },
  { key: 'lpg', name: 'LPG', label: 'LPG', shape: 'diamond' },
];

// Space-grouped thousands, the way European timetables set large numbers.
// Narrow no-break space, so counts never wrap inside the index columns.
function fmtNum(n) {
  return n.toLocaleString('en-US').replaceAll(',', '\u202F');
}

// One-shot rise-in on first viewport entry; instant under reduced motion.
function Reveal({ className = '', children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add(styles.revealOn);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.classList.add(styles.revealOn);
        io.disconnect();
      }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`${styles.reveal} ${className}`}>{children}</div>;
}

function FuelPict({ shape, label, active }) {
  return (
    <span className={`${styles.pict} ${styles[shape]} ${active ? styles.pictActive : ''}`}>
      <span>{label}</span>
    </span>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { user, logout } = useUser() ?? {};
  const [counts, setCounts] = useState({});
  const [fuel, setFuel] = useState('diesel');
  const [leagues, setLeagues] = useState({}); // fuel key -> ranked country rows

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
        [fuel]: d.filter(m => m.median != null && COUNTRY_NAMES[m.country])
          .sort((a, b) => a.median - b.median)
          .slice(0, 8),
      })))
      .catch(() => {});
  }, [fuel, leagues]);

  const league = leagues[fuel];
  const fuelMeta = FUELS.find(f => f.key === fuel);

  const covered = Object.keys(COUNTRY_NAMES).filter(c => counts[c] > 0);
  const totalStations = Object.values(counts).reduce((a, b) => a + b, 0);
  const indexRows = Object.entries(COUNTRY_NAMES)
    .sort((a, b) => a[1].localeCompare(b[1]));

  async function handleLogout() {
    await logout?.();
    router.push('/');
  }

  return (
    <main className={styles.page}>

      <header className={styles.masthead}>
        <Link href="/" className={styles.wordmark}>Gasify<span className={styles.wordmarkDot}>.</span></Link>
        <nav className={styles.mastNav} aria-label="Primary">
          <Link href="/map" className={styles.mastLink}>Map</Link>
          <Link href="/news" className={styles.mastLink}>News</Link>
          <Link href="/pricing" className={styles.mastLink}>Pricing</Link>
          <Link href="/credits" className={styles.mastLink}>Credits</Link>
          {user && <Link href="/dashboard" className={styles.mastLink}>Dashboard</Link>}
          {user
            ? <button className={styles.mastBtn} onClick={handleLogout}>Logout</button>
            : <Link href="/auth/login" className={styles.mastBtn}>Login</Link>}
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowMark} aria-hidden="true" />
              Live fuel price index · {covered.length || '75'} countries
            </p>
            <h1 className={styles.headline}>Every station.<br />Every price.<br />One map.</h1>
            <p className={styles.sub}>
              Live pump prices from {totalStations ? fmtNum(totalStations) : 'hundreds of thousands of'} stations,
              collected from government ministries, energy regulators and state oil
              companies. Nothing crowdsourced, nothing stale.
            </p>
            <div className={styles.cta}>
              <Link href="/map" className={styles.btnPrimary}>Open the map</Link>
              <Link href="/auth/register" className={styles.linkQuiet}>Create a free account →</Link>
            </div>
          </div>

          <figure className={styles.board}>
            <div className={styles.boardHead}>
              <span>Cheapest countries</span>
              <span className={styles.boardUnit}>EUR / litre</span>
            </div>
            <div className={styles.boardTabs} role="tablist" aria-label="Fuel type">
              {FUELS.map(f => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={fuel === f.key}
                  className={`${styles.boardTab} ${fuel === f.key ? styles.boardTabActive : ''}`}
                  onClick={() => setFuel(f.key)}
                >
                  <FuelPict shape={f.shape} label={f.label} active={fuel === f.key} />
                  <span className={styles.boardTabName}>{f.name}</span>
                </button>
              ))}
            </div>
            <ol className={styles.boardRows}>
              {(league ?? []).map((m, i) => (
                <li key={m.country}>
                  <Link href="/map" className={styles.boardRow}>
                    <span className={styles.boardRank}>{String(i + 1).padStart(2, '0')}</span>
                    <span className={styles.boardCountry}>{COUNTRY_NAMES[m.country]}</span>
                    <span className={styles.boardPrice}>{m.median.toFixed(3)}</span>
                  </Link>
                </li>
              ))}
            </ol>
            {league === undefined && <div className={styles.boardEmpty}>Loading prices…</div>}
            {league?.length === 0 && <div className={styles.boardEmpty}>No live {fuelMeta.name} medians right now.</div>}
            <figcaption className={styles.boardFoot}>
              Median pump price per country · live
            </figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.stats} aria-label="Key figures">
        <Reveal className={styles.statsGrid}>
          <div className={styles.statCell}>
            <span className={styles.statNum}>{totalStations ? fmtNum(totalStations) : '—'}</span>
            <span className={styles.statLabel}>stations tracked</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statNum}>{covered.length || '—'}</span>
            <span className={styles.statLabel}>countries live</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statNum}>100&thinsp;%</span>
            <span className={styles.statLabel}>official sources</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statNum}>0</span>
            <span className={styles.statLabel}>crowdsourced prices</span>
          </div>
        </Reveal>
      </section>

      <section className={styles.plate}>
        <Reveal>
          <div className={styles.sectionRule}>
            <span className={styles.sectionTag}>The map</span>
          </div>
          <h2 className={styles.h2}>The whole market, at a glance.</h2>
          <div className={styles.plateFrame}>
            <MapPreview />
          </div>
          <p className={styles.plateCaption}>
            Live median diesel price by country · pan and zoom · open the full map for every station
          </p>
        </Reveal>
      </section>

      <section className={styles.coverage}>
        <Reveal>
          <div className={styles.sectionRule}>
            <span className={styles.sectionTag}>Coverage</span>
          </div>
          <h2 className={styles.h2}>Where Gasify works.</h2>
          <div className={styles.indexCols}>
            {indexRows.map(([code, name]) => {
              const count = counts[code];
              return (
                <div key={code} className={`${styles.indexRow} ${count ? '' : styles.indexRowPending}`}>
                  <span className={styles.indexCode}>{code}</span>
                  <span className={styles.indexName}>{name}</span>
                  <span className={styles.indexCount}>{count > 0 ? fmtNum(count) : '·'}</span>
                </div>
              );
            })}
          </div>
          <p className={styles.indexNote}>
            Stations per country · counts update with every sync
          </p>
        </Reveal>
      </section>

      <section className={styles.method}>
        <Reveal className={styles.methodGrid}>
          <div className={styles.methodCol}>
            <div className={styles.sectionRule}>
              <span className={styles.sectionTag}>Sources</span>
            </div>
            <h3 className={styles.h3}>Official, or nothing.</h3>
            <p className={styles.body}>
              Every price comes from a government ministry, an energy regulator or a
              state oil company — never from user reports. Each source is documented,
              licensed and listed in the open.
            </p>
            <Link href="/credits" className={styles.methodLink}>See every source →</Link>
          </div>
          <div className={styles.methodCol}>
            <div className={styles.sectionRule}>
              <span className={styles.sectionTag}>Freshness</span>
            </div>
            <h3 className={styles.h3}>Synced around the clock.</h3>
            <p className={styles.body}>
              Automated pipelines pull new prices continuously, country by country,
              and a freshness monitor watches every feed. When a source updates,
              the map follows.
            </p>
            <Link href="/news" className={styles.methodLink}>Read fuel news →</Link>
          </div>
          <div className={styles.methodCol}>
            <div className={styles.sectionRule}>
              <span className={styles.sectionTag}>Scale</span>
            </div>
            <h3 className={styles.h3}>One map, every market.</h3>
            <p className={styles.body}>
              Compare a single junction or an entire continent. Median prices,
              per-station detail and multi-currency conversion sit on one
              continuous map of the world.
            </p>
            <Link href="/map" className={styles.methodLink}>Open the map →</Link>
          </div>
        </Reveal>
      </section>

      <section className={styles.finale}>
        <Reveal className={styles.finaleInner}>
          <h2 className={styles.finaleHead}>The cheapest station<br />is already on the map.</h2>
          <div className={styles.finaleCta}>
            <Link href="/map" className={styles.btnFinale}>Open the map</Link>
            <Link href="/auth/register" className={styles.finaleQuiet}>Create a free account →</Link>
          </div>
        </Reveal>
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>Gasify<span className={styles.wordmarkDot}>.</span></span>
        <div className={styles.footerLinks}>
          <Link href="/map">Map</Link>
          <Link href="/news">News</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/credits">Data sources</Link>
          <Link href="/auth/login">Login</Link>
        </div>
        <span className={styles.footerNote}>
          Prices from official government sources · Map data © OpenStreetMap contributors · © MapTiler
        </span>
      </footer>
    </main>
  );
}
