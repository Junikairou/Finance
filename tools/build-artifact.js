/* Génère une page autonome (CSS + JS intégrés) à partir de index.html.
   Sortie : dist/boule-de-neige.html — un seul fichier, sans dépendance
   externe, publiable ou partageable tel quel.

   Usage : node tools/build-artifact.js
*/

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const css = read('assets/styles.css');
const calc = read('assets/calc.js');
const app = read('assets/app.js');

const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
  .replace(/\s*<script src="assets\/calc\.js"><\/script>\s*/, '\n')
  .replace(/\s*<script src="assets\/app\.js"><\/script>\s*/, '\n')
  .trim();

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'Boule de neige'])[1];
const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1];

const out = `<title>${title}</title>
<meta name="description" content="${desc}">
<style>
${css}
</style>

${body}

<script>
${calc}
</script>
<script>
${app}
</script>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'boule-de-neige.html'), out);
console.log('dist/boule-de-neige.html — ' + Math.round(out.length / 1024) + ' Ko');
