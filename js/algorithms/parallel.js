/* =============================================================
   Parallel-Machine Scheduling Algorithms
   Pm | β | γ  and  Qm | β | γ
   ============================================================= */

const ParallelMachine = (() => {

  /* ── Helpers ────────────────────────────────────────────── */
  function round2(v) { return Math.round(v * 100) / 100; }
  function round4(v) { return Math.round(v * 10000) / 10000; }
  function minIdx(arr) { return arr.indexOf(Math.min(...arr)); }

  /* ── LPT — List Scheduling for Pm||Cmax ────────────────── */
  function lpt(tasks, m) {
    const sorted = [...tasks].sort((a, b) => b.processing_time - a.processing_time);
    return _assign(sorted, m);
  }

  /* ── SPT — for Pm||ΣCi ──────────────────────────────────── */
  function sptParallel(tasks, m) {
    const sorted = [...tasks].sort((a, b) => a.processing_time - b.processing_time);
    return _assign(sorted, m);
  }

  /* ── WSPT — for Pm||ΣwCi ────────────────────────────────── */
  function wsptParallel(tasks, m) {
    const sorted = [...tasks].sort((a, b) => {
      const ra = (a.weight || 1) / a.processing_time;
      const rb = (b.weight || 1) / b.processing_time;
      return rb - ra;
    });
    return _assign(sorted, m);
  }

  /* ── Preemptive McNaughton: Pm|pmtn|Cmax ────────────────── */
  function mcnaughton(tasks, m) {
    const total = tasks.reduce((s, t) => s + t.processing_time, 0);
    const cmax = Math.max(total / m, Math.max(...tasks.map(t => t.processing_time)));
    let ev = [];
    let slot_start = new Array(m).fill(0);
    let slot_machine = 0;
    let cur_pos = 0;

    const sorted = [...tasks].sort((a, b) => b.processing_time - a.processing_time);

    for (const task of sorted) {
      let rem = task.processing_time;
      while (rem > 1e-9) {
        const avail = cmax - cur_pos;
        const chunk = Math.min(rem, avail);
        ev.push({ id: task.id, machine: slot_machine, start: round4(cur_pos), finish: round4(cur_pos + chunk), processing_time: round4(chunk), due_time: task.due_time, weight: task.weight || 1 });
        rem -= chunk;
        cur_pos += chunk;
        if (Math.abs(cur_pos - cmax) < 1e-9 && rem > 1e-9) {
          slot_machine = (slot_machine + 1) % m;
          cur_pos = 0;
        }
      }
    }
    return ev;
  }

  /* ── Common assignment loop ─────────────────────────────── */
  function _assign(sorted, m) {
    const machine_ready = new Array(m).fill(0);
    return sorted.map(task => {
      const best = minIdx(machine_ready);
      const start = Math.max(machine_ready[best], task.release_time || 0);
      const finish = start + task.processing_time;
      machine_ready[best] = finish;
      const due = task.due_time;
      const tardiness = due != null ? round4(Math.max(0, finish - due)) : 0;
      return { ...task, machine: best, start: round4(start), finish: round4(finish), tardiness };
    });
  }

  /* ── Uniform machines Qm (varying speed) ────────────────── */
  // For simplicity, Qm with speeds uses weighted LPT
  function qmLPT(tasks, speeds) {
    const m = speeds.length;
    const machine_ready = new Array(m).fill(0);
    const sorted = [...tasks].sort((a, b) => b.processing_time - a.processing_time);
    return sorted.map(task => {
      // Choose machine minimizing finish time
      let best = 0, bestFinish = Infinity;
      for (let i = 0; i < m; i++) {
        const eff = task.processing_time / (speeds[i] || 1);
        const start = Math.max(machine_ready[i], task.release_time || 0);
        const fin = start + eff;
        if (fin < bestFinish) { bestFinish = fin; best = i; }
      }
      const eff = task.processing_time / (speeds[best] || 1);
      const start = Math.max(machine_ready[best], task.release_time || 0);
      const finish = start + eff;
      machine_ready[best] = finish;
      const due = task.due_time;
      const tardiness = due != null ? round4(Math.max(0, finish - due)) : 0;
      return { ...task, machine: best, start: round4(start), finish: round4(finish), tardiness };
    });
  }

  /* ── Evaluate parallel schedule ─────────────────────────── */
  function evaluate(ev) {
    if (!ev.length) return { 'Cmax': 0, 'ΣCi': 0, 'ΣwCi': 0, 'ΣTj': 0, 'ΣUj': 0 };
    const cmax  = Math.max(...ev.map(t => t.finish));
    const sum_ci  = ev.reduce((s, t) => s + t.finish, 0);
    const sum_wci = ev.reduce((s, t) => s + (t.weight || 1) * t.finish, 0);
    const sum_tj  = ev.reduce((s, t) => s + (t.tardiness || 0), 0);
    const sum_uj  = ev.filter(t => (t.tardiness || 0) > 1e-9).length;
    return {
      'Cmax':  round2(cmax),
      'ΣCi':   round2(sum_ci),
      'ΣwCi':  round2(sum_wci),
      'ΣTj':   round2(sum_tj),
      'ΣUj':   sum_uj,
    };
  }

  /* ── Main solver ────────────────────────────────────────── */
  function solve(tasks, m, beta, gamma, speeds = null) {
    const betaSet = new Set(beta || []);
    const pmtn = betaSet.has('pmtn');
    let ev, algo;

    if (pmtn) {
      ev = mcnaughton(tasks, m);
      algo = 'McNaughton (préemptif)';
    } else if (speeds && speeds.length === m) {
      ev = qmLPT(tasks, speeds);
      algo = 'LPT uniforme (Qm)';
    } else if (gamma === 'ΣCi') {
      ev = sptParallel(tasks, m);
      algo = 'SPT parallèle';
    } else if (gamma === 'ΣwCi') {
      ev = wsptParallel(tasks, m);
      algo = 'WSPT parallèle';
    } else {
      ev = lpt(tasks, m);
      algo = 'LPT (List Scheduling)';
    }

    return { evaluated: ev, indicators: evaluate(ev), algorithm: algo };
  }

  return { solve, lpt, sptParallel, wsptParallel, mcnaughton, evaluate };
})();
