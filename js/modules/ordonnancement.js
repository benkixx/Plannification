/* =============================================================
   Module : Ordonnancement des tâches
   Supports: 1 | β | γ,  Pm, Qm, Fm, Jm
   ============================================================= */

const Ordonnancement = (() => {

  /* ── State ─────────────────────────────────────────────────── */
  let state = {
    alpha: '1',
    beta:  [],
    gamma: 'Cmax',
    m:     2,         // number of machines (for Pm, Qm, Fm, Jm)
    tasks: [],        // array of task objects
    result: null,
    rule:  'SPT',     // jobshop rule
  };

  /* ── Constraint / objective maps ────────────────────────────── */
  const CONSTRAINTS_1 = {
    'rj':   '⏳ Disponibilité (rj)',
    'dj':   '📅 Date limite (dj)',
    'wj':   '⭐ Poids (wj)',
    'prec': '🔗 Précédence',
    'pmtn': '✂️ Préemptif',
  };
  const CONSTRAINTS_PM = { 'pmtn': '✂️ Préemptif' };
  const CONSTRAINTS_QM = { 'pmtn': '✂️ Préemptif' };

  const OBJECTIVES = {
    '1': {
      'Cmax': '⏱️ Makespan (Cmax)',
      'ΣCi':  '🧮 Somme achèvements (ΣCi)',
      'ΣwCi': '⭐ Somme pondérée (ΣwCi)',
      'Lmax': '⚠️ Retard max (Lmax)',
      'ΣTj':  '📉 Somme retards (ΣTj)',
      'ΣUj':  '✅ Nb tâches en retard (ΣUj)',
    },
    'Pm': {
      'Cmax': '⏱️ Makespan (Cmax)',
      'ΣCi':  '🧮 Somme achèvements (ΣCi)',
      'ΣwCi': '⭐ Somme pondérée (ΣwCi)',
    },
    'Qm': {
      'Cmax': '⏱️ Makespan (Cmax)',
      'ΣCi':  '🧮 Somme achèvements (ΣCi)',
    },
    'Fm': {
      'Cmax': '⏱️ Makespan (Cmax)',
      'ΣCi':  '🧮 Somme achèvements (ΣCi)',
      'ΣwCi': '⭐ Somme pondérée (ΣwCi)',
      'Lmax': '⚠️ Retard max (Lmax)',
      'ΣTj':  '📉 Somme retards (ΣTj)',
      'ΣUj':  '✅ Nb tâches en retard (ΣUj)',
    },
    'Jm': {
      'Cmax': '⏱️ Makespan (Cmax)',
    },
  };

  const ALPHA_LABELS = {
    '1': '1 — Machine unique',
    'Pm': 'Pm — Machines parallèles',
    'Qm': 'Qm — Machines uniformes',
    'Fm': 'Fm — Flow Shop',
    'Jm': 'Jm — Job Shop',
  };

  /* ── Default task sets ──────────────────────────────────────── */
  const DEFAULTS = {
    '1': [
      { id:'T1', processing_time:3, release_time:0, due_time:10, weight:1, precedence:'' },
      { id:'T2', processing_time:5, release_time:1, due_time:12, weight:2, precedence:'' },
      { id:'T3', processing_time:2, release_time:0, due_time:8,  weight:1, precedence:'T1' },
      { id:'T4', processing_time:4, release_time:2, due_time:15, weight:3, precedence:'' },
    ],
    'Pm': [
      { id:'T1', processing_time:4, release_time:0, due_time:null, weight:1 },
      { id:'T2', processing_time:6, release_time:0, due_time:null, weight:1 },
      { id:'T3', processing_time:3, release_time:0, due_time:null, weight:1 },
      { id:'T4', processing_time:5, release_time:0, due_time:null, weight:1 },
      { id:'T5', processing_time:2, release_time:0, due_time:null, weight:1 },
    ],
    'Qm': [
      { id:'T1', processing_time:4, release_time:0, due_time:null, weight:1 },
      { id:'T2', processing_time:6, release_time:0, due_time:null, weight:1 },
      { id:'T3', processing_time:3, release_time:0, due_time:null, weight:1 },
    ],
    'Fm': [
      { id:'J1', processing_times:[3,2,4], weight:1, due_time:null },
      { id:'J2', processing_times:[4,3,2], weight:1, due_time:null },
      { id:'J3', processing_times:[2,5,1], weight:1, due_time:null },
      { id:'J4', processing_times:[5,1,3], weight:1, due_time:null },
    ],
    'Jm': [
      { id:'J1', due_time:null, weight:1, operations:[
        { order:1, machine:'M1', processing_time:3, label:'O1' },
        { order:2, machine:'M2', processing_time:2, label:'O2' },
      ]},
      { id:'J2', due_time:null, weight:1, operations:[
        { order:1, machine:'M2', processing_time:4, label:'O1' },
        { order:2, machine:'M1', processing_time:3, label:'O2' },
      ]},
      { id:'J3', due_time:null, weight:1, operations:[
        { order:1, machine:'M1', processing_time:2, label:'O1' },
        { order:2, machine:'M2', processing_time:5, label:'O2' },
      ]},
    ],
  };

  /* ── Render ─────────────────────────────────────────────────── */
  function render(container) {
    container.innerHTML = '';
    container.appendChild(Utils.backButton(() => App.navigate('home')));

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="module-header">
        <div class="module-title">🎯 Ordonnancement des tâches</div>
        <div class="module-caption">Séquencez vos tâches · minimisez makespan, retards ou temps moyens</div>
      </div>
      <div class="col-layout col-layout-2">
        <div id="ord-left"></div>
        <div id="ord-right"></div>
      </div>
      <div class="credit-bar">Developed by Nabil Benkirane &nbsp;·&nbsp; Supervised by Prof. Faouzi Tayalati</div>
    `;
    container.appendChild(wrap);

    _renderLeft();
    _renderRight();
  }

  /* ── LEFT panel: configuration + task input ─────────────────── */
  function _renderLeft() {
    const left = document.getElementById('ord-left');
    left.innerHTML = '';

    // Machine type selector
    const alphaCard = Utils.div('card');
    alphaCard.innerHTML = `<div class="card-title">Type de ressource (α)</div>`;
    const alphaGroup = Utils.radioGroup(ALPHA_LABELS, state.alpha, val => {
      state.alpha = val;
      state.beta  = [];
      state.gamma = Object.keys(OBJECTIVES[val] || {})[0] || 'Cmax';
      state.tasks = Utils.clone(DEFAULTS[val] || []);
      state.result = null;
      _renderLeft();
      _renderRight();
    });
    alphaCard.appendChild(alphaGroup);

    // Number of machines (if multi)
    if (['Pm','Qm','Fm','Jm'].includes(state.alpha)) {
      const mRow = Utils.div('form-group', '');
      mRow.style.marginTop = '.75rem';
      const mLabel = document.createElement('label');
      mLabel.textContent = 'Nombre de machines';
      const mInput = document.createElement('input');
      mInput.type = 'number'; mInput.min = 2; mInput.max = 20; mInput.value = state.m;
      mInput.onchange = () => {
        state.m = Math.max(2, parseInt(mInput.value) || 2);
        if (state.alpha === 'Fm') {
          // Adjust processing_times length
          state.tasks.forEach(t => {
            while ((t.processing_times||[]).length < state.m) t.processing_times.push(1);
            if (t.processing_times) t.processing_times = t.processing_times.slice(0, state.m);
          });
        }
        state.result = null;
        _renderLeft();
        _renderRight();
      };
      mRow.appendChild(mLabel);
      mRow.appendChild(mInput);
      alphaCard.appendChild(mRow);
    }

    left.appendChild(alphaCard);

    // Constraints (beta) — only for 1, Pm, Qm
    if (!['Fm','Jm'].includes(state.alpha)) {
      const betaCard = Utils.div('card', ''); betaCard.style.marginTop = '.75rem';
      betaCard.innerHTML = `<div class="card-title">Contraintes (β)</div>`;
      const constraintMap = state.alpha === '1' ? CONSTRAINTS_1
        : state.alpha === 'Pm' ? CONSTRAINTS_PM
        : CONSTRAINTS_QM;
      const chips = Utils.constraintChips(constraintMap, state.beta, active => {
        state.beta = active;
        // Filter gamma
        const avail = OBJECTIVES[state.alpha] || {};
        if (!avail[state.gamma]) state.gamma = Object.keys(avail)[0] || 'Cmax';
        state.result = null;
        _renderGamma(betaCard);
        _renderLeft();
        _renderRight();
      });
      betaCard.appendChild(chips);
      left.appendChild(betaCard);
    }

    // Objective (gamma)
    const gammaCard = Utils.div('card'); gammaCard.style.marginTop = '.75rem';
    gammaCard.id = 'ord-gamma-card';
    gammaCard.innerHTML = `<div class="card-title">Objectif (γ)</div>`;
    _renderGamma(gammaCard);
    left.appendChild(gammaCard);

    // Job shop rule
    if (state.alpha === 'Jm') {
      const ruleCard = Utils.div('card'); ruleCard.style.marginTop = '.75rem';
      ruleCard.innerHTML = `<div class="card-title">Règle de dispatching</div>`;
      const ruleGroup = Utils.radioGroup(
        { SPT:'SPT', EDD:'EDD', LPT:'LPT', WSPT:'WSPT', FIFO:'FIFO' },
        state.rule,
        val => { state.rule = val; state.result = null; _renderRight(); }
      );
      ruleCard.appendChild(ruleGroup);
      left.appendChild(ruleCard);
    }

    // Task input
    const taskCard = Utils.div('card'); taskCard.style.marginTop = '.75rem';
    taskCard.innerHTML = `<div class="card-title">Saisie des tâches</div>`;

    // Load example button
    const btnEx = Utils.el('button', 'btn btn-secondary btn-sm');
    btnEx.textContent = '📂 Charger un exemple';
    btnEx.onclick = () => {
      state.tasks = Utils.clone(DEFAULTS[state.alpha] || []);
      state.result = null;
      _renderLeft();
      _renderRight();
    };
    taskCard.appendChild(btnEx);

    // Add task button
    const btnAdd = Utils.el('button', 'btn btn-secondary btn-sm');
    btnAdd.style.marginLeft = '.5rem';
    btnAdd.textContent = '➕ Ajouter';
    btnAdd.onclick = () => { _addTask(); _renderLeft(); };
    taskCard.appendChild(btnAdd);

    // CSV import
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.csv'; fileInput.style.display = 'none';
    fileInput.onchange = (e) => _importCSV(e.target.files[0]);
    const btnCSV = Utils.el('button', 'btn btn-secondary btn-sm');
    btnCSV.style.marginLeft = '.5rem';
    btnCSV.textContent = '📥 Import CSV';
    btnCSV.onclick = () => fileInput.click();
    taskCard.appendChild(btnCSV);
    taskCard.appendChild(fileInput);

    taskCard.appendChild(document.createElement('br'));
    taskCard.appendChild(document.createElement('br'));

    // Render task table
    taskCard.appendChild(_buildTaskTable());
    left.appendChild(taskCard);

    // Solve button
    const btnSolve = Utils.el('button', 'btn btn-primary btn-full');
    btnSolve.style.marginTop = '.75rem';
    btnSolve.textContent = '🚀 Calculer l\'ordonnancement';
    btnSolve.onclick = _solve;
    left.appendChild(btnSolve);
  }

  function _renderGamma(card) {
    // Remove old gamma group if any
    const old = card.querySelector('.radio-group');
    if (old) old.remove();
    const betaSet = new Set(state.beta);
    const pmtn = betaSet.has('pmtn');
    let avail = { ...(OBJECTIVES[state.alpha] || {}) };
    if (state.alpha === '1' && pmtn) {
      // Preemptive: only ΣCi and (if dj) Lmax
      avail = { 'ΣCi': OBJECTIVES['1']['ΣCi'] };
      if (betaSet.has('dj')) avail['Lmax'] = OBJECTIVES['1']['Lmax'];
    }
    if (!avail[state.gamma]) state.gamma = Object.keys(avail)[0] || 'Cmax';
    const group = Utils.radioGroup(avail, state.gamma, val => {
      state.gamma = val;
      state.result = null;
      _renderRight();
    });
    card.appendChild(group);
  }

  /* ── Task table ─────────────────────────────────────────────── */
  function _buildTaskTable() {
    const alpha = state.alpha;
    const betaSet = new Set(state.beta);

    if (alpha === 'Fm') return _buildFlowShopTable();
    if (alpha === 'Jm') return _buildJobShopTable();

    // Single / Parallel machine table
    const wrap = Utils.div('table-wrap');
    const cols = ['ID', 'Durée'];
    if (betaSet.has('rj') || alpha !== '1') {} // always show release for parallel to handle
    if (alpha !== '1' || betaSet.has('rj')) cols.push('Arrivée');
    if (betaSet.has('dj') || alpha !== '1')  cols.push('Limite');
    if (betaSet.has('wj') || alpha !== '1')  cols.push('Poids');
    if (betaSet.has('prec') && alpha === '1') cols.push('Prédécesseurs');
    cols.push('');

    let html = `<table class="editable-table"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;

    state.tasks.forEach((task, i) => {
      html += `<tr>
        <td><input type="text" value="${task.id}" data-i="${i}" data-key="id" /></td>
        <td><input type="number" value="${task.processing_time}" min="0.1" step="0.5" data-i="${i}" data-key="processing_time" /></td>
        ${(alpha !== '1' || betaSet.has('rj')) ? `<td><input type="number" value="${task.release_time||0}" min="0" step="0.5" data-i="${i}" data-key="release_time" /></td>` : ''}
        ${(betaSet.has('dj') || alpha !== '1') ? `<td><input type="number" value="${task.due_time??''}" min="0" step="0.5" placeholder="—" data-i="${i}" data-key="due_time" /></td>` : ''}
        ${(betaSet.has('wj') || alpha !== '1') ? `<td><input type="number" value="${task.weight||1}" min="1" step="1" data-i="${i}" data-key="weight" /></td>` : ''}
        ${(betaSet.has('prec') && alpha === '1') ? `<td><input type="text" value="${task.precedence||''}" placeholder="T1,T2" data-i="${i}" data-key="precedence" /></td>` : ''}
        <td><button class="btn-icon" onclick="Ordonnancement._removeTask(${i})" title="Supprimer">🗑</button></td>
      </tr>`;
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;

    // Bind change events
    wrap.querySelectorAll('input').forEach(inp => {
      inp.onchange = (e) => {
        const i = parseInt(e.target.dataset.i);
        const key = e.target.dataset.key;
        let val = e.target.value;
        if (key === 'processing_time' || key === 'release_time' || key === 'weight') {
          val = parseFloat(val) || 0;
        } else if (key === 'due_time') {
          val = val === '' ? null : parseFloat(val);
        }
        state.tasks[i][key] = val;
        state.result = null;
        _renderRight();
      };
    });
    return wrap;
  }

  function _buildFlowShopTable() {
    const m = state.m;
    const wrap = Utils.div('table-wrap');
    const cols = ['ID', ...Array.from({length:m},(_,k)=>`M${k+1}`), 'Poids', 'Limite', ''];
    let html = `<table class="editable-table"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
    state.tasks.forEach((job, i) => {
      const pts = job.processing_times || new Array(m).fill(1);
      html += `<tr>
        <td><input type="text" value="${job.id}" data-i="${i}" data-key="id" data-alpha="Fm" /></td>
        ${pts.map((p,k) => `<td><input type="number" value="${p}" min="0" step="0.5" data-i="${i}" data-key="pt_${k}" /></td>`).join('')}
        <td><input type="number" value="${job.weight||1}" min="1" step="1" data-i="${i}" data-key="weight" data-alpha="Fm" /></td>
        <td><input type="number" value="${job.due_time??''}" placeholder="—" data-i="${i}" data-key="due_time" data-alpha="Fm" /></td>
        <td><button class="btn-icon" onclick="Ordonnancement._removeTask(${i})" title="Supprimer">🗑</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    wrap.querySelectorAll('input').forEach(inp => {
      inp.onchange = e => {
        const i = parseInt(e.target.dataset.i);
        const key = e.target.dataset.key;
        if (key === 'id') {
          state.tasks[i].id = e.target.value;
        } else if (key === 'weight') {
          state.tasks[i].weight = parseInt(e.target.value) || 1;
        } else if (key === 'due_time') {
          state.tasks[i].due_time = e.target.value === '' ? null : parseFloat(e.target.value);
        } else if (key.startsWith('pt_')) {
          const k = parseInt(key.split('_')[1]);
          if (!state.tasks[i].processing_times) state.tasks[i].processing_times = new Array(m).fill(1);
          state.tasks[i].processing_times[k] = parseFloat(e.target.value) || 0;
        }
        state.result = null; _renderRight();
      };
    });
    return wrap;
  }

  function _buildJobShopTable() {
    const wrap = Utils.div('');

    // Per-job sections
    let html = '';
    state.tasks.forEach((job, ji) => {
      html += `<div class="card" style="margin-bottom:.5rem">
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
          <b>Job:</b>
          <input type="text" value="${job.id}" style="width:80px" onchange="Ordonnancement._jsJobId(${ji},this.value)"/>
          &nbsp; Limite: <input type="number" value="${job.due_time??''}" placeholder="—" style="width:80px" onchange="Ordonnancement._jsJobDue(${ji},this.value)"/>
          &nbsp; Poids: <input type="number" value="${job.weight||1}" min="1" style="width:60px" onchange="Ordonnancement._jsJobWeight(${ji},this.value)"/>
          <button class="btn-icon" onclick="Ordonnancement._removeTask(${ji})" title="Supprimer job">🗑</button>
        </div>`;
      html += `<table class="editable-table"><thead><tr><th>Ordre</th><th>Opération</th><th>Machine</th><th>Durée</th><th></th></tr></thead><tbody>`;
      (job.operations||[]).forEach((op, oi) => {
        html += `<tr>
          <td><input type="number" value="${op.order}" min="1" style="width:50px" onchange="Ordonnancement._jsOpField(${ji},${oi},'order',this.value)"/></td>
          <td><input type="text" value="${op.label||''}" placeholder="O${oi+1}" onchange="Ordonnancement._jsOpField(${ji},${oi},'label',this.value)"/></td>
          <td><input type="text" value="${op.machine||'M1'}" placeholder="M1" style="width:60px" onchange="Ordonnancement._jsOpField(${ji},${oi},'machine',this.value)"/></td>
          <td><input type="number" value="${op.processing_time||1}" min="0.1" step="0.5" onchange="Ordonnancement._jsOpField(${ji},${oi},'processing_time',this.value)"/></td>
          <td><button class="btn-icon" onclick="Ordonnancement._jsRemoveOp(${ji},${oi})" title="Supprimer op">🗑</button></td>
        </tr>`;
      });
      html += `</tbody></table>
        <button class="btn btn-secondary btn-xs" style="margin-top:.4rem" onclick="Ordonnancement._jsAddOp(${ji})">➕ Opération</button>
      </div>`;
    });

    wrap.innerHTML = html;

    // Add job button
    const btnAdd = Utils.el('button','btn btn-secondary btn-sm');
    btnAdd.textContent = '➕ Ajouter un job';
    btnAdd.onclick = () => { _addTask(); _renderLeft(); };
    wrap.appendChild(btnAdd);
    return wrap;
  }

  /* ── Job shop edit helpers (called from inline onchange) ─── */
  function _jsJobId(ji, val) { state.tasks[ji].id = val; state.result=null; }
  function _jsJobDue(ji, val) { state.tasks[ji].due_time = val===''?null:parseFloat(val); state.result=null; }
  function _jsJobWeight(ji, val) { state.tasks[ji].weight = parseInt(val)||1; state.result=null; }
  function _jsOpField(ji, oi, key, val) {
    if (!state.tasks[ji].operations) state.tasks[ji].operations=[];
    if (key === 'processing_time') val = parseFloat(val)||1;
    if (key === 'order') val = parseInt(val)||1;
    state.tasks[ji].operations[oi][key] = val;
    state.result=null;
  }
  function _jsAddOp(ji) {
    if (!state.tasks[ji].operations) state.tasks[ji].operations=[];
    const n = state.tasks[ji].operations.length+1;
    state.tasks[ji].operations.push({ order:n, machine:`M1`, processing_time:1, label:`O${n}` });
    state.result=null; _renderLeft();
  }
  function _jsRemoveOp(ji, oi) {
    state.tasks[ji].operations.splice(oi,1); state.result=null; _renderLeft();
  }

  function _addTask() {
    const alpha = state.alpha;
    const n = state.tasks.length + 1;
    if (alpha === 'Fm') {
      state.tasks.push({ id:`J${n}`, processing_times: new Array(state.m).fill(1), weight:1, due_time:null });
    } else if (alpha === 'Jm') {
      state.tasks.push({ id:`J${n}`, due_time:null, weight:1, operations:[
        { order:1, machine:'M1', processing_time:1, label:'O1' }
      ]});
    } else {
      state.tasks.push({ id:`T${n}`, processing_time:1, release_time:0, due_time:null, weight:1, precedence:'' });
    }
  }

  function _removeTask(i) {
    state.tasks.splice(i,1); state.result=null; _renderLeft(); _renderRight();
  }

  /* ── CSV import ─────────────────────────────────────────────── */
  function _importCSV(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const lines = e.target.result.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
        const obj = {};
        headers.forEach((h,i) => obj[h] = vals[i] || '');
        return obj;
      }).filter(r => r['ID'] || r['Job']);

      if (state.alpha === 'Fm') {
        state.tasks = rows.map(r => ({
          id: r['ID'] || r['Job'],
          processing_times: Array.from({length:state.m},(_,k) => parseFloat(r[`M${k+1}`])||0),
          weight: parseFloat(r['Poids'])||1,
          due_time: r['Limite']!==''?parseFloat(r['Limite']):null,
        }));
      } else if (state.alpha === 'Jm') {
        const jobs = {};
        rows.forEach(r => {
          const jid = r['Job'];
          if (!jobs[jid]) jobs[jid] = { id:jid, due_time: r['Limite']!==''?parseFloat(r['Limite']):null, weight:parseFloat(r['Poids'])||1, operations:[] };
          jobs[jid].operations.push({ order:parseInt(r['Ordre'])||1, machine:r['Machine']||'M1', processing_time:parseFloat(r['Duree'])||1, label:r['Operation']||'' });
        });
        state.tasks = Object.values(jobs);
      } else {
        state.tasks = rows.map(r => ({
          id: r['ID'],
          processing_time: parseFloat(r['Duree'])||1,
          release_time: parseFloat(r['Arrivee'])||0,
          due_time: r['Limite']!==''?parseFloat(r['Limite']):null,
          weight: parseFloat(r['Poids'])||1,
          precedence: r['Predecesseurs']||'',
        }));
      }
      state.result = null;
      _renderLeft(); _renderRight();
    };
    reader.readAsText(file);
  }

  /* ── Solve ──────────────────────────────────────────────────── */
  function _solve() {
    if (!state.tasks.length) {
      document.getElementById('ord-right').innerHTML = Utils.alertBanner('warning','Ajoutez au moins une tâche.');
      return;
    }
    let result;
    try {
      if (state.alpha === '1') {
        result = SingleMachine.solve(state.tasks, state.beta, state.gamma);
      } else if (state.alpha === 'Pm' || state.alpha === 'Qm') {
        result = ParallelMachine.solve(state.tasks, state.m, state.beta, state.gamma);
      } else if (state.alpha === 'Fm') {
        result = FlowShop.solve(state.tasks, state.m, state.beta, state.gamma);
      } else if (state.alpha === 'Jm') {
        result = JobShop.solve(state.tasks, state.m, state.beta, state.gamma, state.rule);
      } else {
        result = SingleMachine.solve(state.tasks, state.beta, state.gamma);
      }
      state.result = result;
    } catch(e) {
      document.getElementById('ord-right').innerHTML = Utils.alertBanner('error', 'Erreur: '+e.message);
      return;
    }
    _renderRight();
  }

  /* ── RIGHT panel: results ────────────────────────────────────── */
  function _renderRight() {
    const right = document.getElementById('ord-right');
    if (!right) return;
    right.innerHTML = '';

    if (!state.result) {
      right.innerHTML = `
        ${Utils.sectionDiv('Résultats')}
        ${Utils.alertBanner('info','Configurez vos tâches et lancez le calcul.')}
        <div style="margin-top:1rem;font-size:.84rem;color:#64748b">
          <b>Algorithmes disponibles :</b><br>
          SPT · EDD · WSPT · Moore-Hodgson · NEH · Johnson · Giffler-Thompson
        </div>`;
      return;
    }

    const { evaluated, indicators, algorithm } = state.result;

    // Notation
    const betaStr = state.beta.join(',') || '—';
    const notation = `${state.alpha} | ${betaStr} | ${state.gamma}`;
    right.innerHTML = `
      ${Utils.sectionDiv('Résultats')}
      <div style="margin-bottom:.5rem">
        <span class="notation-badge">${notation}</span>
        &nbsp;<span style="font-size:.82rem;color:#64748b">Algorithme : <b>${algorithm||'—'}</b></span>
      </div>`;

    // KPIs
    const ind = indicators || {};
    const kpiEl = Utils.kpiGrid([
      { label:'Cmax',  value: ind['Cmax']  != null ? ind['Cmax']  : '—' },
      { label:'ΣCi',   value: ind['ΣCi']   != null ? ind['ΣCi']   : '—' },
      { label:'ΣwCi',  value: ind['ΣwCi']  != null ? ind['ΣwCi']  : '—' },
      { label:'Lmax',  value: ind['Lmax']  != null ? ind['Lmax']  : '—' },
      { label:'ΣTj',   value: ind['ΣTj']   != null ? ind['ΣTj']   : '—' },
      { label:'ΣUj',   value: ind['ΣUj']   != null ? ind['ΣUj']   : '—' },
    ], 3);
    right.appendChild(kpiEl);

    // Results table
    right.innerHTML += Utils.sectionDiv('Séquence planifiée');

    if (state.alpha === 'Fm') {
      right.innerHTML += _flowshopResultsHtml(evaluated);
    } else if (state.alpha === 'Jm') {
      right.innerHTML += _jobshopResultsHtml(evaluated);
    } else {
      right.innerHTML += Utils.resultsTable(evaluated, [
        { key:'id',              label:'ID' },
        { key:'machine',         label:'Machine', format: v => v != null ? `M${parseInt(v)+1}` : '—' },
        { key:'start',           label:'Début',   format: v => Utils.fmt(v) },
        { key:'finish',          label:'Fin',     format: v => Utils.fmt(v) },
        { key:'processing_time', label:'Durée',   format: v => Utils.fmt(v) },
        { key:'due_time',        label:'Limite',  format: v => v != null ? Utils.fmt(v) : '—' },
        { key:'tardiness',       label:'Retard',  format: (v, row) => {
          const t = parseFloat(v);
          if (t > 0) return `<span class="badge badge-red">${Utils.fmt(t)}</span>`;
          return `<span class="badge badge-green">0</span>`;
        }},
      ]);
    }

    // Export
    const btnCSV = Utils.el('button','btn btn-secondary btn-sm');
    btnCSV.style.marginTop = '.5rem';
    btnCSV.textContent = '📥 Exporter CSV';
    btnCSV.onclick = () => Utils.downloadCSV(evaluated, 'ordonnancement.csv');
    right.appendChild(btnCSV);

    // Gantt
    right.innerHTML += Utils.sectionDiv('Diagramme de Gantt');
    const ganttDiv = document.createElement('div');
    ganttDiv.id = 'ord-gantt';
    right.appendChild(ganttDiv);

    requestAnimationFrame(() => {
      const machineCount = ['Pm','Qm','Fm','Jm'].includes(state.alpha) ? state.m : 1;
      const labels = state.alpha === 'Jm' || state.alpha === 'Fm'
        ? Array.from({length:machineCount},(_,i)=>`Machine ${i+1}`)
        : state.alpha === '1' ? ['Machine 1']
        : Array.from({length:machineCount},(_,i)=>`Machine ${i+1}`);
      Gantt.render('ord-gantt', evaluated, {
        machine_count: machineCount,
        machineLabels: labels,
        title: `Gantt — ${notation}`,
        alpha: state.alpha,
      });
    });
  }

  function _flowshopResultsHtml(evaluated) {
    // Group by job then sort by machine
    const jobs = {};
    for (const op of evaluated) {
      if (!jobs[op.id]) jobs[op.id] = [];
      jobs[op.id].push(op);
    }
    const cols = ['Job', ...Array.from({length:state.m},(_,k)=>`M${k+1} Début`), ...Array.from({length:state.m},(_,k)=>`M${k+1} Fin`), 'Limite'];
    let html = '<div class="table-wrap"><table><thead><tr>';
    html += cols.map(c=>`<th>${c}</th>`).join('');
    html += '</tr></thead><tbody>';
    for (const [jid, ops] of Object.entries(jobs)) {
      html += `<tr><td>${jid}</td>`;
      ops.sort((a,b)=>a.machine-b.machine);
      for (let k=0;k<state.m;k++) {
        const op = ops.find(o=>o.machine===k);
        html += `<td>${op?Utils.fmt(op.start):'—'}</td>`;
      }
      for (let k=0;k<state.m;k++) {
        const op = ops.find(o=>o.machine===k);
        html += `<td>${op?Utils.fmt(op.finish):'—'}</td>`;
      }
      const due = ops[0]?.due_time;
      html += `<td>${due!=null?Utils.fmt(due):'—'}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  function _jobshopResultsHtml(evaluated) {
    return Utils.resultsTable(evaluated, [
      { key:'id',              label:'Job' },
      { key:'op_label',        label:'Opération' },
      { key:'machine',         label:'Machine', format: v => `M${parseInt(v)+1}` },
      { key:'operation',       label:'Ordre' },
      { key:'start',           label:'Début',   format: v => Utils.fmt(v) },
      { key:'finish',          label:'Fin',     format: v => Utils.fmt(v) },
      { key:'processing_time', label:'Durée',   format: v => Utils.fmt(v) },
    ]);
  }

  /* ── Public API ─────────────────────────────────────────────── */
  return {
    render,
    _removeTask,
    _jsJobId, _jsJobDue, _jsJobWeight,
    _jsOpField, _jsAddOp, _jsRemoveOp,
  };
})();
