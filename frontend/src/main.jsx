import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './index.css';
import './festive.css';
import { applyFestive } from './components/FestiveLayer.jsx';
import { festiveToday } from './lib/festive.js';

// Before the first paint, so a festive day never flashes the ordinary look.
applyFestive(festiveToday());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Registering the worker is what makes Chrome offer "Install app" and build a
// WebAPK. It caches nothing (see public/sw.js) — a failure here costs the
// install prompt, never the app, so it must not block rendering.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed; the app still works.', err);
    });
  });
}
