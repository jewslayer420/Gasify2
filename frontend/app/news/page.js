'use client';
import { useState, useEffect, useRef } from 'react';
import { getNews, getNewsPlaces } from '../../lib/api';
import { COUNTRY_NAMES } from '../../lib/countries';
import { useCurrency } from '../../lib/context/CurrencyContext';
import styles from './page.module.css';

const FUEL_LABELS = { diesel: 'Diesel', sp95: '95', sp98: '98', sp100: '100', diesel_premium: 'Diesel+', lpg: 'LPG' };

function arrow(pct) {
  return pct > 0 ? '▲' : '▼';
}

// Country matches for the search dropdown, resolved client-side from the
// static COUNTRY_NAMES map (cities come from the backend, see getNewsPlaces).
function matchCountries(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return Object.entries(COUNTRY_NAMES)
    .filter(([code, name]) => name.toLowerCase().startsWith(needle) || code.toLowerCase() === needle)
    .slice(0, 4)
    .map(([code, name]) => ({ type: 'country', code, name }));
}

export default function NewsPage() {
  const { fmt } = useCurrency();
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState(null); // { country?, city?, label }
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    getNews(scope ?? {})
      .then(data => { setChanges(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setChanges([]); setLoading(false); });
  }, [scope]);

  // Close the dropdown on any click outside the search box
  useEffect(() => {
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function onQueryChange(e) {
    const q = e.target.value;
    setQuery(q);
    setActiveIdx(-1);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSuggestions(matchCountries(q)); setOpen(!!q.trim()); return; }
    setSuggestions(matchCountries(q));
    setOpen(true);
    debounceRef.current = setTimeout(() => {
      getNewsPlaces(q.trim())
        .then(cities => {
          setSuggestions([
            ...matchCountries(q),
            ...cities.map(c => ({ type: 'city', city: c.city, country: c.country, stations: c.stations })),
          ]);
        })
        .catch(() => {});
    }, 250);
  }

  function select(s) {
    if (!s) return;
    if (s.type === 'country') {
      setScope({ country: s.code, label: s.name });
    } else if (s.country) {
      setScope({ country: s.country, city: s.city, label: `${s.city}, ${COUNTRY_NAMES[s.country] ?? s.country}` });
    } else {
      // Free-text Enter with no match: search the city prefix worldwide
      setScope({ city: s.city, label: s.city });
    }
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) return select(suggestions[activeIdx]);
      if (suggestions.length) return select(suggestions[0]);
      const q = query.trim();
      if (q) select({ type: 'city', city: q, country: null });
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Price Changes</h1>
        <p className={styles.sub}>Stations with significant price moves in the last 24 hours</p>
      </div>

      <div className={styles.searchWrap} ref={boxRef}>
        <div className={styles.searchBox}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search a country or city…"
            value={query}
            onChange={onQueryChange}
            onKeyDown={onKeyDown}
            onFocus={() => { if (suggestions.length) setOpen(true); }}
            aria-label="Search price changes by country or city"
          />
          {scope && (
            <button className={styles.scopeChip} onClick={() => setScope(null)} title="Back to worldwide">
              {scope.label ?? scope.city}
              <span className={styles.scopeX}>×</span>
            </button>
          )}
        </div>

        {open && suggestions.length > 0 && (
          <div className={styles.dropdown}>
            {suggestions.map((s, i) => (
              <button
                key={s.type === 'country' ? `c-${s.code}` : `y-${s.city}-${s.country}`}
                className={`${styles.suggestion} ${i === activeIdx ? styles.suggestionActive : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => select(s)}
              >
                <span className={styles.suggestionName}>
                  {s.type === 'country' ? s.name : s.city}
                </span>
                <span className={styles.suggestionMeta}>
                  {s.type === 'country' ? 'Country' : `${COUNTRY_NAMES[s.country] ?? s.country} · ${s.stations} station${s.stations === 1 ? '' : 's'}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className={styles.spinner} />}

      {!loading && changes.length === 0 && (
        <div className={styles.empty}>
          <p>
            {scope
              ? `No significant price changes in ${scope.label ?? scope.city} in the last 24 hours.`
              : 'No significant price changes in the last 24 hours.'}
          </p>
          {scope && (
            <button className={styles.emptyClear} onClick={() => setScope(null)}>Show worldwide changes</button>
          )}
        </div>
      )}

      <div className={styles.list}>
        {changes.map((c, i) => (
          <div key={i} className={styles.item}>
            <div className={styles.itemLeft}>
              <div className={styles.stationName}>{c.station.name}</div>
              <div className={styles.stationCity}>
                {[c.station.city, c.station.country, FUEL_LABELS[c.fuelType] ?? c.fuelType].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className={styles.itemRight}>
              <div className={`${styles.change} ${c.changePct > 0 ? styles.up : styles.down}`}>
                {arrow(c.changePct)} {Math.abs(c.changePct)}%
              </div>
              <div className={styles.prices}>
                <span className={styles.oldPrice}>{fmt(c.oldPrice)}</span>
                <span className={styles.arrow}>→</span>
                <span className={styles.newPrice}>{fmt(c.newPrice)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
