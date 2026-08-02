import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/grillexa-logo.png';

const GREETING_MS = 3000;

// The hello on the way in. Rendered by App, not by the login page: signing in
// unmounts that page immediately, which is why this never appeared while it
// lived there. Over the app rather than in front of it — the page behind is
// already loading, so the greeting costs nobody three seconds.
export default function GreetingOverlay() {
  const { greeting, clearGreeting } = useAuth();

  // Cleared on unmount too, so a timer cannot fire against a page that is
  // already gone.
  useEffect(() => {
    if (!greeting) return undefined;
    const timer = setTimeout(clearGreeting, GREETING_MS);
    return () => clearTimeout(timer);
  }, [greeting, clearGreeting]);

  if (!greeting) return null;

  // Dismissable by tapping: it still leaves on its own, but someone opening
  // the app to settle a consignment should not have to wait out a greeting.
  return (
    <div className="modal-backdrop" onClick={clearGreeting}>
      <div className="modal greeting-modal" role="status">
        <img src={logo} alt="" className="greeting-logo" />
        <h2>{greeting}</h2>
        <p>Greetings from Grillexa 🥗</p>
      </div>
    </div>
  );
}
