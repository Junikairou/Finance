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
        const label = current() === 'dark' ? 'Thème clair' : 'Thème sombre';
        btn.textContent = label;
        /* Sur écran étroit, le CSS n'affiche que ce symbole à la place du
           libellé ; l'aria-label garde la phrase pour les lecteurs d'écran. */
        btn.dataset.symbole = current() === 'dark' ? '☀' : '☾';
        btn.setAttribute('aria-label', label);
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
    for (const a of document.querySelectorAll('.nav a')) {
      if ((a.getAttribute('href') || '').split('/').pop() === here) a.setAttribute('aria-current', 'page');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  global.Site = { theme: current, onThemeChange: (f) => listeners.push(f) };
})(window);
