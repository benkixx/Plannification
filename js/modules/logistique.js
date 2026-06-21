/* =============================================================
   Module : Déchargement entrepôt (Logistique)
   Trucks → Docks scheduling (Pm | rj,dj | γ)
   ============================================================= */

const Logistique = (() => {

  let state = {
    n_quais:    3,
    gamma:      'Cmax',
    open_h:     6.0,
    close_h:    18.0,
    use_weights: false,
    trucks:     [],
    result:     null,
    kpis:       null,
  };

  const OBJECTIVES_SINGLE = {
    'Cmax': 'Finir au plus tôt (Cmax)',
    'ΣTj':  'Minimiser les retards (ΣTj)',
    'Lmax': 'Minimiser le pire retard (Lmax)',
    'ΣCi':  'Temps moyen de traitement (ΣCi)',
    'ΣUj':  'Minimiser le nb camions en retard (ΣUj)',
    'ΣwCi': 'Prioriser livraisons urgentes (ΣwCi)',
  };
  const OBJECTIVES_PARALLEL = {
    'Cmax': 'Finir au plus tôt (Cmax)',
    'ΣCi':  'Temps moyen de traitement (ΣCi)',
    'ΣwCi': 'Prioriser livraisons urgentes (ΣwCi)',
  };
  const ALGO_HINTS = {
    'Cmax':  'LPT / List Scheduling',
    'ΣTj':   'EDD (Earliest Due Date)',
    'Lmax':  'EDD (Earliest Due Date)',
    'ΣCi':   'SPT (Shortest Processing Time)',
    'ΣUj':   'Moore-Hodgson',
    'ΣwCi':  'WSPT (Weighted SPT)',
  };

  /* ── Generate trucks ─────────────────────────────────────── */
  function _generateTrucks(n) {
    const { open_h, close_h } = state;
    const weights = [1,1,1,2,2,3,4,5];
    const trucks = [];
    for (let i = 0; i < n; i++) {
      const arrival  = parseFloat((open_h + Math.random() * (close_h - open_h) * 0.7).toFixed(2));
      const unload   = parseFloat((0.3 + Math.random() * 1.7).toFixed(2));
      const deadline = parseFloat(Math.min(arrival + unload + 1 + Math.random()*4, close_h).toFixed(2));
      trucks.push({
        truck_id:   `CAM-${String(i+1).padStart(2,'0')}`,
        arrival_h:  arrival,
        unload_h:   unload,
        deadline_h: deadline,
        weight:     weights[Math.floor(Math.random()*weights.length)],
      });
    }
    trucks.sort((a,b) => a.arrival_h - b.arrival_h);
    return trucks;
  }

  /* ── Convert trucks → scheduling tasks ──────────────────── */
  function _toTasks(trucks) {
    return trucks.map(t => ({
      id: t.truck_id,
      processing_time: parseFloat(t.unload_h),
      release_time:    parseFloat(t.arrival_h),
      due_time:        parseFloat(t.deadline_h),
      weight:          state.use_weights ? Math.max(1, parseFloat(t.weight||1)) : 1,
    }));
  }

  /* ── Compute KPIs ────────────────────────────────────────── */
  function _computeKpis(evaluated) {
    const n = evaluated.length;
    const { n_quais, open_h, close_h, use_weights } = state;
    const cmax = Math.max(...evaluated.map(t => t.finish), 0);
    const tard_vals = evaluated.map(t => Math.max(0, (t.tardiness||0)));
    const on_time  = tard_vals.filter(v => v <= 0.001).length;
    const total_tard = tard_vals.reduce((s,v) => s+v, 0);
    const max_tard  = tard_vals.length ? Math.max(...tard_vals) : 0;
    const total_wait = evaluated.reduce((s,t) => s + Math.max(0, t.start - (t.release_time||0)), 0);
    const total_unload = evaluated.reduce((s,t) => s + (t.processing_time||0), 0);
    const shift_h = Math.max(close_h - open_h, 1);
    const occupation = n_quais > 0 ? parseFloat((100 * total_unload / (n_quais * shift_h)).toFixed(1)) : 0;
    const sum_wci = use_weights ? evaluated.reduce((s,t) => s + (t.weight||1)*t.finish, 0) : null;
    const total_w = use_weights ? evaluated.reduce((s,t) => s + (t.weight||1), 0) : null;
    return {
      n_trucks: n, cmax_h: parseFloat(cmax.toFixed(2)),
      on_time, late: n - on_time,
      on_time_rate: parseFloat((100*on_time/Math.max(n,1)).toFixed(1)),
      late_pct: parseFloat((100*(n-on_time)/Math.max(n,1)).toFixed(1)),
      avg_wait_h: parseFloat((total_wait/Math.max(n,1)).toFixed(2)),
      total_tard_h: parseFloat(total_tard.toFixed(2)),
      max_tard_h: parseFloat(max_tard.toFixed(2)),
      total_unload_h: parseFloat(total_unload.toFixed(2)),
      occupation_pct: occupation,
      overtime_h: parseFloat(Math.max(0, cmax - close_h).toFixed(2)),
      sum_wci: sum_wci != null ? parseFloat(sum_wci.toFixed(3)) : null,
      avg_wci: (sum_wci != null && total_w > 0) ? parseFloat((sum_wci/total_w).toFixed(3)) : null,
    };
  }

  /* ── Render ─────────────────────────────────────────────── */
  function render(container) {
    container.innerHTML = '';
    container.appendChild(Utils.backButton(() => App.navigate('home')));

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="module-header">
        <div class="module-title">🚛 Déchargement entrepôt</div>
        <div class="module-caption">Affectez les camions aux quais · optimisez les dechargements</div>
      </div>
      <div class="col-layout col-layout-2">
        <div id="logi-left"></div>
        <div id="logi-right"></div>
      </div>
      <div class="credit-bar">Developed by Nabil Benkirane &nbsp;·&nbsp; Supervised by Prof. Faouzi Tayalati</div>`;
    container.appendChild(wrap);

    _renderLeft();
    _renderRight();
  }

  function _renderLeft() {
    const left = document.getElementById('logi-left');
    left.innerHTML = '';
    const objMap = state.n_quais === 1 ? OBJECTIVES_SINGLE : OBJECTIVES_PARALLEL;
    if (!objMap[state.gamma]) state.gamma = Object.keys(objMap)[0];

    left.innerHTML = `
      <div class="card">
        <div class="card-title">⚙️ Configuration entrepôt</div>
        <div class="form-row">
          <div class="form-group">
            <label>Quais de déchargement</label>
            <input type="number" id="logi-nq" value="${state.n_quais}" min="1" max="20" />
          </div>
          <div class="form-group">
            <label>Objectif</label>
            <select id="logi-gamma">
              ${Object.entries(objMap).map(([k,v])=>`<option value="${k}" ${k===state.gamma?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="font-size:.8rem;color:#64748b;margin-bottom:.5rem">
          Algorithme : <b id="logi-algo-hint">${ALGO_HINTS[state.gamma]||'—'}</b>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Ouverture (h)</label>
            <input type="number" id="logi-open" value="${state.open_h}" min="0" max="23.5" step="0.5" />
          </div>
          <div class="form-group">
            <label>Fermeture (h)</label>
            <input type="number" id="logi-close" value="${state.close_h}" min="0.5" max="24" step="0.5" />
          </div>
        </div>
        <label class="checkbox-label">
          <input type="checkbox" id="logi-weights" ${state.use_weights?'checked':''} />
          Activer les poids
        </label>
      </div>

      <div class="card" style="margin-top:.75rem">
        <div class="card-title">🚛 Camions</div>
        <div class="form-row" style="align-items:flex-end;gap:.5rem">
          <div class="form-group" style="flex:2">
            <label>Générer N camions</label>
            <input type="number" id="logi-ngen" value="8" min="1" max="100" />
          </div>
          <div>
            <button class="btn btn-secondary btn-sm btn-full" id="logi-btn-gen">Générer</button>
          </div>
          <div>
            <button class="btn btn-danger btn-sm" id="logi-btn-clear">Vider</button>
          </div>
        </div>
        <div id="logi-add-form"></div>
        <div id="logi-truck-table"></div>
        <div id="logi-truck-stats"></div>
      </div>

      <button class="btn btn-primary btn-full" style="margin-top:.75rem" id="logi-btn-solve">
        🚀 Planifier les déchargements
      </button>`;

    // Bind config events
    document.getElementById('logi-nq').onchange = e => {
      state.n_quais = Math.max(1, parseInt(e.target.value)||1);
      state.result = null;
      _renderLeft(); _renderRight();
    };
    document.getElementById('logi-gamma').onchange = e => {
      state.gamma = e.target.value;
      document.getElementById('logi-algo-hint').textContent = ALGO_HINTS[state.gamma]||'—';
      state.result = null;
    };
    document.getElementById('logi-open').onchange = e => { state.open_h = parseFloat(e.target.value)||6; };
    document.getElementById('logi-close').onchange = e => { state.close_h = parseFloat(e.target.value)||18; };
    document.getElementById('logi-weights').onchange = e => {
      state.use_weights = e.target.checked; state.result=null; _renderLeft(); _renderRight();
    };
    document.getElementById('logi-btn-gen').onclick = () => {
      const n = parseInt(document.getElementById('logi-ngen').value)||8;
      state.trucks = _generateTrucks(n);
      state.result = null;
      _renderTruckTable(); _renderTruckStats();
    };
    document.getElementById('logi-btn-clear').onclick = () => {
      state.trucks = []; state.result = null; _renderTruckTable(); _renderTruckStats(); _renderRight();
    };
    document.getElementById('logi-btn-solve').onclick = _solve;

    _renderAddForm();
    _renderTruckTable();
    _renderTruckStats();
  }

  function _renderAddForm() {
    const form = document.getElementById('logi-add-form');
    if (!form) return;
    form.innerHTML = `
      <details style="margin-bottom:.5rem">
        <summary style="cursor:pointer;font-size:.84rem;font-weight:600;color:#4f46e5;padding:.4rem 0">
          ➕ Ajouter un camion
        </summary>
        <div class="card" style="margin-top:.4rem">
          <div class="form-row">
            <div class="form-group">
              <label>ID</label>
              <input type="text" id="add-truck-id" value="CAM-${String(state.trucks.length+1).padStart(2,'0')}" />
            </div>
            <div class="form-group">
              <label>Arrivée (h)</label>
              <input type="number" id="add-truck-arr" value="${state.open_h}" min="0" step="0.25" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Durée déch. (h)</label>
              <input type="number" id="add-truck-dur" value="1.0" min="0.1" step="0.25" />
            </div>
            <div class="form-group">
              <label>Limite fin (h)</label>
              <input type="number" id="add-truck-dead" value="${state.close_h}" min="0" step="0.25" />
            </div>
          </div>
          ${state.use_weights ? `<div class="form-group"><label>Poids</label><input type="number" id="add-truck-weight" value="1" min="1" /></div>` : ''}
          <button class="btn btn-primary btn-sm" id="logi-btn-add-truck">Ajouter</button>
        </div>
      </details>`;

    document.getElementById('logi-btn-add-truck').onclick = () => {
      const id   = document.getElementById('add-truck-id')?.value?.trim();
      const arr  = parseFloat(document.getElementById('add-truck-arr')?.value)||state.open_h;
      const dur  = parseFloat(document.getElementById('add-truck-dur')?.value)||1;
      const dead = parseFloat(document.getElementById('add-truck-dead')?.value)||state.close_h;
      const wt   = state.use_weights ? (parseInt(document.getElementById('add-truck-weight')?.value)||1) : 1;
      if (!id) return;
      if (dur <= 0) return;
      if (dead <= arr) { alert('La limite doit être après l\'arrivée.'); return; }
      state.trucks.push({ truck_id:id, arrival_h:arr, unload_h:dur, deadline_h:dead, weight:wt });
      state.result = null;
      _renderLeft(); _renderRight();
    };
  }

  function _renderTruckTable() {
    const wrap = document.getElementById('logi-truck-table');
    if (!wrap) return;
    if (!state.trucks.length) {
      wrap.innerHTML = `<div class="alert alert-info" style="margin-top:.5rem">Aucun camion. Générez ou ajoutez-en.</div>`;
      return;
    }
    let html = `<div class="table-wrap" style="margin-top:.5rem">
      <table class="editable-table">
        <thead><tr>
          <th>ID</th><th>Arrivée (h)</th><th>Durée (h)</th><th>Limite (h)</th>
          ${state.use_weights?'<th>Poids</th>':''}
          <th></th>
        </tr></thead><tbody>`;
    state.trucks.forEach((t,i) => {
      html += `<tr>
        <td><input type="text" value="${t.truck_id}" onchange="Logistique._editTruck(${i},'truck_id',this.value)"/></td>
        <td><input type="number" value="${t.arrival_h}"  step="0.25" onchange="Logistique._editTruck(${i},'arrival_h',+this.value)"/></td>
        <td><input type="number" value="${t.unload_h}"   step="0.25" onchange="Logistique._editTruck(${i},'unload_h',+this.value)"/></td>
        <td><input type="number" value="${t.deadline_h}" step="0.25" onchange="Logistique._editTruck(${i},'deadline_h',+this.value)"/></td>
        ${state.use_weights?`<td><input type="number" value="${t.weight||1}" min="1" onchange="Logistique._editTruck(${i},'weight',+this.value)"/></td>`:''}
        <td><button class="btn-icon" onclick="Logistique._removeTruck(${i})">🗑</button></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  function _renderTruckStats() {
    const el = document.getElementById('logi-truck-stats');
    if (!el || !state.trucks.length) { if(el) el.innerHTML=''; return; }
    const total_h = state.trucks.reduce((s,t)=>s+(t.unload_h||0),0);
    el.innerHTML = `<div class="metrics-grid metrics-grid-3" style="margin-top:.5rem">
      ${[
        {label:'Camions',     value:state.trucks.length},
        {label:'Durée totale',value:`${total_h.toFixed(1)} h`},
        {label:'Quais',       value:state.n_quais},
      ].map(m=>`<div class="metric-card"><div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div></div>`).join('')}
    </div>`;
  }

  function _editTruck(i, key, val) { state.trucks[i][key] = val; state.result = null; }
  function _removeTruck(i) { state.trucks.splice(i,1); state.result=null; _renderLeft(); _renderRight(); }

  /* ── Solve ──────────────────────────────────────────────── */
  function _solve() {
    if (!state.trucks.length) { alert('Ajoutez au moins un camion.'); return; }
    const tasks = _toTasks(state.trucks);
    const alpha = state.n_quais === 1 ? '1' : 'Pm';
    const beta  = ['rj','dj', ...(state.use_weights && state.gamma==='ΣwCi' ? ['wj'] : [])];
    let result;
    if (alpha === '1') {
      result = SingleMachine.solve(tasks, beta, state.gamma);
    } else {
      result = ParallelMachine.solve(tasks, state.n_quais, beta, state.gamma);
    }
    const evaluated = result.evaluated;
    // Recalculate tardiness
    evaluated.forEach(ev => {
      const due = parseFloat(ev.due_time);
      ev.tardiness = Math.max(0, ev.finish - due);
      ev.status = ev.tardiness > 0.001 ? 'En retard' : 'À temps';
    });
    state.result = { evaluated, indicators: result.indicators, algorithm: result.algorithm };
    state.kpis   = _computeKpis(evaluated);
    _renderRight();
  }

  /* ── RIGHT panel ────────────────────────────────────────── */
  function _renderRight() {
    const right = document.getElementById('logi-right');
    if (!right) return;
    right.innerHTML = '';

    if (!state.result) {
      right.innerHTML = `
        ${Utils.sectionDiv('Résultats')}
        ${Utils.alertBanner('info','Configurez vos camions et lancez la planification.')}
        <div style="margin-top:1rem;font-size:.84rem;color:#64748b">
          <b>Comment ça marche :</b><br>
          1. Définissez le nombre de quais et l'objectif.<br>
          2. Saisissez ou générez des camions.<br>
          3. Cliquez sur "Planifier" pour obtenir le Gantt des quais.
        </div>`;
      return;
    }

    const { evaluated, algorithm } = state.result;
    const k = state.kpis || {};

    right.innerHTML += Utils.sectionDiv('Indicateurs');

    const kpiEl = Utils.kpiGrid([
      { label:'Fin de journée',        value:`${k.cmax_h} h` },
      { label:'Camions à l\'heure',    value:`${k.on_time} / ${k.n_trucks}` },
      { label:'En retard',             value: k.late },
      { label:'Taux service',          value:`${k.on_time_rate} %` },
      { label:'Retard total',          value:`${k.total_tard_h} h` },
      { label:'Retard max',            value:`${k.max_tard_h} h` },
      { label:'Attente moy.',          value:`${k.avg_wait_h} h` },
      { label:'Occupation quais',      value:`${k.occupation_pct} %` },
      { label:'Dépassement horaire',   value:`${k.overtime_h} h` },
    ], 3);
    right.appendChild(kpiEl);

    if (k.overtime_h > 0) {
      right.innerHTML += Utils.alertBanner('warning', `Dépassement horaire : ${k.overtime_h} h après fermeture.`);
    } else {
      right.innerHTML += Utils.alertBanner('success', `Algo : ${algorithm||'—'} — toutes les livraisons dans les horaires.`);
    }

    if (state.use_weights && k.sum_wci != null) {
      right.innerHTML += Utils.sectionDiv('Critères pondérés');
      const wKpi = Utils.kpiGrid([
        { label:'ΣwCi (somme pond. fins)', value:k.sum_wci.toFixed(2) },
        { label:'Fin pondérée moy.',        value:`${k.avg_wci?.toFixed(2)||'—'} h` },
      ], 2);
      right.appendChild(wKpi);
    }

    right.innerHTML += Utils.sectionDiv('Séquence de déchargement');
    right.innerHTML += Utils.resultsTable(evaluated, [
      { key:'machine',         label:'Quai',    format: v => `Quai ${parseInt(v)+1}` },
      { key:'id',              label:'Camion' },
      ...(state.use_weights ? [{ key:'weight', label:'Poids' }] : []),
      { key:'start',           label:'Début',   format: v => `${Utils.fmt(v)} h` },
      { key:'finish',          label:'Fin',     format: v => `${Utils.fmt(v)} h` },
      { key:'processing_time', label:'Durée',   format: v => `${Utils.fmt(v)} h` },
      { key:'due_time',        label:'Limite',  format: v => `${Utils.fmt(v)} h` },
      { key:'tardiness',       label:'Retard',  format: (v, row) => {
        const t = parseFloat(v);
        return t > 0
          ? `<span class="badge badge-red">${Utils.fmt(t)} h</span>`
          : `<span class="badge badge-green">0</span>`;
      }},
      { key:'status',          label:'Statut',  format: v =>
        v==='En retard' ? `<span class="badge badge-red">${v}</span>` : `<span class="badge badge-green">${v}</span>` },
    ]);

    const btnCSV = Utils.el('button','btn btn-secondary btn-sm');
    btnCSV.style.marginTop = '.5rem';
    btnCSV.textContent = '📥 Exporter CSV';
    btnCSV.onclick = () => Utils.downloadCSV(evaluated, 'plan_dechargement.csv');
    right.appendChild(btnCSV);

    right.innerHTML += Utils.sectionDiv('Gantt des quais');
    const ganttDiv = document.createElement('div');
    ganttDiv.id = 'logi-gantt';
    right.appendChild(ganttDiv);

    requestAnimationFrame(() => {
      Gantt.renderParallel('logi-gantt', evaluated, state.n_quais, 'Quai', {
        title: `Gantt des quais — ${state.n_quais} quai(s)`,
      });
    });
  }

  return { render, _editTruck, _removeTruck };
})();
