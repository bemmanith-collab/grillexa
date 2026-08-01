/* Loaded from index.html before the app bundle. Kept in its own file so
   the Content-Security-Policy can forbid inline script outright — the
   session token lives in localStorage, so script injection is the risk
   worth closing hardest. */

// Chrome fires beforeinstallprompt during page load — before React has
      // mounted and before any component can add a listener. Attaching it in a
      // useEffect misses the event entirely, and the Install button never
      // appears. Stash it here, at the earliest point there is, and let the
      // component pick it up whenever it mounts.
      window.__installPrompt = null;
      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        window.__installPrompt = e;
        window.dispatchEvent(new Event('installpromptready'));
      });

/* Boot diagnostics.
         A blank screen tells whoever is holding the phone nothing, and tells
         whoever is debugging it even less. This runs before the app bundle,
         in plain ES5 so it cannot itself fail on an old engine, records
         anything that goes wrong during startup, and — if the app has not
         rendered after a few seconds — prints the reason on screen where it
         can be read or photographed.
         Silent when the app boots normally. */
      (function () {
        var errors = [];
        window.__bootErrors = errors;

        function note(what) {
          errors.push(String(what));
        }

        window.addEventListener('error', function (e) {
          note(e.message + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''));
        });
        window.addEventListener('unhandledrejection', function (e) {
          note('Unhandled: ' + ((e.reason && (e.reason.message || e.reason)) || 'unknown'));
        });

        function report() {
          var root = document.getElementById('root');
          if (!root || root.childElementCount > 0) return; // app rendered — nothing to say

          var lines = [
            'Build: ' + (document.currentScript ? 'ok' : 'ok'),
            'Screen: ' + window.innerWidth + '×' + window.innerHeight,
            'Phone layout: ' + (window.matchMedia('(max-width: 720px)').matches ? 'yes' : 'NO — desktop layout'),
            'Service worker: ' + ('serviceWorker' in navigator ? 'supported' : 'not supported'),
            'Browser: ' + navigator.userAgent
          ];
          if (errors.length) lines.push('', 'Errors:', errors.join('\n'));
          else lines.push('', 'No JavaScript errors — the app script did not finish loading.');

          root.innerHTML =
            '<div style="font:14px/1.5 -apple-system,system-ui,sans-serif;color:#e4f1f3;' +
            'background:#052a33;min-height:100vh;padding:20px;-webkit-text-size-adjust:100%">' +
            '<h1 style="font-size:19px;margin:0 0 6px">Grillexa didn\'t start</h1>' +
            '<p style="margin:0 0 14px;color:#a2c0c6">Screenshot this and send it over.</p>' +
            '<pre style="white-space:pre-wrap;word-break:break-word;background:#0c2a33;' +
            'border:1px solid #17454f;border-radius:10px;padding:12px;font-size:12px;margin:0 0 14px">' +
            lines.join('\n').replace(/[<>&]/g, function (c) {
              return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
            }) +
            '</pre>' +
            '<button onclick="location.reload()" style="font:600 15px system-ui;background:#f0642b;' +
            'color:#fff;border:0;border-radius:10px;padding:13px 20px;width:100%">Try again</button>' +
            '</div>';
        }

        setTimeout(report, 6000);
      })();
