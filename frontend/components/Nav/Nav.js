'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '../../lib/context/UserContext';
import styles from './Nav.module.css';

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { user, logout } = useUser() ?? {};

  if (path === '/map') return null;

  async function handleLogout() {
    await logout?.();
    router.push('/');
  }

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.logo}>⛽ Gasify</Link>
      <div className={styles.links}>
        <Link href="/map" className={styles.link}>Map</Link>
        <Link href="/news" className={styles.link}>News</Link>
        {user && <Link href="/dashboard" className={styles.link}>Dashboard</Link>}
        {user
          ? <button className={`${styles.link} ${styles.loginBtn}`} onClick={handleLogout}>Logout</button>
          : <Link href="/auth/login" className={`${styles.link} ${styles.loginBtn}`}>Login</Link>
        }
      </div>
    </nav>
  );
}
