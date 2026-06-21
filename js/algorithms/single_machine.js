/* =============================================================
   Single-Machine Scheduling Algorithms
   1 | β | γ  —  exact algorithms (polynomial)
   ============================================================= */

const SingleMachine = (() => {

  /* ── Sorting heuristics ─────────────────────────────────── */

  function spt(tasks) {
    return [...tasks].sort((a, b) => a.processing_time - b.processing_time);
  }

  function lpt(tasks) {
    return [...tasks].sort((a, b) => b.processing_time - a.processing_time);
  }

  function edd(tasks) {
    return [...tasks].sort((a, b) => {
      const da = a.due_time != null ? a.due_time : Infinity;
      const db = b.due_time != null ? b.due_time : Infinity;
      return da - db;
    });
  }

  function wspt(tasks) {
    return [...tasks].sort((a, b) => {
      const ra = (a.weight || 1) / a.processing_time;
      const rb = (b.weight || 1) / b.processing_time;
      return rb - ra;
    });
  }

  function fifo(tasks) {
    return [...tasks].sort((a, b) => (a.release_time || 0) - (b.release_time || 0));
  }

  // ATC – Apparent Tardiness Cost (heuristic for ΣTj)
  function atc(tasks, k = 2.0) {
    let time = 0;
    let remaining = tasks.map(t => ({ ...t }));
    let result = [];
    while (remaining.length > 0) {
      const avgP = remaining.reduce((s, t) => s + t.processing_time, 0) / remaining.length;
      const K = k * avgP;
      const scores = remaining.map(t => {
        const slack = Math.max(0, (t.due_time || 0) - time - t.processing_time);
        return {
          task: t,
          score: ((t.weight || 1) / t.processing_time) * Math.exp(-slack / (K || 1)),
        };
      });
      scores.sort((a, b) => b.score - a.score);
      result.push(scores[0].task);
      remaining = remaining.filter(t => t.id !== scores[0].task.id);
      time += scores[0].task.processing_time;
    }
    return result;
  }

  /* ── Moore-Hodgson: 1|dj|ΣUj ───────────────────────────── */
  function mooreHodgson(tasks) {
    let sorted = edd(tasks);
    let current_time = 0;
    let scheduled = [];
    let removed = [];

    for (const task of sorted) {
      scheduled.push({ ...task });
      current_time += task.processing_time;
      if (task.due_time != null && current_time > task.due_time) {
        // Remove the task with longest processing time from schedule
        let longestIdx = 0;
        for (let i = 1; i < scheduled.length; i++) {
          if (scheduled[i].processing_time > scheduled[longestIdx].processing_time) longestIdx = i;
        }
        current_time -= scheduled[longestIdx].processing_time;
        removed.push(scheduled.splice(longestIdx, 1)[0]);
      }
    }
    return [...scheduled, ...removed];
  }

  /* ── Preemptive SRPT: 1|pmtn|ΣCi ───────────────────────── */
  function srpt(tasks) {
    let rem = tasks.map(t => ({ ...t, remaining: t.processing_time }));
    let parts = [];
    let t = 0;
    let MAX_ITER = 1e6;

    while (rem.some(x => x.remaining > 1e-9) && MAX_ITER-- > 0) {
      const available = rem.filter(x => x.remaining > 1e-9 && (x.release_time || 0) <= t + 1e-9);
      if (!available.length) {
        t = Math.min(...rem.filter(x => x.remaining > 1e-9).map(x => x.release_time || 0));
        continue;
      }
      available.sort((a, b) => a.remaining - b.remaining);
      const cur = available[0];
      const nextArr = rem
        .filter(x => x.remaining > 1e-9 && (x.release_time || 0) > t + 1e-9)
        .map(x => x.release_time || 0);
      const nextEvt = nextArr.length ? Math.min(...nextArr) : Infinity;
      const dur = Math.min(cur.remaining, nextEvt - t);
      parts.push({ id: cur.id, machine: 0, start: round4(t), finish: round4(t + dur), processing_time: round4(dur), due_time: cur.due_time, weight: cur.weight || 1 });
      cur.remaining -= dur;
      t += dur;
    }
    return parts;
  }

  /* ── Preemptive EDF: 1|pmtn,dj|Lmax ────────────────────── */
  function edf(tasks) {
    let rem = tasks.map(t => ({ ...t, remaining: t.processing_time }));
    let parts = [];
    let t = 0;
    let MAX_ITER = 1e6;

    while (rem.some(x => x.remaining > 1e-9) && MAX_ITER-- > 0) {
      const available = rem.filter(x => x.remaining > 1e-9 && (x.release_time || 0) <= t + 1e-9);
      if (!available.length) {
        t = Math.min(...rem.filter(x => x.remaining > 1e-9).map(x => x.release_time || 0));
        continue;
      }
      available.sort((a, b) => (a.due_time || Infinity) - (b.due_time || Infinity));
      const cur = available[0];
      const nextArr = rem
        .filter(x => x.remaining > 1e-9 && (x.release_time || 0) > t + 1e-9)
        .map(x => x.release_time || 0);
      const nextEvt = nextArr.length ? Math.min(...nextArr) : Infinity;
      const nextDDL = available.length > 1 ? Infinity : Infinity; // simplified
      const dur = Math.min(cur.remaining, nextEvt - t, 1e8);
      parts.push({ id: cur.id, machine: 0, start: round4(t), finish: round4(t + dur), processing_time: round4(dur), due_time: cur.due_time, weight: cur.weight || 1 });
      cur.remaining -= dur;
      t += dur;
    }
    return parts;
  }

  /* ── Evaluate single-machine schedule ───────────────────── */
  function evaluate(ordered, preemptive_parts = null) {
    const data = preemptive_parts || _buildEvaluated(ordered);
    const indicators = _computeIndicators(data);
    return { evaluated: data, indicators };
  }

  function _buildEvaluated(ordered) {
    let time = 0;
    return ordered.map(task => {
      const start = Math.max(time, task.release_time || 0);
      const finish = start + task.processing_time;
      time = finish;
      const due = task.due_time;
      const tardiness = due != null ? Math.max(0, finish - due) : 0;
      return { ...task, start: round4(start), finish: round4(finish), tardiness: round4(tardiness), machine: 0 };
    });
  }

  function _computeIndicators(ev) {
    let cmax = 0, sum_ci = 0, sum_wci = 0, lmax = null, sum_tj = 0, sum_uj = 0;
    for (const t of ev) {
      cmax = Math.max(cmax, t.finish);
      sum_ci += t.finish;
      sum_wci += (t.weight || 1) * t.finish;
      if (t.due_time != null) {
        const lat = t.finish - t.due_time;
        lmax = lmax == null ? lat : Math.max(lmax, lat);
        sum_tj += Math.max(0, lat);
        sum_uj += lat > 1e-9 ? 1 : 0;
      }
    }
    return {
      'Cmax':  round2(cmax),
      'ΣCi':   round2(sum_ci),
      'ΣwCi':  round2(sum_wci),
      'Lmax':  lmax != null ? round2(lmax) : null,
      'ΣTj':   round2(sum_tj),
      'ΣUj':   sum_uj,
    };
  }

  /* ── Main solver entry point ────────────────────────────── */
  function solve(tasks, beta, gamma) {
    const betaSet = new Set(beta || []);
    const pmtn = betaSet.has('pmtn');
    const hasRj = betaSet.has('rj');
    const hasDj = betaSet.has('dj');
    const hasWj = betaSet.has('wj');
    const hasPrec = betaSet.has('prec');

    // Apply precedence constraints (topological sort)
    let ordered;
    if (hasPrec) {
      ordered = _topoSort(tasks);
    } else if (pmtn) {
      if (gamma === 'ΣCi') {
        const parts = srpt(tasks);
        return evaluate(tasks, parts);
      } else if (gamma === 'Lmax') {
        const parts = edf(tasks);
        return evaluate(tasks, parts);
      }
      // fallback
      const parts = srpt(tasks);
      return evaluate(tasks, parts);
    } else {
      // Non-preemptive
      if (gamma === 'Cmax') {
        ordered = hasRj ? fifo(tasks) : spt(tasks);
      } else if (gamma === 'ΣCi') {
        ordered = spt(tasks);
      } else if (gamma === 'ΣwCi') {
        ordered = wspt(tasks);
      } else if (gamma === 'Lmax') {
        ordered = edd(tasks);
      } else if (gamma === 'ΣTj') {
        // EDD is optimal for some, use ATC as better heuristic
        ordered = hasDj ? atc(tasks) : spt(tasks);
      } else if (gamma === 'ΣUj') {
        ordered = mooreHodgson(tasks);
      } else {
        ordered = spt(tasks);
      }
    }

    const ev = _buildEvaluated(ordered);
    const ind = _computeIndicators(ev);
    return {
      evaluated: ev,
      indicators: ind,
      algorithm: _algoName(beta, gamma, pmtn),
    };
  }

  function _algoName(beta, gamma, pmtn) {
    if (pmtn && gamma === 'ΣCi') return 'SRPT (préemptif)';
    if (pmtn && gamma === 'Lmax') return 'EDF (préemptif)';
    const map = {
      'Cmax': 'SPT / FIFO',
      'ΣCi':  'SPT (Shortest Processing Time)',
      'ΣwCi': 'WSPT (Weighted SPT)',
      'Lmax': 'EDD (Earliest Due Date)',
      'ΣTj':  'ATC (Apparent Tardiness Cost)',
      'ΣUj':  'Moore-Hodgson',
    };
    return map[gamma] || 'SPT';
  }

  function _topoSort(tasks) {
    const map = {};
    tasks.forEach(t => map[t.id] = t);
    const visited = new Set(), result = [];
    function visit(id) {
      if (visited.has(id)) return;
      visited.add(id);
      const task = map[id];
      const preds = task.precedence ? String(task.precedence).split(',').map(s => s.trim()).filter(Boolean) : [];
      preds.forEach(p => { if (map[p]) visit(p); });
      result.push(task);
    }
    tasks.forEach(t => visit(t.id));
    return result;
  }

  /* ── helpers ────────────────────────────────────────────── */
  function round2(v) { return Math.round(v * 100) / 100; }
  function round4(v) { return Math.round(v * 10000) / 10000; }

  return { solve, spt, lpt, edd, wspt, fifo, mooreHodgson, evaluate };
})();
