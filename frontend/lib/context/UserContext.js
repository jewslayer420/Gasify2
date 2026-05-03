'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { logout as apiLogout } from '../api';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUser(data?.user ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function logout() {
    await apiLogout();
    setUser(null);
  }

  return (
    <UserContext.Provider value={{ user, setUser, logout, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
