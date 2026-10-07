(function () {
const S = 420, E = 900, L0 = 660, L1 = 690;
const DAYS = [['Man', 12], ['Tir', 13], ['Ons', 14], ['Tor', 15], ['Fre', 16], ['Lør', 17], ['Søn', 18]].map(([wd, d], i) => ({ i, wd, d, we: i > 4, long: ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'][i] }));
const COMPS = [
  { id: 'tep', name: 'Teppefliser', short: 'TEP', color: 'var(--line-blue)' },
  { id: 'foga', name: 'FOGA', short: 'FOGA', color: 'var(--line-teal)' },
  { id: 'inn', name: 'Innredning', short: 'INN', color: 'var(--line-green)' },
  { id: 'mob', name: 'Møbler', short: 'MØB', color: 'var(--line-amber)' },
  { id: 'ban', name: 'Banner', short: 'BAN', color: 'var(--line-rose)' },
  { id: 'ext', name: 'Extra', short: 'EXT', color: 'var(--line-violet)' }
];
const P = [
  ['Anders Berg', 'tep foga ext'], ['Bjørn Dahl', 'tep ext'], ['Camilla Eide', 'inn mob ban'], ['Daniel Fjeld', 'foga inn ext'],
  ['Eirik Haug', 'tep foga'], ['Frida Holm', 'inn ban ext'], ['Geir Isaksen', 'mob ext'], ['Hanne Johansen', 'tep inn'],
  ['Ivar Karlsen', 'foga mob ext'], ['Jonas Lie', 'foga ext'], ['Kari Moen', 'inn mob'], ['Lars Nilsen', 'tep ext'],
  ['Mona Olsen', 'ban ext'], ['Nils Pedersen', 'foga inn mob'], ['Ola Rønning', 'mob ext'], ['Per Solberg', 'tep foga inn'],
  ['Rune Strand', 'inn ext'], ['Siri Tangen', 'ban mob ext'], ['Tor Vik', 'foga ext'], ['Ulrik Aas', 'inn mob ext']
];
const PEOPLE = P.map(([name, c], i) => ({ id: 'p' + (i + 1), name, comps: c.split(' ') }));
const EXC = {
  p8: { 2: { off: 'Ferie' }, 3: { off: 'Ferie' }, 4: { off: 'Ferie' } },
  p4: { 1: { off: 'Kurs' } },
  p13: { 4: { s: 420, e: 720, note: 'Går 12:00' } },
  p17: { 0: { s: 600, e: 900, note: 'Fra 10:00' } }
};
function baseAvail(pid, d) {
  if (d > 4) return { we: true };
  return (EXC[pid] && EXC[pid][d]) || { s: S, e: E };
}
const DEMAND = {
  tep: [37.5, 52.5, 22.5, 7.5, 0, 0, 0],
  foga: [30, 30, 37.5, 15, 7.5, 0, 0],
  inn: [15, 22.5, 30, 37.5, 22.5, 7.5, 0],
  mob: [0, 7.5, 15, 30, 37.5, 15, 0],
  ban: [7.5, 7.5, 15, 15, 7.5, 0, 0],
  ext: [15, 15, 15, 22.5, 30, 7.5, 7.5]
};
let n = 1; const b = (pid, day, comp, s = S, e = E) => ({ id: 's' + (n++), pid, day, comp, s, e });
const SEED = [
  b('p1', 0, 'tep'), b('p2', 0, 'tep'), b('p5', 0, 'tep'), b('p12', 0, 'tep'),
  b('p10', 0, 'foga'), b('p19', 0, 'foga'), b('p9', 0, 'foga'),
  b('p3', 0, 'ban'), b('p6', 0, 'inn'), b('p11', 0, 'inn'),
  b('p1', 1, 'tep'), b('p2', 1, 'tep'), b('p12', 1, 'tep'),
  b('p16', 1, 'tep', 420, 660), b('p16', 1, 'foga', 690, 900),
  b('p16', 2, 'inn', 420, 600), b('p16', 2, 'tep', 600, 900)
];
const hrs = (s, e) => (e - s - Math.max(0, Math.min(e, L1) - Math.max(s, L0))) / 60;
const fmtH = h => { const r = Math.round(h * 10) / 10; return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ','); };
const fmtT = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function freeIv(av, bl) {
  if (!av || av.s == null) return [];
  const out = []; let c = av.s;
  bl.slice().sort((a, b) => a.s - b.s).forEach(x => { if (x.s > c) out.push([c, Math.min(x.s, av.e)]); c = Math.max(c, x.e); });
  if (c < av.e) out.push([c, av.e]);
  return out.filter(([a, z]) => z - a >= 15);
}
const freeH = (av, bl) => freeIv(av, bl).reduce((a, [s, e]) => a + hrs(s, e), 0);
function merge(bl) {
  const g = {}; bl.forEach(x => { (g[x.pid + '|' + x.day] = g[x.pid + '|' + x.day] || []).push(x); });
  const out = [];
  Object.values(g).forEach(arr => { arr.sort((a, z) => a.s - z.s); let last = null; arr.forEach(x => { if (last && last.comp === x.comp && last.e === x.s) { last = { ...last, e: x.e }; out[out.length - 1] = last; } else { last = x; out.push(x); } }); });
  return out;
}
const VS = 360, VE = 1260;
const otH = (b, we) => { const t = hrs(b.s, b.e); if (we) return t; const a = Math.max(b.s, S), z = Math.min(b.e, E); return t - (z > a ? hrs(a, z) : 0); };
function vAvail(av) { if (av.off) return null; if (av.we) return { s: VS, e: VE }; if (av.note) return { s: av.s, e: av.e }; return { s: VS, e: VE }; }
window.BM = { S, E, L0, L1, VS, VE, otH, vAvail, DAYS, COMPS, PEOPLE, baseAvail, DEMAND, SEED, hrs, fmtH, fmtT, freeIv, freeH, merge };
})();
