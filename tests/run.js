/* npm test — à lancer avant chaque commit, et surtout avant tout commit qui
   touche à android/app/src/main/res/.

   Une compilation d'APK coûte plusieurs minutes sur GitHub Actions, et les
   erreurs de ressources Android ne nomment ni le fichier ni la ligne fautive :
   « Can not extract resource from com.android.aaptcompiler.ParsedResource@... ».
   Ces vérifications-là sont donc faites ici, où l'on peut nommer le fichier.

   Usage : node tests/run.js
*/

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function near(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg} — attendu ~${b}, obtenu ${a}`);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/* ---------- 1. Ressources Android ---------- */

const resDir = path.join(root, 'android/app/src/main/res');
const xmlFiles = walk(resDir).filter((p) => p.endsWith('.xml'));
const androidXml = xmlFiles.concat([
  path.join(root, 'android/app/src/main/AndroidManifest.xml'),
]).filter((p) => fs.existsSync(p));

console.log(`Ressources Android (${androidXml.length} fichiers XML)`);

check('aucun commentaire XML ne contient deux tirets consécutifs', () => {
  for (const f of androidXml) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /<!--([\s\S]*?)-->/g;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      assert(!m[1].includes('--'), `${path.relative(root, f)}:${line} — commentaire avec « -- », interdit par la spécification XML`);
    }
  }
});

check('les apostrophes des chaînes sont échappées', () => {
  for (const f of androidXml.filter((p) => /values[^/]*\/.*\.xml$/.test(p))) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /<string[^>]*>([\s\S]*?)<\/string>/g;
    let m;
    while ((m = re.exec(src))) {
      const value = m[1];
      const line = src.slice(0, m.index).split('\n').length;
      const quoted = value.startsWith('"') && value.endsWith('"');
      const bad = /(^|[^\\])'/.test(value) && !quoted;
      assert(!bad, `${path.relative(root, f)}:${line} — apostrophe non échappée (écrire \\' ou entourer la chaîne de guillemets) : ${value}`);
    }
  }
});

check('aucun texte en dur dans un layout', () => {
  for (const f of androidXml.filter((p) => p.includes(`${path.sep}layout${path.sep}`))) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /android:text\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      assert(m[1].startsWith('@'), `${path.relative(root, f)}:${line} — texte en dur « ${m[1] }», passer par @string/`);
    }
  }
});

check('les balises XML sont équilibrées', () => {
  for (const f of androidXml) {
    const src = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
    const stack = [];
    const re = /<(\/?)([\w.:-]+)([^>]*?)(\/?)>/g;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      if (m[1]) {
        const open = stack.pop();
        assert(open === m[2], `${path.relative(root, f)}:${line} — </${m[2]}> fermé alors que <${open}> était ouvert`);
      } else if (!m[4]) {
        stack.push(m[2]);
      }
    }
    assert(stack.length === 0, `${path.relative(root, f)} — balise(s) jamais fermée(s) : ${stack.join(', ')}`);
  }
});

/* ---------- 1 bis. Workflows GitHub ---------- */

console.log('\nWorkflows GitHub');

const YAML = require('yaml');
const workflows = fs.readdirSync(path.join(root, '.github/workflows')).filter((f) => f.endsWith('.yml'));

check('les workflows sont du YAML valide', () => {
  for (const f of workflows) {
    const p = path.join(root, '.github/workflows', f);
    try {
      YAML.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      // Un workflow invalide échoue sur GitHub avant même de démarrer un job :
      // aucun log, aucune ligne fautive. Le message du parseur, lui, en donne une.
      throw new Error(`.github/workflows/${f} — ${e.message.split('\n')[0]}`);
    }
  }
});

check('le workflow APK publie la Release sous un tag fixe', () => {
  const wf = YAML.parse(fs.readFileSync(path.join(root, '.github/workflows/apk.yml'), 'utf8'));
  const etapes = wf.jobs.build.steps.map((s) => s.run || '').join('\n');
  assert(wf.permissions && wf.permissions.contents === 'write', 'apk.yml : permissions.contents doit valoir write pour publier une Release');
  assert(/gh release create apk\b/.test(etapes), 'apk.yml : la Release doit garder le tag « apk », sinon l\'adresse de téléchargement change à chaque version');
  assert(etapes.includes('assembleDebug'), 'apk.yml : aucune compilation');
});

/* ---------- 2. Identité de l'application ---------- */

console.log('\nIdentité de l\'application');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const capConfig = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const strings = fs.readFileSync(path.join(resDir, 'values/strings.xml'), 'utf8');

check('la version est un numéro à trois chiffres', () => {
  assert(/^\d+\.\d+\.\d+$/.test(pkg.version), `package.json : version « ${pkg.version} » inutilisable pour le versionCode Android`);
});

check('le nom du paquet est le même partout', () => {
  const id = capConfig.appId;
  assert(gradle.includes(`applicationId "${id}"`), `build.gradle : applicationId différent de ${id}`);
  assert(strings.includes(`<string name="package_name">${id}</string>`), `strings.xml : package_name différent de ${id}`);
});

check('le nom affiché est celui de capacitor.config.json', () => {
  assert(strings.includes(`<string name="app_name">${capConfig.appName}</string>`), `strings.xml : app_name différent de « ${capConfig.appName} »`);
});

check('la clé de débogage partagée est présente et référencée', () => {
  assert(fs.existsSync(path.join(root, 'android/app/boule-debug.keystore')), 'android/app/boule-debug.keystore manquant : les APK successifs ne pourraient plus se mettre à jour');
  assert(/signingConfigs\s*\{[\s\S]*debug\s*\{[\s\S]*boule-debug\.keystore/.test(gradle), 'build.gradle : bloc signingConfigs.debug absent, Gradle signerait avec une clé aléatoire');
  assert(/buildTypes\s*\{[\s\S]*debug\s*\{[\s\S]*signingConfig signingConfigs\.debug/.test(gradle), 'build.gradle : buildTypes.debug n\'utilise pas signingConfigs.debug');
});

/* ---------- 3. Contenu embarqué dans l'APK ---------- */

console.log('\nContenu embarqué (www/)');

execFileSync(process.execPath, [path.join(root, 'tools/build-www.js')], { stdio: 'pipe' });
const www = path.join(root, 'www');
const pages = ['index.html', 'simulateur.html', 'comprendre.html'];

check('les trois pages et leurs ressources sont copiées', () => {
  for (const p of pages) assert(fs.existsSync(path.join(www, p)), `www/${p} manquant`);
  for (const a of ['styles.css', 'site.js', 'calc.js', 'app.js', 'natif.js', 'favicon.svg']) {
    assert(fs.existsSync(path.join(www, 'assets', a)), `www/assets/${a} manquant`);
  }
});

check('natif.js est chargé avant site.js sur chaque page', () => {
  for (const p of pages) {
    const html = fs.readFileSync(path.join(www, p), 'utf8');
    const n = html.indexOf('assets/natif.js');
    const s = html.indexOf('assets/site.js');
    assert(n !== -1, `www/${p} : natif.js absent`);
    assert(n < s, `www/${p} : natif.js chargé après site.js`);
  }
});

check('le site publié ne charge pas natif.js', () => {
  for (const p of pages) {
    assert(!fs.readFileSync(path.join(root, p), 'utf8').includes('assets/natif.js'), `${p} : natif.js ne doit exister que dans www/`);
  }
});

check('aucune ressource référencée par une page ne manque', () => {
  for (const p of pages) {
    const html = fs.readFileSync(path.join(www, p), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) {
      assert(fs.existsSync(path.join(www, m[1])), `www/${p} référence ${m[1]}, absent de www/`);
    }
  }
});

/* ---------- 4. Moteur de calcul ---------- */

console.log('\nMoteur de calcul');

const { project, summarize, solveMonthly } = require(path.join(root, 'assets/calc.js'));

check('100 €/mois à 8 % pendant 30 ans donnent 140 855,06 €', () => {
  const r = project({ initial: 0, monthly: 100, rate: 0.08, years: 30 });
  near(summarize(r.monthlyC, r.meta, 'exonere').finalCapital, 140855.06, 0.01, 'capital final');
});

check('viser 200 000 € demande 141,99 €/mois', () => {
  near(solveMonthly({ initial: 0, target: 200000, rate: 0.08, years: 30 }), 141.99, 0.01, 'effort mensuel');
});

check('un objectif déjà atteint ne demande aucun versement', () => {
  assert(solveMonthly({ initial: 300000, target: 200000, rate: 0.08, years: 30 }) === 0, 'versement non nul');
});

check('les frais de gestion réduisent le capital final', () => {
  const sans = project({ initial: 0, monthly: 100, rate: 0.08, years: 30 });
  const avec = project({ initial: 0, monthly: 100, rate: 0.08, fees: 0.01, years: 30 });
  const a = summarize(sans.monthlyC, sans.meta, 'exonere').finalCapital;
  const b = summarize(avec.monthlyC, avec.meta, 'exonere').finalCapital;
  assert(b < a, `frais sans effet (${b} au lieu de moins de ${a})`);
});

console.log(failures === 0 ? '\nTout est vert.' : `\n${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
