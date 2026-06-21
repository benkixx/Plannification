/* =============================================================
   Job-Shop Scheduling Algorithms
   Jm | | Cmax  — Giffler-Thompson dispatching
   ============================================================= */

const JobShop = (() => {

  function round2(v) { return Math.round(v * 100) / 100; }
  function round4(v) { return Math.round(v * 10000) / 10000; }

  /* ── Giffler-Thompson with dispatching rule ─────────────── */
  function gifflerThompson(jobs, m, rule = 'SPT') {
    // Build operation list
    let all_ops = [];
    for (const job of jobs) {
      const ops = job.operations || [];
      for (const op of ops) {
        const mach_str = String(op.machine || 'M1');
        const mach_idx = Math.max(0, parseInt(mach_str.replace(/\D/g, ''), 10) - 1);
        all_ops.push({
          job_id: job.id,
          op_label: op.label || op.operation_id || `O${op.order}`,
          machine: mach_idx,
          processing_time: parseFloat(op.processing_time || op.duration || 0),
          order: parseInt(op.order, 10),
          due_time: job.due_time,
          weight: job.weight || 1,
        });
      }
    }

    // Sort ops per job by order
    const job_queues = {};
    for (const op of all_ops) {
      if (!job_queues[op.job_id]) job_queues[op.job_id] = [];
      job_queues[op.job_id].push(op);
    }
    for (const jid of Object.keys(job_queues)) {
      job_queues[jid].sort((a, b) => a.order - b.order);
    }

    const machine_ready = new Array(m).fill(0);
    const job_ready     = {};
    for (const jid of Object.keys(job_queues)) job_ready[jid] = 0;

    const remaining = {};
    for (const [jid, ops] of Object.entries(job_queues)) {
      remaining[jid] = [...ops];
    }

    const scheduled = [];
    let MAX_ITER = 100000;

    while (Object.values(remaining).some(q => q.length > 0) && MAX_ITER-- > 0) {
      // Collect schedulable ops (first of each non-empty queue)
      const schedulable = [];
      for (const [jid, queue] of Object.entries(remaining)) {
        if (!queue.length) continue;
        const op = queue[0];
        const ready = Math.max(machine_ready[op.machine] || 0, job_ready[jid] || 0);
        schedulable.push({ ...op, job_id: jid, ready_time: ready, finish_if_selected: ready + op.processing_time });
      }
      if (!schedulable.length) break;

      // Find sigma* = min finish time across all schedulable ops
      const sigma_star = Math.min(...schedulable.map(o => o.finish_if_selected));

      // Conflict set: ops on the machine that achieves sigma*, with ready < sigma*
      const min_mach = schedulable.find(o => o.finish_if_selected === sigma_star)?.machine ?? 0;
      const conflicts = schedulable.filter(o => o.machine === min_mach && o.ready_time < sigma_star);
      const pool = conflicts.length ? conflicts : schedulable;

      // Apply dispatching rule
      if (rule === 'SPT') {
        pool.sort((a, b) => a.processing_time - b.processing_time);
      } else if (rule === 'EDD') {
        pool.sort((a, b) => (a.due_time ?? Infinity) - (b.due_time ?? Infinity));
      } else if (rule === 'LPT') {
        pool.sort((a, b) => b.processing_time - a.processing_time);
      } else if (rule === 'WSPT') {
        pool.sort((a, b) => {
          const ra = (a.weight || 1) / a.processing_time;
          const rb = (b.weight || 1) / b.processing_time;
          return rb - ra;
        });
      } else if (rule === 'FIFO') {
        // keep original order
      }

      const sel = pool[0];
      const start  = Math.max(machine_ready[sel.machine] || 0, job_ready[sel.job_id] || 0);
      const finish = start + sel.processing_time;
      machine_ready[sel.machine] = finish;
      job_ready[sel.job_id]      = finish;
      remaining[sel.job_id].shift();

      scheduled.push({
        id: sel.job_id,
        machine: sel.machine,
        operation: sel.order,
        op_label: sel.op_label,
        start:  round4(start),
        finish: round4(finish),
        processing_time: round4(sel.processing_time),
        due_time: sel.due_time,
        weight: sel.weight || 1,
        tardiness: sel.due_time != null ? round4(Math.max(0, finish - sel.due_time)) : 0,
      });
    }

    return scheduled;
  }

  /* ── Jackson's algorithm for J2||Cmax ───────────────────── */
  function jackson(jobs) {
    // Group operations by routing
    // A: only machine 1 | B: only machine 2 | AB: 1 then 2 | BA: 2 then 1
    const A  = jobs.filter(j => j.operations.length === 1 && j.operations[0].machine === 'M1');
    const B  = jobs.filter(j => j.operations.length === 1 && j.operations[0].machine === 'M2');
    const AB = jobs.filter(j => j.operations.length >= 2 &&
      parseInt(j.operations[0].machine.replace('M','')) === 1);
    const BA = jobs.filter(j => j.operations.length >= 2 &&
      parseInt(j.operations[0].machine.replace('M','')) === 2);

    // Sort AB by p_1j ascending, BA by p_2j ascending
    AB.sort((a, b) => a.operations[0].processing_time - b.operations[0].processing_time);
    BA.sort((a, b) => a.operations[1].processing_time - b.operations[1].processing_time);

    return gifflerThompson([...AB, ...BA, ...A, ...B], 2, 'FIFO');
  }

  /* ── Evaluate job-shop schedule ─────────────────────────── */
  function evaluate(ev) {
    if (!ev.length) return { 'Cmax': 0, 'ΣCi': 0, 'ΣwCi': 0, 'ΣTj': 0, 'ΣUj': 0 };
    // Job completion = max finish across all operations of that job
    const job_finish = {}, job_due = {}, job_weight = {};
    for (const op of ev) {
      job_finish[op.id] = Math.max(job_finish[op.id] || 0, op.finish);
      if (op.due_time != null) job_due[op.id] = op.due_time;
      job_weight[op.id] = op.weight || 1;
    }
    const cmax_val = Math.max(...Object.values(job_finish));
    let sum_ci = 0, sum_wci = 0, sum_tj = 0, sum_uj = 0;
    for (const [id, fin] of Object.entries(job_finish)) {
      sum_ci  += fin;
      sum_wci += (job_weight[id] || 1) * fin;
      if (job_due[id] != null) {
        const tard = Math.max(0, fin - job_due[id]);
        sum_tj += tard;
        if (tard > 1e-9) sum_uj++;
      }
    }
    return {
      'Cmax':  round2(cmax_val),
      'ΣCi':   round2(sum_ci),
      'ΣwCi':  round2(sum_wci),
      'ΣTj':   round2(sum_tj),
      'ΣUj':   sum_uj,
    };
  }

  /* ── Main solver ────────────────────────────────────────── */
  function solve(jobs, m, beta, gamma, rule = 'SPT') {
    if (!jobs || !jobs.length) return { evaluated: [], indicators: {}, algorithm: '' };
    const ev = gifflerThompson(jobs, m, rule);
    return {
      evaluated: ev,
      indicators: evaluate(ev),
      algorithm: `Giffler-Thompson (${rule})`,
    };
  }

  return { solve, gifflerThompson, jackson, evaluate };
})();
