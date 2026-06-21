/* =============================================================
   Module : Planification MRP (stocks)
   PDP — Plan Directeur de Production multiniveau
   ============================================================= */

const Stocks = (() => {

  let state = {
    n:             4,
    unite:         'Semaine',
    produit_nom:   'Produit A',
    produit_code:  'PF-001',
    previsions:    '50,60,50,40',
    stock_pf:      100,
    ss_pf:         0,
    lt_pf:         1,
    pol_pf:        'lot-for-lot',
    lot_pf:        1,
    bom: [
      { parent:'Produit A',composant:'B',qte_par:2,niveau:1,type:'Fabriqué',lead_time:1,stock_initial:80,stock_securite:0,politique:'lot-for-lot',taille_lot:1 },
      { parent:'Produit A',composant:'C',qte_par:1,niveau:1,type:'Acheté',  lead_time:2,stock_initial:50,stock_securite:0,politique:'lot-for-lot',taille_lot:1 },
      { parent:'B',        composant:'D',qte_par:1,niveau:2,type:'Acheté',  lead_time:1,stock_initial:30,stock_securite:0,politique:'lot-for-lot',taille_lot:1 },
      { parent:'B',        composant:'E',qte_par:2,niveau:2,type:'Acheté',  lead_time:1,stock_initial:60,stock_securite:0,politique:'lot-for-lot',taille_lot:1 },
      { parent:'C',        composant:'F',qte_par:3,niveau:2,type:'Acheté',  lead_time:1,stock_initial:30,stock_securite:0,politique:'lot-for-lot',taille_lot:1 },
    ],
    results: null,
  };

  /* ── MRP calculation for one article ─────────────────────── */
  function _mrpArticle(besoins_bruts, stock_initial, stock_securite, lead_time, politique, taille_lot, ordres_lances) {
    const n = besoins_bruts.length;
    const stock      = new Array(n).fill(0);
    const besoins_nets = new Array(n).fill(0);
    const ordres_fin   = new Array(n).fill(0);
    const ordres_debut = new Array(n + lead_time).fill(0);
    let stock_courant  = stock_initial;

    for (let t = 0; t < n; t++) {
      const recu = (t < ordres_lances.length ? ordres_lances[t] : 0) + ordres_fin[t];
      const dispo = stock_courant + recu;
      const bn    = besoins_bruts[t] + stock_securite - dispo;
      besoins_nets[t] = Math.max(0, bn);

      if (besoins_nets[t] > 0) {
        let qte;
        if (politique === 'lot-for-lot') {
          qte = besoins_nets[t];
        } else if (politique === 'lot-fixe') {
          qte = Math.max(besoins_nets[t], taille_lot);
          qte = Math.ceil(qte / taille_lot) * taille_lot;
        } else {
          qte = taille_lot > 0 ? Math.ceil(besoins_nets[t] / taille_lot) * taille_lot : besoins_nets[t];
        }
        ordres_fin[t] = qte;
        const idx = t - lead_time;
        if (idx >= 0 && idx < ordres_debut.length) ordres_debut[idx] += qte;
      }

      stock[t] = dispo + ordres_fin[t] - besoins_bruts[t];
      stock_courant = stock[t];
    }
    return {
      besoins_bruts,
      ordres_lances: ordres_lances.slice(0, n),
      besoins_nets,
      stock,
      ordres_fin,
      ordres_debut: ordres_debut.slice(0, n),
    };
  }

  function _parseFloats(str, n, def = 0) {
    let vals = str.replace(/;/g,',').split(',').map(s=>parseFloat(s.trim())).filter(v=>!isNaN(v));
    if (!vals.length) vals = [def];
    while (vals.length < n) vals.push(vals[vals.length-1]??def);
    return vals.slice(0, n);
  }

  /* ── BOM SVG tree ──────────────────────────────────────────── */
  function _renderBomSvg(pf_nom, bom, lt_pf, si_pf) {
    const children_map = {};
    const node_meta    = {};
    node_meta[pf_nom]  = { type:'Fabriqué', qte_par:null, lead_time:lt_pf, stock_initial:si_pf };

    const sorted = [...bom].sort((a,b)=>parseInt(a.nivel||a.niveau||1)-parseInt(b.nivel||b.niveau||1));
    for (const row of sorted) {
      const { composant, parent } = row;
      if (!children_map[parent]) children_map[parent] = [];
      if (!children_map[parent].includes(composant)) children_map[parent].push(composant);
      if (!node_meta[composant]) node_meta[composant] = { type:row.type, qte_par:row.qte_par, lead_time:row.lead_time, stock_initial:row.stock_initial };
    }

    // BFS levels
    const node_level = { [pf_nom]: 0 };
    const queue = [pf_nom];
    while (queue.length) {
      const node = queue.shift();
      for (const child of (children_map[node]||[])) {
        if (!(child in node_level)) { node_level[child] = node_level[node]+1; queue.push(child); }
      }
    }
    if (Object.keys(node_level).length <= 1 && !(children_map[pf_nom]?.length)) return '';
    const max_level = Math.max(...Object.values(node_level));

    const NODE_W=158, NODE_H=70, H_GAP=22, V_GAP=76, PAD=24;
    const node_cx = {};
    let counter = PAD;
    function assignCx(node) {
      const ch = (children_map[node]||[]).filter(c=>c in node_level);
      if (!ch.length) { node_cx[node]=counter+NODE_W/2; counter+=NODE_W+H_GAP; return; }
      ch.forEach(assignCx);
      node_cx[node] = Math.round((node_cx[ch[0]]+node_cx[ch[ch.length-1]])/2);
    }
    assignCx(pf_nom);

    const svg_w = Math.max(counter+PAD, NODE_W+2*PAD);
    const svg_h = (max_level+1)*(NODE_H+V_GAP)+PAD*2;

    let p = [`<div class="bom-wrap"><svg xmlns="http://www.w3.org/2000/svg" width="${svg_w}" height="${svg_h}" style="font-family:'Segoe UI',system-ui,Arial,sans-serif;display:block;margin:0 auto">`];

    // Connectors
    for (const [parent, children] of Object.entries(children_map)) {
      if (!(parent in node_cx)) continue;
      const ch = children.filter(c=>c in node_cx);
      if (!ch.length) continue;
      const px    = node_cx[parent];
      const py_bot= node_level[parent]*(NODE_H+V_GAP)+PAD+NODE_H;
      const mid_y = py_bot+V_GAP/2;
      p.push(`<line x1="${px}" y1="${py_bot}" x2="${px}" y2="${mid_y}" stroke="#94a3b8" stroke-width="1.8"/>`);
      const xs = ch.map(c=>node_cx[c]);
      if (xs.length>1) p.push(`<line x1="${Math.min(...xs)}" y1="${mid_y}" x2="${Math.max(...xs)}" y2="${mid_y}" stroke="#94a3b8" stroke-width="1.8"/>`);
      for (const c of ch) {
        const cy_top = node_level[c]*(NODE_H+V_GAP)+PAD;
        p.push(`<line x1="${node_cx[c]}" y1="${mid_y}" x2="${node_cx[c]}" y2="${cy_top}" stroke="#94a3b8" stroke-width="1.8"/>`);
      }
    }

    // Nodes
    for (const [node, lv] of Object.entries(node_level)) {
      if (!(node in node_cx)) continue;
      const cx=node_cx[node], x=cx-NODE_W/2, y=lv*(NODE_H+V_GAP)+PAD;
      const meta=node_meta[node]||{};
      const typ=meta.type||'Fabriqué', qte=meta.qte_par, lt=meta.lead_time||0, si=parseInt(meta.stock_initial||0);
      let bg,stroke,txt,sub,badge;
      if (lv===0)        { bg='#eef2ff';stroke='#4f46e5';txt='#1e1b4b';sub='#4f46e5';badge='Produit fini'; }
      else if(typ==='Fabriqué') { bg='#eff6ff';stroke='#2563eb';txt='#1e3a5f';sub='#3b82f6';badge='Fabriqué'; }
      else               { bg='#f0fdf4';stroke='#16a34a';txt='#14532d';sub='#16a34a';badge='Acheté'; }
      p.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="9" fill="${bg}" stroke="${stroke}" stroke-width="2"/>`);
      p.push(`<text x="${cx}" y="${y+22}" text-anchor="middle" font-size="13" font-weight="700" fill="${txt}">${node}</text>`);
      p.push(`<text x="${cx}" y="${y+37}" text-anchor="middle" font-size="10" fill="${sub}">${badge}</text>`);
      const details = [...(qte!=null?[`x${qte}`]:[]), `LT ${lt}`, `SI ${si}`].join('  ·  ');
      p.push(`<text x="${cx}" y="${y+53}" text-anchor="middle" font-size="9.5" fill="#64748b">${details}</text>`);
      p.push(`<text x="${x+NODE_W-5}" y="${y+12}" text-anchor="end" font-size="8.5" fill="${sub}" opacity="0.75">N${lv}</text>`);
    }

    p.push('</svg></div>');
    return p.join('');
  }

  /* ── Render ─────────────────────────────────────────────── */
  function render(container) {
    container.innerHTML = '';
    container.appendChild(Utils.backButton(() => App.navigate('home')));
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="module-header">
        <div class="module-title">📦 PDP – Plan Directeur de Production</div>
        <div class="module-caption">MRP multiniveau · Prévisions → Ordres de fabrication &amp; d'achat</div>
      </div>
      <div id="stocks-body"></div>
      <div class="credit-bar">Developed by Nabil Benkirane &nbsp;·&nbsp; Supervised by Prof. Faouzi Tayalati</div>`;
    container.appendChild(wrap);
    _renderBody();
  }

  function _renderBody() {
    const body = document.getElementById('stocks-body');
    const tabsEl = Utils.tabs({
      'pf':  { label:'📦 Produit & Prévisions', content: _buildPfTab() },
      'bom': { label:'🗂 Nomenclature (BOM)',   content: _buildBomTab() },
    });
    body.innerHTML = '';
    body.appendChild(tabsEl);

    const btnCalc = Utils.el('button','btn btn-primary btn-full');
    btnCalc.style.marginTop = '.75rem';
    btnCalc.textContent = '🚀 Lancer le calcul MRP';
    btnCalc.onclick = _calculate;
    body.appendChild(btnCalc);

    const resDiv = Utils.div('');
    resDiv.id = 'stocks-results';
    body.appendChild(resDiv);
    if (state.results) _renderResults();
  }

  function _buildPfTab() {
    const d = Utils.div('');
    d.innerHTML = `
      <div class="form-row" style="flex-wrap:wrap">
        <div class="form-group">
          <label>Produit fini</label>
          <input type="text" value="${state.produit_nom}" onchange="Stocks._pf('produit_nom',this.value)"/>
        </div>
        <div class="form-group">
          <label>Code produit</label>
          <input type="text" value="${state.produit_code}" onchange="Stocks._pf('produit_code',this.value)"/>
        </div>
        <div class="form-group">
          <label>Nb périodes</label>
          <input type="number" value="${state.n}" min="2" max="26" onchange="Stocks._pf('n',+this.value);Stocks._refreshBody()"/>
        </div>
        <div class="form-group">
          <label>Unité de temps</label>
          <select onchange="Stocks._pf('unite',this.value)">
            ${['Semaine','Mois','Jour','Trimestre'].map(u=>`<option ${state.unite===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Stock initial</label>
          <input type="number" value="${state.stock_pf}" min="0" onchange="Stocks._pf('stock_pf',+this.value)"/>
        </div>
        <div class="form-group">
          <label>Stock sécurité</label>
          <input type="number" value="${state.ss_pf}" min="0" onchange="Stocks._pf('ss_pf',+this.value)"/>
        </div>
        <div class="form-group">
          <label>Lead time</label>
          <input type="number" value="${state.lt_pf}" min="0" max="10" onchange="Stocks._pf('lt_pf',+this.value)"/>
        </div>
        <div class="form-group">
          <label>Politique lot</label>
          <select onchange="Stocks._pf('pol_pf',this.value)">
            ${['lot-for-lot','lot-fixe','multiple'].map(p=>`<option ${state.pol_pf===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        ${state.pol_pf !== 'lot-for-lot' ? `<div class="form-group"><label>Taille lot</label><input type="number" value="${state.lot_pf}" min="1" onchange="Stocks._pf('lot_pf',+this.value)"/></div>` : ''}
      </div>
      <div class="form-group">
        <label>Prévisions de ventes (${state.n} valeurs séparées par virgule)</label>
        <input type="text" value="${state.previsions}" placeholder="${Array(state.n).fill(50).join(',')}" onchange="Stocks._pf('previsions',this.value)"/>
      </div>`;
    return d;
  }

  function _buildBomTab() {
    const d = Utils.div('');
    const btnAdd = Utils.el('button','btn btn-secondary btn-sm');
    btnAdd.textContent = '➕ Ajouter composant';
    btnAdd.onclick = () => {
      state.bom.push({ parent:state.produit_nom, composant:`C${state.bom.length+1}`, qte_par:1, niveau:1, type:'Acheté', lead_time:1, stock_initial:0, stock_securite:0, politique:'lot-for-lot', taille_lot:1 });
      _renderBody();
    };
    d.appendChild(btnAdd);

    // Header
    const cols = ['Parent','Composant','Qté','Niv.','Type','LT','SI','SS','Politique',''];
    let html = `<div class="table-wrap" style="margin-top:.5rem"><table class="editable-table">
      <thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
    state.bom.forEach((row, i) => {
      html += `<tr>
        <td><input type="text" value="${row.parent}" onchange="Stocks._bomField(${i},'parent',this.value)"/></td>
        <td><input type="text" value="${row.composant}" onchange="Stocks._bomField(${i},'composant',this.value)"/></td>
        <td><input type="number" value="${row.qte_par}" min="1" style="width:55px" onchange="Stocks._bomField(${i},'qte_par',+this.value)"/></td>
        <td><input type="number" value="${row.niveau}" min="1" max="5" style="width:45px" onchange="Stocks._bomField(${i},'niveau',+this.value)"/></td>
        <td><select onchange="Stocks._bomField(${i},'type',this.value)">
          <option ${row.type==='Fabriqué'?'selected':''}>Fabriqué</option>
          <option ${row.type==='Acheté'?'selected':''}>Acheté</option>
        </select></td>
        <td><input type="number" value="${row.lead_time}" min="0" max="10" style="width:45px" onchange="Stocks._bomField(${i},'lead_time',+this.value)"/></td>
        <td><input type="number" value="${row.stock_initial}" min="0" onchange="Stocks._bomField(${i},'stock_initial',+this.value)"/></td>
        <td><input type="number" value="${row.stock_securite}" min="0" onchange="Stocks._bomField(${i},'stock_securite',+this.value)"/></td>
        <td><select onchange="Stocks._bomField(${i},'politique',this.value)">
          ${['lot-for-lot','lot-fixe','multiple'].map(p=>`<option ${row.politique===p?'selected':''}>${p}</option>`).join('')}
        </select></td>
        <td><button class="btn-icon" onclick="Stocks._removeBom(${i})">🗑</button></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    d.innerHTML += html;

    // BOM tree
    if (state.bom.length) {
      const treeDiv = Utils.div('');
      treeDiv.innerHTML = `<div style="margin-top:1rem"><b>📐 Structure hiérarchique</b></div>`;
      treeDiv.innerHTML += _renderBomSvg(state.produit_nom, state.bom, state.lt_pf, state.stock_pf) || '<p style="color:#64748b">Ajoutez des composants pour visualiser.</p>';
      d.appendChild(treeDiv);
    }
    return d;
  }

  /* ── Calculate MRP ─────────────────────────────────────────── */
  function _calculate() {
    const n = state.n;
    const previsions = _parseFloats(state.previsions, n, 50);

    const res_pf = _mrpArticle(previsions, state.stock_pf, state.ss_pf, state.lt_pf,
      state.pol_pf, state.lot_pf, new Array(n).fill(0));

    const resultats = {};
    resultats[state.produit_nom] = { res:res_pf, type:'Fabriqué', lead_time:state.lt_pf, stock_initial:state.stock_pf, politique:state.pol_pf };

    const ordres_debut_par = {};
    ordres_debut_par[state.produit_nom] = res_pf.ordres_debut;

    // Sort by level
    const levels = [...new Set(state.bom.map(b=>parseInt(b.niveau||1)))].sort((a,b)=>a-b);
    for (const niveau of levels) {
      for (const row of state.bom.filter(b=>parseInt(b.niveau||1)===niveau)) {
        const parent = row.parent;
        const comp   = row.composant;
        const qte    = parseInt(row.qte_par)||1;
        const parent_ord = ordres_debut_par[parent] || new Array(n).fill(0);
        const bb = parent_ord.map(v=>v*qte);
        const res = _mrpArticle(bb, parseFloat(row.stock_initial)||0, parseFloat(row.stock_securite)||0,
          parseInt(row.lead_time)||0, row.politique||'lot-for-lot', parseFloat(row.taille_lot)||1, new Array(n).fill(0));

        if (resultats[comp]) {
          const ex = ordres_debut_par[comp];
          ordres_debut_par[comp] = ex.map((v,t)=>v+(res.ordres_debut[t]||0));
          const ex_bb = resultats[comp].res.besoins_bruts;
          res.besoins_bruts = ex_bb.map((v,t)=>v+bb[t]);
        } else {
          ordres_debut_par[comp] = res.ordres_debut;
        }
        resultats[comp] = { res, type:row.type, lead_time:parseInt(row.lead_time)||0, stock_initial:parseFloat(row.stock_initial)||0, politique:row.politique };
      }
    }

    state.results = { resultats, n, unite:state.unite, previsions };
    _renderResults();
  }

  /* ── Render results ──────────────────────────────────────── */
  function _renderResults() {
    const el = document.getElementById('stocks-results');
    if (!el || !state.results) return;
    const { resultats, n, unite } = state.results;
    const pf = state.produit_nom;
    const periodes = Array.from({length:n},(_,t)=>`${unite} ${t+1}`);

    // KPIs
    const arts_fab = Object.entries(resultats).filter(([,v])=>v.type==='Fabriqué').map(([k])=>k);
    const arts_ach = Object.entries(resultats).filter(([,v])=>v.type==='Acheté').map(([k])=>k);
    const tot_fab  = Object.entries(resultats).filter(([,v])=>v.type==='Fabriqué').reduce((s,[,v])=>s+v.res.ordres_debut.reduce((a,b)=>a+b,0),0);
    const tot_ach  = Object.entries(resultats).filter(([,v])=>v.type==='Acheté').reduce((s,[,v])=>s+v.res.ordres_debut.reduce((a,b)=>a+b,0),0);
    const stock_moy = resultats[pf] ? resultats[pf].res.stock.reduce((s,v)=>s+Math.max(0,v),0)/n : 0;
    const taux_couv = resultats[pf] ? parseFloat((100*resultats[pf].res.besoins_nets.filter(v=>v===0).length/n).toFixed(0)) : 0;

    el.innerHTML = `<hr style="margin:1rem 0"/>
      <h3 style="margin-bottom:.75rem">📊 Résultats MRP</h3>
      <div class="metrics-grid metrics-grid-3">
        ${[
          {label:'Articles fabriqués', value:arts_fab.length},
          {label:'Articles achetés',   value:arts_ach.length},
          {label:'OF – Production',    value:Math.round(tot_fab)},
          {label:'OA – Achat',         value:Math.round(tot_ach)},
          {label:'Stock moyen PF',     value:stock_moy.toFixed(1)},
          {label:'Taux couverture',    value:`${taux_couv} %`},
        ].map(m=>`<div class="metric-card"><div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div></div>`).join('')}
      </div>
      <div class="alert alert-info" style="margin-top:.5rem">
        <b>À fabriquer :</b> ${arts_fab.join(', ')||'—'}  &nbsp;·&nbsp;
        <b>À approvisionner :</b> ${arts_ach.join(', ')||'—'}
      </div>`;

    // Tabs: MRP tables | Orders | Plan | Charts
    const mrpTabContent  = Utils.div('');
    const ordTabContent  = Utils.div('');
    const planTabContent = Utils.div('');
    const chrtTabContent = Utils.div('');

    // --- MRP Tables ---
    mrpTabContent.innerHTML = '';
    for (const [article, v] of Object.entries(resultats)) {
      const icon = v.type==='Fabriqué' ? '🏭' : '🛒';
      mrpTabContent.innerHTML += `<h4 style="margin:.75rem 0 .35rem">${icon} ${article} — ${v.type}</h4>`;
      mrpTabContent.innerHTML += _mrpTableHtml(article, v.res, n, unite, v.lead_time, v.stock_initial, v.politique);
    }

    // --- Orders ---
    const of_rows = [], oa_rows = [];
    for (const [art, v] of Object.entries(resultats)) {
      v.res.ordres_debut.forEach((q,t) => {
        if (q <= 0) return;
        const row = { Article:art, Lancement:t+1, Fin:t+1+v.lead_time, Quantite:Math.round(q) };
        if (v.type==='Fabriqué') of_rows.push(row);
        else oa_rows.push(row);
      });
    }
    of_rows.sort((a,b)=>a.Lancement-b.Lancement);
    oa_rows.sort((a,b)=>a.Lancement-b.Lancement);
    ordTabContent.innerHTML = `<div class="col-layout col-layout-eq" style="gap:1rem">
      <div>
        <h4 style="margin-bottom:.5rem">🔧 Ordres de fabrication (OF)</h4>
        ${of_rows.length ? Utils.resultsTable(of_rows,[
          {key:'Article',label:'Article'},{key:'Lancement',label:'Lancement'},{key:'Fin',label:'Fin'},{key:'Quantite',label:'Quantité'}
        ]) : Utils.alertBanner('info','Aucun ordre de fabrication.')}
      </div>
      <div>
        <h4 style="margin-bottom:.5rem">🛒 Ordres d\'achat (OA)</h4>
        ${oa_rows.length ? Utils.resultsTable(oa_rows,[
          {key:'Article',label:'Article'},{key:'Commande',label:'Commande',format:(_,r)=>r.Lancement},{key:'Livraison',label:'Livraison',format:(_,r)=>r.Fin},{key:'Quantite',label:'Quantité'}
        ]) : Utils.alertBanner('info','Aucun ordre d\'achat.')}
      </div>
    </div>`;

    // --- Plan consolidé ---
    let planHtml = '<div class="table-wrap"><table><thead><tr><th>Article</th>';
    periodes.forEach(p => planHtml += `<th>${p}</th>`);
    planHtml += '<th>TOTAL</th></tr></thead><tbody>';
    for (const [art, v] of Object.entries(resultats)) {
      const total = v.res.ordres_debut.reduce((s,q)=>s+q,0);
      planHtml += `<tr><td><b>${art}</b></td>`;
      v.res.ordres_debut.forEach(q => {
        planHtml += `<td style="${q>0?'background:#d4edda;font-weight:700':''}">
          ${Math.round(q)||0}</td>`;
      });
      planHtml += `<td><b>${Math.round(total)}</b></td></tr>`;
    }
    planHtml += '</tbody></table></div>';
    planTabContent.innerHTML = `<p style="font-size:.8rem;color:#64748b;margin-bottom:.5rem">🟢 Valeur &gt; 0 = ordre à lancer cette période</p>` + planHtml;

    // --- Charts ---
    chrtTabContent.innerHTML = `
      <div class="col-layout col-layout-eq" style="gap:1rem;margin-bottom:1rem">
        <div class="chart-wrap"><h4 style="margin-bottom:.4rem">Prévisions vs Ordres — ${pf}</h4>
          <canvas id="mrp-chart-pf" height="200"></canvas></div>
        <div class="chart-wrap"><h4 style="margin-bottom:.4rem">Stock projeté — ${pf}</h4>
          <canvas id="mrp-chart-stock" height="200"></canvas></div>
      </div>
      <div class="chart-wrap" style="margin-bottom:1rem"><h4 style="margin-bottom:.4rem">Charge totale par période</h4>
        <canvas id="mrp-chart-charge" height="200"></canvas></div>
      <div class="chart-wrap"><h4 style="margin-bottom:.4rem">Évolution stocks — tous articles</h4>
        <canvas id="mrp-chart-stocks-all" height="200"></canvas></div>`;

    // Assemble tabs
    const resultsTabsEl = Utils.tabs({
      'mrp':    { label:'📋 Tableaux MRP',     content: mrpTabContent },
      'orders': { label:'📦 Ordres',           content: ordTabContent },
      'plan':   { label:'📅 Plan consolidé',   content: planTabContent },
      'charts': { label:'📊 Graphiques',       content: chrtTabContent },
    });
    el.appendChild(resultsTabsEl);

    // Render charts (Chart.js)
    requestAnimationFrame(() => {
      const pf_res = resultats[pf]?.res;
      if (pf_res) {
        const ctx1 = document.getElementById('mrp-chart-pf')?.getContext('2d');
        if (ctx1) new Chart(ctx1, { type:'bar', data:{
          labels: periodes,
          datasets:[
            { label:'Besoins bruts', data:pf_res.besoins_bruts, backgroundColor:'rgba(79,70,229,.5)' },
            { label:'Ordres prévus', data:pf_res.ordres_debut,  backgroundColor:'rgba(16,185,129,.5)' },
          ]
        }, options:{ plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}} }});

        const ctx2 = document.getElementById('mrp-chart-stock')?.getContext('2d');
        if (ctx2) new Chart(ctx2, { type:'line', data:{
          labels: periodes,
          datasets:[
            { label:'Stock projeté', data:pf_res.stock,        borderColor:'#4f46e5', fill:false },
            { label:'Besoins nets',  data:pf_res.besoins_nets, borderColor:'#dc2626', fill:false },
          ]
        }, options:{ plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}} }});
      }

      const charge_fab = new Array(n).fill(0);
      const charge_ach = new Array(n).fill(0);
      for (const [,v] of Object.entries(resultats)) {
        v.res.ordres_debut.forEach((q,t) => {
          if (v.type==='Fabriqué') charge_fab[t]+=q;
          else charge_ach[t]+=q;
        });
      }
      const ctx3 = document.getElementById('mrp-chart-charge')?.getContext('2d');
      if (ctx3) new Chart(ctx3, { type:'bar', data:{
        labels: periodes,
        datasets:[
          { label:'🔧 Production', data:charge_fab, backgroundColor:'rgba(79,70,229,.6)' },
          { label:'🛒 Achat',      data:charge_ach, backgroundColor:'rgba(16,185,129,.6)' },
        ]
      }, options:{ plugins:{legend:{position:'top'}}, scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}} }});

      const datasets_all = Object.entries(resultats).map(([art,v],i) => ({
        label: art,
        data: v.res.stock,
        borderColor: Utils.COLORS[i%Utils.COLORS.length],
        fill: false,
      }));
      const ctx4 = document.getElementById('mrp-chart-stocks-all')?.getContext('2d');
      if (ctx4) new Chart(ctx4, { type:'line', data:{ labels:periodes, datasets:datasets_all },
        options:{ plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}} }});
    });
  }

  /* ── MRP table HTML ─────────────────────────────────────── */
  function _mrpTableHtml(article, res, n, unite, lead_time, stock_initial, politique) {
    const periodes = Array.from({length:n},(_,t)=>`${unite} ${t+1}`);
    const rows = {
      'Besoins bruts':       res.besoins_bruts,
      'Ordres lancés':       res.ordres_lances,
      'Besoins nets':        res.besoins_nets,
      'Stock projeté':       res.stock,
      'Ordre prévu (fin)':   res.ordres_fin,
      'Ordre prévu (début)': res.ordres_debut,
    };
    const ROW_STYLE = {
      'Ordre prévu (début)': (v) => v>0?'background:#d4edda;font-weight:bold;color:#155724':'',
      'Besoins nets':        (v) => v>0?'background:#fff3cd;color:#856404':'',
      'Stock projeté':       (v) => v<=0?'background:#f8d7da;color:#721c24;font-weight:bold':'',
      'Ordre prévu (fin)':   (v) => v>0?'background:#cce5ff;color:#004085':'',
    };

    let html = `<div class="table-wrap"><table style="font-size:.78rem"><thead>
      <tr><th>${article} | SI=${stock_initial} | LT=${lead_time} | ${politique}</th>
      ${periodes.map(p=>`<th>${p}</th>`).join('')}
      </tr></thead><tbody>`;
    for (const [label, vals] of Object.entries(rows)) {
      const styleFn = ROW_STYLE[label] || (()=>'');
      html += `<tr><td style="font-weight:600;white-space:nowrap">${label}</td>`;
      vals.forEach(v=>{ html+=`<td style="${styleFn(v)}">${Math.round(v)||0}</td>`; });
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  /* ── Edit helpers ────────────────────────────────────────── */
  function _pf(k,v) { state[k]=v; }
  function _bomField(i,k,v) { state.bom[i][k]=v; }
  function _removeBom(i) { state.bom.splice(i,1); _renderBody(); }
  function _refreshBody() { _renderBody(); }

  return { render, _pf, _bomField, _removeBom, _refreshBody };
})();
