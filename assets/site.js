/* Éléments communs à toutes les pages : thème clair/sombre et lien actif. */

(function (global) {
  'use strict';

  const KEY = 'boule-de-neige.theme';
  const root = document.documentElement;
  const listeners = [];

  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
  } catch (e) { /* stockage indisponible */ }

  function current() {
    const set = root.getAttribute('data-theme');
    if (set === 'dark' || set === 'light') return set;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function wire() {
    const btn = document.getElementById('themeToggle');
    if (btn) {
      const sync = () => {
        const dark = current() === 'dark';
        btn.textContent = dark ? '☀' : '☾';
        btn.setAttribute('aria-label', dark ? 'Passer au thème clair' : 'Passer au thème sombre');
      };
      btn.addEventListener('click', () => {
        const next = current() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem(KEY, next); } catch (e) { /* stockage indisponible */ }
        sync();
        listeners.forEach((f) => f(next));
      });
      sync();
    }

    const here = location.pathname.split('/').pop() || 'index.html';
    for (const a of document.querySelectorAll('.nav a, .tabbar a')) {
      if ((a.getAttribute('href') || '').split('/').pop() === here) a.setAttribute('aria-current', 'page');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  /* Dans l'APK (natif.js pose data-natif avant ce script), sw.js n'est pas
     embarqué : Capacitor sert déjà l'appli hors-ligne, inutile de l'enregistrer
     et une tentative ne ferait que 404 dans la console à chaque page. */
  if ('serviceWorker' in navigator && !root.hasAttribute('data-natif')) {
    window.addEventListener('load', () => {
      const base = location.pathname.replace(/[^/]*$/, '');
      navigator.serviceWorker.register(base + 'sw.js').catch(() => { /* PWA indisponible */ });
    });
  }

  global.Site = { theme: current, onThemeChange: (f) => listeners.push(f) };
})(window);
