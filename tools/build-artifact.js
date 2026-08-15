/* Génère une page autonome (CSS + JS intégrés) à partir de simulateur.html.
   Sortie : dist/boule-de-neige.html — un seul fichier, sans dépendance
   externe, ouvrable hors ligne ou publiable tel quel.

   Les liens de navigation sont retirés : la page autonome est le simulateur
   seul, sans les autres pages du site.

   Usage : node tools/build-artifact.js
*/

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('simulateur.html');

const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
  .replace(/<nav class="nav"[\s\S]*?<\/nav>/, '')
  .replace(/\s*<script src="assets\/(calc|app)\.js"><\/script>/g, '')
  .trim();

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'Boule de neige'])[1];
const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1];

// Un fichier unique, sans dossier assets/ à côté : les polices se @font-face
// avec un chemin relatif dans styles.css, remplacé ici par leur contenu en
// base64 pour que la page reste ouvrable seule, hors ligne.
const css = read('assets/styles.css').replace(
  /url\("fonts\/([\w-]+\.woff2)"\)/g,
  (m, file) => {
    const data = fs.readFileSync(path.join(root, 'assets/fonts', file)).toString('base64');
    return `url("data:font/woff2;base64,${data}")`;
  }
);

const out = `<title>${title.replace('Simulateur — ', '')}</title>
<meta name="description" content="${desc}">
<style>
${css}
</style>

${body}

<script>
${read('assets/site.js')}
</script>
<script>
${read('assets/calc.js')}
</script>
<script>
${read('assets/app.js')}
</script>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'boule-de-neige.html'), out);
console.log('dist/boule-de-neige.html — ' + Math.round(out.length / 1024) + ' Ko');
