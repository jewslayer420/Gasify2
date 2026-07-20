'use client';
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

// Metric/imperial display preference. Distances are always computed and
// stored in km internally (source of truth); this only affects how numbers
// are formatted for display. CurrencyContext reads volumeFactor from here
// to convert EUR-per-litre prices to EUR-per-US-gallon, so every existing
// fmt()/fmtCompact()/convert() call site sitewide gets gallon pricing for
// free with no call-site changes.

export const STORAGE_KEY = 'gasify.units';

const KM_PER_MI = 1.609344;
const L_PER_US_GAL = 3.785411784;

const UnitsContext = createContext(null);

export function UnitsProvider({ children }) {
  const [system, setSystemState] = useState('metric'); // first client render matches SSR; localStorage applies after mount

  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
    if (saved === 'metric' || saved === 'imperial') setSystemState(saved);
  }, []);

  const setSystem = useCallback(s => {
    if (s !== 'metric' && s !== 'imperial') return;
    setSystemState(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch {}
  }, []);

  const value = useMemo(() => {
    const imperial = system === 'imperial';

    const fmtDistance = km => {
      if (km == null) return '—';
      const v = imperial ? km / KM_PER_MI : km;
      return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${imperial ? 'mi' : 'km'}`;
    };

    return {
      system,
      setSystem,
      imperial,
      distanceUnit: imperial ? 'mi' : 'km',
      volumeUnit: imperial ? 'gal' : 'L',
      fmtDistance,
      // Multiply a EUR-per-litre value by this to get EUR-per-(display unit).
      volumeFactor: imperial ? L_PER_US_GAL : 1,
    };
  }, [system, setSystem]);

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  return useContext(UnitsContext);
}
