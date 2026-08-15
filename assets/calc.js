/* Moteur de calcul — intérêts composés, effet boule de neige.

   Capitalisation annuelle : les intérêts d'une année portent sur le capital
   présent en début d'année.
   Capitalisation mensuelle : chaque mois, les intérêts s'ajoutent au solde et
   produisent à leur tour dès le mois suivant.

   Les frais de gestion sont prélevés sur l'encours : un taux brut r et des
   frais f donnent un taux net r − f appliqué à chaque période.
   L'inflation ne change pas les montants, elle sert à les convertir en euros
   d'aujourd'hui (déflateur (1 + i)^n).
   L'impôt est calculé à la sortie, sur les gains, selon l'enveloppe. */

(function (global) {
  'use strict';

  /** Enveloppes fiscales — taux appliqué aux gains à la sortie. */
  const ENVELOPES = {
    exonere: { label: 'Livret A / LEP — exonéré', rate: 0, allowance: 0 },
    pea: { label: 'PEA après 5 ans', rate: 0.172, allowance: 0 },
    av: { label: 'Assurance-vie après 8 ans', rate: 0.247, allowance: 4600 },
    cto: { label: 'Compte-titres — flat tax', rate: 0.30, allowance: 0 },
  };

  /**
   * @param {object} p
   * @param {number} p.initial    capital initial (€)
   * @param {number} p.monthly    épargne mensuelle (€)
   * @param {number} p.rate       rendement annuel brut (ex. 0.08)
   * @param {number} [p.fees]     frais de gestion annuels (ex. 0.005)
   * @param {number} [p.inflation] inflation annuelle (ex. 0.02)
   * @param {number} p.years      durée en années
   */
  function project(p) {
    const initial = Math.max(0, p.initial || 0);
    const monthly = Math.max(0, p.monthly || 0);
    const gross = p.rate || 0;
    const fees = Math.max(0, p.fees || 0);
    const inflation = p.inflation || 0;
    const rate = gross - fees; // taux net de frais
    const years = Math.max(1, Math.round(p.years || 1));
    const yearly = monthly * 12;
    // Taux mensuel équivalent : composé 12 fois, il redonne exactement le taux
    // annuel net (convention utilisée par Finary), et non taux/12 (taux nominal).
    const rMonth = Math.pow(1 + rate, 1 / 12) - 1;

    const annual = [];
    const monthlyC = [];
    let openA = initial;
    let openM = initial;

    for (let y = 1; y <= years; y++) {
      const paidIn = initial + yearly * y;
      const deflator = Math.pow(1 + inflation, -y);

      const interestA = openA * rate;
      const closeA = openA + yearly + interestA;
      annual.push({
        year: y, open: openA, contribution: yearly, base: openA + yearly,
        interest: interestA, close: closeA, savedCumul: yearly * y, paidIn: paidIn,
        interestCumul: closeA - paidIn, deflator: deflator,
      });

      let bal = openM;
      for (let m = 0; m < 12; m++) bal = bal + bal * rMonth + monthly;
      const closeM = bal;
      monthlyC.push({
        year: y, open: openM, contribution: yearly, base: openM + yearly,
        interest: closeM - openM - yearly, close: closeM, savedCumul: yearly * y,
        paidIn: paidIn, interestCumul: closeM - paidIn, deflator: deflator,
      });

      openA = closeA;
      openM = closeM;
    }

    return {
      annual: annual,
      monthlyC: monthlyC,
      meta: { initial, monthly, yearly, gross, fees, rate, rMonth, inflation, years },
    };
  }

  /** Impôt dû sur les gains à la sortie. */
  function tax(gains, envelopeKey) {
    const e = ENVELOPES[envelopeKey] || ENVELOPES.exonere;
    return Math.max(0, gains - e.allowance) * e.rate;
  }

  /** Indicateurs de l'effet boule de neige. */
  function summarize(rows, meta, envelopeKey) {
    const last = rows[rows.length - 1];
    const interest = last.close - last.paidIn;
    const due = tax(interest, envelopeKey);

    let tipping = null;
    for (const r of rows) {
      if (r.contribution > 0 && r.interest > r.contribution) { tipping = r.year; break; }
    }
    let crossover = null;
    for (const r of rows) {
      if (r.interestCumul > r.paidIn) { crossover = r.year; break; }
    }

    return {
      finalCapital: last.close,
      paidIn: last.paidIn,
      interest: interest,
      interestShare: last.close > 0 ? interest / last.close : 0,
      multiple: last.paidIn > 0 ? last.close / last.paidIn : 0,
      tax: due,
      netCapital: last.close - due,
      realCapital: last.close * last.deflator,
      realNetCapital: (last.close - due) * last.deflator,
      tippingYear: tipping,
      crossoverYear: crossover,
      firstInterest: rows[0].interest,
      lastInterest: last.interest,
      acceleration: rows[0].interest > 0 ? last.interest / rows[0].interest : 0,
      monthlyIncomeAtEnd: (last.close * meta.rate) / 12,
    };
  }

  /**
   * Objectif inversé : épargne mensuelle nécessaire pour atteindre `target`.
   * Renvoie 0 si le capital initial suffit déjà.
   */
  function solveMonthly(p) {
    const initial = Math.max(0, p.initial || 0);
    const target = Math.max(0, p.target || 0);
    const rate = (p.rate || 0) - Math.max(0, p.fees || 0);
    const years = Math.max(1, Math.round(p.years || 1));
    const compounding = p.compounding === 'annual' ? 'annual' : 'monthly';

    if (compounding === 'annual') {
      const g = Math.pow(1 + rate, years);
      const factor = rate === 0 ? years : (g - 1) / rate; // valeur future de 1 €/an
      const need = target - initial * g;
      return Math.max(0, need / factor / 12);
    }
    const m = Math.pow(1 + rate, 1 / 12) - 1;
    const n = years * 12;
    const g = Math.pow(1 + m, n);
    const factor = m === 0 ? n : (g - 1) / m; // valeur future de 1 €/mois
    const need = target - initial * g;
    return Math.max(0, need / factor);
  }

  const api = { project, summarize, solveMonthly, tax, ENVELOPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Compound = api;
})(typeof window !== 'undefined' ? window : globalThis);
