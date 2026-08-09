import React, { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';
import { greetingFor } from '../lib/greeting';
import { dropPushSubscription } from '../lib/push';
import { todayStr } from '../utils/date';

const AuthContext = createContext(null);

// The last business day this device was greeted on. Greeting only on login
// meant the people who use the app most never saw it: the installed app opens
// at "/" and the session cookie lasts eight hours, so it restores a session
// rather than logging in, and so does a phone browser coming back later. Now
// opening the app greets too — but once a day, because it is opened between
// every two stores and a hello on the fortieth open is an obstacle.
const GREETED_KEY = 'grillexa_greeted_on';

function greetedToday() {
  try {
    return localStorage.getItem(GREETED_KEY) === todayStr();
  } catch (err) {
    // Private mode or storage disabled: better to greet twice than to crash
    // the whole provider on the way in.
    return false;
  }
}

function markGreeted() {
  try {
    localStorage.setItem(GREETED_KEY, todayStr());
  } catch (err) {
    /* nothing to remember it with — the greeting just repeats */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // The greeting lives here rather than on the login page because signing in
  // unmounts that page: App swaps /login for a redirect the moment `user` is
  // set, so a greeting held in Login's own state was destroyed in the same
  // render it was created in and never appeared on screen. Held here it
  // outlives the redirect and shows over wherever the user lands.
  const [greeting, setGreeting] = useState('');

  // The session is an httpOnly cookie, so the page cannot inspect it to decide
  // whether it is signed in — asking the server is the only way to know, and
  // it is the honest one: a token that exists is not the same as a token that
  // is still valid.
  useEffect(() => {
    client
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        // First open of the day on this device gets the hello, however the
        // session got here. Later opens go straight to work.
        if (!greetedToday()) {
          setGreeting(greetingFor(res.data.user.name));
          markGreeted();
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await client.post('/auth/login', { email, password });
    // An actual login is always an arrival, greeted-today or not: someone who
    // signed out and back in did just walk in.
    setGreeting(greetingFor(res.data.user.name));
    markGreeted();
    setUser(res.data.user);
    // Returned as well as stored: the caller needs to know who just logged in
    // before the context state has propagated to it.
    return res.data.user;
  }

  async function logout() {
    setGreeting('');
    // Drop this device's push subscription first, while the session cookie is
    // still valid — the endpoint is scoped to the calling user and a signed-out
    // request cannot reach it. Without this, a shared phone would keep buzzing
    // for whoever used it last, and they would be reading a colleague's
    // notifications with no way to make it stop short of browser settings.
    //
    // Never blocks signing out: a failure here must not strand someone on a
    // screen they are trying to leave.
    await dropPushSubscription().catch(() => {});
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
    <AuthContext.Provider
      value={{ user, loading, login, logout, greeting, clearGreeting: () => setGreeting('') }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
