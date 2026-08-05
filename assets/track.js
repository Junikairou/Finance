/* Suivi réel — historique saisi à la main, mois par mois.

   Chaque ligne décrit un mois : ce que vous avez versé, et soit la valeur du
   portefeuille à la fin du mois, soit les intérêts perçus. L'autre colonne se
   déduit.

     valeur connue    → intérêts = valeur − capital début − versement
     intérêts connus  → valeur   = capital début + versement + intérêts

   Le rendement du mois suit la méthode de Dietz simplifiée : les versements
   sont supposés arrivés en milieu de mois, donc ils ne comptent que pour
   moitié dans le capital qui a travaillé.

     rendement du mois = intérêts / (capital début + versement / 2)

   La moyenne annuelle est géométrique : on chaîne les rendements mensuels puis
   on ramène le tout à un an. Elle tient compte de l'effet composé, ce que la
   moyenne arithmétique ne fait pas.

     moyenne annuelle = (∏ (1 + rendement du mois))^(12 / nombre de mois) − 1

   La trajectoire idéale rejoue les mêmes versements au taux cible, avec la
   même convention de milieu de mois : l'écart affiché ne vient donc que du
   rendement, jamais d'une différence de méthode. Son taux mensuel est le taux
   équivalent, (1 + taux cible)^(1/12) − 1, et non taux / 12 : douze mois
   chaînés redonnent ainsi exactement le taux cible affiché. */

(function (global) {
  'use strict';

  /** Mois suivant, au format AAAA-MM. */
  function nextMonth(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '');
    if (!m) {
      const now = new Date();
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    let y = +m[1];
    let mo = +m[2] + 1;
    if (mo > 12) { mo = 1; y += 1; }
    return y + '-' + String(mo).padStart(2, '0');
  }

  /**
   * Déroule l'historique saisi.
   *
   * @param {object} p
   * @param {number} p.initial     capital au départ, avant le premier mois (€)
   * @param {number} p.targetRate  taux cible annuel (ex. 0.08)
   * @param {Array}  p.entries     lignes { month, contribution, value, interest }
   *                               `value` et `interest` valent null si non saisis
   */
  function track(p) {
    const initial = +p.initial || 0;
    const target = +p.targetRate || 0;
    const m = Math.pow(1 + target, 1 / 12) - 1; // taux mensuel équivalent
    const entries = (p.entries || []).slice().sort((a, b) => String(a.month).localeCompare(String(b.month)));

    const rows = [];
    let open = initial;
    let openIdeal = initial;
    let paidIn = initial;
    let chain = 1;
    let rated = 0; // mois dont le rendement est mesurable

    for (const e of entries) {
      const contribution = +e.contribution || 0;
      const hasValue = e.value !== null && e.value !== undefined && e.value !== '';
      const hasInterest = e.interest !== null && e.interest !== undefined && e.interest !== '';

      let interest;
      let close;
      let source;
      if (hasValue) {
        close = +e.value || 0;
        interest = close - open - contribution;
        source = 'value';
      } else if (hasInterest) {
        interest = +e.interest || 0;
        close = open + contribution + interest;
        source = 'interest';
      } else {
        interest = 0;
        close = open + contribution;
        source = 'none';
      }

      const base = open + contribution / 2;
      const rate = base > 0 && source !== 'none' ? interest / base : null;
      if (rate !== null) { chain *= 1 + rate; rated += 1; }

      const idealInterest = (openIdeal + contribution / 2) * m;
      const idealClose = openIdeal + contribution + idealInterest;

      paidIn += contribution;
      rows.push({
        month: e.month,
        year: +String(e.month).slice(0, 4) || 0,
        open: open,
        contribution: contribution,
        interest: interest,
        close: close,
        source: source,
        rate: rate,
        annualized: rate === null ? null : Math.pow(1 + rate, 12) - 1,
        idealOpen: openIdeal,
        idealInterest: idealInterest,
        idealClose: idealClose,
        gap: close - idealClose,
        rateGap: rate === null ? null : rate - m,
        paidIn: paidIn,
        note: e.note || '',
      });

      open = close;
      openIdeal = idealClose;
    }

    const last = rows[rows.length - 1] || null;
    const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
    const totalIdealInterest = rows.reduce((s, r) => s + r.idealInterest, 0);
    const average = rated > 0 ? Math.pow(chain, 12 / rated) - 1 : null;

    return {
      rows: rows,
      years: byYear(rows, m),
      meta: { initial: initial, targetRate: target, monthlyTarget: m, months: rows.length, ratedMonths: rated },
      summary: {
        months: rows.length,
        ratedMonths: rated,
        paidIn: last ? last.paidIn : initial,
        contributions: last ? last.paidIn - initial : 0,
        capital: last ? last.close : initial,
        idealCapital: last ? last.idealClose : initial,
        interest: totalInterest,
        idealInterest: totalIdealInterest,
        gap: last ? last.close - last.idealClose : 0,
        interestGap: totalInterest - totalIdealInterest,
        average: average,
        target: target,
        rateGap: average === null ? null : average - target,
        totalReturn: last && last.paidIn > 0 ? last.close / last.paidIn - 1 : 0,
      },
    };
  }

  /** Regroupe par année civile : rendement chaîné de l'année, idéal, écart. */
  function byYear(rows, m) {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.year)) {
        map.set(r.year, {
          year: r.year, months: 0, ratedMonths: 0, contribution: 0, interest: 0,
          idealInterest: 0, open: r.open, idealOpen: r.idealOpen, close: r.close,
          idealClose: r.idealClose, chain: 1, idealChain: 1,
        });
      }
      const y = map.get(r.year);
      y.months += 1;
      y.contribution += r.contribution;
      y.interest += r.interest;
      y.idealInterest += r.idealInterest;
      y.close = r.close;
      y.idealClose = r.idealClose;
      if (r.rate !== null) { y.chain *= 1 + r.rate; y.ratedMonths += 1; }
      y.idealChain *= 1 + m;
    }
    return Array.from(map.values()).map((y) => ({
      year: y.year,
      months: y.months,
      complete: y.months === 12,
      contribution: y.contribution,
      interest: y.interest,
      idealInterest: y.idealInterest,
      open: y.open,
      close: y.close,
      idealClose: y.idealClose,
      /* Rendement de l'année tel quel s'il y a douze mois ; sinon ramené à un
         an, pour rester comparable au taux cible. */
      rate: y.ratedMonths > 0 ? Math.pow(y.chain, 12 / y.ratedMonths) - 1 : null,
      idealRate: Math.pow(y.idealChain, 12 / y.months) - 1,
      gap: y.close - y.idealClose,
      interestGap: y.interest - y.idealInterest,
    }));
  }

  const api = { track: track, byYear: byYear, nextMonth: nextMonth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Track = api;
})(typeof window !== 'undefined' ? window : globalThis);
