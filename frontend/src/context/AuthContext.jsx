import React, { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // The session is an httpOnly cookie, so the page cannot inspect it to decide
  // whether it is signed in — asking the server is the only way to know, and
  // it is the honest one: a token that exists is not the same as a token that
  // is still valid.
  useEffect(() => {
    client
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await client.post('/auth/login', { email, password });
    setUser(res.data.user);
  }

  async function logout() {
    // Server-side: the browser will not let a script delete a cookie it cannot
    // read. The local state is cleared regardless, so a failed request still
    // signs the user out of this tab rather than stranding them.
    try {
      await client.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
