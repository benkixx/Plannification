/* =============================================================
   Flow-Shop Scheduling Algorithms
   Fm | | γ
   ============================================================= */

const FlowShop = (() => {

  function round2(v) { return Math.round(v * 100) / 100; }
  function round4(v) { return Math.round(v * 10000) / 10000; }

  /* ── Compute completion matrix ───────────────────────────── */
  function _completionMatrix(seq, m) {
    const n = seq.length;
    const C = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < m; k++) {
        const prevJob  = j > 0 ? C[j - 1][k] : 0;
        const prevMach = k > 0 ? C[j][k - 1] : 0;
        C[j][k] = Math.max(prevJob, prevMach) + (seq[j].processing_times[k] || 0);
      }
    }
    return C;
  }

  /* ── Evaluate a sequence and return operation records ──── */
  function evalSequence(seq, m) {
    if (!seq.length) return [];
    const C = _completionMatrix(seq, m);
    const ev = [];
    for (let j = 0; j < seq.length; j++) {
      for (let k = 0; k < m; k++) {
        const finish = C[j][k];
        const start  = finish - (seq[j].processing_times[k] || 0);
        const due    = seq[j].due_time;
        ev.push({
          id: seq[j].id,
          machine: k,
          start:  round4(start),
          finish: round4(finish),
          processing_time: round4(seq[j].processing_times[k] || 0),
          due_time: due,
          weight: seq[j].weight || 1,
          tardiness: (due != null && k === m - 1) ? round4(Math.max(0, finish - due)) : 0,
        });
      }
    }
    return ev;
  }

  /* ── Cmax for a candidate sequence ─────────────────────── */
  function cmax(seq, m) {
    if (!seq.length) return 0;
    const C = _completionMatrix(seq, m);
    return C[seq.length - 1][m - 1];
  }

  /* ── NEH heuristic (Fm || Cmax, widely used) ────────────── */
  function neh(jobs, m) {
    if (!jobs.length) return [];
    const sorted = [...jobs].sort((a, b) => {
      const ta = (a.processing_times || []).reduce((s, t) => s + t, 0);
      const tb = (b.processing_times || []).reduce((s, t) => s + t, 0);
      return tb - ta;
    });

    let seq = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      let best_pos = 0, best_cmax = Infinity;
      for (let pos = 0; pos <= seq.length; pos++) {
        const candidate = [...seq.slice(0, pos), sorted[i], ...seq.slice(pos)];
        const c = cmax(candidate, m);
        if (c < best_cmax) { best_cmax = c; best_pos = pos; }
      }
      seq.splice(best_pos, 0, sorted[i]);
    }
    return evalSequence(seq, m);
  }

  /* ── Johnson's algorithm for F2||Cmax ───────────────────── */
  function johnson(jobs) {
    const g1 = jobs.filter(j => j.processing_times[0] <= j.processing_times[1]);
    const g2 = jobs.filter(j => j.processing_times[0] > j.processing_times[1]);
    g1.sort((a, b) => a.processing_times[0] - b.processing_times[0]);
    g2.sort((a, b) => b.processing_times[1] - a.processing_times[1]);
    return evalSequence([...g1, ...g2], 2);
  }

  /* ── EDD order for Fm|dj|Lmax / ΣTj ───────────────────── */
  function eddFlow(jobs, m) {
    const sorted = [...jobs].sort((a, b) => {
      const da = a.due_time != null ? a.due_time : Infinity;
      const db = b.due_time != null ? b.due_time : Infinity;
      return da - db;
    });
    return evalSequence(sorted, m);
  }

  /* ── Indicators for a list of operation records ─────────── */
  function indicators(ev, m) {
    if (!ev.length) return { 'Cmax': 0, 'ΣCi': 0, 'ΣwCi': 0, 'ΣTj': 0, 'ΣUj': 0, 'Lmax': null };
    const cmax_val = Math.max(...ev.map(t => t.finish));
    // Completion of each job = max finish across all machines
    const job_finish = {};
    const job_due    = {};
    const job_weight = {};
    for (const op of ev) {
      job_finish[op.id] = Math.max(job_finish[op.id] || 0, op.finish);
      if (op.due_time != null) job_due[op.id] = op.due_time;
      job_weight[op.id] = op.weight || 1;
    }
    let sum_ci = 0, sum_wci = 0, lmax = null, sum_tj = 0, sum_uj = 0;
    for (const [id, fin] of Object.entries(job_finish)) {
      sum_ci  += fin;
      sum_wci += (job_weight[id] || 1) * fin;
      if (job_due[id] != null) {
        const lat = fin - job_due[id];
        lmax = lmax == null ? lat : Math.max(lmax, lat);
        sum_tj += Math.max(0, lat);
        sum_uj += lat > 1e-9 ? 1 : 0;
      }
    }
    return {
      'Cmax':  round2(cmax_val),
      'ΣCi':   round2(sum_ci),
      'ΣwCi':  round2(sum_wci),
      'Lmax':  lmax != null ? round2(lmax) : null,
      'ΣTj':   round2(sum_tj),
      'ΣUj':   sum_uj,
    };
  }

  /* ── Main solver ────────────────────────────────────────── */
  function solve(jobs, m, beta, gamma) {
    if (!jobs.length) return { evaluated: [], indicators: {}, algorithm: '' };
    let ev, algo;

    if (m === 2) {
      ev = johnson(jobs);
      algo = "Johnson's Algorithm (F2)";
    } else if (gamma === 'Lmax' || gamma === 'ΣTj') {
      ev = eddFlow(jobs, m);
      algo = 'EDD Flow Shop';
    } else {
      ev = neh(jobs, m);
      algo = `NEH Heuristic (F${m})`;
    }

    return { evaluated: ev, indicators: indicators(ev, m), algorithm: algo };
  }

  return { solve, neh, johnson, eddFlow, evalSequence, indicators };
})();
