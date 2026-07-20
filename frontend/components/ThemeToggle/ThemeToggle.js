'use client';
import { useTheme } from '../../lib/context/ThemeContext';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme() ?? {};
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className={`${styles.toggle} ${className}`}
      onClick={toggleTheme}
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
