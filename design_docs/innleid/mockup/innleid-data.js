(function () {
  const DAYS = [['man', 5], ['tir', 6], ['ons', 7], ['tor', 8], ['fre', 9], ['lør', 10], ['søn', 11], ['man', 12], ['tir', 13], ['ons', 14], ['tor', 15], ['fre', 16]].map(([wd, d], i) => ({ wd, d, wk: i < 7 ? 41 : 42, we: wd === 'lør' || wd === 'søn' }));
  const COMPS = [
    { id: 'Vegger', short: 'VEG', color: 'var(--line-blue)' }, { id: 'Tepper', short: 'TEP', color: 'var(--line-teal)' }, { id: 'Elektro', short: 'ELE', color: 'var(--line-amber)' },
    { id: 'Møbler', short: 'MØB', color: 'var(--line-green)' }, { id: 'Rigg', short: 'RIG', color: 'var(--line-violet)' }, { id: 'Lys', short: 'LYS', color: 'var(--line-rose)' },
    { id: 'Skilt', short: 'SKI', color: 'var(--line-sky)' }, { id: 'Truck', short: 'TRU', color: 'var(--line-plum)' }, { id: 'Rørlegger', short: 'RØR', color: 'var(--line-slate)' }];
  // hours of demand left per competence per day after faste (normaltid + overtid)
  const RESID = {
    Vegger: [0, 15, 22.5, 30, 15, 0, 0, 45, 60, 52.5, 30, 0], Tepper: [0, 0, 0, 7.5, 15, 0, 0, 30, 37.5, 22.5, 0, 0], Elektro: [0, 7.5, 7.5, 15, 15, 0, 0, 22.5, 15, 7.5, 7.5, 0],
    Møbler: [0, 0, 0, 0, 0, 0, 0, 15, 30, 30, 15, 0], Rigg: [0, 0, 15, 15, 0, 0, 0, 0, 0, 7.5, 7.5, 0], Lys: [0, 0, 0, 7.5, 15, 0, 0, 15, 15, 7.5, 0, 0],
    Skilt: [0, 0, 0, 0, 7.5, 0, 0, 0, 7.5, 7.5, 7.5, 0], Truck: [0, 0, 0, 0, 0, 0, 0, 7.5, 7.5, 0, 0, 0], Rørlegger: Array(12).fill(0) };
  const CTRS = [
    { id: 'k1', name: 'Manpower', comps: ['Vegger', 'Tepper', 'Møbler', 'Truck'], max: 12, shifts: ['dag', 'kveld', 'natt'], rate: 545, contact: 'Line Aasen · 912 34 567' },
    { id: 'k2', name: 'Adecco', comps: ['Tepper', 'Møbler', 'Skilt'], max: 6, shifts: ['dag', 'kveld'], rate: 560, contact: 'Ole Brekke · 934 11 220' },
    { id: 'k3', name: 'Nordic Crew', comps: ['Vegger', 'Rigg', 'Lys', 'Truck'], max: 8, shifts: ['dag', 'kveld', 'natt'], rate: 610, contact: 'Siv Dalen · 476 02 118' },
    { id: 'k4', name: 'Elkraft Utleie', comps: ['Elektro', 'Lys', 'Rørlegger'], max: 4, shifts: ['dag', 'kveld'], rate: 690, contact: 'Per Moe · 415 77 903' },
    { id: 'k5', name: 'StandBygg', comps: ['Vegger', 'Elektro', 'Skilt', 'Rigg'], max: 6, shifts: ['dag'], rate: 590, contact: 'Kari Lund · 988 45 016' }];
  const SHIFTS = { dag: { label: 'Dag', s: 420, e: 900 }, kveld: { label: 'Kveld', s: 900, e: 1380 }, natt: { label: 'Natt', s: 1380, e: 420 } };
  const SEED = [
    { id: 'b1', cid: 'k1', comp: 'Vegger', day: 2, fte: 3, s: 420, e: 900 }, { id: 'b2', cid: 'k1', comp: 'Vegger', day: 3, fte: 4, s: 420, e: 900 },
    { id: 'b3', cid: 'k3', comp: 'Rigg', day: 2, fte: 2, s: 900, e: 1380 }, { id: 'b4', cid: 'k3', comp: 'Rigg', day: 3, fte: 2, s: 900, e: 1380 },
    { id: 'b5', cid: 'k4', comp: 'Elektro', day: 3, fte: 2, s: 420, e: 900 }, { id: 'b6', cid: 'k2', comp: 'Tepper', day: 4, fte: 2, s: 420, e: 900 },
    { id: 'b7', cid: 'k1', comp: 'Vegger', day: 7, fte: 4, s: 420, e: 900 }, { id: 'b8', cid: 'k5', comp: 'Vegger', day: 7, fte: 2, s: 420, e: 900 }];
  const dur = (s, e) => e > s ? e - s : e + 1440 - s;
  const shH = (s, e) => { const d = dur(s, e); return (d - (d >= 360 ? 30 : 0)) / 60; };
  const shKey = (s, e) => (Object.entries(SHIFTS).find(([, v]) => v.s === s && v.e === e) || ['egen'])[0];
  const fmtH = h => { const r = Math.round(h * 10) / 10; return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ','); };
  const fmtT = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const parseT = v => { const [h, m] = v.split(':').map(Number); return (h * 60 + (m || 0)) % 1440; };
  window.IL = { DAYS, COMPS, RESID, CTRS, SHIFTS, SEED, TODAY: 3, dur, shH, shKey, fmtH, fmtT, parseT };
})();
