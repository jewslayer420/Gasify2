'use client';
import { useCurrency, CURRENCY_GROUPS } from '../../lib/context/CurrencyContext';
import styles from './CurrencySelect.module.css';

// Compact currency switcher: the closed control shows just the active code;
// the (invisible, full-hit-area) native select supplies the grouped dropdown
// and keyboard/screen-reader behaviour for free.
export default function CurrencySelect() {
  const { code, setCode } = useCurrency() ?? {};
  if (!code) return null;

  return (
    <label className={styles.wrap} title="Display currency">
      <span className={styles.code}>{code}</span>
      <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
      <select
        className={styles.select}
        value={code}
        onChange={e => setCode(e.target.value)}
        aria-label="Display currency"
      >
        {CURRENCY_GROUPS.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map(([c, name]) => (
              <option key={c} value={c}>{c} — {name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
