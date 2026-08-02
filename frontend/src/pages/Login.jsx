import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import { greetingFor } from '../lib/greeting';
import logo from '../assets/grillexa-logo.png';

const GREETING_MS = 3000;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [greeting, setGreeting] = useState('');

  // The greeting shows itself out after three seconds and lands them in the
  // app. Cleared on unmount so someone who hits Back mid-greeting isn't
  // yanked forward again by a timer that outlived the page.
  useEffect(() => {
    if (!greeting) return undefined;
    const timer = setTimeout(() => navigate('/'), GREETING_MS);
    return () => clearTimeout(timer);
  }, [greeting, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      // Everyone is greeted by name, not only managers. It was manager-only
      // first, and the next two people who wanted it were an admin and a
      // sales account — a role gate here is just that request again the next
      // time someone is hired. The name is whatever the account says it is,
      // so changing the greeting means renaming the account, not a deploy.
      const hello = greetingFor(user.name);
      if (hello) setGreeting(hello);
      else navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (greeting) {
    return (
      <div className="auth-page">
        <div className="modal-backdrop">
          <div className="modal greeting-modal" role="status">
            <img src={logo} alt="" className="greeting-logo" />
            <h2>{greeting}</h2>
            <p>Greetings from Grillexa 🥗</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <img src={logo} alt="Grillexa" className="auth-logo" />
        <form className="auth-form card" onSubmit={handleSubmit}>
          <div>
            <h1>Welcome back</h1>
            <p className="auth-subtitle">Log in to manage your stores.</p>
          </div>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}
