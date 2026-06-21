/* =============================================================
   Gantt Chart Renderer — SVG-based, no external dependencies
   ============================================================= */

const Gantt = (() => {

  const COLORS = [
    '#4f46e5','#7c3aed','#2563eb','#0891b2','#059669',
    '#d97706','#dc2626','#db2777','#0d9488','#ea580c',
    '#65a30d','#0369a1','#7c2d12','#4338ca','#0284c7',
    '#9333ea','#16a34a','#ca8a04','#0e7490','#be185d',
  ];

  function _esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Main render function ─────────────────────────────────── */
  function render(containerId, tasks, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!tasks || !tasks.length) {
      container.innerHTML = '<div class="alert alert-info">Aucune donnée à afficher.</div>';
      return;
    }

    // Unique machines and jobs
    const machines    = [...new Set(tasks.map(t => t.machine ?? 0))].sort((a, b) => a - b);
    const machine_count = (options.machine_count != null)
      ? options.machine_count
      : (machines.length ? Math.max(...machines) + 1 : 1);
    const job_ids     = [...new Set(tasks.map(t => t.id))];
    const color_map   = {};
    job_ids.forEach((id, i) => color_map[id] = COLORS[i % COLORS.length]);

    const min_t = Math.min(...tasks.map(t => t.start ?? 0));
    const max_t = Math.max(...tasks.map(t => t.finish ?? 0));
    const span  = Math.max(max_t - min_t, 1);

    // Layout constants
    const ROW_H    = 46;
    const GAP      = 6;
    const HDR_H    = 44;
    const FOOT_H   = 32;
    const LEFT     = options.leftMargin ?? 150;
    const RIGHT    = 24;
    const WIDTH    = Math.max(container.clientWidth || 720, 600);
    const CHART_W  = WIDTH - LEFT - RIGHT;
    const SVG_H    = HDR_H + machine_count * (ROW_H + GAP) + FOOT_H;
    const scale    = CHART_W / span;

    const machineLabels = options.machineLabels ||
      Array.from({ length: machine_count }, (_, i) => `Machine ${i + 1}`);
    const title = options.title || 'Diagramme de Gantt';
    const alpha = options.alpha || '';
    const isJobshop = alpha === 'Jm';

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${SVG_H}"
      style="font-family:Inter,system-ui,sans-serif;display:block">`;

    // Background
    svg += `<rect width="${WIDTH}" height="${SVG_H}" fill="#f8faff" rx="10"/>`;

    // Title
    svg += `<text x="${WIDTH/2}" y="24" text-anchor="middle" font-size="13"
      font-weight="700" fill="#0f172a">${_esc(title)}</text>`;

    // X-axis ticks and grid
    const N_TICKS = Math.min(10, Math.floor(CHART_W / 60));
    for (let i = 0; i <= N_TICKS; i++) {
      const t   = min_t + span * i / N_TICKS;
      const x   = LEFT + (t - min_t) * scale;
      const y0  = HDR_H;
      const y1  = HDR_H + machine_count * (ROW_H + GAP);
      svg += `<line x1="${x.toFixed(1)}" y1="${y0}" x2="${x.toFixed(1)}" y2="${y1}"
        stroke="#e0e7ff" stroke-width="1" stroke-dasharray="3,3"/>`;
      svg += `<text x="${x.toFixed(1)}" y="${SVG_H - 8}" text-anchor="middle"
        font-size="10" fill="#64748b">${parseFloat(t.toFixed(1))}</text>`;
    }

    // Machine row backgrounds + labels
    for (let m = 0; m < machine_count; m++) {
      const y = HDR_H + m * (ROW_H + GAP);
      const label = machineLabels[m] || `Machine ${m + 1}`;
      svg += `<rect x="${LEFT}" y="${y}" width="${CHART_W}" height="${ROW_H}"
        fill="${m % 2 === 0 ? '#eef2ff' : '#f8faff'}" rx="4"/>`;
      svg += `<rect x="0" y="${y}" width="${LEFT - 8}" height="${ROW_H}"
        fill="#eef2ff" rx="6"/>`;
      svg += `<text x="${LEFT - 10}" y="${y + ROW_H/2 + 4}" text-anchor="end"
        font-size="11" font-weight="600" fill="#334155">${_esc(label)}</text>`;
    }

    // Task bars
    for (const task of tasks) {
      const m_idx = task.machine ?? 0;
      if (m_idx < 0 || m_idx >= machine_count) continue;
      const y   = HDR_H + m_idx * (ROW_H + GAP);
      const x   = LEFT + (task.start - min_t) * scale;
      const w   = Math.max(2, (task.finish - task.start) * scale);
      const col = color_map[task.id] || '#4f46e5';
      const late = (task.tardiness || 0) > 1e-9;
      const bar_y = y + 5, bar_h = ROW_H - 10;

      svg += `<rect x="${x.toFixed(1)}" y="${bar_y}" width="${w.toFixed(1)}" height="${bar_h}"
        fill="${col}" rx="4"
        stroke="${late ? '#ef4444' : 'rgba(0,0,0,0.12)'}" stroke-width="${late ? 2 : 0.8}"
        opacity="0.92"/>`;

      if (w > 18) {
        let label = isJobshop && task.operation ? `${task.id}-O${task.operation}` : task.id;
        svg += `<text x="${(x + w/2).toFixed(1)}" y="${y + ROW_H/2 + 4}"
          text-anchor="middle" font-size="9" font-weight="bold" fill="white"
          clip-path="url(#clip_${m_idx})">${_esc(label)}</text>`;
      }
    }

    // Legend (up to 15 jobs)
    if (job_ids.length <= 15) {
      const legend_y = 32;
      const legend_x_start = LEFT;
      let lx = legend_x_start;
      for (const jid of job_ids) {
        const col = color_map[jid] || '#4f46e5';
        if (lx + 80 > WIDTH) break;
        svg += `<rect x="${lx}" y="${legend_y - 10}" width="12" height="12"
          fill="${col}" rx="2"/>`;
        svg += `<text x="${lx + 16}" y="${legend_y}" font-size="9" fill="#475569">${_esc(jid)}</text>`;
        lx += Math.max(String(jid).length * 7 + 24, 60);
      }
    }

    // X-axis label
    svg += `<text x="${LEFT + CHART_W/2}" y="${SVG_H}" text-anchor="middle"
      font-size="11" fill="#64748b">Temps</text>`;

    svg += '</svg>';
    const wrap = document.createElement('div');
    wrap.className = 'gantt-wrap';
    wrap.innerHTML = svg;
    container.innerHTML = '';
    container.appendChild(wrap);
  }

  /* ── Convenience: render for single machine ─────────────── */
  function renderSingle(containerId, ev, options = {}) {
    render(containerId, ev, {
      machine_count: 1,
      machineLabels: ['Machine 1'],
      title: 'Diagramme de Gantt — Machine unique',
      ...options,
    });
  }

  /* ── Convenience: render for parallel machines ──────────── */
  function renderParallel(containerId, ev, m, labelPrefix = 'Machine', options = {}) {
    render(containerId, ev, {
      machine_count: m,
      machineLabels: Array.from({ length: m }, (_, i) => `${labelPrefix} ${i + 1}`),
      title: `Diagramme de Gantt — ${m} ${labelPrefix}s`,
      ...options,
    });
  }

  /* ── Maintenance technician Gantt (HTML SVG) ─────────────── */
  function renderMaintenance(containerId, planning, techniciens, semaine) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const affectes = planning.filter(p => p.statut === 'affecte' && p.periode === semaine);
    if (!affectes.length) {
      container.innerHTML = '<div class="alert alert-info">Aucune intervention affectée pour cette période.</div>';
      return;
    }

    const COLORS_M = ['#4facfe','#43e97b','#f093fb','#f5a623','#ff6b6b','#a29bfe','#fd79a8','#00cec9'];
    const task_col = {};
    affectes.forEach((p, i) => { if (!task_col[p.id]) task_col[p.id] = COLORS_M[i % COLORS_M.length]; });

    const noms_tech = {};
    techniciens.forEach(t => noms_tech[t.id] = t.nom);

    // Build tech timeline
    const par_tech = {};
    for (const p of affectes) {
      for (const tid of (p.ids_tech || '').split(',').map(s => s.trim()).filter(Boolean)) {
        if (!par_tech[tid]) par_tech[tid] = [];
        par_tech[tid].push(p);
      }
    }

    const max_fin = Math.max(...affectes.map(p => p.fin_h || 0), 1);
    const SCALE = 560 / max_fin;
    const ROW_H = 46, HDR_H = 44, LABEL_W = 170, GAP = 10;
    const SVG_W = LABEL_W + 580;
    const tech_list = Object.keys(par_tech);
    const SVG_H = HDR_H + tech_list.length * (ROW_H + GAP) + 24;

    let lines = [`<div class="gantt-wrap"><svg width="${SVG_W}" height="${SVG_H}"
      xmlns="http://www.w3.org/2000/svg" style="font-family:Inter,sans-serif">`];

    lines.push(`<text x="${SVG_W/2}" y="18" font-size="13" font-weight="bold"
      fill="#444" text-anchor="middle">${_esc(semaine)}</text>`);

    // Grid
    for (let i = 0; i <= 5; i++) {
      const tx = LABEL_W + Math.round(i * max_fin / 5 * SCALE);
      const val = (i * max_fin / 5).toFixed(1);
      lines.push(`<line x1="${tx}" y1="28" x2="${tx}" y2="${SVG_H - 8}"
        stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`);
      lines.push(`<text x="${tx}" y="38" font-size="10" fill="#999"
        text-anchor="middle">${val}h</text>`);
    }

    tech_list.forEach((tid, i) => {
      const y = HDR_H + i * (ROW_H + GAP);
      const nom = noms_tech[tid] || tid;
      lines.push(`<rect x="0" y="${y}" width="${LABEL_W - 6}" height="${ROW_H}"
        fill="#f0f4ff" rx="6"/>`);
      lines.push(`<text x="${LABEL_W - 14}" y="${y + ROW_H/2 + 4}" font-size="11"
        fill="#334" text-anchor="end" font-weight="600">${_esc(nom)}</text>`);
      lines.push(`<rect x="${LABEL_W}" y="${y}" width="${Math.round(max_fin * SCALE)}" height="${ROW_H}"
        fill="#f5f7fa" rx="4"/>`);

      let pos = 0;
      for (const p of par_tech[tid]) {
        const dur = p.duree_h || 0;
        const x0 = LABEL_W + Math.round(pos * SCALE);
        const w  = Math.max(6, Math.round(dur * SCALE));
        const col = task_col[p.id] || '#4f46e5';
        const prio = parseInt(p.priorite || 1);
        lines.push(`<rect x="${x0}" y="${y + 5}" width="${w}" height="${ROW_H - 10}"
          fill="${col}" rx="4" stroke="${prio === 5 ? '#c0392b' : '#555'}"
          stroke-width="${prio === 5 ? 2 : 1}" opacity="0.92"/>`);
        if (w > 28) lines.push(`<text x="${x0 + w/2}" y="${y + ROW_H/2 - 2}" font-size="9"
          fill="white" text-anchor="middle" font-weight="bold">${_esc(p.id)}</text>`);
        if (w > 48) lines.push(`<text x="${x0 + w/2}" y="${y + ROW_H/2 + 10}" font-size="8"
          fill="rgba(255,255,255,0.85)" text-anchor="middle">${_esc(String(p.machine).slice(0,8))}</text>`);
        pos += dur;
      }
    });

    lines.push('</svg></div>');
    container.innerHTML = lines.join('\n');
  }

  return { render, renderSingle, renderParallel, renderMaintenance };
})();
