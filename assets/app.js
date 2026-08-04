/* Simulateur — interface, graphiques SVG, tableau. */

(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const STORE = 'boule-de-neige.v2';

  const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct1 = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
  const num1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const pctText = (v) => (v * 100).toFixed(2).replace('.', ',') + ' %';

  function compact(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return num1.format(v / 1e6) + ' M€';
    if (a >= 1e3) return Math.round(v / 1e3) + ' k€';
    return Math.round(v) + ' €';
  }

  const $ = (id) => document.getElementById(id);

  const inputs = {
    initial: $('initial'), target: $('target'), monthly: $('monthly'), yearly: $('yearly'),
    rate: $('rate'), years: $('years'), fees: $('fees'), inflation: $('inflation'),
  };

  let mode = 'monthly';      // capitalisation : monthly | annual | compare
  let goal = 'contribution'; // point de départ : contribution | target
  let units = 'nominal';     // affichage : nominal | real
  let envelope = 'exonere';
  let result = null;
  let solvedMonthly = 0;

  /* ---------- SVG ---------- */

  function sv(tag, attrs, styles) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (styles) for (const k in styles) n.style.setProperty(k, styles[k]);
    return n;
  }

  function niceScale(v, count) {
    const c = count || 4;
    if (!(v > 0)) return { max: c, step: 1 };
    const raw = v / c;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => s >= raw / mag) * mag;
    return { max: step * c, step: step };
  }

  function barPath(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h));
    return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
  }

  function yearTicks(n) {
    const step = n <= 12 ? 1 : n <= 25 ? 2 : n <= 40 ? 5 : 10;
    const out = [];
    for (let y = step; y <= n; y += step) out.push(y);
    if (out[out.length - 1] !== n) out.push(n);
    return out;
  }

  /* ---------- état ---------- */

  const num = (el, min, max) => Math.min(max, Math.max(min, +el.value || 0));

  function readState() {
    return {
      initial: num(inputs.initial, 0, 1e12),
      target: num(inputs.target, 0, 1e12),
      monthly: num(inputs.monthly, 0, 1e9),
      rate: num(inputs.rate, 0, 100) / 100,
      fees: num(inputs.fees, 0, 10) / 100,
      inflation: num(inputs.inflation, 0, 20) / 100,
      years: Math.round(num(inputs.years, 1, 70)),
    };
  }

  function save(s) {
    try { localStorage.setItem(STORE, JSON.stringify({ ...s, mode, goal, units, envelope })); } catch (e) { /* stockage indisponible */ }
  }

  function restore() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { s = null; }
    if (!s) return;
    const set = (el, v, factor) => { if (typeof v === 'number' && isFinite(v)) el.value = round2(v * (factor || 1)); };
    set(inputs.initial, s.initial);
    set(inputs.target, s.target);
    set(inputs.monthly, s.monthly);
    if (typeof s.monthly === 'number') inputs.yearly.value = round2(s.monthly * 12);
    set(inputs.rate, s.rate, 100);
    set(inputs.fees, s.fees, 100);
    set(inputs.inflation, s.inflation, 100);
    if (typeof s.years === 'number') inputs.years.value = s.years;
    if (s.mode) mode = s.mode;
    if (s.goal) goal = s.goal;
    if (s.units) units = s.units;
    if (s.envelope && Compound.ENVELOPES[s.envelope]) envelope = s.envelope;
  }

  const round2 = (v) => Math.round(v * 100) / 100;

  function syncSegmented(groupId, attr, value) {
    for (const b of $(groupId).querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
    }
  }

  function syncControls() {
    syncSegmented('modeGroup', 'mode', mode);
    syncSegmented('goalGroup', 'goal', goal);
    syncSegmented('unitsGroup', 'units', units);
    $('envelope').value = envelope;

    $('modeHint').textContent = mode === 'monthly' ? 'Intérêts calculés chaque mois'
      : mode === 'annual' ? 'Intérêts calculés une fois par an'
        : 'Les deux méthodes côte à côte';
    $('unitsHint').textContent = units === 'real'
      ? 'Corrigés de l\'inflation' : 'Sans correction de l\'inflation';

    const solving = goal === 'target';
    $('targetField').hidden = !solving;
    $('solved').hidden = !solving;
    inputs.monthly.readOnly = solving;
    inputs.yearly.readOnly = solving;
    inputs.monthly.closest('.input-shell').classList.toggle('is-computed', solving);
    inputs.yearly.closest('.input-shell').classList.toggle('is-computed', solving);
  }

  /* ---------- rendu ---------- */

  const activeRows = () => (mode === 'annual' ? result.annual : result.monthlyC);

  /** Convertit un montant de l'année `year` selon l'unité d'affichage choisie. */
  function conv(value, deflator) {
    return units === 'real' ? value * deflator : value;
  }

  function render() {
    const s = readState();

    if (goal === 'target') {
      solvedMonthly = Compound.solveMonthly({
        initial: s.initial, target: s.target, rate: s.rate, fees: s.fees,
        years: s.years, compounding: mode === 'annual' ? 'annual' : 'monthly',
      });
      s.monthly = solvedMonthly;
      inputs.monthly.value = solvedMonthly.toFixed(2);
      inputs.yearly.value = (solvedMonthly * 12).toFixed(2);
    }

    save(s);
    result = Compound.project(s);
    const rows = activeRows();
    const sum = Compound.summarize(rows, result.meta, envelope);

    const m = result.meta;
    $('monthlyHint').textContent = 'soit ' + eur0.format(m.yearly) + ' par an';
    $('rateMonthHint').textContent = m.fees > 0
      ? 'net de frais : ' + pctText(m.rate) + ' par an'
      : 'soit ' + pctText(m.rMonth) + ' par mois';
    $('feesHint').textContent = m.fees > 0
      ? 'rendement net ramené à ' + pctText(m.rate) : 'Prélevés sur l\'encours';
    $('envelopeHint').textContent = Compound.ENVELOPES[envelope].allowance > 0
      ? 'après abattement de ' + eur0.format(Compound.ENVELOPES[envelope].allowance)
      : 'impôt calculé à la sortie';
    $('rateHint').textContent = m.years + ' ans · ' + eur0.format(m.monthly) + '/mois · ' + pctText(m.rate) + ' net';

    if (goal === 'target') {
      const s2 = readState();
      $('solved').innerHTML = solvedMonthly > 0
        ? `Pour atteindre <strong>${eur0.format(s2.target)}</strong> en ${m.years} ans à ${pctText(m.rate)} net, il faut verser <strong>${eur2.format(solvedMonthly)} par mois</strong> — soit ${eur0.format(solvedMonthly * 12)} par an, ${eur0.format(solvedMonthly * 12 * m.years + m.initial)} au total de votre poche.`
        : `Votre capital initial suffit&nbsp;: à ${pctText(m.rate)} net il dépasse seul l'objectif en ${m.years} ans. Aucun versement nécessaire.`;
    }

    renderTiles(sum);
    renderReadout(rows, sum);
    renderArea(rows, sum);
    renderBars(rows, sum);
    renderTable(rows, sum);
  }

  function renderTiles(sum) {
    const m = result.meta;
    const last = activeRows()[m.years - 1];
    const real = units === 'real';
    const suffix = real ? ' (euros d\'aujourd\'hui)' : '';
    const env = Compound.ENVELOPES[envelope];

    const tiles = [
      {
        k: 'Capital au bout de ' + m.years + ' ans' + suffix,
        v: eur0.format(conv(sum.finalCapital, last.deflator)),
        s: num1.format(sum.multiple) + ' × ce que vous avez versé', hero: true,
      },
      {
        k: 'Total versé de votre poche', v: eur0.format(conv(sum.paidIn, last.deflator)),
        cls: 'pay', dot: 'pay',
        s: eur0.format(m.monthly) + '/mois pendant ' + m.years + ' ans' + (m.initial > 0 ? ' + ' + eur0.format(m.initial) + ' au départ' : ''),
      },
      {
        k: 'Intérêts composés gagnés', v: eur0.format(conv(sum.interest, last.deflator)),
        cls: 'int', dot: 'int',
        s: pct1.format(sum.interestShare) + ' du capital final',
      },
      {
        k: 'Après impôt — ' + env.label,
        v: eur0.format(conv(sum.netCapital, last.deflator)),
        s: sum.tax > 0 ? eur0.format(conv(sum.tax, last.deflator)) + ' d\'impôt sur les gains' : 'aucun impôt sur les gains',
      },
      {
        k: real ? 'Soit en euros courants' : 'Pouvoir d\'achat réel',
        v: eur0.format(real ? sum.netCapital : sum.realNetCapital),
        s: m.inflation > 0
          ? (real ? 'valeur affichée sur les relevés' : pctText(m.inflation) + ' d\'inflation par an')
          : 'inflation à zéro',
      },
      {
        k: 'Année de bascule',
        v: sum.tippingYear ? 'An ' + sum.tippingYear : '—',
        s: sum.tippingYear ? 'les intérêts rapportent plus que vos versements' : 'pas atteinte sur ' + m.years + ' ans',
      },
    ];

    $('tiles').innerHTML = tiles.map((t) => `
      <div class="tile${t.hero ? ' is-hero' : ''}">
        <span class="k">${t.dot ? `<i class="swatch ${t.dot}"></i>` : ''}${t.k}</span>
        <span class="v${t.cls ? ' ' + t.cls : ''}">${t.v}</span>
        <span class="s">${t.s}</span>
      </div>`).join('');
  }

  function renderReadout(rows, sum) {
    const m = result.meta;
    let txt;
    if (sum.tippingYear) {
      const r = rows[sum.tippingYear - 1];
      txt = `À partir de l'<strong>année ${sum.tippingYear}</strong>, vos placements produisent <span class="mark">${eur0.format(r.interest)}</span> d'intérêts sur l'année, plus que les <span class="mark">${eur0.format(r.contribution)}</span> que vous y versez. `;
    } else {
      txt = `Sur ${m.years} ans, les intérêts d'une année n'atteignent pas encore vos versements annuels — allongez la durée ou augmentez le rendement pour voir la bascule. `;
    }
    if (sum.crossoverYear) {
      txt += `À l'<strong>année ${sum.crossoverYear}</strong>, les intérêts cumulés dépassent tout ce que vous avez versé depuis le début. `;
    }
    txt += `En année ${m.years}, le capital génère à lui seul <span class="mark">${eur0.format(sum.monthlyIncomeAtEnd)}</span> par mois.`;
    $('readout').innerHTML = txt;
  }

  /* ---------- aires empilées ---------- */

  function renderArea(rows, sum) {
    const host = $('areaChart');
    const tip = $('areaTip');
    const old = host.querySelector('svg');
    if (old) old.remove();

    const W = Math.max(320, host.clientWidth || 720);
    const H = Math.min(380, Math.max(260, Math.round(W * 0.42)));
    const pad = { t: 26, r: 18, b: 28, l: 62 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    const pts = [{ year: 0, paid: result.meta.initial, total: result.meta.initial }].concat(
      rows.map((r) => ({ year: r.year, paid: conv(r.paidIn, r.deflator), total: conv(r.close, r.deflator) }))
    );
    const n = pts.length - 1;
    const max = niceScale(Math.max.apply(null, pts.map((p) => p.total)), 4).max;

    const x = (i) => pad.l + (n === 0 ? 0 : (i / n) * pw);
    const y = (v) => pad.t + ph - (v / max) * ph;

    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
    svg.appendChild(sv('title', {})).textContent =
      `Versements cumulés et intérêts composés cumulés sur ${result.meta.years} ans`;

    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = y(v);
      svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'grid' }));
      const t = sv('text', { x: pad.l - 10, y: yy + 3.5, 'text-anchor': 'end' });
      t.textContent = compact(v);
      svg.appendChild(t);
    }

    const areaTo = (key) => {
      let d = `M${x(0)},${y(0)}`;
      pts.forEach((p, i) => { d += ` L${x(i)},${y(p[key])}`; });
      return d + ` L${x(n)},${y(0)} Z`;
    };
    const lineTo = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[key])}`).join(' ');

    svg.appendChild(sv('path', { d: areaTo('total') }, { fill: 'var(--int-fill)' }));
    svg.appendChild(sv('path', { d: areaTo('paid') }, { fill: 'var(--pay-fill)' }));
    svg.appendChild(sv('path', { d: lineTo('paid'), fill: 'none', 'stroke-width': 2 }, { stroke: 'var(--surface)' }));
    svg.appendChild(sv('path', { d: lineTo('total'), fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round' }, { stroke: 'var(--int)' }));

    svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), class: 'axis' }));
    for (const yr of yearTicks(n)) {
      const t = sv('text', { x: x(yr), y: H - pad.b + 16, 'text-anchor': 'middle' });
      t.textContent = yr;
      svg.appendChild(t);
    }
    const zero = sv('text', { x: pad.l, y: H - pad.b + 16, 'text-anchor': 'middle' });
    zero.textContent = '0';
    svg.appendChild(zero);

    if (sum.tippingYear) {
      const bx = x(sum.tippingYear);
      svg.appendChild(sv('line', { x1: bx, x2: bx, y1: pad.t - 6, y2: y(0), 'stroke-width': 1, 'stroke-dasharray': '3 3' }, { stroke: 'var(--int)' }));
      const lbl = sv('text', { x: bx + 5, y: pad.t - 10 }, { fill: 'var(--int)' });
      lbl.textContent = 'bascule · an ' + sum.tippingYear;
      svg.appendChild(lbl);
    }

    const end = pts[n];
    svg.appendChild(sv('circle', { cx: x(n), cy: y(end.total), r: 4.5, 'stroke-width': 2 }, { fill: 'var(--int)', stroke: 'var(--surface)' }));
    const t1 = sv('text', { x: W - pad.r - 8, y: Math.max(y(end.total) - 14, pad.t + 8), 'text-anchor': 'end', class: 'label-strong' });
    t1.textContent = eur0.format(end.total);
    svg.appendChild(t1);

    const cursor = sv('g', { opacity: 0 });
    const cline = sv('line', { y1: pad.t, y2: y(0), 'stroke-width': 1 }, { stroke: 'var(--rule-strong)' });
    const dotP = sv('circle', { r: 4, 'stroke-width': 2 }, { fill: 'var(--pay)', stroke: 'var(--surface)' });
    const dotT = sv('circle', { r: 4, 'stroke-width': 2 }, { fill: 'var(--int)', stroke: 'var(--surface)' });
    cursor.appendChild(cline); cursor.appendChild(dotP); cursor.appendChild(dotT);
    svg.appendChild(cursor);

    const hit = sv('rect', { x: pad.l, y: pad.t, width: pw, height: ph, fill: 'transparent' });
    svg.appendChild(hit);

    function move(ev) {
      const box = svg.getBoundingClientRect();
      const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - box.left) * (W / box.width);
      const i = Math.max(0, Math.min(n, Math.round(((px - pad.l) / pw) * n)));
      const p = pts[i];
      cursor.setAttribute('opacity', 1);
      cline.setAttribute('x1', x(i)); cline.setAttribute('x2', x(i));
      dotP.setAttribute('cx', x(i)); dotP.setAttribute('cy', y(p.paid));
      dotT.setAttribute('cx', x(i)); dotT.setAttribute('cy', y(p.total));
      tip.innerHTML = `
        <div class="tt-year">${i === 0 ? 'Au départ' : 'Fin de l\'année ' + p.year}</div>
        <div class="tt-row"><span class="tt-k"><i class="swatch pay"></i>Versé</span><span>${eur0.format(p.paid)}</span></div>
        <div class="tt-row"><span class="tt-k"><i class="swatch int"></i>Intérêts cumulés</span><span>${eur0.format(p.total - p.paid)}</span></div>
        <div class="tt-row total"><span>Capital</span><span>${eur0.format(p.total)}</span></div>`;
      tip.dataset.show = 'true';
      const scale = host.clientWidth / W;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(host.clientWidth - tw, x(i) * scale - tw / 2)) + 'px';
      tip.style.top = Math.max(0, y(p.total) * scale - tip.offsetHeight - 14) + 'px';
    }
    const leave = () => { cursor.setAttribute('opacity', 0); tip.dataset.show = 'false'; };

    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', leave);
    hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('touchmove', move, { passive: true });
    hit.addEventListener('touchend', leave);

    host.appendChild(svg);
  }

  /* ---------- barres groupées ---------- */

  function renderBars(rows, sum) {
    const host = $('barChart');
    const tip = $('barTip');
    const old = host.querySelector('svg');
    if (old) old.remove();

    const W = Math.max(320, host.clientWidth || 720);
    const H = Math.min(340, Math.max(240, Math.round(W * 0.36)));
    const pad = { t: 26, r: 18, b: 28, l: 62 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    const n = rows.length;
    const vals = rows.map((r) => ({
      pay: conv(r.contribution, r.deflator),
      int: conv(r.interest, r.deflator),
    }));
    const max = niceScale(Math.max.apply(null, vals.map((v) => Math.max(v.pay, v.int))), 4).max;
    const y = (v) => pad.t + ph - (v / max) * ph;
    const gw = pw / n;
    const bw = Math.max(1.5, Math.min(15, (gw - 4) / 2 - 1));
    const gx = (i) => pad.l + i * gw + gw / 2;

    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
    svg.appendChild(sv('title', {})).textContent =
      'Versements de l\'année comparés aux intérêts produits dans l\'année';

    const hover = sv('rect', { y: pad.t, height: ph, width: gw, opacity: 0 }, { fill: 'var(--rule)' });
    svg.appendChild(hover);

    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = y(v);
      svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'grid' }));
      const t = sv('text', { x: pad.l - 10, y: yy + 3.5, 'text-anchor': 'end' });
      t.textContent = compact(v);
      svg.appendChild(t);
    }

    vals.forEach((v, i) => {
      const cx = gx(i);
      if (v.pay > 0) svg.appendChild(sv('path', { d: barPath(cx - bw - 1, y(v.pay), bw, y(0) - y(v.pay), 4) }, { fill: 'var(--pay-fill)' }));
      if (v.int > 0) svg.appendChild(sv('path', { d: barPath(cx + 1, y(v.int), bw, y(0) - y(v.int), 4) }, { fill: 'var(--int-fill)' }));
    });

    svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), class: 'axis' }));
    for (const yr of yearTicks(n)) {
      const t = sv('text', { x: gx(yr - 1), y: H - pad.b + 16, 'text-anchor': 'middle' });
      t.textContent = yr;
      svg.appendChild(t);
    }

    if (sum.tippingYear) {
      const bx = gx(sum.tippingYear - 1);
      svg.appendChild(sv('line', { x1: bx, x2: bx, y1: pad.t - 6, y2: y(0), 'stroke-width': 1, 'stroke-dasharray': '3 3' }, { stroke: 'var(--int)' }));
      const anchor = bx > pad.l + pw * 0.72 ? 'end' : 'start';
      const lbl = sv('text', { x: bx + (anchor === 'end' ? -5 : 5), y: pad.t - 10, 'text-anchor': anchor }, { fill: 'var(--int)' });
      lbl.textContent = 'les intérêts dépassent vos versements · an ' + sum.tippingYear;
      svg.appendChild(lbl);
    }

    const hit = sv('rect', { x: pad.l, y: pad.t, width: pw, height: ph, fill: 'transparent' });
    svg.appendChild(hit);

    function move(ev) {
      const box = svg.getBoundingClientRect();
      const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - box.left) * (W / box.width);
      const i = Math.max(0, Math.min(n - 1, Math.floor((px - pad.l) / gw)));
      const r = rows[i];
      hover.setAttribute('x', pad.l + i * gw);
      hover.setAttribute('opacity', 0.5);
      tip.innerHTML = `
        <div class="tt-year">Année ${r.year}</div>
        <div class="tt-row"><span class="tt-k"><i class="swatch pay"></i>Vous versez</span><span>${eur0.format(vals[i].pay)}</span></div>
        <div class="tt-row"><span class="tt-k"><i class="swatch int"></i>Intérêts produits</span><span>${eur0.format(vals[i].int)}</span></div>
        <div class="tt-row total"><span>Capital fin d'année</span><span>${eur0.format(conv(r.close, r.deflator))}</span></div>`;
      tip.dataset.show = 'true';
      const tw = tip.offsetWidth;
      const left = (gx(i) / W) * host.clientWidth;
      tip.style.left = Math.max(0, Math.min(host.clientWidth - tw, left - tw / 2)) + 'px';
      tip.style.top = '4px';
    }
    const leave = () => { hover.setAttribute('opacity', 0); tip.dataset.show = 'false'; };

    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', leave);
    hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('touchmove', move, { passive: true });
    hit.addEventListener('touchend', leave);

    host.appendChild(svg);
  }

  /* ---------- tableau ---------- */

  function renderTable(rows, sum) {
    const unitNote = units === 'real' ? ' Montants en euros d\'aujourd\'hui.' : '';
    const rowClass = (year) => {
      const c = [];
      if (sum.tippingYear === year) c.push('is-tipping');
      if (year % 10 === 0) c.push('is-decade');
      return c.join(' ');
    };
    const c = (v, d) => eur2.format(conv(v, d));

    if (mode === 'compare') {
      $('tableNote').textContent = 'Les deux méthodes de capitalisation côte à côte. À taux égal, capitaliser chaque mois rapporte davantage.' + unitNote;
      $('thead').innerHTML = ['Année', 'Épargne cumulée', 'Capital début (annuel)', 'Intérêts (annuel)',
        'Capital fin (annuel)', 'Int. cumulés (annuel)', 'Intérêts (mensuel)', 'Capital fin (mensuel)',
        'Int. cumulés (mensuel)', 'Écart mensuel − annuel']
        .map((h) => `<th scope="col">${h}</th>`).join('');
      $('tbody').innerHTML = result.annual.map((a, i) => {
        const m = result.monthlyC[i];
        return `<tr class="${rowClass(a.year)}">
          <td>${a.year}</td>
          <td>${c(a.savedCumul, a.deflator)}</td>
          <td>${c(a.open, a.deflator)}</td>
          <td class="c-int">${c(a.interest, a.deflator)}</td>
          <td class="c-strong">${c(a.close, a.deflator)}</td>
          <td class="c-int">${c(a.interestCumul, a.deflator)}</td>
          <td class="c-int">${c(m.interest, m.deflator)}</td>
          <td class="c-strong">${c(m.close, m.deflator)}</td>
          <td class="c-int">${c(m.interestCumul, m.deflator)}</td>
          <td>${c(m.close - a.close, a.deflator)}</td>
        </tr>`;
      }).join('');
      return;
    }

    $('tableNote').textContent = (mode === 'monthly'
      ? 'Capitalisation mensuelle : les intérêts du mois s\'ajoutent au solde et produisent à leur tour dès le mois suivant.'
      : 'Capitalisation annuelle : les intérêts d\'une année portent sur le capital présent en début d\'année.') + unitNote;

    $('thead').innerHTML = ['Année', 'Versement de l\'année', 'Capital début d\'année', 'Capital + épargne',
      'Intérêts de l\'année', 'Capital fin d\'année', 'Total versé', 'Intérêts composés cumulés', 'Part des intérêts']
      .map((h) => `<th scope="col">${h}</th>`).join('');

    $('tbody').innerHTML = rows.map((r) => `<tr class="${rowClass(r.year)}">
        <td>${r.year}</td>
        <td class="c-pay">${c(r.contribution, r.deflator)}</td>
        <td>${c(r.open, r.deflator)}</td>
        <td>${c(r.base, r.deflator)}</td>
        <td class="c-int">${c(r.interest, r.deflator)}</td>
        <td class="c-strong">${c(r.close, r.deflator)}</td>
        <td class="c-pay">${c(r.paidIn, r.deflator)}</td>
        <td class="c-int">${c(r.interestCumul, r.deflator)}</td>
        <td>${pct1.format(r.close > 0 ? r.interestCumul / r.close : 0)}</td>
      </tr>`).join('');
  }

  /* ---------- câblage ---------- */

  let raf = null;
  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = null; render(); });
  }

  inputs.monthly.addEventListener('input', () => {
    if (inputs.monthly.readOnly) return;
    inputs.yearly.value = round2((+inputs.monthly.value || 0) * 12);
    schedule();
  });
  inputs.yearly.addEventListener('input', () => {
    if (inputs.yearly.readOnly) return;
    inputs.monthly.value = round2((+inputs.yearly.value || 0) / 12);
    schedule();
  });
  for (const k of ['initial', 'target', 'rate', 'years', 'fees', 'inflation']) {
    inputs[k].addEventListener('input', schedule);
  }

  $('envelope').innerHTML = Object.keys(Compound.ENVELOPES)
    .map((k) => `<option value="${k}">${Compound.ENVELOPES[k].label}</option>`).join('');
  $('envelope').addEventListener('change', (e) => { envelope = e.target.value; syncControls(); render(); });

  const onSegment = (groupId, attr, apply) => $(groupId).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-' + attr + ']');
    if (!b) return;
    apply(b.dataset[attr]);
    syncControls();
    render();
  });
  onSegment('modeGroup', 'mode', (v) => { mode = v; });
  onSegment('goalGroup', 'goal', (v) => { goal = v; });
  onSegment('unitsGroup', 'units', (v) => { units = v; });

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!result) return;
      const rows = activeRows();
      const sum = Compound.summarize(rows, result.meta, envelope);
      renderArea(rows, sum);
      renderBars(rows, sum);
    }, 120);
  });

  restore();
  syncControls();
  render();
})();
