/* Interface — simulateur d'intérêts composés « boule de neige ». */

(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const STORE = 'boule-de-neige.v1';

  const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct1 = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
  const num1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

  function compact(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return num1.format(v / 1e6) + ' M€';
    if (a >= 1e3) return Math.round(v / 1e3) + ' k€';
    return Math.round(v) + ' €';
  }

  const $ = (id) => document.getElementById(id);

  const inputs = {
    initial: $('initial'),
    monthly: $('monthly'),
    yearly: $('yearly'),
    rate: $('rate'),
    years: $('years'),
  };

  let mode = 'monthly';
  let result = null;

  /* ---------- SVG helpers ---------- */

  function sv(tag, attrs, styles) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (styles) for (const k in styles) n.style.setProperty(k, styles[k]);
    return n;
  }

  /** Échelle lisible : un pas rond, et un maximum multiple de ce pas. */
  function niceScale(v, count) {
    const c = count || 4;
    if (!(v > 0)) return { max: c, step: 1 };
    const raw = v / c;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => s >= norm) * mag;
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

  /* ---------- lecture / écriture des paramètres ---------- */

  function readState() {
    return {
      initial: Math.max(0, +inputs.initial.value || 0),
      monthly: Math.max(0, +inputs.monthly.value || 0),
      rate: Math.max(0, +inputs.rate.value || 0) / 100,
      years: Math.min(70, Math.max(1, Math.round(+inputs.years.value || 1))),
    };
  }

  function save(s) {
    try { localStorage.setItem(STORE, JSON.stringify({ ...s, mode })); } catch (e) { /* stockage indisponible */ }
  }

  function restore() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { s = null; }
    if (!s) return;
    if (typeof s.initial === 'number') inputs.initial.value = s.initial;
    if (typeof s.monthly === 'number') { inputs.monthly.value = s.monthly; inputs.yearly.value = round2(s.monthly * 12); }
    if (typeof s.rate === 'number') inputs.rate.value = round2(s.rate * 100);
    if (typeof s.years === 'number') inputs.years.value = s.years;
    if (s.mode) setMode(s.mode, false);
  }

  const round2 = (v) => Math.round(v * 100) / 100;

  function setMode(m, rerender) {
    mode = m;
    for (const b of $('modeGroup').querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    }
    $('modeHint').textContent = m === 'monthly'
      ? 'Intérêts calculés chaque mois'
      : m === 'annual'
        ? 'Intérêts calculés une fois par an'
        : 'Les deux méthodes côte à côte';
    if (rerender !== false) render();
  }

  /* ---------- rendu ---------- */

  function activeRows() {
    return mode === 'annual' ? result.annual : result.monthlyC;
  }

  function render() {
    const s = readState();
    save(s);
    result = Compound.project(s);

    const rows = activeRows();
    const sum = Compound.summarize(rows, result.meta);

    $('monthlyHint').textContent = 'soit ' + eur0.format(result.meta.yearly) + ' par an';
    $('rateMonthHint').textContent = 'soit ' + (result.meta.rMonth * 100).toFixed(2).replace('.', ',') + ' % par mois';
    $('rateHint').textContent = result.meta.years + ' ans · ' + eur0.format(result.meta.monthly) + '/mois · ' + (s.rate * 100).toFixed(2).replace('.', ',') + ' %/an';

    renderTiles(rows, sum);
    renderReadout(rows, sum);
    renderArea(rows, sum);
    renderBars(rows, sum);
    renderTable(rows, sum);
  }

  function renderTiles(rows, sum) {
    const tiles = [
      {
        k: 'Capital au bout de ' + result.meta.years + ' ans', v: eur0.format(sum.finalCapital),
        s: 'soit ' + num1.format(sum.multiple) + ' × ce que vous avez versé', hero: true,
      },
      {
        k: 'Total versé de votre poche', v: eur0.format(sum.paidIn), cls: 'pay', dot: 'pay',
        s: eur0.format(result.meta.monthly) + '/mois pendant ' + result.meta.years + ' ans' + (result.meta.initial > 0 ? ' + ' + eur0.format(result.meta.initial) + ' au départ' : ''),
      },
      {
        k: 'Intérêts composés gagnés', v: eur0.format(sum.interest), cls: 'int', dot: 'int',
        s: pct1.format(sum.interestShare) + ' du capital final',
      },
      {
        k: 'Intérêts la dernière année', v: eur0.format(sum.lastInterest),
        s: sum.firstInterest > 0
          ? num1.format(sum.acceleration) + ' × les intérêts de la 1ʳᵉ année'
          : 'contre ' + eur0.format(sum.firstInterest) + ' la 1ʳᵉ année',
      },
      {
        k: 'Année de bascule',
        v: sum.tippingYear ? 'An ' + sum.tippingYear : '—',
        s: sum.tippingYear
          ? 'les intérêts rapportent plus que vos versements'
          : 'pas atteinte sur ' + result.meta.years + ' ans',
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
    const y = result.meta.years;
    let txt;
    if (sum.tippingYear) {
      const r = rows[sum.tippingYear - 1];
      txt = `À partir de l'<strong>année ${sum.tippingYear}</strong>, vos placements produisent <span class="mark">${eur0.format(r.interest)}</span> d'intérêts sur l'année, plus que les <span class="mark">${eur0.format(r.contribution)}</span> que vous y versez. `;
    } else {
      txt = `Sur ${y} ans, les intérêts d'une année n'atteignent pas encore vos versements annuels — allongez la durée ou augmentez le taux pour voir la bascule. `;
    }
    if (sum.crossoverYear) {
      txt += `À l'<strong>année ${sum.crossoverYear}</strong>, les intérêts cumulés dépassent tout ce que vous avez versé depuis le début. `;
    }
    txt += `En année ${y}, le capital génère à lui seul <span class="mark">${eur0.format(sum.monthlyIncomeAtEnd)}</span> par mois.`;
    $('readout').innerHTML = txt;
  }

  /* ---------- graphique en aires empilées ---------- */

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

    // point 0 = aujourd'hui
    const pts = [{ year: 0, paid: result.meta.initial, total: result.meta.initial }].concat(
      rows.map((r) => ({ year: r.year, paid: r.paidIn, total: r.close }))
    );
    const n = pts.length - 1;
    const max = niceScale(pts[n].total, 4).max;

    const x = (i) => pad.l + (n === 0 ? 0 : (i / n) * pw);
    const y = (v) => pad.t + ph - (v / max) * ph;

    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
    svg.appendChild(sv('title', {})).textContent =
      `Versements cumulés et intérêts composés cumulés sur ${result.meta.years} ans`;

    // grille + axe des ordonnées
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
      d += ` L${x(n)},${y(0)} Z`;
      return d;
    };
    const lineTo = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[key])}`).join(' ');

    // aire des intérêts (jusqu'au total), puis aire des versements par-dessus
    svg.appendChild(sv('path', { d: areaTo('total') }, { fill: 'var(--int-fill)' }));
    svg.appendChild(sv('path', { d: areaTo('paid') }, { fill: 'var(--pay-fill)' }));
    // séparation de 2 px : la couleur du fond crée l'espace entre les deux aires
    svg.appendChild(sv('path', { d: lineTo('paid'), fill: 'none', 'stroke-width': 2 }, { stroke: 'var(--surface)' }));
    svg.appendChild(sv('path', { d: lineTo('total'), fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round' }, { stroke: 'var(--int)' }));

    // axe des abscisses
    svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), class: 'axis' }));
    for (const yr of yearTicks(n)) {
      const t = sv('text', { x: x(yr), y: H - pad.b + 16, 'text-anchor': 'middle' });
      t.textContent = yr;
      svg.appendChild(t);
    }
    const ax = sv('text', { x: pad.l, y: H - pad.b + 16, 'text-anchor': 'middle' });
    ax.textContent = '0';
    svg.appendChild(ax);

    // repère de bascule
    if (sum.tippingYear) {
      const bx = x(sum.tippingYear);
      svg.appendChild(sv('line', {
        x1: bx, x2: bx, y1: pad.t - 6, y2: y(0),
        'stroke-width': 1, 'stroke-dasharray': '3 3',
      }, { stroke: 'var(--int)' }));
      const lbl = sv('text', { x: bx + 5, y: pad.t - 10, 'text-anchor': 'start' }, { fill: 'var(--int)' });
      lbl.textContent = 'bascule · an ' + sum.tippingYear;
      svg.appendChild(lbl);
    }

    // étiquette directe en bout de courbe
    const end = pts[n];
    svg.appendChild(sv('circle', { cx: x(n), cy: y(end.total), r: 4.5, 'stroke-width': 2 }, { fill: 'var(--int)', stroke: 'var(--surface)' }));
    const t1 = sv('text', { x: W - pad.r - 8, y: Math.max(y(end.total) - 14, pad.t + 8), 'text-anchor': 'end', class: 'label-strong' });
    t1.textContent = eur0.format(end.total);
    svg.appendChild(t1);

    // curseur
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
      let i = Math.round(((px - pad.l) / pw) * n);
      i = Math.max(0, Math.min(n, i));
      const p = pts[i];
      cursor.setAttribute('opacity', 1);
      cline.setAttribute('x1', x(i)); cline.setAttribute('x2', x(i));
      dotP.setAttribute('cx', x(i)); dotP.setAttribute('cy', y(p.paid));
      dotT.setAttribute('cx', x(i)); dotT.setAttribute('cy', y(p.total));

      const interest = p.total - p.paid;
      tip.innerHTML = `
        <div class="tt-year">${i === 0 ? 'Au départ' : 'Fin de l\'année ' + p.year}</div>
        <div class="tt-row"><span class="tt-k"><i class="swatch pay"></i>Versé</span><span>${eur0.format(p.paid)}</span></div>
        <div class="tt-row"><span class="tt-k"><i class="swatch int"></i>Intérêts cumulés</span><span>${eur0.format(interest)}</span></div>
        <div class="tt-row total"><span>Capital</span><span>${eur0.format(p.total)}</span></div>`;
      tip.dataset.show = 'true';
      const scale = host.clientWidth / W;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(host.clientWidth - tw, x(i) * scale - tw / 2)) + 'px';
      tip.style.top = Math.max(0, y(p.total) * scale - tip.offsetHeight - 14) + 'px';
    }

    function leave() { cursor.setAttribute('opacity', 0); tip.dataset.show = 'false'; }

    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', leave);
    hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('touchmove', move, { passive: true });
    hit.addEventListener('touchend', leave);

    host.appendChild(svg);
  }

  /* ---------- graphique en barres groupées ---------- */

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
    const max = niceScale(Math.max(rows[n - 1].interest, rows[0].contribution), 4).max;
    const y = (v) => pad.t + ph - (v / max) * ph;
    const gw = pw / n;
    const bw = Math.max(1.5, Math.min(15, (gw - 4) / 2 - 1));
    const gx = (i) => pad.l + i * gw + gw / 2;

    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
    svg.appendChild(sv('title', {})).textContent =
      'Versements de l\'année comparés aux intérêts produits dans l\'année';

    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = y(v);
      svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'grid' }));
      const t = sv('text', { x: pad.l - 10, y: yy + 3.5, 'text-anchor': 'end' });
      t.textContent = compact(v);
      svg.appendChild(t);
    }

    rows.forEach((r, i) => {
      const cx = gx(i);
      const xPay = cx - bw - 1;
      const xInt = cx + 1;
      const hPay = Math.max(0, y(0) - y(r.contribution));
      const hInt = Math.max(0, y(0) - y(r.interest));
      if (hPay > 0) {
        svg.appendChild(sv('path', { d: barPath(xPay, y(r.contribution), bw, hPay, 4) }, { fill: 'var(--pay-fill)' }));
      }
      if (hInt > 0) {
        svg.appendChild(sv('path', { d: barPath(xInt, y(r.interest), bw, hInt, 4) }, { fill: 'var(--int-fill)' }));
      }
    });

    svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), class: 'axis' }));
    for (const yr of yearTicks(n)) {
      const t = sv('text', { x: gx(yr - 1), y: H - pad.b + 16, 'text-anchor': 'middle' });
      t.textContent = yr;
      svg.appendChild(t);
    }

    if (sum.tippingYear) {
      const bx = gx(sum.tippingYear - 1);
      svg.appendChild(sv('line', {
        x1: bx, x2: bx, y1: pad.t - 6, y2: y(0), 'stroke-width': 1, 'stroke-dasharray': '3 3',
      }, { stroke: 'var(--int)' }));
      const anchor = bx > pad.l + pw * 0.72 ? 'end' : 'start';
      const lbl = sv('text', { x: bx + (anchor === 'end' ? -5 : 5), y: pad.t - 10, 'text-anchor': anchor }, { fill: 'var(--int)' });
      lbl.textContent = 'les intérêts dépassent vos versements · an ' + sum.tippingYear;
      svg.appendChild(lbl);
    }

    const hit = sv('rect', { x: pad.l, y: pad.t, width: pw, height: ph, fill: 'transparent' });
    svg.appendChild(hit);
    const hover = sv('rect', { y: pad.t, height: ph, opacity: 0, width: gw }, { fill: 'var(--rule)' });
    svg.insertBefore(hover, svg.firstChild.nextSibling);

    function move(ev) {
      const box = svg.getBoundingClientRect();
      const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - box.left) * (W / box.width);
      let i = Math.floor((px - pad.l) / gw);
      i = Math.max(0, Math.min(n - 1, i));
      const r = rows[i];
      hover.setAttribute('x', pad.l + i * gw);
      hover.setAttribute('opacity', 0.5);
      tip.innerHTML = `
        <div class="tt-year">Année ${r.year}</div>
        <div class="tt-row"><span class="tt-k"><i class="swatch pay"></i>Vous versez</span><span>${eur0.format(r.contribution)}</span></div>
        <div class="tt-row"><span class="tt-k"><i class="swatch int"></i>Intérêts produits</span><span>${eur0.format(r.interest)}</span></div>
        <div class="tt-row total"><span>Capital fin d'année</span><span>${eur0.format(r.close)}</span></div>`;
      tip.dataset.show = 'true';
      const left = ((pad.l + i * gw + gw / 2) / W) * host.clientWidth;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(host.clientWidth - tw, left - tw / 2)) + 'px';
      tip.style.top = '4px';
    }

    function leave() { hover.setAttribute('opacity', 0); tip.dataset.show = 'false'; }

    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', leave);
    hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('touchmove', move, { passive: true });
    hit.addEventListener('touchend', leave);

    host.appendChild(svg);
  }

  /* ---------- tableau ---------- */

  function renderTable(rows, sum) {
    const thead = $('thead');
    const tbody = $('tbody');

    if (mode === 'compare') {
      $('tableNote').textContent = 'Les deux méthodes de capitalisation côte à côte. À taux égal, capitaliser chaque mois rapporte davantage.';
      thead.innerHTML = ['Année', 'Épargne cumulée', 'Capital début (annuel)', 'Intérêts (annuel)',
        'Capital fin (annuel)', 'Int. cumulés (annuel)', 'Intérêts (mensuel)', 'Capital fin (mensuel)',
        'Int. cumulés (mensuel)', 'Écart mensuel − annuel']
        .map((h) => `<th scope="col">${h}</th>`).join('');

      tbody.innerHTML = result.annual.map((a, i) => {
        const m = result.monthlyC[i];
        const cls = [];
        if (sum.tippingYear === a.year) cls.push('is-tipping');
        if (a.year % 10 === 0) cls.push('is-decade');
        return `<tr class="${cls.join(' ')}">
          <td>${a.year}</td>
          <td>${eur2.format(a.savedCumul)}</td>
          <td>${eur2.format(a.open)}</td>
          <td class="c-int">${eur2.format(a.interest)}</td>
          <td class="c-strong">${eur2.format(a.close)}</td>
          <td class="c-int">${eur2.format(a.interestCumul)}</td>
          <td class="c-int">${eur2.format(m.interest)}</td>
          <td class="c-strong">${eur2.format(m.close)}</td>
          <td class="c-int">${eur2.format(m.interestCumul)}</td>
          <td>${eur2.format(m.close - a.close)}</td>
        </tr>`;
      }).join('');
      return;
    }

    $('tableNote').textContent = mode === 'monthly'
      ? 'Capitalisation mensuelle : les intérêts du mois s\'ajoutent au solde et produisent à leur tour dès le mois suivant.'
      : 'Capitalisation annuelle : les intérêts d\'une année portent sur le capital présent en début d\'année.';

    thead.innerHTML = ['Année', 'Versement de l\'année', 'Capital début d\'année', 'Capital + épargne',
      'Intérêts de l\'année', 'Capital fin d\'année', 'Total versé', 'Intérêts composés cumulés', 'Part des intérêts']
      .map((h) => `<th scope="col">${h}</th>`).join('');

    tbody.innerHTML = rows.map((r) => {
      const cls = [];
      if (sum.tippingYear === r.year) cls.push('is-tipping');
      if (r.year % 10 === 0) cls.push('is-decade');
      const share = r.close > 0 ? r.interestCumul / r.close : 0;
      return `<tr class="${cls.join(' ')}">
        <td>${r.year}</td>
        <td class="c-pay">${eur2.format(r.contribution)}</td>
        <td>${eur2.format(r.open)}</td>
        <td>${eur2.format(r.base)}</td>
        <td class="c-int">${eur2.format(r.interest)}</td>
        <td class="c-strong">${eur2.format(r.close)}</td>
        <td class="c-pay">${eur2.format(r.paidIn)}</td>
        <td class="c-int">${eur2.format(r.interestCumul)}</td>
        <td>${pct1.format(share)}</td>
      </tr>`;
    }).join('');
  }

  /* ---------- câblage ---------- */

  let raf = null;
  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = null; render(); });
  }

  inputs.monthly.addEventListener('input', () => {
    inputs.yearly.value = round2((+inputs.monthly.value || 0) * 12);
    schedule();
  });
  inputs.yearly.addEventListener('input', () => {
    inputs.monthly.value = round2((+inputs.yearly.value || 0) / 12);
    schedule();
  });
  for (const k of ['initial', 'rate', 'years']) inputs[k].addEventListener('input', schedule);

  $('modeGroup').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (b) setMode(b.dataset.mode);
  });

  /* thème */
  const root = document.documentElement;
  const toggle = $('themeToggle');
  try {
    const saved = localStorage.getItem(STORE + '.theme');
    if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
  } catch (e) { /* stockage indisponible */ }

  function currentTheme() {
    const set = root.getAttribute('data-theme');
    if (set === 'dark' || set === 'light') return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function syncToggle() {
    toggle.textContent = currentTheme() === 'dark' ? 'Thème clair' : 'Thème sombre';
  }
  toggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORE + '.theme', next); } catch (e) { /* stockage indisponible */ }
    syncToggle();
    render();
  });

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!result) return;
      const rows = activeRows();
      const sum = Compound.summarize(rows, result.meta);
      renderArea(rows, sum);
      renderBars(rows, sum);
    }, 120);
  });

  restore();
  syncToggle();
  setMode(mode, false);
  render();
})();
