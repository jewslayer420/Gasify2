'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '../../lib/context/UserContext';
import { getAccount } from '../../lib/api';
import styles from './page.module.css';

// Free tier = everything Gasify does today (all real, all shipped).
const FREE = [
  'Live fuel prices across 60+ countries',
  'Interactive map, heatmap & cheapest-near-me',
  'Favorite stations & saved locations',
  'Price-history charts per station',
  'Prices in 45+ currencies',
  'Daily price-change news',
];

// Premium tier = a direction, not a promise. Everything here is upcoming; the
// exact lineup is still being decided, so nothing is billable yet.
const PREMIUM = [
  'Price-drop alerts for your favorites',
  'Unlimited saved locations',
  'Ad-free, faster experience',
  'Priority data refresh',
  'Full history export (CSV)',
  'API access for developers',
];

function Check() {
  return (
    <svg className={styles.check} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function PricingPage() {
  const { user } = useUser() ?? {};
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    if (user) getAccount().then(a => setPlan(a?.plan ?? null)).catch(() => {});
  }, [user]);

  const onFree = user && plan === 'free';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Pricing</span>
        <h1 className={styles.title}>Start free. Upgrade when it’s worth it.</h1>
        <p className={styles.sub}>
          Everything you need to find cheaper fuel is free, forever. Premium is on the way for people who want alerts and power tools.
        </p>
      </header>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.planName}>Free</div>
          <div className={styles.price}><span className={styles.amount}>€0</span><span className={styles.per}>/ forever</span></div>
          <p className={styles.planNote}>Everything Gasify does today.</p>
          <ul className={styles.features}>
            {FREE.map(f => <li key={f}><Check />{f}</li>)}
          </ul>
          {onFree
            ? <div className={`${styles.cta} ${styles.ctaCurrent}`}>Your current plan</div>
            : user
              ? <Link href="/map" className={`${styles.cta} ${styles.ctaGhost}`}>Open the map</Link>
              : <Link href="/auth/register" className={`${styles.cta} ${styles.ctaSolid}`}>Create free account</Link>}
        </section>

        <section className={`${styles.card} ${styles.cardPremium}`}>
          <div className={styles.premiumBadge}>Coming soon</div>
          <div className={styles.planName}>Premium</div>
          <div className={styles.price}><span className={styles.amount}>TBD</span><span className={styles.per}>/ month</span></div>
          <p className={styles.planNote}>For regular drivers and fleets who want more.</p>
          <ul className={styles.features}>
            {PREMIUM.map(f => <li key={f}><Check />{f}</li>)}
          </ul>
          <button className={`${styles.cta} ${styles.ctaSoon}`} disabled>Not available yet</button>
        </section>
      </div>

      <p className={styles.foot}>
        Prices and Premium features aren’t final. Have a feature you’d pay for?{' '}
        <a href="mailto:teo.karov@gmail.com" className={styles.footLink}>Tell us</a>.
      </p>
    </div>
  );
}
