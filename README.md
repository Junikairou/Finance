# Boule de neige — site sur les intérêts composés

Un site statique en trois pages qui montre, année par année, ce que produit une
épargne mensuelle régulière : les intérêts de l'année, le capital atteint et les
intérêts composés cumulés depuis le départ — l'effet boule de neige.

| Page | Rôle |
| --- | --- |
| `index.html` | Accueil : le mécanisme en une page, un exemple chiffré |
| `simulateur.html` | L'outil : paramètres, graphiques, tableau année par année |
| `suivi.html` | Le suivi réel : historique saisi à la main, rendement constaté, écart |
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

## Ce que fait le suivi réel

`suivi.html` est un tableau que vous remplissez vous-même, un mois par ligne :
le versement, puis **soit** la valeur du portefeuille en fin de mois, **soit**
les intérêts perçus — la colonne manquante se déduit et s'affiche en gris.

- **Le rendement de chaque mois**, méthode de Dietz simplifiée : les versements
  sont supposés arrivés en milieu de mois.
- **La moyenne annuelle géométrique**, qui tient compte de l'effet composé.
- **La trajectoire idéale** : les mêmes versements rejoués au taux cible, d'où
  l'écart de capital et l'écart de taux, mois par mois et année par année.
- **Import et export CSV** (`mois;versement;valeur;interets`, décimales à la
  virgule). Les données restent dans le navigateur, en stockage local.

## Les formules

Capitalisation annuelle — les intérêts portent sur le capital de début d'année :

```
intérêts    = capital_début × taux
capital_fin = capital_début + épargne_annuelle + intérêts
```

Capitalisation mensuelle — les intérêts du mois produisent dès le mois suivant :

```
solde = solde × (1 + taux / 12) + versement_mensuel     (× 12 par an)
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

## Emplacements publicitaires

Chaque page réserve trois blocs — haut, milieu, bas :

```html
<aside class="ad-slot" data-slot="haut" aria-label="Publicité"></aside>
```

Collez votre code (script de régie, iframe, image) à l'intérieur du bloc voulu.
Tant qu'un bloc est vide il est masqué et ne prend aucune place : le site reste
inchangé jusqu'au jour où vous le remplissez. Une bannière plus large que la
page est ramenée à sa largeur, jamais l'inverse.

Pour voir les emplacements pendant la mise au point, ajoutez la classe
`ads-preview` sur la balise `<html>` : les blocs vides apparaissent alors en
pointillés avec leur nom.

## Structure

```
index.html · simulateur.html · suivi.html · comprendre.html
assets/styles.css          thème clair et sombre, mise en page
assets/site.js             navigation et bascule de thème, communes aux pages
assets/calc.js             moteur de calcul (utilisable aussi sous Node)
assets/app.js              simulateur : interface, graphiques SVG, tableau
assets/track.js            moteur du suivi réel (utilisable aussi sous Node)
assets/track-ui.js         suivi réel : tableau de saisie, synthèse, courbe
tools/build-artifact.js    génère la page autonome dans dist/
```

`assets/calc.js` s'utilise seul :

```js
const { project, summarize, solveMonthly } = require('./assets/calc.js');

const r = project({ initial: 0, monthly: 100, rate: 0.08, years: 30 });
summarize(r.monthlyC, r.meta, 'exonere').finalCapital; // 149 035,94

solveMonthly({ initial: 0, target: 200000, rate: 0.08, years: 30 }); // 134,20 €/mois
```

`assets/track.js` aussi :

```js
const { track } = require('./assets/track.js');

track({
  initial: 1000,
  targetRate: 0.08,
  entries: [{ month: '2024-01', contribution: 150, value: 1162.9 }],
}).summary.average; // rendement annuel moyen constaté
```

## Limites

Le suivi réel ne vaut que ce que vaut la saisie : une valeur de portefeuille
oubliée fausse le mois concerné et le suivant. Le rendement mensuel suppose les
versements en milieu de mois, ce qui n'est exact que si vous versez à date fixe
au milieu du mois.

Côté simulateur : rendement constant, aucun aléa simulé, versements non indexés, fiscalité
simplifiée (impôt appliqué en une fois sur la totalité des gains en fin de
période). Ces chiffres illustrent un mécanisme, ils ne prédisent pas un résultat
et ne constituent pas un conseil en investissement.
