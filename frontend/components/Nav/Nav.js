'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '../../lib/context/UserContext';
import styles from './Nav.module.css';

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { user, logout } = useUser() ?? {};

  async function handleLogout() {
    await logout?.();
    router.push('/');
  }

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.logo}>⛽ Gasify</Link>
      <div className={styles.links}>
        <Link href="/map" className={`${styles.link} ${path === '/map' ? styles.linkActive : ''}`}>Map</Link>
        <Link href="/news" className={`${styles.link} ${path === '/news' ? styles.linkActive : ''}`}>News</Link>
        <Link href="/credits" className={`${styles.link} ${path === '/credits' ? styles.linkActive : ''}`}>Credits</Link>
        {user && <Link href="/dashboard" className={`${styles.link} ${path === '/dashboard' ? styles.linkActive : ''}`}>Dashboard</Link>}
        {user
          ? <button className={`${styles.link} ${styles.loginBtn}`} onClick={handleLogout}>Logout</button>
          : <Link href="/auth/login" className={`${styles.link} ${styles.loginBtn}`}>Login</Link>
        }
      </div>
    </nav>
  );
}
