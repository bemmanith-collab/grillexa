/* Runs only on engines too old for ES modules, which ignore the bundle
   entirely and would otherwise show a blank page with no error.
   External rather than inline so the CSP can forbid inline script. */
/* An engine too old for ES modules ignores the bundle above entirely and
         shows a blank page with no error at all. Say so instead. */
      document.getElementById('root').innerHTML =
        '<div style="font:15px/1.5 system-ui;color:#e4f1f3;background:#052a33;min-height:100vh;padding:22px">' +
        '<h1 style="font-size:19px">This browser is too old</h1>' +
        '<p style="color:#a2c0c6">Grillexa needs a newer browser. Please update Chrome or Safari.</p></div>';
