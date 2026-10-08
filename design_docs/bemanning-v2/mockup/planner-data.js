(function () {
  const START = new Date(Date.UTC(2026, 9, 5));
  const N = 42;
  const iso = d => d.toISOString().slice(0, 10);
  const days = Array.from({ length: N }, (_, i) => { const d = new Date(START); d.setUTCDate(d.getUTCDate() + i); return d; });
  const WD = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
  const MO = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
  const week = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); };
  const D = days.map((d, i) => ({ i, iso: iso(d), day: d.getUTCDate(), wd: WD[d.getUTCDay()], month: MO[d.getUTCMonth()], week: week(d), type: d.getUTCDay() % 6 === 0 ? 'Helg' : 'Arbeidsdag' }));
  const idx = s => { const [m, dd] = s.split('.').reverse().map(Number); return D.findIndex(x => x.day === dd && MO.indexOf(x.month) === m - 1); };
  const span = (a, b) => [idx(a), idx(b)];

  const HALLS = ['A1', 'B1', 'B2', 'B3', 'B4', 'C', 'D1', 'D2', 'E'];
  const PROJECTS = [
    { no: '26970', name: 'VVS 2026', halls: ['B1', 'B2', 'C'], phases: { assembly: span('6.10', '11.10'), movingIn: span('12.10', '13.10'), event: span('14.10', '16.10'), movingOut: span('17.10', '18.10'), dismantle: span('19.10', '20.10') } },
    { no: '26330', name: 'Studentmessen 2026', halls: ['A1'], phases: { movingIn: span('13.10', '13.10'), event: span('14.10', '15.10'), movingOut: span('15.10', '15.10') } },
    { no: '26412', name: 'Hage 2026', halls: ['D1', 'D2', 'E'], phases: { assembly: span('19.10', '22.10'), movingIn: span('23.10', '23.10'), event: span('24.10', '26.10'), movingOut: span('26.10', '26.10'), dismantle: span('27.10', '28.10') } },
    { no: '26655', name: 'Matmessen 2026', halls: ['C'], phases: { assembly: span('27.10', '29.10'), movingIn: span('30.10', '30.10'), event: span('31.10', '1.11'), movingOut: span('1.11', '1.11'), dismantle: span('2.11', '3.11') } },
    { no: '26118', name: 'Oslo Motor Show 2026', halls: ['A1', 'B3', 'B4'], phases: { assembly: span('26.10', '3.11'), movingIn: span('4.11', '4.11'), event: span('5.11', '8.11'), movingOut: span('8.11', '8.11'), dismantle: span('9.11', '11.11') } },
  ];

  const work = (a, b) => { const out = []; for (let i = a; i <= b; i++) if (D[i] && D[i].type === 'Arbeidsdag') out.push(i); return out; };
  const windowOf = (p, phase) => phase === 'Montering'
    ? work((p.phases.assembly || p.phases.movingIn)[0], (p.phases.movingIn || p.phases.assembly)[1])
    : work((p.phases.movingOut || p.phases.dismantle)[0], (p.phases.dismantle || p.phases.movingOut)[1]);

  let n = 0;
  const row = (p, phase, competence, hours, opt = {}) => ({ id: 'r' + (++n), projectNo: p.no, projectName: p.name, refYear: '2026', phase, competence, basis: 'Planlagt', hall: opt.hall, avdeling: opt.avd, hours, fte: opt.fte || {}, window: windowOf(p, phase) });
  const fill = (p, phase, vals) => { const w = windowOf(p, phase), o = {}; vals.forEach((v, k) => { if (w[k] !== undefined && v) o[w[k]] = v; }); return o; };
  const [vvs, stud, hage, mat, oms] = PROJECTS;
  const ROWS = [
    row(vvs, 'Montering', 'Vegger', 337.5, { hall: 'B1', fte: fill(vvs, 'Montering', [8, 8, 8, 8, 6, 4]) }),
    row(vvs, 'Montering', 'Vegger', 202.5, { hall: 'B2', fte: fill(vvs, 'Montering', [4, 4, 5, 5, 4]) }),
    row(vvs, 'Montering', 'Tepper', 180, { fte: fill(vvs, 'Montering', [0, 0, 0, 3, 5, 4]) }),
    row(vvs, 'Montering', 'Elektro', 135, { fte: fill(vvs, 'Montering', [2, 2, 3, 3, 3, 3]) }),
    row(vvs, 'Montering', 'Møbler', 90, { avd: 'Arrangør', fte: fill(vvs, 'Montering', [0, 0, 0, 0, 4, 6]) }),
    row(vvs, 'Demontering', 'Vegger', 270, { fte: fill(vvs, 'Demontering', [10, 12]) }),
    row(vvs, 'Demontering', 'Tepper', 82.5, { fte: fill(vvs, 'Demontering', [4, 5]) }),
    row(vvs, 'Demontering', 'Elektro', 60),
    row(hage, 'Montering', 'Vegger', 300, { fte: fill(hage, 'Montering', [6, 8, 8]) }),
    row(hage, 'Montering', 'Tepper', 150),
    row(hage, 'Montering', 'Rigg', 112.5, { hall: 'E' }),
    row(hage, 'Demontering', 'Vegger', 165),
    row(hage, 'Demontering', 'Rigg', 60, { hall: 'E' }),
    row(mat, 'Montering', 'Vegger', 120),
    row(mat, 'Montering', 'Elektro', 67.5),
    row(mat, 'Demontering', 'Vegger', 75),
    row(oms, 'Montering', 'Vegger', 525, { hall: 'B3' }),
    row(oms, 'Montering', 'Vegger', 375, { hall: 'B4' }),
    row(oms, 'Montering', 'Tepper', 240),
    row(oms, 'Montering', 'Elektro', 210),
    row(oms, 'Demontering', 'Vegger', 420),
    row(oms, 'Demontering', 'Tepper', 120),
  ];
  void stud;

  const HIRED = {}; [idx('8.10'), idx('9.10'), idx('12.10'), idx('13.10')].forEach(i => HIRED[i] = 4); [idx('19.10'), idx('20.10')].forEach(i => HIRED[i] = 6);
  const ABSENT = {}; D.forEach((d, i) => { if (d.type === 'Arbeidsdag') ABSENT[i] = i % 3 === 0 ? 2 : 1; });

  const fmt = (v, digits = 1) => v === null || v === undefined || !isFinite(v) ? '' : (Math.abs(v) < 0.05 ? 0 : v).toLocaleString('nb-NO', { maximumFractionDigits: digits }).replace('-', '−');

  window.EP = { DAYS: D, HALLS, PROJECTS, ROWS, HIRED, ABSENT, SETTINGS: { baseCrew: 21, hoursPerDay: 7.5 }, TODAY: 0, fmt,
    DIMENSIONS: ['project', 'phase', 'hall', 'competence', 'avdeling'],
    DIM_LABELS: { project: 'Prosjekt', phase: 'Arbeidsfase', hall: 'Hall/Sted', competence: 'Kompetanse', avdeling: 'Avd.' },
    PHASE_CODES: { assembly: 'A', movingIn: 'MI', event: '', movingOut: 'MO', dismantle: 'D' },
    PHASE_NAMES: { assembly: 'Assembly', movingIn: 'Moving in', event: 'Event', movingOut: 'Moving out', dismantle: 'Dismantle' } };
})();
