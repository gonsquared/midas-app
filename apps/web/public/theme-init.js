// Applies the stored theme before first paint. Loaded as an external script from <head> so the
// strict CSP (script-src 'self') allows it. Keep in sync with src/lib/theme.ts (tested there).
(function () {
  var resolved = 'light';
  try {
    var stored = window.localStorage.getItem('midas.theme');
    var preference = stored === 'light' || stored === 'dark' ? stored : 'system';
    resolved =
      preference === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : preference;
  } catch {
    // Storage or matchMedia unavailable: fall back to light.
  }
  document.documentElement.setAttribute('data-theme', resolved);
})();
