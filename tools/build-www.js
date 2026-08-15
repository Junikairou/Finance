/* Prépare www/, le dossier embarqué dans l'APK par Capacitor.

   Le site est copié tel quel : mêmes pages, mêmes scripts, aucun changement de
   code entre la version web et la version Android. Seule addition : natif.js,
   chargé en premier sur chaque page, qui branche le bouton retour d'Android.

   Une liste explicite de fichiers, plutôt qu'une copie du dossier : le dépôt
   contient aussi node_modules/, android/ et les outils, qui n'ont rien à faire
   dans l'application.

   Usage : node tools/build-www.js
*/

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');

const PAGES = ['index.html', 'simulateur.html', 'comprendre.html'];
const ASSETS = ['styles.css', 'site.js', 'calc.js', 'app.js', 'natif.js', 'favicon.svg'];
const ICONS = ['favicon-32.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'];
const FONTS = ['pretendard-regular.woff2', 'pretendard-semibold.woff2', 'pretendard-bold.woff2'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets/icons'), { recursive: true });
fs.mkdirSync(path.join(out, 'assets/fonts'), { recursive: true });

for (const f of ASSETS) fs.copyFileSync(path.join(root, 'assets', f), path.join(out, 'assets', f));
for (const f of ICONS) fs.copyFileSync(path.join(root, 'assets/icons', f), path.join(out, 'assets/icons', f));
for (const f of FONTS) fs.copyFileSync(path.join(root, 'assets/fonts', f), path.join(out, 'assets/fonts', f));

for (const p of PAGES) {
  let html = fs.readFileSync(path.join(root, p), 'utf8');
  if (!html.includes('assets/natif.js')) {
    html = html.replace(
      '<script src="assets/site.js" defer></script>',
      '<script src="assets/natif.js" defer></script>\n<script src="assets/site.js" defer></script>'
    );
  }
  fs.writeFileSync(path.join(out, p), html);
}

const n = PAGES.length + ASSETS.length + ICONS.length + FONTS.length;
console.log(`www/ : ${n} fichiers (${PAGES.length} pages, ${ASSETS.length + ICONS.length + FONTS.length} ressources)`);
