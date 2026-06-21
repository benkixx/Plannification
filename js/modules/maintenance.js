/* =============================================================
   Module : Maintenance & interventions préventives
   ============================================================= */

const Maintenance = (() => {

  let state = {
    machines:     [],
    maintenances: [],
    techniciens:  [],
    results:      null,
    gantt_semaine: null,
  };

  /* ── Default data ────────────────────────────────────────── */
  function _defaultData() {
    state.machines = [
      { code:'M-001', nom:'Presse Hydraulique',  atelier:'Atelier A', criticite:'Critique' },
      { code:'M-002', nom:'Convoyeur Principal', atelier:'Atelier B', criticite:'Importante' },
      { code:'M-003', nom:'Four Thermique',      atelier:'Atelier C', criticite:'Critique' },
      { code:'M-004', nom:'Pompe à Vide',        atelier:'Atelier A', criticite:'Normale' },
    ];
    state.maintenances = [
      { id:'PM-001', machine:'M-001', intitule:'Inspection huile',      duree_h:1.5, periode:'Semaine 1', priorite:5, competence:'Hydraulique',nb_tech:1 },
      { id:'PM-002', machine:'M-002', intitule:'Lubrification chaîne',  duree_h:1.0, periode:'Semaine 1', priorite:3, competence:'Mécanique',  nb_tech:1 },
      { id:'PM-003', machine:'M-003', intitule:'Calibration capteurs',  duree_h:2.0, periode:'Semaine 1', priorite:5, competence:'Électrique', nb_tech:2 },
      { id:'PM-004', machine:'M-004', intitule:'Remplacement joint',    duree_h:3.0, periode:'Semaine 2', priorite:4, competence:'Hydraulique',nb_tech:2 },
      { id:'PM-005', machine:'M-001', intitule:'Contrôle soupapes',     duree_h:2.5, periode:'Semaine 2', priorite:4, competence:'Hydraulique',nb_tech:1 },
      { id:'PM-006', machine:'M-003', intitule:'Nettoyage résistances', duree_h:1.5, periode:'Semaine 2', priorite:2, competence:'Électrique', nb_tech:1 },
    ];
    state.techniciens = [
      { id:'T-001', nom:'Ahmed Benali',    specialite:'Hydraulique', disponibilite:'Semaine 1 & 2', heures_dispo:8.0 },
      { id:'T-002', nom:'Sara Ouali',      specialite:'Électrique',  disponibilite:'Semaine 1 & 2', heures_dispo:8.0 },
      { id:'T-003', nom:'Karim Messaoudi', specialite:'Mécanique',   disponibilite:'Semaine 1 & 2', heures_dispo:6.0 },
      { id:'T-004', nom:'Nadia Chérif',    specialite:'Électrique',  disponibilite:'Semaine 2',     heures_dispo:8.0 },
    ];
    state.results = null;
  }

  /* ── Scheduling algorithm ────────────────────────────────── */
  function _ordonnancer() {
    const { maintenances, techniciens } = state;
    const alertes = [];
    const planning = [];
    const charge = {};
    const fin_courante = {};
    const heures_dispo = {};
    const noms = {};

    techniciens.forEach(t => {
      charge[t.id] = 0;
      fin_courante[t.id] = 0;
      heures_dispo[t.id] = parseFloat(t.heures_dispo) || 8;
      noms[t.id] = t.nom;
    });

    const sorted = [...maintenances].sort((a,b) => {
      const pa = -(parseInt(a.priorite)||1), pb = -(parseInt(b.priorite)||1);
      return pa - pb || a.id.localeCompare(b.id);
    });

    for (const tache of sorted) {
      let nb_req = Math.max(1, parseInt(tache.nb_tech)||1);
      const duree = parseFloat(tache.duree_h)||1;

      const disponibles = techniciens
        .filter(t => (heures_dispo[t.id] - charge[t.id]) >= duree)
        .map(t => t.id);

      if (disponibles.length < nb_req) {
        alertes.push(`⚠️ ${tache.id} – ${tache.intitule} : ${disponibles.length}/${nb_req} technicien(s) disponible(s)`);
        if (!disponibles.length) {
          planning.push({ id:tache.id, machine:tache.machine, intitule:tache.intitule,
            periode:tache.periode||'—', priorite:tache.priorite||1, duree_h:duree,
            techniciens:'— NON AFFECTÉ —', ids_tech:'', debut_h:'—', fin_h:'—', statut:'non_affecte' });
          continue;
        }
        nb_req = disponibles.length;
      }

      disponibles.sort((a,b) => charge[a]-charge[b]);
      const affectes = disponibles.slice(0, nb_req);
      const debut = Math.max(...affectes.map(tid => fin_courante[tid]));
      const fin   = debut + duree;

      affectes.forEach(tid => {
        charge[tid]      += duree;
        fin_courante[tid] = fin;
      });

      planning.push({
        id: tache.id, machine: tache.machine, intitule: tache.intitule,
        periode: tache.periode||'—', priorite: parseInt(tache.priorite)||1, duree_h: duree,
        techniciens: affectes.map(tid=>noms[tid]).join(' / '),
        ids_tech: affectes.join(', '),
        debut_h: parseFloat(debut.toFixed(2)), fin_h: parseFloat(fin.toFixed(2)),
        statut: 'affecte',
      });
    }

    const charge_tech = techniciens.map(t => {
      const h = charge[t.id];
      const hd = heures_dispo[t.id];
      const taux = parseFloat((100*h/hd).toFixed(1));
      const surcharge = h > hd;
      if (surcharge) alertes.push(`🔴 ${t.nom} : surcharge ${h.toFixed(1)}h / ${hd}h dispo`);
      return {
        id:t.id, nom:t.nom, specialite:t.specialite||'', heures_dispo:hd,
        heures_affectees: parseFloat(h.toFixed(2)), taux_charge:taux,
        statut: surcharge ? '🔴 Surchargé' : (taux>70 ? '🟡 Chargé' : '🟢 OK'),
      };
    });

    return { planning, charge_tech, alertes };
  }

  /* ── Render ─────────────────────────────────────────────── */
  function render(container) {
    container.innerHTML = '';
    container.appendChild(Utils.backButton(() => App.navigate('home')));

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="module-header">
        <div class="module-title">🔧 Planification de Maintenance Préventive</div>
        <div class="module-caption">Saisie des interventions · Affectation aux techniciens · Ordonnancement</div>
      </div>
      <div id="maint-body"></div>
      <div class="credit-bar">Developed by Nabil Benkirane &nbsp;·&nbsp; Supervised by Prof. Faouzi Tayalati</div>`;
    container.appendChild(wrap);
    _renderBody();
  }

  function _renderBody() {
    const body = document.getElementById('maint-body');
    body.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="maint-btn-example" style="margin-bottom:.75rem">
        📂 Charger un exemple
      </button>`;

    document.getElementById('maint-btn-example').onclick = () => { _defaultData(); _renderBody(); };

    // 1. Machines
    body.appendChild(_machinesSection());
    // 2. Interventions
    body.appendChild(_maintenancesSection());
    // 3. Technicians
    body.appendChild(_techniciensSection());

    // Solve button
    const btnSolve = Utils.el('button','btn btn-primary btn-full');
    btnSolve.style.marginTop = '.5rem';
    btnSolve.textContent = '🚀 Générer le planning de maintenance';
    btnSolve.onclick = () => {
      const r = _ordonnancer();
      state.results = r;
      const semaines = [...new Set(r.planning.filter(p=>p.statut==='affecte').map(p=>p.periode))].sort();
      state.gantt_semaine = semaines[0] || null;
      _renderResults();
    };
    body.appendChild(btnSolve);

    // Results
    const resDiv = Utils.div('');
    resDiv.id = 'maint-results';
    body.appendChild(resDiv);
    if (state.results) _renderResults();
  }

  function _machinesSection() {
    const sec = Utils.div('card', ''); sec.style.marginBottom = '.75rem';
    sec.innerHTML = `<div class="card-title">🏭 1 · Parc machines</div>`;

    const btnAdd = Utils.el('button','btn btn-secondary btn-sm');
    btnAdd.textContent = '➕ Ajouter machine';
    btnAdd.onclick = () => {
      state.machines.push({ code:`M-${String(state.machines.length+1).padStart(3,'0')}`, nom:'Nouvelle machine', atelier:'Atelier X', criticite:'Normale' });
      _renderBody();
    };
    sec.appendChild(btnAdd);

    const tableWrap = Utils.div('table-wrap', '');
    tableWrap.style.marginTop = '.5rem';
    let html = `<table class="editable-table"><thead><tr>
      <th>Code</th><th>Nom machine</th><th>Atelier</th><th>Criticité</th><th></th>
    </tr></thead><tbody>`;
    state.machines.forEach((m,i) => {
      html += `<tr>
        <td><input type="text" value="${m.code}" onchange="Maintenance._editMachine(${i},'code',this.value)"/></td>
        <td><input type="text" value="${m.nom}" onchange="Maintenance._editMachine(${i},'nom',this.value)"/></td>
        <td><input type="text" value="${m.atelier}" onchange="Maintenance._editMachine(${i},'atelier',this.value)"/></td>
        <td><select onchange="Maintenance._editMachine(${i},'criticite',this.value)">
          ${['Critique','Importante','Normale'].map(opt=>`<option ${m.criticite===opt?'selected':''}>${opt}</option>`).join('')}
        </select></td>
        <td><button class="btn-icon" onclick="Maintenance._removeMachine(${i})">🗑</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    tableWrap.innerHTML = html;
    sec.appendChild(tableWrap);
    return sec;
  }

  function _maintenancesSection() {
    const sec = Utils.div('card', ''); sec.style.marginBottom = '.75rem';
    sec.innerHTML = `<div class="card-title">📋 2 · Interventions préventives</div>`;
    const codes = state.machines.map(m=>m.code);
    const periodes = ['Semaine 1','Semaine 2','Semaine 3','Semaine 4','Mois 1','Mois 2','Mois 3'];
    const competences = ['Hydraulique','Électrique','Mécanique','Instrumentation','Généraliste'];

    const btnAdd = Utils.el('button','btn btn-secondary btn-sm');
    btnAdd.textContent = '➕ Ajouter intervention';
    btnAdd.onclick = () => {
      const n = state.maintenances.length+1;
      state.maintenances.push({
        id:`PM-${String(n).padStart(3,'0')}`, machine:codes[0]||'M-001',
        intitule:'Nouvelle intervention', duree_h:1.0, periode:'Semaine 1',
        priorite:3, competence:'Mécanique', nb_tech:1,
      });
      _renderBody();
    };
    sec.appendChild(btnAdd);

    const wrap = Utils.div('table-wrap',''); wrap.style.marginTop='.5rem';
    let html = `<table class="editable-table"><thead><tr>
      <th>ID</th><th>Machine</th><th>Intitulé</th><th>Durée (h)</th><th>Période</th>
      <th>Priorité (1-5)</th><th>Compétence</th><th>Nb tech.</th><th></th>
    </tr></thead><tbody>`;
    state.maintenances.forEach((m,i) => {
      html += `<tr>
        <td><input type="text" value="${m.id}" onchange="Maintenance._editMaint(${i},'id',this.value)"/></td>
        <td><select onchange="Maintenance._editMaint(${i},'machine',this.value)">
          ${codes.map(c=>`<option ${m.machine===c?'selected':''}>${c}</option>`).join('')}
        </select></td>
        <td><input type="text" value="${m.intitule}" onchange="Maintenance._editMaint(${i},'intitule',this.value)"/></td>
        <td><input type="number" value="${m.duree_h}" min="0.1" step="0.5" onchange="Maintenance._editMaint(${i},'duree_h',+this.value)"/></td>
        <td><select onchange="Maintenance._editMaint(${i},'periode',this.value)">
          ${periodes.map(p=>`<option ${m.periode===p?'selected':''}>${p}</option>`).join('')}
        </select></td>
        <td><input type="number" value="${m.priorite}" min="1" max="5" step="1" onchange="Maintenance._editMaint(${i},'priorite',+this.value)"/></td>
        <td><select onchange="Maintenance._editMaint(${i},'competence',this.value)">
          ${competences.map(c=>`<option ${m.competence===c?'selected':''}>${c}</option>`).join('')}
        </select></td>
        <td><input type="number" value="${m.nb_tech}" min="1" max="6" onchange="Maintenance._editMaint(${i},'nb_tech',+this.value)"/></td>
        <td><button class="btn-icon" onclick="Maintenance._removeMaint(${i})">🗑</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    sec.appendChild(wrap);
    return sec;
  }

  function _techniciensSection() {
    const sec = Utils.div('card', ''); sec.style.marginBottom = '.75rem';
    sec.innerHTML = `<div class="card-title">👷 3 · Techniciens disponibles</div>`;
    const specialites = ['Hydraulique','Électrique','Mécanique','Instrumentation','Généraliste'];

    const btnAdd = Utils.el('button','btn btn-secondary btn-sm');
    btnAdd.textContent = '➕ Ajouter technicien';
    btnAdd.onclick = () => {
      const n = state.techniciens.length+1;
      state.techniciens.push({ id:`T-${String(n).padStart(3,'0')}`, nom:`Technicien ${n}`, specialite:'Mécanique', disponibilite:'Semaine 1 & 2', heures_dispo:8.0 });
      _renderBody();
    };
    sec.appendChild(btnAdd);

    const wrap = Utils.div('table-wrap',''); wrap.style.marginTop='.5rem';
    let html = `<table class="editable-table"><thead><tr>
      <th>ID</th><th>Nom</th><th>Spécialité</th><th>Disponibilité</th><th>Heures dispo</th><th></th>
    </tr></thead><tbody>`;
    state.techniciens.forEach((t,i) => {
      html += `<tr>
        <td><input type="text" value="${t.id}" onchange="Maintenance._editTech(${i},'id',this.value)"/></td>
        <td><input type="text" value="${t.nom}" onchange="Maintenance._editTech(${i},'nom',this.value)"/></td>
        <td><select onchange="Maintenance._editTech(${i},'specialite',this.value)">
          ${specialites.map(s=>`<option ${t.specialite===s?'selected':''}>${s}</option>`).join('')}
        </select></td>
        <td><input type="text" value="${t.disponibilite}" onchange="Maintenance._editTech(${i},'disponibilite',this.value)"/></td>
        <td><input type="number" value="${t.heures_dispo}" min="0.5" max="24" step="0.5" onchange="Maintenance._editTech(${i},'heures_dispo',+this.value)"/></td>
        <td><button class="btn-icon" onclick="Maintenance._removeTech(${i})">🗑</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    sec.appendChild(wrap);
    return sec;
  }

  /* ── Render results ──────────────────────────────────────── */
  function _renderResults() {
    const el = document.getElementById('maint-results');
    if (!el || !state.results) return;
    const { planning, charge_tech, alertes } = state.results;

    const nb_total    = planning.length;
    const nb_affectes = planning.filter(p=>p.statut==='affecte').length;
    const nb_non_aff  = nb_total - nb_affectes;
    const total_h     = planning.filter(p=>p.statut==='affecte').reduce((s,p)=>s+p.duree_h,0);
    const cmax        = Math.max(0, ...planning.filter(p=>p.statut==='affecte').map(p=>parseFloat(p.fin_h)||0));
    const taux_aff    = nb_total>0 ? parseFloat((100*nb_affectes/nb_total).toFixed(1)) : 0;

    let html = `<hr style="margin:1rem 0"/>
      <h3 style="margin-bottom:.5rem">📊 Synthèse</h3>`;

    html += `<div class="metrics-grid metrics-grid-4" style="margin-bottom:.75rem">
      ${[
        {label:'Interventions totales',  value:nb_total},
        {label:'Interventions affectées',value:nb_affectes},
        {label:'Non affectées',          value:nb_non_aff},
        {label:'Makespan (h)',           value:cmax.toFixed(1)},
        {label:'Taux affectation',       value:`${taux_aff} %`},
        {label:'Heures totales',         value:`${total_h.toFixed(1)} h`},
      ].map(m=>`<div class="metric-card"><div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div></div>`).join('')}
    </div>`;

    if (alertes.length) {
      html += Utils.alertBanner('warning', '<b>Alertes :</b><br>' + alertes.join('<br>'));
    } else {
      html += Utils.alertBanner('success', '✅ Toutes les interventions ont été affectées sans conflit.');
    }

    el.innerHTML = html;

    // Planning table
    el.innerHTML += `<h3 style="margin:1rem 0 .5rem">📅 Planning global des maintenances</h3>`;
    el.innerHTML += Utils.resultsTable(
      [...planning].sort((a,b)=>-(a.priorite-b.priorite)),
      [
        { key:'id',          label:'ID' },
        { key:'machine',     label:'Machine' },
        { key:'intitule',    label:'Intitulé' },
        { key:'periode',     label:'Période' },
        { key:'priorite',    label:'Priorité' },
        { key:'duree_h',     label:'Durée (h)', format:v=>Utils.fmt(v) },
        { key:'techniciens', label:'Technicien(s)' },
        { key:'debut_h',     label:'Début (h)',  format:v=>v==='—'?'—':Utils.fmt(v) },
        { key:'fin_h',       label:'Fin (h)',    format:v=>v==='—'?'—':Utils.fmt(v) },
        { key:'statut',      label:'Statut', format:v=>
          v==='affecte'?`<span class="badge badge-green">✅ Affecté</span>`
                       :`<span class="badge badge-red">❌ Non affecté</span>` },
      ]
    );

    // Charge technicians
    el.innerHTML += `<h3 style="margin:1rem 0 .5rem">👷 Charge par technicien</h3>`;
    el.innerHTML += Utils.resultsTable(charge_tech, [
      { key:'id',               label:'ID' },
      { key:'nom',              label:'Nom' },
      { key:'specialite',       label:'Spécialité' },
      { key:'heures_dispo',     label:'H. dispo',    format:v=>Utils.fmt(v) },
      { key:'heures_affectees', label:'H. affectées', format:v=>Utils.fmt(v) },
      { key:'taux_charge',      label:'Charge (%)',  format:v=>Utils.fmt(v) },
      { key:'statut',           label:'Statut', format:v=>{
        if (v.includes('Surchargé')) return `<span class="badge badge-red">${v}</span>`;
        if (v.includes('Chargé')) return `<span class="badge badge-yellow">${v}</span>`;
        return `<span class="badge badge-green">${v}</span>`;
      }},
    ]);

    // Gantt by period
    const semaines = [...new Set(planning.filter(p=>p.statut==='affecte').map(p=>p.periode))].sort();
    if (semaines.length) {
      el.innerHTML += `<h3 style="margin:1rem 0 .5rem">📊 Diagramme de Gantt</h3>`;
      const radioWrap = Utils.div('radio-group','');
      semaines.forEach(sem => {
        const btn = Utils.el('button','radio-btn'+(state.gantt_semaine===sem?' selected':''));
        btn.textContent = sem;
        btn.onclick = () => {
          state.gantt_semaine = sem;
          radioWrap.querySelectorAll('.radio-btn').forEach(b=>b.classList.remove('selected'));
          btn.classList.add('selected');
          Gantt.renderMaintenance('maint-gantt', planning, state.techniciens, sem);
        };
        radioWrap.appendChild(btn);
      });
      el.appendChild(radioWrap);
      const ganttDiv = Utils.div('');
      ganttDiv.id = 'maint-gantt';
      el.appendChild(ganttDiv);
      requestAnimationFrame(() => {
        Gantt.renderMaintenance('maint-gantt', planning, state.techniciens, state.gantt_semaine||semaines[0]);
      });
    }

    // Advanced KPIs
    el.innerHTML += `<h3 style="margin:1rem 0 .5rem">📈 Indicateurs avancés</h3>`;
    const nb_crit     = planning.filter(p=>parseInt(p.priorite)===5).length;
    const nb_crit_aff = planning.filter(p=>parseInt(p.priorite)===5&&p.statut==='affecte').length;
    const taux_crit   = nb_crit>0 ? parseFloat((100*nb_crit_aff/nb_crit).toFixed(1)) : 100;
    const charge_moy  = charge_tech.length ? parseFloat((charge_tech.reduce((s,c)=>s+c.taux_charge,0)/charge_tech.length).toFixed(1)) : 0;
    const tech_surcharges = charge_tech.filter(c=>c.statut.includes('Surchargé')).length;
    const h_dispo     = state.techniciens.reduce((s,t)=>s+(parseFloat(t.heures_dispo)||8),0);
    const util_glob   = h_dispo>0 ? parseFloat((100*total_h/h_dispo).toFixed(1)) : 0;

    el.innerHTML += `<div class="metrics-grid metrics-grid-4">
      ${[
        {label:'Tâches critiques (P5)', value:nb_crit},
        {label:'Critiques affectées',   value:`${taux_crit} %`},
        {label:'Charge moy. techniciens',value:`${charge_moy} %`},
        {label:'Techniciens surchargés', value:tech_surcharges},
        {label:'Utilisation ressources', value:`${util_glob} %`},
      ].map(m=>`<div class="metric-card"><div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div></div>`).join('')}
    </div>`;

    // Bar charts
    el.innerHTML += `<h3 style="margin:1rem 0 .5rem">📊 Visualisations</h3>
      <div class="col-layout col-layout-eq" style="gap:1rem">
        <div class="chart-wrap"><canvas id="maint-chart-charge" height="250"></canvas></div>
        <div class="chart-wrap"><canvas id="maint-chart-comp" height="250"></canvas></div>
      </div>`;

    requestAnimationFrame(() => {
      // Charge by technician
      const ctx1 = document.getElementById('maint-chart-charge')?.getContext('2d');
      if (ctx1) {
        new Chart(ctx1, { type:'bar', data:{
          labels: charge_tech.map(c=>c.nom),
          datasets:[{ label:'Charge (%)', data:charge_tech.map(c=>c.taux_charge),
            backgroundColor:'rgba(79,70,229,.7)', borderColor:'#4f46e5', borderWidth:1 }]
        }, options:{ plugins:{legend:{display:false}}, scales:{y:{max:120,beginAtZero:true}} }});
      }
      // By competence
      const comp_map = {};
      state.maintenances.forEach(m=>{ comp_map[m.competence]=(comp_map[m.competence]||0)+parseFloat(m.duree_h||0); });
      const ctx2 = document.getElementById('maint-chart-comp')?.getContext('2d');
      if (ctx2) {
        new Chart(ctx2, { type:'bar', data:{
          labels: Object.keys(comp_map),
          datasets:[{ label:'Total (h)', data:Object.values(comp_map),
            backgroundColor:'rgba(16,185,129,.7)', borderColor:'#059669', borderWidth:1 }]
        }, options:{ plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }});
      }
    });
  }

  /* ── Edit helpers ────────────────────────────────────────── */
  function _editMachine(i,k,v) { state.machines[i][k]=v; }
  function _removeMachine(i)   { state.machines.splice(i,1); _renderBody(); }
  function _editMaint(i,k,v)   { state.maintenances[i][k]=v; }
  function _removeMaint(i)     { state.maintenances.splice(i,1); _renderBody(); }
  function _editTech(i,k,v)    { state.techniciens[i][k]=v; }
  function _removeTech(i)      { state.techniciens.splice(i,1); _renderBody(); }

  return { render, _editMachine, _removeMachine, _editMaint, _removeMaint, _editTech, _removeTech };
})();
