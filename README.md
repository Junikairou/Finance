# Boule de neige — site sur les intérêts composés

Un site statique en trois pages qui montre, année par année, ce que produit une
épargne mensuelle régulière : les intérêts de l'année, le capital atteint et les
intérêts composés cumulés depuis le départ — l'effet boule de neige.

| Page | Rôle |
| --- | --- |
| `index.html` | Accueil : le mécanisme en une page, un exemple chiffré |
| `simulateur.html` | L'outil : paramètres, graphiques, tableau année par année |
| `comprendre.html` | Les formules exactes, les hypothèses et leurs limites |

## Ouvrir

Ouvrez `index.html` dans un navigateur. Aucune installation, aucun serveur,
aucune connexion réseau.

Pour une page autonome en un seul fichier (le simulateur seul, CSS et JS
intégrés) :

```
node tools/build-artifact.js   # → dist/boule-de-neige.html
```

## Publication

`.github/workflows/pages.yml` déploie le site sur GitHub Pages à chaque push sur
`main`. Il faut l'activer une fois : **Settings → Pages → Source : GitHub
Actions**.

## Installer comme application (PWA) et obtenir un APK

Le site est une PWA installable (`manifest.webmanifest` + `sw.js`) : une fois
publié sur GitHub Pages, Chrome sur Android propose « Installer l'application »
— icône sur l'écran d'accueil, plein écran, fonctionne hors-ligne.

Pour un fichier `.apk` réel (installable sans passer par Chrome) :

1. Publiez le site (voir *Publication* ci-dessus) — url du type
   `https://<compte>.github.io/Finance/`.
2. Allez sur [pwabuilder.com](https://www.pwabuilder.com), collez cette URL,
   cliquez **Package for stores → Android**. PWABuilder lit le manifest et
   génère un APK signé (Trusted Web Activity) prêt à installer.

Aucun outil Android (SDK, Bubblewrap) n'est nécessaire côté dépôt ; le site
n'embarque que le manifest et le service worker qui rendent ça possible.

## Ce que fait le simulateur

- **Deux points de départ** : « je verse tant par mois », ou « je vise un
  capital » — l'effort mensuel nécessaire est alors calculé par inversion de la
  formule.
- **Deux modes de capitalisation**, mensuelle et annuelle, plus un mode
  comparaison qui affiche les deux côte à côte.
- **Des hypothèses réalistes** : frais de gestion prélevés sur l'encours,
  inflation (bascule de tous les affichages en euros d'aujourd'hui), impôt à la
  sortie selon l'enveloppe (Livret A, PEA, assurance-vie, compte-titres).
- **L'année de bascule** : la première année où les intérêts produits dépassent
  les versements de l'année, repérée sur les deux graphiques et dans le tableau.

Les paramètres sont conservés d'une visite à l'autre.

## Les formules

Capitalisation annuelle — les intérêts portent sur le capital de début d'année :

```
intérêts    = capital_début × taux
capital_fin = capital_début + épargne_annuelle + intérêts
```

Capitalisation mensuelle — les intérêts du mois produisent dès le mois suivant :

```
m     = (1 + taux)^(1/12) − 1        (taux mensuel équivalent, convention Finary)
solde = solde × (1 + m) + versement_mensuel     (× 12 par an)
```

Frais, inflation, impôt :

```
taux net           = taux brut − frais de gestion
euros d'aujourd'hui = montant / (1 + inflation)^n
impôt              = max(0, gains − abattement) × taux de l'enveloppe
```

Objectif inversé, avec `m = taux net / 12` et `n = années × 12` :

```
versement mensuel = [ cible − capital_initial × (1 + m)^n ] × m / [ (1 + m)^n − 1 ]
```

Intérêts composés cumulés d'une année :

```
intérêts_cumulés = capital_fin − (capital_initial + épargne_annuelle × n)
```

## Structure

```
index.html · simulateur.html · comprendre.html
assets/styles.css          thème clair et sombre, mise en page
assets/site.js             navigation et bascule de thème, communes aux pages
assets/calc.js             moteur de calcul (utilisable aussi sous Node)
assets/app.js              simulateur : interface, graphiques SVG, tableau
tools/build-artifact.js    génère la page autonome dans dist/
```

`assets/calc.js` s'utilise seul :

```js
const { project, summarize, solveMonthly } = require('./assets/calc.js');

const r = project({ initial: 0, monthly: 100, rate: 0.08, years: 30 });
summarize(r.monthlyC, r.meta, 'exonere').finalCapital; // 149 035,94

solveMonthly({ initial: 0, target: 200000, rate: 0.08, years: 30 }); // 134,20 €/mois
```

## Limites

Rendement constant, aucun aléa simulé, versements non indexés, fiscalité
simplifiée (impôt appliqué en une fois sur la totalité des gains en fin de
période). Ces chiffres illustrent un mécanisme, ils ne prédisent pas un résultat
et ne constituent pas un conseil en investissement.
