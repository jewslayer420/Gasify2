'use client';
import { createContext, useContext, useState, useEffect, useMemo } from 'react';

// Display-currency switcher. Prices stay EUR internally everywhere (sorting,
// price-level colors, thresholds) — only the rendered string converts, using
// EUR-base rates from /api/fx (open.er-api.com, cached 12h server-side).

// Curated picker catalog: majors first, then every currency our 64 countries
// price fuel in. Rates themselves come from the API, so adding a line here is
// all it takes to offer another currency.
export const CURRENCY_GROUPS = [
  { label: 'Popular', items: [
    ['EUR', 'Euro'], ['USD', 'US Dollar'], ['GBP', 'British Pound'], ['INR', 'Indian Rupee'],
    ['JPY', 'Japanese Yen'], ['CNY', 'Chinese Yuan'], ['AUD', 'Australian Dollar'],
    ['CAD', 'Canadian Dollar'], ['CHF', 'Swiss Franc'],
  ]},
  { label: 'Europe', items: [
    ['ISK', 'Icelandic Króna'], ['DKK', 'Danish Krone'], ['CZK', 'Czech Koruna'], ['PLN', 'Polish Złoty'],
    ['HUF', 'Hungarian Forint'], ['RON', 'Romanian Leu'], ['BGN', 'Bulgarian Lev'], ['RSD', 'Serbian Dinar'],
    ['BAM', 'Bosnian Mark'], ['MKD', 'Macedonian Denar'], ['ALL', 'Albanian Lek'], ['MDL', 'Moldovan Leu'],
    ['TRY', 'Turkish Lira'], ['AZN', 'Azerbaijani Manat'],
  ]},
  { label: 'Americas', items: [
    ['BRL', 'Brazilian Real'], ['MXN', 'Mexican Peso'], ['CLP', 'Chilean Peso'], ['DOP', 'Dominican Peso'],
    ['UYU', 'Uruguayan Peso'], ['CRC', 'Costa Rican Colón'], ['PAB', 'Panamanian Balboa'],
  ]},
  { label: 'Middle East & Africa', items: [
    ['AED', 'UAE Dirham'], ['SAR', 'Saudi Riyal'], ['QAR', 'Qatari Riyal'], ['KWD', 'Kuwaiti Dinar'],
    ['BHD', 'Bahraini Dinar'], ['OMR', 'Omani Rial'], ['JOD', 'Jordanian Dinar'], ['ILS', 'Israeli Shekel'],
    ['EGP', 'Egyptian Pound'], ['MAD', 'Moroccan Dirham'], ['TND', 'Tunisian Dinar'], ['DZD', 'Algerian Dinar'],
    ['ZAR', 'South African Rand'], ['KES', 'Kenyan Shilling'],
  ]},
  { label: 'Asia-Pacific', items: [
    ['PKR', 'Pakistani Rupee'], ['BDT', 'Bangladeshi Taka'], ['LKR', 'Sri Lankan Rupee'], ['NPR', 'Nepalese Rupee'],
    ['THB', 'Thai Baht'], ['MYR', 'Malaysian Ringgit'], ['IDR', 'Indonesian Rupiah'], ['VND', 'Vietnamese Dong'],
    ['BND', 'Brunei Dollar'], ['TWD', 'Taiwan Dollar'], ['NZD', 'New Zealand Dollar'],
  ]},
];

const STORAGE_KEY = 'gasify.currency';
const KNOWN = new Set(CURRENCY_GROUPS.flatMap(g => g.items.map(([c]) => c)));

const CurrencyContext = createContext(null);

// Formatter cache: one Intl.NumberFormat per currency+digits pair
const nfCache = new Map();
function nf(code, digits) {
  const key = `${code}:${digits}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en', {
      style: 'currency', currency: code, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
    nfCache.set(key, f);
  }
  return f;
}

export function CurrencyProvider({ children }) {
  const [code, setCodeState] = useState('EUR'); // first client render matches SSR; localStorage applies after mount
  const [rates, setRates] = useState(null);

  useEffect(() => {
    const saved = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (saved && KNOWN.has(saved)) setCodeState(saved);
    fetch('/api/fx')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.rates) setRates(d.rates); })
      .catch(() => {});
  }, []);

  const value = useMemo(() => {
    const rate = code === 'EUR' ? 1 : (rates?.[code] ?? null);
    const active = rate != null; // rates still loading / currency unknown → fall back to EUR display
    const effCode = active ? code : 'EUR';
    const effRate = active ? rate : 1;

    const convert = eur => (eur == null ? null : eur * effRate);

    // Fuel prices span €0.2/L to IDR ~19,000/L — pick decimals by magnitude so
    // every currency reads naturally (¥191, ₹92.46, $1.853, Rp 17,300).
    const fmt = eur => {
      if (eur == null) return '—';
      const v = eur * effRate;
      const d = v >= 1000 ? 0 : v >= 100 ? 1 : v >= 10 ? 2 : 3;
      return nf(effCode, d).format(v);
    };
    const fmtCompact = eur => {
      if (eur == null) return '—';
      const v = eur * effRate;
      const d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
      return nf(effCode, d).format(v);
    };

    const setCode = c => {
      if (!KNOWN.has(c)) return;
      setCodeState(c);
      try { localStorage.setItem(STORAGE_KEY, c); } catch {}
    };

    return { code, effCode, setCode, rate: effRate, ready: active, convert, fmt, fmtCompact };
  }, [code, rates]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
