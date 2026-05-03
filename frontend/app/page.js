import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <main className={styles.landing}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>🇸🇮 Slovenia · More coming soon</span>
          <h1 className={styles.headline}>
            Find the <span className={styles.accent}>cheapest fuel</span><br />near you
          </h1>
          <p className={styles.sub}>
            Real-time prices from 500+ gas stations. Search by location or city — no account required.
          </p>
          <div className={styles.cta}>
            <Link href="/map" className={styles.btnPrimary}>Open Map</Link>
            <Link href="/auth/register" className={styles.btnSecondary}>Create Account</Link>
          </div>
        </div>
      </section>

      <section className={styles.features}>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>📍</div>
          <h3>GPS Location</h3>
          <p>Share your location to instantly find the cheapest station within reach.</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>🗺️</div>
          <h3>Interactive Map</h3>
          <p>Browse stations on the map, color-coded by price. Tap for full details.</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>⭐</div>
          <h3>Save Favorites</h3>
          <p>Log in to save your favorite stations and home/work locations.</p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>📈</div>
          <h3>Price Trends</h3>
          <p>Track price history and get notified when prices drop significantly.</p>
        </div>
      </section>
    </main>
  );
}
