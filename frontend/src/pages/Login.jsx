import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import logo from '../assets/grillexa-logo.png';

const GREETING_MS = 3000;

// Local clock, not the server's: it's a greeting, so what matters is the time
// of day where the person reading it is standing.
function timeOfDay(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

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
  // app. Cleared on unmount so a manager who hits Back mid-greeting isn't
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
      // Managers get a hello on the way in; everyone else goes straight through.
      if (user.role === 'MANAGER') {
        setGreeting(`${timeOfDay()}, ${user.name.split(' ')[0]}`);
      } else {
        navigate('/');
      }
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
