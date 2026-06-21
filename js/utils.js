/* =============================================================
   Utils — helpers, CSV export, DOM utilities
   ============================================================= */

const Utils = (() => {

  /* ── Number formatting ────────────────────────────────────── */
  function fmt(v, dec = 2) {
    if (v == null || v === '') return '—';
    const n = parseFloat(v);
    if (isNaN(n)) return String(v);
    return n.toFixed(dec);
  }

  function fmtOpt(v, dec = 2, suffix = '') {
    if (v == null || v === '') return '—';
    const n = parseFloat(v);
    if (isNaN(n)) return '—';
    return n.toFixed(dec) + (suffix ? ' ' + suffix : '');
  }

  /* ── DOM helpers ────────────────────────────────────────────── */
  function el(tag, cls = '', html = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function div(cls = '', html = '') { return el('div', cls, html); }

  /* ── Back button ────────────────────────────────────────────── */
  function backButton(onClick) {
    const btn = el('button', 'btn btn-secondary btn-sm');
    btn.textContent = '← Accueil';
    btn.onclick = onClick;
    const wrap = div('back-wrap');
    wrap.appendChild(btn);
    return wrap;
  }

  /* ── Metric card ────────────────────────────────────────────── */
  function metricCard(label, value, delta = '') {
    const c = div('metric-card');
    c.innerHTML = `<div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${delta ? `<div class="metric-delta">${delta}</div>` : ''}`;
    return c;
  }

  /* ── Alert banner ───────────────────────────────────────────── */
  function alertBanner(type, msg) {
    return `<div class="alert alert-${type}">${msg}</div>`;
  }

  /* ── Section divider ────────────────────────────────────────── */
  function sectionDiv(label) {
    return `<div class="section-div">${label}</div>`;
  }

  /* ── Radio button group ─────────────────────────────────────── */
  function radioGroup(options, selected, onChange) {
    const wrap = div('radio-group');
    for (const [val, label] of Object.entries(options)) {
      const btn = el('button', 'radio-btn' + (val === selected ? ' selected' : ''));
      btn.textContent = label;
      btn.dataset.val = val;
      btn.onclick = () => {
        wrap.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        onChange(val);
      };
      wrap.appendChild(btn);
    }
    return wrap;
  }

  /* ── Constraint chip toggles ────────────────────────────────── */
  function constraintChips(options, selected, onChange) {
    const wrap = div('constraint-toggle');
    for (const [val, label] of Object.entries(options)) {
      const chip = el('span', 'constraint-chip' + (selected.includes(val) ? ' active' : ''));
      chip.textContent = label;
      chip.onclick = () => {
        chip.classList.toggle('active');
        const active = [...wrap.querySelectorAll('.constraint-chip.active')].map(c => c.dataset.val);
        onChange(active);
      };
      chip.dataset.val = val;
      wrap.appendChild(chip);
    }
    return wrap;
  }

  /* ── Expander ───────────────────────────────────────────────── */
  function expander(title, bodyEl, openByDefault = false) {
    const wrap = div('expander');
    const hdr = div('expander-header' + (openByDefault ? ' open' : ''));
    hdr.innerHTML = `<span>${title}</span><span class="expander-arrow">▼</span>`;
    const body = div('expander-body');
    body.style.display = openByDefault ? 'block' : 'none';
    if (bodyEl instanceof HTMLElement) body.appendChild(bodyEl);
    else body.innerHTML = bodyEl;
    hdr.onclick = () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      hdr.classList.toggle('open', !open);
    };
    wrap.appendChild(hdr);
    wrap.appendChild(body);
    return wrap;
  }

  /* ── Tabs ───────────────────────────────────────────────────── */
  function tabs(tabsObj) {
    const wrap = div('');
    const tabBar = div('tabs');
    const panels = div('');
    let first = true;
    for (const [key, { label, content }] of Object.entries(tabsObj)) {
      const btn = el('button', 'tab-btn' + (first ? ' active' : ''));
      btn.textContent = label;
      btn.dataset.tab = key;
      const panel = div('tab-panel' + (first ? ' active' : ''));
      panel.dataset.tabPanel = key;
      if (content instanceof HTMLElement) panel.appendChild(content);
      else panel.innerHTML = content;
      tabBar.appendChild(btn);
      panels.appendChild(panel);
      first = false;
    }
    tabBar.addEventListener('click', e => {
      if (!e.target.classList.contains('tab-btn')) return;
      const key = e.target.dataset.tab;
      tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === key));
      panels.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tabPanel === key));
    });
    wrap.appendChild(tabBar);
    wrap.appendChild(panels);
    return wrap;
  }

  /* ── Results table ──────────────────────────────────────────── */
  function resultsTable(rows, cols) {
    if (!rows || !rows.length) return `<div class="alert alert-info">Aucun résultat.</div>`;
    let html = '<div class="table-wrap"><table><thead><tr>';
    for (const c of cols) html += `<th>${c.label || c.key}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of rows) {
      html += '<tr>';
      for (const c of cols) {
        let val = row[c.key];
        if (val == null || val === '') val = '—';
        if (c.format) val = c.format(val, row);
        html += `<td>${val}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  /* ── CSV export ─────────────────────────────────────────────── */
  function downloadCSV(rows, filename = 'export.csv') {
    if (!rows || !rows.length) return;
    const keys = Object.keys(rows[0]);
    const lines = [keys.join(',')];
    for (const row of rows) {
      lines.push(keys.map(k => {
        const v = row[k] ?? '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Color palette ──────────────────────────────────────────── */
  const COLORS = [
    '#4f46e5','#7c3aed','#2563eb','#0891b2','#059669',
    '#d97706','#dc2626','#db2777','#0d9488','#ea580c',
    '#65a30d','#0369a1','#7c2d12','#4338ca','#0284c7',
  ];

  function colorFor(id, map = {}) {
    if (!map[id]) {
      const keys = Object.keys(map);
      map[id] = COLORS[keys.length % COLORS.length];
    }
    return map[id];
  }

  /* ── Random ID generator ────────────────────────────────────── */
  function uid() { return Math.random().toString(36).slice(2, 8); }

  /* ── Deep clone ─────────────────────────────────────────────── */
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /* ── Parse float safe ───────────────────────────────────────── */
  function parseNum(v, def = 0) {
    const n = parseFloat(v);
    return isNaN(n) ? def : n;
  }

  /* ── KPI row builder ────────────────────────────────────────── */
  function kpiGrid(items, cols = 3) {
    const wrap = div(`metrics-grid metrics-grid-${cols}`);
    for (const { label, value, delta } of items) {
      wrap.appendChild(metricCard(label, value, delta));
    }
    return wrap;
  }

  return {
    fmt, fmtOpt, el, div, backButton, metricCard, alertBanner,
    sectionDiv, radioGroup, constraintChips, expander, tabs,
    resultsTable, downloadCSV, COLORS, colorFor, uid, clone,
    parseNum, kpiGrid,
  };
})();
