'use client';
import { createContext, useContext, useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';

// useLayoutEffect warns during SSR; this variant is a no-op there and a real
// layout effect on the client, so the toggle's icon updates before paint
// instead of flashing the server's placeholder for a frame.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Site-wide light/dark switch. The map page ignores this entirely — its
// palette is pinned locally in map.module.css. A blocking inline script in
// layout.js sets documentElement's data-theme before hydration (see
// THEME_BOOTSTRAP below, inlined there) so there's no flash on load; this
// provider just keeps React and the DOM attribute in sync afterwards.

export const STORAGE_KEY = 'gasify.theme';

const ThemeContext = createContext(null);

function systemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  // Always starts 'light' so server and first client render match exactly —
  // the layout effect below corrects it before the browser paints, using
  // whatever the blocking bootstrap script already wrote to the DOM.
  const [theme, setThemeState] = useState('light');

  useIsoLayoutEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
    const next = saved === 'dark' || saved === 'light' ? saved : systemTheme();
    setThemeState(next);
    document.documentElement.dataset.theme = next;

    // Only follow the OS live if the user never chose explicitly.
    if (!saved) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = e => {
        const t = e.matches ? 'dark' : 'light';
        setThemeState(t);
        document.documentElement.dataset.theme = t;
      };
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, []);

  const setTheme = useCallback(t => {
    if (t !== 'light' && t !== 'dark') return;
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
