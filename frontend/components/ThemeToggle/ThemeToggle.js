'use client';
import { useTheme } from '../../lib/context/ThemeContext';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme() ?? {};
  const dark = theme === 'dark';

  // A circular reveal expanding from the button, via the View Transitions
  // API — browsers without support (or reduced-motion) just snap instantly,
  // which is a perfectly fine fallback since the underlying DOM swap is one
  // attribute write either way.
  function handleClick(e) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !document.startViewTransition) {
      toggleTheme();
      return;
    }
    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );
    const root = document.documentElement;
    root.style.setProperty('--theme-flip-x', `${x}px`);
    root.style.setProperty('--theme-flip-y', `${y}px`);
    root.style.setProperty('--theme-flip-r', `${endRadius}px`);
    document.startViewTransition(() => { toggleTheme(); });
  }

  return (
    <button
      type="button"
      className={`${styles.toggle} ${className}`}
      onClick={handleClick}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.4" />
          <path stroke="currentColor" strokeWidth="1.4" strokeLinecap="square"
            d="M8 0.8v2M8 13.2v2M15.2 8h-2M2.8 8h-2M13.1 2.9l-1.4 1.4M4.3 11.7l-1.4 1.4M13.1 13.1l-1.4-1.4M4.3 4.3L2.9 2.9" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
          <path stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
            d="M14 9.3A6.3 6.3 0 1 1 6.7 2 5 5 0 0 0 14 9.3Z" />
        </svg>
      )}
    </button>
  );
}
