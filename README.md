# Boule de neige — simulateur d'intérêts composés

Application web qui montre, année par année, ce que produit une épargne
mensuelle régulière : les intérêts de l'année, le capital atteint, et les
intérêts composés cumulés depuis le départ — autrement dit l'effet boule de
neige.

## Ouvrir

Ouvrez `index.html` dans un navigateur. Aucune installation, aucun serveur,
aucune connexion réseau nécessaire.

Pour produire une page autonome en un seul fichier (CSS et JS intégrés) :

```
node tools/build-artifact.js   # → dist/boule-de-neige.html
```

## Ce que l'application montre

- **Cinq indicateurs de synthèse** : capital final, total versé de votre poche,
  intérêts composés gagnés, intérêts de la dernière année, et l'**année de
  bascule** — celle où les intérêts d'une année dépassent vos versements de
  l'année.
- **Le graphique « boule de neige »** : deux aires empilées, vos versements
  cumulés en bas, les intérêts composés cumulés au-dessus. La deuxième mange
  peu à peu la première.
- **Le graphique annuel** : vos versements (plats) face aux intérêts de l'année
  (qui grimpent seuls). L'année où la barre dorée dépasse la bleue est marquée.
- **Le tableau détaillé**, une ligne par année : versement de l'année, capital
  de début d'année, capital + épargne, intérêts de l'année, capital de fin
  d'année, total versé, intérêts composés cumulés et part des intérêts.

Les paramètres (capital initial, épargne mensuelle ou annuelle, taux annuel,
durée, mode de capitalisation) sont conservés d'une visite à l'autre.

## Les deux modes de capitalisation

**Annuelle** — les intérêts d'une année portent sur le capital présent en début
d'année :

```
intérêts    = capital_début × taux
capital_fin = capital_début + épargne_annuelle + intérêts
```

**Mensuelle** — chaque mois, les intérêts s'ajoutent au solde et produisent à
leur tour dès le mois suivant :

```
solde = solde × (1 + taux / 12) + versement_mensuel     (× 12 par an)
```

Dans les deux cas, les **intérêts composés cumulés** d'une année sont l'écart
entre le capital atteint et tout ce qui a été versé depuis le départ :

```
intérêts_cumulés = capital_fin − (capital_initial + épargne_annuelle × n)
```

Le mode **Comparer** affiche les deux méthodes côte à côte : à taux identique,
capitaliser chaque mois rapporte davantage.

## Structure

```
index.html                 structure de la page
assets/styles.css          thème clair et sombre, mise en page
assets/calc.js             moteur de calcul (utilisable aussi sous Node)
assets/app.js              interface, graphiques SVG, tableau
tools/build-artifact.js    génère la page autonome dans dist/
```

`assets/calc.js` s'utilise seul :

```js
const { project, summarize } = require('./assets/calc.js');
const r = project({ initial: 0, monthly: 100, rate: 0.08, years: 30 });
summarize(r.monthlyC, r.meta).finalCapital; // 149 035,94 €
```

## Limites

Simulation à taux constant, hors fiscalité, hors frais de gestion et hors
inflation. Les rendements réels varient d'une année à l'autre : ces chiffres
illustrent un mécanisme, ils ne prédisent pas un résultat.
