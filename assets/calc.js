/* Moteur de calcul — intérêts composés et effet boule de neige.
   Reproduit la logique du tableur : capitalisation annuelle (intérêts calculés
   sur le capital de début d'année) et capitalisation mensuelle (intérêts
   calculés chaque mois sur le solde, versement en fin de mois). */

(function (global) {
  'use strict';

  /**
   * @param {object} p
   * @param {number} p.initial     capital initial (€)
   * @param {number} p.monthly     épargne mensuelle (€)
   * @param {number} p.rate        taux d'intérêt annuel (ex. 0.08)
   * @param {number} p.years       durée en années
   * @returns {{annual: Row[], monthlyC: Row[], meta: object}}
   */
  function project(p) {
    const initial = Math.max(0, p.initial || 0);
    const monthly = Math.max(0, p.monthly || 0);
    const rate = p.rate || 0;
    const years = Math.max(1, Math.round(p.years || 1));
    const yearly = monthly * 12;
    const rMonth = rate / 12;

    const annual = [];
    const monthlyC = [];

    let openA = initial; // capital de début d'année, modèle annuel
    let openM = initial; // solde de début d'année, modèle mensuel

    for (let y = 1; y <= years; y++) {
      const paidIn = initial + yearly * y; // total versé, capital initial inclus

      // --- Capitalisation annuelle -------------------------------------
      const interestA = openA * rate;
      const closeA = openA + yearly + interestA;

      annual.push({
        year: y,
        open: openA,
        contribution: yearly,
        base: openA + yearly, // « Capital + Épargne »
        interest: interestA,
        close: closeA,
        savedCumul: yearly * y,
        paidIn: paidIn,
        interestCumul: closeA - paidIn,
      });

      // --- Capitalisation mensuelle ------------------------------------
      let bal = openM;
      const months = [];
      for (let m = 1; m <= 12; m++) {
        const int = bal * rMonth;
        bal = bal + int + monthly;
        months.push({ month: m, interest: int, balance: bal });
      }
      const closeM = bal;
      const interestM = closeM - openM - yearly;

      monthlyC.push({
        year: y,
        open: openM,
        contribution: yearly,
        base: openM + yearly,
        interest: interestM,
        close: closeM,
        savedCumul: yearly * y,
        paidIn: paidIn,
        interestCumul: closeM - paidIn,
        months: months,
      });

      openA = closeA;
      openM = closeM;
    }

    return {
      annual: annual,
      monthlyC: monthlyC,
      meta: { initial, monthly, yearly, rate, rMonth, years },
    };
  }

  /** Indicateurs de l'effet boule de neige pour une série de lignes. */
  function summarize(rows, meta) {
    const last = rows[rows.length - 1];
    const paidIn = last.paidIn;
    const interest = last.close - paidIn;

    // Année de bascule : les intérêts de l'année dépassent les versements.
    let tipping = null;
    for (const r of rows) {
      if (r.contribution > 0 && r.interest > r.contribution) { tipping = r.year; break; }
    }
    // Année où les intérêts cumulés dépassent le total versé.
    let crossover = null;
    for (const r of rows) {
      if (r.interestCumul > r.paidIn) { crossover = r.year; break; }
    }
    // Intérêts de la dernière année vs. de la première : accélération.
    const firstInterest = rows[0].interest;
    const lastInterest = last.interest;

    return {
      finalCapital: last.close,
      paidIn: paidIn,
      interest: interest,
      interestShare: last.close > 0 ? interest / last.close : 0,
      multiple: paidIn > 0 ? last.close / paidIn : 0,
      tippingYear: tipping,
      crossoverYear: crossover,
      firstInterest: firstInterest,
      lastInterest: lastInterest,
      acceleration: firstInterest > 0 ? lastInterest / firstInterest : 0,
      monthlyIncomeAtEnd: (last.close * meta.rate) / 12,
    };
  }

  const api = { project, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Compound = api;
})(typeof window !== 'undefined' ? window : globalThis);
