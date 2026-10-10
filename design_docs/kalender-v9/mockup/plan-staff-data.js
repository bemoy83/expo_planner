(function () {
  const EP = window.EP, D = EP.DAYS, N = D.length, HPD = EP.SETTINGS.hoursPerDay;
  const S = 420, E = 900, L0 = 660, L1 = 690, T0 = 300, T1 = 1320;
  const we = i => D[i].type !== 'Arbeidsdag';
  const COMPS = [
    { id: 'Vegger', short: 'VEG', color: 'var(--line-blue)' },
    { id: 'Tepper', short: 'TEP', color: 'var(--line-teal)' },
    { id: 'Elektro', short: 'ELE', color: 'var(--line-amber)' },
    { id: 'Møbler', short: 'MØB', color: 'var(--line-green)' },
    { id: 'Rigg', short: 'RIG', color: 'var(--line-violet)' }
  ];
  const PP = [['Anders Berg', 'Vegger Rigg'], ['Bjørn Dahl', 'Vegger Tepper'], ['Camilla Eide', 'Møbler Tepper'], ['Daniel Fjeld', 'Vegger Elektro'], ['Eirik Haug', 'Vegger'], ['Frida Holm', 'Elektro Møbler'], ['Geir Isaksen', 'Rigg Vegger'], ['Hanne Johansen', 'Tepper Møbler'], ['Ivar Karlsen', 'Vegger Rigg'], ['Jonas Lie', 'Elektro'], ['Kari Moen', 'Tepper Vegger'], ['Lars Nilsen', 'Vegger'], ['Mona Olsen', 'Møbler Elektro'], ['Nils Pedersen', 'Vegger Tepper Rigg'], ['Ola Rønning', 'Rigg'], ['Per Solberg', 'Vegger Elektro'], ['Rune Strand', 'Tepper'], ['Siri Tangen', 'Møbler Vegger'], ['Tor Vik', 'Vegger Rigg'], ['Ulrik Aas', 'Elektro Vegger']];
  const PEOPLE = PP.map(([name, c], i) => ({ id: 'p' + (i + 1), name, comps: c.split(' ') }));
  const EXC = { p8: { 16: 'Ferie', 17: 'Ferie', 18: 'Ferie' }, p4: { 3: 'Kurs' }, p11: { 9: 'Kurs' } };
  const baseAvail = (pid, i) => we(i) ? { we: true } : EXC[pid] && EXC[pid][i] ? { off: EXC[pid][i] } : { s: S, e: E };
  const hrs = (s, e) => Math.max(0, e - s - Math.max(0, Math.min(e, L1) - Math.max(s, L0))) / 60;
  const otH = (b, isWe) => isWe ? hrs(b.s, b.e) : hrs(b.s, Math.min(b.e, S)) + hrs(Math.max(b.s, E), b.e);
  const fmtH = h => { const r = Math.round(h * 10) / 10; return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',').replace('-', '−'); };
  const fmtT = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  function freeIv(w, bl) {
    if (!w || w.s == null) return [];
    const out = []; let c = w.s;
    bl.slice().sort((a, b) => a.s - b.s).forEach(x => { if (x.e <= w.s || x.s >= w.e) return; if (x.s > c) out.push([c, Math.min(x.s, w.e)]); c = Math.max(c, x.e); });
    if (c < w.e) out.push([c, w.e]);
    return out.filter(([a, z]) => z - a >= 15 && hrs(a, z) > 0);
  }
  const freeH = (w, bl) => freeIv(w, bl).reduce((a, [s, e]) => a + hrs(s, e), 0);
  function merge(bl) {
    const g = {}; bl.forEach(x => { (g[x.pid + '|' + x.day] = g[x.pid + '|' + x.day] || []).push(x); });
    const out = [];
    Object.values(g).forEach(a => { a.sort((x, y) => x.s - y.s); let cur = null; a.forEach(x => { if (cur && cur.comp === x.comp && cur.proj === x.proj && x.s <= cur.e) cur.e = Math.max(cur.e, x.e); else { cur = { ...x }; out.push(cur); } }); });
    return out;
  }
  // hours of demand per competence per day, from Kalender rows (FTE × 7,5). projectNo narrows to one project.
  function demand(rows, projectNo) {
    const m = Object.fromEntries(COMPS.map(c => [c.id, D.map(() => 0)]));
    rows.forEach(r => { if (projectNo && r.projectNo !== projectNo) return; if (!m[r.competence]) return; Object.entries(r.fte).forEach(([i, v]) => { m[r.competence][i] += v * HPD; }); });
    return m;
  }
  function assigned(blocks, sick, projectNo) {
    const m = Object.fromEntries(COMPS.map(c => [c.id, D.map(() => 0)]));
    blocks.forEach(b => { if (sick[b.pid + '|' + b.day]) return; if (projectNo && b.proj !== projectNo) return; m[b.comp][b.day] += hrs(b.s, b.e); });
    return m;
  }
  const topProj = {};
  EP.ROWS.forEach(r => Object.entries(r.fte).forEach(([i, v]) => { const k = r.competence + '|' + i; if (!topProj[k] || topProj[k].v < v) topProj[k] = { no: r.projectNo, v }; }));
  const dem0 = demand(EP.ROWS);
  let n = 0; const SEED = [];
  const add = (pid, day, comp, s, e, proj) => SEED.push({ id: 's' + (++n), pid, day, comp, s, e, proj });
  for (let d = 0; d < 21; d++) {
    if (we(d)) continue;
    const rem = Object.fromEntries(COMPS.map(c => [c.id, dem0[c.id][d] * (d < 8 ? 0.95 : 0.7)]));
    PEOPLE.map((p, k) => PEOPLE[(k * 7 + d * 3) % PEOPLE.length]).forEach(p => {
      if (baseAvail(p.id, d).off) return;
      const pick = () => p.comps.slice().sort((a, b) => rem[b] - rem[a])[0];
      let c = pick(); if (rem[c] <= 0.5) return;
      const pr = c2 => (topProj[c2 + '|' + d] || {}).no;
      if (rem[c] >= HPD) { add(p.id, d, c, S, E, pr(c)); rem[c] -= HPD; return; }
      add(p.id, d, c, S, L0, pr(c)); rem[c] -= 4; c = pick();
      if (rem[c] > 0.5) { add(p.id, d, c, L1, E, pr(c)); rem[c] -= 3.5; }
    });
  }
  add('p1', 2, 'Vegger', E, 1020, '26970');
  // Hired: anonymous crews (count per day) feed Kalender «Innleid»; named hired people are Persons with kind 'hired'
  const CREWS = [
    { id: 'c1', supplier: 'Manpower', comp: 'Vegger', counts: { 3: 3, 4: 3, 7: 4, 8: 4, 14: 4, 15: 4 } },
    { id: 'c2', supplier: 'Adecco', comp: 'Tepper', counts: { 14: 2, 15: 2 } }
  ];
  const HIRED_SEED = [{ id: 'h1', name: 'Kim Larsen', comps: ['Vegger'], kind: 'hired', supplier: 'Manpower', fromCrew: 'c1' }];
  add('h1', 3, 'Vegger', S, E, '26970'); add('h1', 4, 'Vegger', S, E, '26970');
  window.PS = { COMPS, PEOPLE, CREWS, HIRED_SEED, SEED: merge(SEED), baseAvail, hrs, otH, fmtH, fmtT, freeIv, freeH, merge, demand, assigned, we, S, E, L0, L1, T0, T1 };
})();
