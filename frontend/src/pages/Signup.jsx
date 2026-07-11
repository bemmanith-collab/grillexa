import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EyeIcon, EyeOffIcon } from '../components/icons';
import logo from '../assets/grillexa-logo.png';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signup(name, email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <img src={logo} alt="Grillexa" className="auth-logo" />
        <form className="auth-form card" onSubmit={handleSubmit}>
          <div>
            <h1>Create your account</h1>
            <p className="auth-subtitle">Get started with Grillexa.</p>
          </div>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                minLength={8}
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
          <p className="form-hint">New accounts start with Sales access. An admin can change your role from the Users page.</p>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign up'}
          </button>
          <p className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
