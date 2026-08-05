/* Suivi réel — saisie du tableau, synthèse, courbe.

   Le corps du tableau n'est reconstruit que lorsque sa structure change
   (ajout, suppression, tri, import). Pendant la frappe, seules les cellules
   calculées sont mises à jour : le champ en cours d'édition garde le focus. */

(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const STORE = 'boule-de-neige.suivi.v1';

  const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

  const $ = (id) => document.getElementById(id);
  const pct = (v, d) => (v === null || v === undefined || !isFinite(v))
    ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d === undefined ? 2 : d).replace('.', ',') + ' %';
  const pts = (v) => (v === null || !isFinite(v))
    ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(2).replace('.', ',') + ' pt';
  const signed = (v) => (v >= 0 ? '+' : '−') + eur0.format(Math.abs(v)).replace('-', '');
  const sign = (v) => (v > 0.005 ? 'c-up' : v < -0.005 ? 'c-down' : '');

  function compact(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return num1.format(v / 1e6) + ' M€';
    if (a >= 1e3) return Math.round(v / 1e3) + ' k€';
    return Math.round(v) + ' €';
  }

  function pretty(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || '');
    if (!m) return key || '—';
    return monthLabel.format(new Date(+m[1], +m[2] - 1, 1));
  }

  function sv(tag, attrs, styles) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (styles) for (const k in styles) n.style.setProperty(k, styles[k]);
    return n;
  }

  function niceScale(v, count) {
    const c = count || 4;
    if (!(v > 0)) return { max: c };
    const raw = v / c;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((s) => s >= raw / mag) * mag;
    return { max: step * c };
  }

  /* ---------- état ---------- */

  let state = { initial: 0, rate: 0.08, entries: [] };
  let data = null;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (raw && Array.isArray(raw.entries)) {
        state = {
          initial: +raw.initial || 0,
          rate: +raw.rate || 0,
          entries: raw.entries.map(clean),
        };
      }
    } catch (e) { /* stockage indisponible ou illisible */ }
    $('tInitial').value = state.initial;
    $('tRate').value = +(state.rate * 100).toFixed(4);
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
  }

  function clean(e) {
    const val = (v) => (v === null || v === undefined || v === '' ? null : (isFinite(+v) ? +v : null));
    return {
      month: String(e.month || '').slice(0, 7),
      contribution: val(e.contribution),
      value: val(e.value),
      interest: val(e.interest),
    };
  }

  const sortEntries = () => state.entries.sort((a, b) => a.month.localeCompare(b.month));

  /* ---------- tableau de saisie ---------- */

  function cell(row, cls, title) {
    const td = document.createElement('td');
    td.className = cls;
    if (title) td.title = title;
    row.appendChild(td);
    return td;
  }

  function moneyInput(row, key, i, placeholder) {
    const td = document.createElement('td');
    const shell = document.createElement('div');
    shell.className = 'cell-input';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.inputMode = 'decimal';
    input.dataset.key = key;
    input.dataset.i = i;
    input.placeholder = placeholder || '';
    const e = state.entries[i];
    input.value = e[key] === null ? '' : e[key];
    input.setAttribute('aria-label', (key === 'contribution' ? 'Versement' : key === 'value' ? 'Valeur du portefeuille' : 'Intérêts') + ' — ' + pretty(e.month));
    shell.appendChild(input);
    td.appendChild(shell);
    row.appendChild(td);
    return input;
  }

  function renderRows() {
    const body = $('tBody');
    body.innerHTML = '';
    state.entries.forEach((e, i) => {
      const tr = document.createElement('tr');
      tr.dataset.i = i;

      const tdMonth = document.createElement('td');
      const shell = document.createElement('div');
      shell.className = 'cell-input';
      const month = document.createElement('input');
      month.type = 'month';
      month.dataset.key = 'month';
      month.dataset.i = i;
      month.value = e.month;
      month.setAttribute('aria-label', 'Mois');
      shell.appendChild(month);
      tdMonth.appendChild(shell);
      tr.appendChild(tdMonth);

      moneyInput(tr, 'contribution', i);
      moneyInput(tr, 'value', i);
      moneyInput(tr, 'interest', i);

      cell(tr, 'c-open');
      cell(tr, 'c-rate');
      cell(tr, 'c-ann', 'Le rendement du mois prolongé sur douze mois');
      cell(tr, 'c-ideal');
      cell(tr, 'c-gap');

      const tdDel = document.createElement('td');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'row-del';
      del.dataset.del = i;
      del.textContent = '×';
      del.setAttribute('aria-label', 'Supprimer ' + pretty(e.month));
      tdDel.appendChild(del);
      tr.appendChild(tdDel);

      body.appendChild(tr);
    });
    $('tEmpty').hidden = state.entries.length > 0;
  }

  /** Met à jour les cellules calculées sans toucher aux champs de saisie. */
  function refreshRows(rows) {
    const trs = $('tBody').children;
    for (let i = 0; i < trs.length; i++) {
      const r = rows[i];
      const tr = trs[i];
      if (!r) continue;
      const q = (cls) => tr.querySelector('.' + cls);
      q('c-open').textContent = eur2.format(r.open);
      q('c-rate').textContent = r.rate === null ? '—' : pct(r.rate);
      q('c-rate').className = 'c-rate ' + (r.rate === null ? '' : sign(r.rate));
      q('c-ann').textContent = r.annualized === null ? '—' : pct(r.annualized, 1);
      q('c-ann').className = 'c-ann ' + (r.annualized === null ? '' : sign(r.annualized - state.rate));
      q('c-ideal').textContent = eur2.format(r.idealClose);
      q('c-gap').textContent = signed(r.gap);
      q('c-gap').className = 'c-gap ' + sign(r.gap);

      /* La colonne non saisie affiche la valeur déduite, en gris. */
      const value = tr.querySelector('input[data-key="value"]');
      const interest = tr.querySelector('input[data-key="interest"]');
      value.placeholder = r.source === 'interest' ? eur2.format(r.close) : '—';
      interest.placeholder = r.source === 'value' ? eur2.format(r.interest) : '—';
      value.parentNode.classList.toggle('is-derived', r.source === 'interest');
      interest.parentNode.classList.toggle('is-derived', r.source === 'value');
      tr.classList.toggle('is-empty', r.source === 'none');
    }
  }

  /* ---------- synthèse ---------- */

  function tile(k, v, s, cls) {
    return `<div class="tile${cls ? ' ' + cls : ''}"><span class="k">${k}</span><span class="v${cls === 'is-hero' ? '' : ''}">${v}</span><span class="s">${s}</span></div>`;
  }

  function renderTiles(s) {
    const host = $('tTiles');
    if (!s.months) {
      host.innerHTML = '';
      $('tTilesNote').textContent = '';
      return;
    }
    const avg = s.average === null ? '—' : pct(s.average, 2);
    const gapClass = sign(s.gap);
    const rateGapClass = s.rateGap === null ? '' : sign(s.rateGap);
    const dessus = s.gap >= 0 ? 'au-dessus' : 'en dessous';

    host.innerHTML = [
      tile('Rendement annuel moyen · ' + s.months + ' mois', `<span class="${rateGapClass}">${avg}</span>`,
        'moyenne géométrique, effet composé compris', 'is-hero'),
      tile('Taux cible', pct(s.target, 2), 'la trajectoire idéale de référence'),
      tile('Écart de rendement', `<span class="${rateGapClass}">${pts(s.rateGap)}</span>`,
        s.rateGap === null ? 'aucun mois mesurable' : 'votre rendement moyen moins le taux cible'),
      tile('Capital réel', eur0.format(s.capital), 'à la fin du dernier mois saisi'),
      tile('Capital idéal', eur0.format(s.idealCapital), 'mêmes versements, au taux cible'),
      tile('Écart de capital', `<span class="${gapClass}">${signed(s.gap)}</span>`, 'ce que l\'écart vaut aujourd\'hui'),
      tile('<i class="swatch pay"></i>Versé de votre poche', eur0.format(s.paidIn), 'capital de départ et versements'),
      tile('<i class="swatch int"></i>Intérêts réels', `<span class="${sign(s.interest)}">${signed(s.interest)}</span>`,
        'contre ' + eur0.format(s.idealInterest) + ' en théorie'),
    ].join('');

    $('tTilesNote').textContent = s.ratedMonths < s.months
      ? (s.months - s.ratedMonths) + ' mois sur ' + s.months + ' n\'ont pas de rendement mesurable (aucune valeur ni intérêt saisis, ou capital nul en début de mois). Ils comptent dans les versements, pas dans la moyenne.'
      : 'Votre portefeuille est ' + dessus + ' de la trajectoire idéale de ' + eur0.format(Math.abs(s.gap)) + ', soit ' + pts(s.rateGap) + ' de rendement annuel.';
  }

  function renderYears(years, s) {
    $('tYearBody').innerHTML = years.map((y) => `<tr${y.complete ? '' : ' class="is-partial"'}>
        <td>${y.year}${y.complete ? '' : ' <span class="tag">' + y.months + ' mois</span>'}</td>
        <td>${y.months}</td>
        <td class="c-pay">${eur2.format(y.contribution)}</td>
        <td class="c-int">${eur2.format(y.interest)}</td>
        <td>${eur2.format(y.idealInterest)}</td>
        <td class="${y.rate === null ? '' : sign(y.rate)}">${y.rate === null ? '—' : pct(y.rate)}</td>
        <td>${pct(y.idealRate)}</td>
        <td class="${y.rate === null ? '' : sign(y.rate - y.idealRate)}">${y.rate === null ? '—' : pts(y.rate - y.idealRate)}</td>
        <td class="c-strong">${eur2.format(y.close)}</td>
        <td class="${sign(y.gap)}">${signed(y.gap)}</td>
      </tr>`).join('');

    $('tYearNote').textContent = years.length
      ? 'Le rendement d\'une année incomplète est ramené à un an pour rester comparable au taux cible. L\'écart cumulé compare le capital atteint fin d\'année à la trajectoire idéale.'
      : 'Rien à agréger pour l\'instant.';
  }

  /* ---------- courbe ---------- */

  function renderChart(rows) {
    const host = $('tChart');
    const tip = $('tTip');
    for (const n of Array.from(host.querySelectorAll('svg'))) n.remove();
    if (rows.length < 1) return;

    const W = 900;
    const H = 340;
    const pad = { t: 16, r: 16, b: 34, l: 62 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const n = rows.length;

    const max = niceScale(Math.max.apply(null, rows.map((r) => Math.max(r.close, r.idealClose, r.paidIn))), 4).max;
    const y = (v) => pad.t + ph - (Math.max(0, v) / max) * ph;
    const x = (i) => (n === 1 ? pad.l + pw / 2 : pad.l + (i / (n - 1)) * pw);

    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
    svg.appendChild(sv('title', {})).textContent = 'Capital réel comparé à la trajectoire idéale, mois par mois';

    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = y(v);
      svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'grid' }));
      const t = sv('text', { x: pad.l - 10, y: yy + 3.5, 'text-anchor': 'end' });
      t.textContent = compact(v);
      svg.appendChild(t);
    }

    const line = (get) => rows.map((r, i) => (i ? 'L' : 'M') + x(i) + ',' + y(get(r))).join(' ');

    svg.appendChild(sv('path', { d: line((r) => r.paidIn), fill: 'none', 'stroke-width': 1.5 },
      { stroke: 'var(--rule-strong)' }));
    svg.appendChild(sv('path', { d: line((r) => r.idealClose), fill: 'none', 'stroke-width': 2, 'stroke-dasharray': '5 4' },
      { stroke: 'var(--pay)' }));
    svg.appendChild(sv('path', { d: line((r) => r.close), fill: 'none', 'stroke-width': 2.5, 'stroke-linejoin': 'round' },
      { stroke: 'var(--int)' }));

    svg.appendChild(sv('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), class: 'axis' }));

    const step = n <= 12 ? 1 : n <= 30 ? 3 : n <= 72 ? 6 : 12;
    for (let i = 0; i < n; i += step) {
      const t = sv('text', { x: x(i), y: H - pad.b + 16, 'text-anchor': 'middle' });
      t.textContent = rows[i].month;
      svg.appendChild(t);
    }

    const marker = sv('circle', { r: 4, opacity: 0 }, { fill: 'var(--int)' });
    const guide = sv('line', { y1: pad.t, y2: pad.t + ph, opacity: 0, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, { stroke: 'var(--rule-strong)' });
    svg.appendChild(guide);
    svg.appendChild(marker);

    const hit = sv('rect', { x: pad.l, y: pad.t, width: pw, height: ph, fill: 'transparent' });
    svg.appendChild(hit);

    function move(ev) {
      const box = svg.getBoundingClientRect();
      const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - box.left) * (W / box.width);
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / pw) * (n - 1))));
      const r = rows[i];
      marker.setAttribute('cx', x(i));
      marker.setAttribute('cy', y(r.close));
      marker.setAttribute('opacity', 1);
      guide.setAttribute('x1', x(i));
      guide.setAttribute('x2', x(i));
      guide.setAttribute('opacity', 1);
      tip.innerHTML = `
        <div class="tt-year">${pretty(r.month)}</div>
        <div class="tt-row"><span class="tt-k"><i class="swatch int"></i>Réel</span><span>${eur0.format(r.close)}</span></div>
        <div class="tt-row"><span class="tt-k"><i class="swatch pay"></i>Idéal</span><span>${eur0.format(r.idealClose)}</span></div>
        <div class="tt-row"><span class="tt-k">Rendement du mois</span><span>${r.rate === null ? '—' : pct(r.rate)}</span></div>
        <div class="tt-row total"><span>Écart</span><span>${signed(r.gap)}</span></div>`;
      tip.dataset.show = 'true';
      const tw = tip.offsetWidth;
      const left = (x(i) / W) * host.clientWidth;
      tip.style.left = Math.max(0, Math.min(host.clientWidth - tw, left - tw / 2)) + 'px';
      tip.style.top = '4px';
    }
    const leave = () => { marker.setAttribute('opacity', 0); guide.setAttribute('opacity', 0); tip.dataset.show = 'false'; };

    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', leave);
    hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('touchmove', move, { passive: true });
    hit.addEventListener('touchend', leave);

    host.appendChild(svg);
  }

  /* ---------- rendu ---------- */

  function refresh() {
    data = Track.track({ initial: state.initial, targetRate: state.rate, entries: state.entries });
    refreshRows(data.rows);
    renderTiles(data.summary);
    renderYears(data.years, data.summary);
    renderChart(data.rows);
    $('tRateHint').textContent = 'Soit ' + pct(data.meta.monthlyTarget, 3) + ' par mois, douze mois de suite';
    $('refHint').textContent = state.entries.length
      ? state.entries.length + ' mois saisis · du ' + pretty(data.rows[0].month) + ' au ' + pretty(data.rows[data.rows.length - 1].month)
      : 'Aucun mois saisi';
    save();
  }

  function rebuild() {
    sortEntries();
    renderRows();
    refresh();
  }

  /* ---------- CSV ---------- */

  const CSV_HEAD = 'mois;versement;valeur;interets';

  function toCsv() {
    const f = (v) => (v === null ? '' : String(v).replace('.', ','));
    return [CSV_HEAD].concat(state.entries.map((e) =>
      [e.month, f(e.contribution), f(e.value), f(e.interest)].join(';'))).join('\n');
  }

  function fromCsv(text) {
    const out = [];
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    for (const line of lines) {
      const cols = line.split(/[;\t,](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ''));
      const month = (cols[0] || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue; // en-tête ou ligne inutilisable
      const n = (v) => {
        const s = String(v === undefined ? '' : v).replace(/\s|€/g, '').replace(',', '.');
        return s === '' || !isFinite(+s) ? null : +s;
      };
      out.push({ month: month, contribution: n(cols[1]), value: n(cols[2]), interest: n(cols[3]) });
    }
    return out;
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /* ---------- câblage ---------- */

  $('tBody').addEventListener('input', (ev) => {
    const el = ev.target;
    const i = +el.dataset.i;
    const key = el.dataset.key;
    if (!key || !state.entries[i]) return;
    if (key === 'month') state.entries[i].month = el.value.slice(0, 7);
    else state.entries[i][key] = el.value === '' ? null : (+el.value || 0);
    refresh();
  });

  /* Le tri n'a lieu qu'une fois le mois validé : réordonner à chaque frappe
     ferait perdre le champ en cours d'édition. */
  $('tBody').addEventListener('change', (ev) => {
    if (ev.target.dataset.key === 'month') rebuild();
  });

  $('tBody').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-del]');
    if (!b) return;
    state.entries.splice(+b.dataset.del, 1);
    rebuild();
  });

  $('tAdd').addEventListener('click', () => {
    const last = state.entries[state.entries.length - 1];
    const prev = state.entries.length > 1 ? state.entries[state.entries.length - 2] : null;
    state.entries.push({
      month: Track.nextMonth(last && last.month),
      /* Un historique est régulier : on reprend le versement du mois
         précédent, à corriger si besoin. */
      contribution: last ? last.contribution : (prev ? prev.contribution : null),
      value: null,
      interest: null,
    });
    rebuild();
    const rows = $('tBody').children;
    const input = rows[rows.length - 1] && rows[rows.length - 1].querySelector('input[data-key="value"]');
    if (input) input.focus();
  });

  $('tExport').addEventListener('click', () => download('suivi-boule-de-neige.csv', toCsv()));
  $('tImport').addEventListener('click', () => $('tFile').click());

  $('tFile').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = fromCsv(String(reader.result));
      if (!rows.length) {
        window.alert('Aucune ligne exploitable. Le fichier doit commencer par une colonne de mois au format AAAA-MM.');
        return;
      }
      if (state.entries.length && !window.confirm('Remplacer les ' + state.entries.length + ' mois déjà saisis par les ' + rows.length + ' mois du fichier ?')) return;
      state.entries = rows.map(clean);
      rebuild();
    };
    reader.readAsText(file);
    ev.target.value = '';
  });

  $('tClear').addEventListener('click', () => {
    if (!state.entries.length) return;
    if (!window.confirm('Effacer les ' + state.entries.length + ' mois saisis ? Cette action est définitive.')) return;
    state.entries = [];
    rebuild();
  });

  $('tInitial').addEventListener('input', () => { state.initial = Math.max(0, +$('tInitial').value || 0); refresh(); });
  $('tRate').addEventListener('input', () => {
    state.rate = Math.min(100, Math.max(0, +$('tRate').value || 0)) / 100;
    refresh();
  });

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (data) renderChart(data.rows); }, 120);
  });

  load();
  rebuild();
})();
