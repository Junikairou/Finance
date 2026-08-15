/* Vérifie l'application dans un vrai navigateur, à la taille d'un téléphone,
   avec Capacitor simulé — donc dans les conditions de l'APK, natif.js compris.

   Playwright n'est pas une dépendance du projet (son installation télécharge un
   navigateur) : l'installer à la demande, puis le retirer.

     npm i -D playwright
     node tools/build-www.js
     node tools/verif-mobile.mjs        # captures dans /tmp/verif-mobile/
     npm uninstall playwright

   CHROME=/chemin/vers/chrome si le navigateur n'est pas trouvé tout seul.
*/

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '../www');
const sortie = process.env.SORTIE || '/tmp/verif-mobile';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

if (!fs.existsSync(racine)) {
  console.error('www/ absent — lancer d\'abord : node tools/build-www.js');
  process.exit(1);
}
fs.mkdirSync(sortie, { recursive: true });

const serveur = http.createServer((req, res) => {
  const p = path.join(racine, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => serveur.listen(4173, r));

const navigateur = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const contexte = await navigateur.newContext({
  viewport: { width: 393, height: 873 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await contexte.newPage();

const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
page.on('pageerror', (e) => erreurs.push(String(e)));

// Capacitor simulé : natif.js doit se brancher exactement comme dans l'APK.
await page.addInitScript(() => {
  const ecouteurs = {};
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      App: {
        addListener: (n, f) => { (ecouteurs[n] = ecouteurs[n] || []).push(f); window.__retour = ecouteurs.backButton; return { remove() {} }; },
        minimizeApp: () => { window.__arrierePlan = true; },
      },
    },
  };
});

let echecs = 0;
const verifier = (ok, msg) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`); if (!ok) echecs++; };

for (const [nom, url] of [['accueil', 'index.html'], ['simulateur', 'simulateur.html'], ['comprendre', 'comprendre.html']]) {
  await page.goto(`http://127.0.0.1:4173/${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const etat = await page.evaluate(() => ({
    natif: document.documentElement.getAttribute('data-natif'),
    retour: !!window.__retour,
    debord: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    hors: [...document.querySelectorAll('.chart svg text')].filter((t) => {
      const b = t.getBoundingClientRect();
      const s = t.closest('svg').getBoundingClientRect();
      return b.right > s.right + 1 || b.left < s.left - 1;
    }).map((t) => t.textContent),
  }));
  verifier(etat.natif === '1' && etat.retour, `${nom} : natif.js branché`);
  verifier(etat.debord === 0, `${nom} : aucun débordement horizontal (${etat.debord}px)`);
  verifier(etat.hors.length === 0, `${nom} : libellés des graphiques dans le cadre ${etat.hors.join(' | ')}`);
  await page.screenshot({ path: `${sortie}/${nom}.png` });
}

// Bouton retour d'Android : reculer d'une page, puis passer en arrière-plan.
await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle' });
await page.click('a[href="simulateur.html"]');
await page.waitForTimeout(400);
await page.evaluate(() => window.__retour.forEach((f) => f({ canGoBack: true })));
await page.waitForTimeout(400);
verifier(new URL(page.url()).pathname === '/index.html', 'retour Android : revient à la page précédente');
await page.evaluate(() => window.__retour.forEach((f) => f({ canGoBack: false })));
await page.waitForTimeout(200);
verifier(await page.evaluate(() => !!window.__arrierePlan), 'retour Android à la racine : application en arrière-plan');

verifier(erreurs.filter((e) => !e.includes('favicon')).length === 0, `aucune erreur de console ${erreurs.join(' | ')}`);

console.log(echecs === 0 ? `\nTout est vert. Captures dans ${sortie}` : `\n${echecs} vérification(s) en échec.`);
await navigateur.close();
serveur.close();
process.exit(echecs === 0 ? 0 : 1);
