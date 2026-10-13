function InnleidApp() {
  const ilW = 116; // day column width (locked)
  const ilLW = 400, { DAYS, COMPS, RESID, SHIFTS, TODAY, fmtH } = IX;
  // v7 seed adds one ok day (tir 6) and one overstaffed day (ons 7) so every Avvik state is visible
  const seed = () => ({ bks: [...IX.SEED, { id: 'b9', cid: 'k1', comp: 'Vegger', day: 1, fte: 2, s: 420, e: 900 }, { id: 'b10', cid: 'k4', comp: 'Elektro', day: 1, fte: 1, s: 420, e: 900 }, { id: 'b11', cid: 'k4', comp: 'Elektro', day: 2, fte: 3, s: 420, e: 900 }].map(b => ({ ...b, conf: { b1: 3, b2: 4, b3: 2, b7: 4, b9: 2, b10: 1, b11: 3 }[b.id] ?? null })), ctrs: IX.CTRS.map(({ max, ...c }) => c) });
  const two = s => ({ ...s, bks: s.bks.map(b => b.conf != null && b.conf < b.fte ? (b.conf > 0 ? { ...b, asked: b.asked ?? b.fte, fte: b.conf } : { ...b, conf: null }) : b) });
  const load = () => { try { const v = JSON.parse(localStorage.getItem('innleid-v7b')); if (v && v.bks) return two(v); } catch (e) {} return two(seed()); };
  const [hist, setHist] = React.useState(() => ({ cur: load(), past: [], future: [] }));
  const { bks, ctrs } = hist.cur;
  const seq = React.useRef(Math.max(1000, ...hist.cur.bks.map(b => +String(b.id).replace(/\D/g, '') || 0)));
  const nid = () => 'b' + (++seq.current);
  React.useEffect(() => { localStorage.setItem('innleid-v7b', JSON.stringify(hist.cur)); }, [hist.cur]);
  const commit = f => setHist(h => { const n = f(h.cur); return n === h.cur ? h : { cur: n, past: [...h.past.slice(-80), h.cur], future: [] }; });
  const setB = f => commit(c => { const nb = f(c.bks); return nb === c.bks ? c : { ...c, bks: vNorm(nb) }; });
  const undo = () => setHist(h => h.past.length ? { cur: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.cur, ...h.future] } : h);
  const redo = () => setHist(h => h.future.length ? { cur: h.future[0], past: [...h.past, h.cur], future: h.future.slice(1) } : h);
  const base = React.useRef(null);
  const liveFor = ids => ({ start: () => setHist(h => { base.current = h.cur; return h; }),
    set: p => setHist(h => ({ ...h, cur: { ...h.cur, bks: h.cur.bks.map(x => ids.includes(x.id) ? { ...x, ...p } : x) } })),
    end: () => setHist(h => { const b0 = base.current; base.current = null; return b0 && b0 !== h.cur ? { cur: { ...h.cur, bks: vNorm(h.cur.bks) }, past: [...h.past.slice(-80), b0], future: [] } : h; }) });
  const [uf, setUf] = React.useState(null); // { comp, days, anchor, sel:[ids] }
  const [side, setSide] = React.useState({ kind: 'matrix' }), [insp, setInsp] = React.useState(false), [pop, setPop] = React.useState(null);
  const [rng, setRng] = React.useState(null), rngRef = React.useRef(null), [brush, setBrush] = React.useState(null), [allSup, setAllSup] = React.useState(false), [erase, setErase] = React.useState(false), [eraseSup, setEraseSup] = React.useState(null), [alt, setAlt] = React.useState(false), [hov, setHov] = React.useState(null);
  const [dark, setDark] = React.useState(() => localStorage.getItem('innleid-dark') === '1');
  const L = React.useRef({}), scrollRef = React.useRef(null);
  React.useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('innleid-dark', dark ? '1' : '0'); }, [dark]);
  const ctrBy = Object.fromEntries(ctrs.map(c => [c.id, c]));
  const strip = COMPS.filter(c => RESID[c.id].some(v => v > 0) || bks.some(b => b.comp === c.id));
  const listOf = (comp, j) => bks.filter(b => b.comp === comp && b.day === j);
  const covOf = (comp, j) => vCov(RESID[comp][j], listOf(comp, j));
  const range = (a, b) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i);
  const xOf = j => ilLW + j * ilW;
  const scrollTo = j => requestAnimationFrame(() => { const el = scrollRef.current; if (!el) return; const x = xOf(j) - ilLW; if (x < el.scrollLeft || x + ilW > el.scrollLeft + el.clientWidth - ilLW) el.scrollTo({ left: Math.max(0, x - 120), behavior: 'smooth' }); });
  const firstShort = comp => { const j = DAYS.findIndex((d, k) => covOf(comp, k).st === 'short'); return j < 0 ? Math.max(0, RESID[comp].findIndex(v => v > 0)) : j; };
  const fitFor = comp => ctrs.filter(c => c.comps.includes(comp));
  const unfold = (comp, days, sel) => { setPop(null); setAllSup(false); setUf({ comp, days, anchor: days[0], sel: sel || null }); setBrush(b => b && !ctrs.find(c => c.id === b).comps.includes(comp) ? (fitFor(comp)[0] || {}).id || null : b); scrollTo(days[0]); };
  const selDays = (j, ext) => setUf(u => u && (ext ? { ...u, days: range(u.anchor, j), sel: null } : { ...u, days: [j], anchor: j, sel: null }));
  const shiftDays = (dir, ext) => setUf(u => { if (!u) return u; const a = u.days[0], b = u.days[u.days.length - 1];
    if (ext) { const end = u.anchor === a ? b : a, n = Math.max(0, Math.min(DAYS.length - 1, end + dir)); return { ...u, days: range(u.anchor, n), sel: null }; }
    const d = Math.max(-a, Math.min(DAYS.length - 1 - b, dir)); scrollTo(a + d); return { ...u, days: u.days.map(x => x + d), anchor: u.anchor + d, sel: null }; });
  const ufList = uf ? bks.filter(b => b.comp === uf.comp && uf.days.includes(b.day)) : [];
  const ufGroups = uf ? vGroups(ufList, ctrs) : [];
  const findG = ids => ids && ufGroups.find(g => g.list.some(b => ids.includes(b.id)));
  const ids = g => g.list.map(b => b.id);
  const patchIds = (is, f) => setB(b => b.map(x => is.includes(x.id) ? { ...x, ...(typeof f === 'function' ? f(x) : f) } : x));
  // asking a confirmed supplier for more = a new question → back to waiting; fewer stays confirmed
  const crew = (g, d) => patchIds(ids(g), x => { const f = Math.max(1, x.fte + d); return { fte: f, conf: x.conf == null || d > 0 ? null : f, asked: d > 0 ? undefined : x.asked }; });
  const setConf = (is, mode) => patchIds(is, x => ({ conf: mode === 'req' ? null : x.fte }));
  const setGot = (is, n) => patchIds(is, x => ({ asked: x.asked ?? x.fte, fte: n, conf: n }));
  const planRun = (comp, days, cid, strict) => { const c = ctrBy[cid]; if (!c || !c.comps.includes(comp)) return [];
    const k = c.shifts.find(sk => !bks.some(b => b.cid === cid && b.comp === comp && days.includes(b.day) && IX.shKey(b.s, b.e) === sk)) || c.shifts[0], sh = SHIFTS[k], H = IX.shH(sh.s, sh.e);
    let add = days.filter(j => covOf(comp, j).st === 'short'); if (!add.length) add = strict ? [] : days;
    return add.map(j => ({ cid, comp, day: j, fte: Math.max(1, Math.ceil(Math.max(0, covOf(comp, j).rem) / H - 1e-6)), s: sh.s, e: sh.e, conf: null })); };
  const addRun = (comp, days, cid, strict) => { const nb = planRun(comp, days, cid, strict).map(b => ({ ...b, id: nid() })); if (!nb.length) return;
    setB(b => [...b, ...nb]); setUf(u => u && { ...u, sel: nb.map(b => b.id) }); };
  const fill = g => { const f = g.list.map(b => b.fte).sort((a, b) => a - b)[Math.floor(g.list.length / 2)], have = new Set(g.list.map(b => b.day));
    const nb = uf.days.filter(j => !have.has(j)).map(j => ({ id: nid(), cid: g.cid, comp: uf.comp, day: j, fte: f, s: g.s, e: g.e, conf: null }));
    setB(b => [...b, ...nb]); setUf(u => ({ ...u, sel: [...ids(g), ...nb.map(b => b.id)] })); };
  const rmIds = is => { setB(b => b.filter(x => !is.includes(x.id))); setUf(u => u && u.sel && u.sel.some(i => is.includes(i)) ? { ...u, sel: null } : u); setPop(null); };
  const stepComp = dir => { const i = strip.findIndex(c => c.id === uf.comp), n = strip[(i + dir + strip.length) % strip.length]; unfold(n.id, uf.days); };
  const supList = uf && !allSup ? fitFor(uf.comp) : ctrs, defBrush = () => (supList[0] || ctrs[0]).id;
  L.current = { uf, ufGroups, pop, brush, supList, erase, insp };
  const openSide = kind => { if (insp && side.kind === kind) setInsp(false); else { setSide({ kind }); setInsp(true); } };
  const canBrush = comp => brush && ctrBy[brush] && ctrBy[brush].comps.includes(comp);
  const pickBrush = id => { setErase(false); setBrush(b => b === id ? null : id); };
  const toolTo = v => { setErase(v === 'erase'); setBrush(v === 'brush' ? (brush || defBrush()) : null); };
  React.useEffect(() => {
    const up = () => { const r = rngRef.current; if (!r) return; rngRef.current = null; setRng(null); const ds = range(r.d0, r.d1);
      if (r.erase) { const is = bks.filter(b => b.comp === r.comp && ds.includes(b.day) && (!r.erase.cid || b.cid === r.erase.cid)).map(b => b.id); if (is.length) rmIds(is); return; }
      unfold(r.comp, ds); if (r.brush) addRun(r.comp, ds, r.brush, true); };
    const kd = e => { if (e.key === 'Alt') setAlt(true); if (e.target.closest('input')) return; const k = e.key, C = L.current;
      if (k === '?') { openSide('help'); return; }
      if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (e.metaKey || e.ctrlKey || C.pop) return;
      if (/^[1-9]$/.test(k) && C.supList[+k - 1]) { pickBrush(C.supList[+k - 1].id); return; }
      if (k === 'b' || k === 'B') { setErase(false); setBrush(b => b ? null : defBrush()); return; }
      if (k === 't' || k === 'T') { setBrush(null); setErase(x => !x); return; }
      if (k === 'Escape' && (C.brush || C.erase)) { setBrush(null); setErase(false); return; }
      if (!C.uf) { if (k === 'Escape' && C.insp) setInsp(false); return; }
      if (k === 'Escape') setUf(null);
      else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); shiftDays(k === 'ArrowLeft' ? -1 : 1, e.shiftKey); }
      else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); const gs = C.ufGroups; if (!gs.length) return; const i = gs.findIndex(g => C.uf.sel && g.list.some(b => C.uf.sel.includes(b.id))), n = gs[Math.max(0, Math.min(gs.length - 1, i < 0 ? 0 : i + (k === 'ArrowUp' ? -1 : 1)))]; setUf(u => ({ ...u, sel: n.list.map(b => b.id) })); }
      else if ((k === 'Delete' || k === 'Backspace') && C.uf.sel) { e.preventDefault(); rmIds(C.uf.sel); }
      else if (k === 'Enter' && C.uf.sel) { e.preventDefault(); const el = document.querySelector('.v-r.on .v-st'); if (el) setPop({ kind: 'conf', r: el.getBoundingClientRect(), ids: C.uf.sel }); }
      else if ((k === '+' || k === '-') && C.uf.sel) { e.preventDefault(); const g = C.ufGroups.find(g => g.list.some(b => C.uf.sel.includes(b.id))); if (g) crew(g, k === '+' ? 1 : -1); } };
    const ku = e => { if (e.key === 'Alt') setAlt(false); }, bl = () => setAlt(false);
    addEventListener('mouseup', up); addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', bl);
    return () => { removeEventListener('mouseup', up); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', bl); };
  });
  const cellDown = (comp, j, e) => { if (e.button !== 0) return; e.preventDefault();
    if (uf && uf.comp === comp && e.shiftKey) { selDays(j, true); return; }
    const er = erase || e.altKey; if (!er && brush && !canBrush(comp)) return;
    const r = { comp, d0: j, d1: j, brush: !er && canBrush(comp) ? brush : null, erase: er ? { cid: erase ? eraseSup : brush } : null }; rngRef.current = r; setRng(r); };
  const cellEnter = (comp, j) => { setHov({ comp, j }); const r = rngRef.current; if (r && r.comp === comp && r.d1 !== j) { const n = { ...r, d1: j }; rngRef.current = n; setRng(n); } };
  const chipDown = (b, e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
    if (erase || e.altKey) { rmIds([b.id]); return; } const sameGroup = bks.filter(x => x.comp === b.comp && vKey(x) === vKey(b));
    if (uf && uf.comp === b.comp && uf.days.includes(b.day)) setUf(u => ({ ...u, sel: sameGroup.filter(x => u.days.includes(x.day)).map(x => x.id) })); else unfold(b.comp, [b.day], [b.id]); };
  const openPop = (kind, e, g) => { const r = e.currentTarget.getBoundingClientRect(); setPop(p => p && p.kind === kind && g && p.ids[0] === g.list[0].id ? null : { kind, r, ids: g ? ids(g) : null }); };
  // totals
  const pendFte = sumBy(bks, b => b.conf == null ? b.fte : Math.max(0, b.fte - b.conf));
  const shortH = sumBy(strip, c => sumBy(DAYS, (d, j) => { const v = covOf(c.id, j); return v.st === 'short' ? v.rem : 0; }));
  const shortDays = DAYS.map((d, j) => strip.some(c => covOf(c.id, j).st === 'short'));
  const nShort = shortDays.filter(Boolean).length;
  const totR = sumBy(strip, c => sumBy(RESID[c.id], v => v));
  const firstPend = [...bks].sort((a, b) => a.day - b.day).find(b => vStat(b) !== 'ok');
  const tpl = ilLW + 'px repeat(' + DAYS.length + ', ' + ilW + 'px)';
  const todayX = xOf(TODAY) - 1;
  const dc = (j, extra = '') => 'il-c' + (DAYS[j].we ? ' we' : '') + (j === TODAY ? ' today' : '') + extra;
  const wkLabel = j => j === 0 || DAYS[j].wd === 'man' ? 'U' + DAYS[j].wk : '';
  const shortP = sumBy(strip, c => sumBy(DAYS, (d, j) => { const v = covOf(c.id, j); return v.st === 'short' ? vPers(v.rem) : 0; }));
  const totIn = sumBy(bks, b => b.fte * vH(b)), pendH = sumBy(bks, b => (b.conf == null ? b.fte : Math.max(0, b.fte - b.conf)) * vH(b));
  const meta = ['+' + fmtH(totIn) + ' t innleid', shortH > 0.01 ? '−' + fmtH(shortH) + ' t udekket' : 'Alt dekket', pendH > 0.01 ? fmtH(pendH) + ' t ubekreftet' : 'Alt bekreftet'];
  const supOrder = (a, b) => ctrs.findIndex(c => c.id === a.cid) - ctrs.findIndex(c => c.id === b.cid) || vAx(a.s) - vAx(b.s);
  const popG = pop && pop.ids && findG(pop.ids);
  const ufSum = uf && (() => { let short = 0, over = 0, R = 0, P = 0; uf.days.forEach(j => { const v = covOf(uf.comp, j); R += v.R; P += v.P; if (v.st === 'short') short += v.rem; if (v.st === 'over') over -= v.rem; }); return { short, over, R, P, pers: uf.days.reduce((t, j) => { const v = covOf(uf.comp, j); return t + (v.st === 'short' ? vPers(v.rem) : 0); }, 0), crew: sumBy(ufList, b => b.fte), n: ufList.length }; })();
  return <div className="il-app">
    <header className="il-top"><span className="il-brand"><i></i>Expo Planner</span><nav>{['Kalender', 'Behov', 'Haller', 'Produkttyper', 'KPI'].map((t, i) => <span key={t} className={i === 0 ? 'on' : ''}>{t}</span>)}</nav></header>
    <div className="khdr">
      <div className="khdr-title"><h1>Kalender</h1><span className="kvtag"><Icon name="users" size={13} />Bemanning · Innleid</span></div>
      <div className="khdr-act">
        <IlSeg size="xs" value={dark ? 'dark' : 'light'} onChange={v => setDark(v === 'dark')} options={[{ value: 'light', label: 'Lys' }, { value: 'dark', label: 'Mørk' }]} />
        <button className={'il-ib' + (insp && side.kind !== 'help' ? ' on' : '')} onClick={() => openSide('matrix')} title="Leverandører og kompetanser"><Icon name="panel-right" size={16} /></button>
      </div>
    </div>
    <div className="il-tb">
      <div className="il-z">
        <IlSeg value="bemanning" onChange={v => v === 'behov' && (location.href = 'Expo Planner Kalender v9.html')} options={[{ value: 'behov', label: <><Icon name="calendar" size={14} />Plan</> }, { value: 'bemanning', label: <><Icon name="users" size={14} />Bemanning</> }]} />
        <IlSeg value="innleid" onChange={v => v === 'faste' && (location.href = 'Expo Planner Kalender v9.html')} options={[{ value: 'faste', label: 'Faste', title: 'Egne ansatte · normaltid og overtid' }, { value: 'innleid', label: 'Innleid', title: 'Leverandører dekker restbehovet' }]} />
      </div>
      <div className="il-z">
        <button className="il-ib" onClick={undo} disabled={!hist.past.length} title="Angre (⌘Z)"><Icon name="undo-2" size={16} /></button>
        <button className="il-ib" onClick={redo} disabled={!hist.future.length} title="Gjør om (⌘⇧Z)"><Icon name="redo-2" size={16} /></button>
        <IlSeg value={erase ? 'erase' : brush ? 'brush' : 'select'} onChange={toolTo} options={[{ value: 'select', label: <><Icon name="mouse-pointer-2" size={14} />Velg</> }, { value: 'brush', label: <><Icon name="paintbrush" size={14} />Pensel{brush ? <b className="v-brush">{ctrBy[brush].name}</b> : <kbd>B</kbd>}</> }, { value: 'erase', label: <><Icon name="eraser" size={14} />Tøm<kbd>T</kbd></>, title: 'Dra over dager for å fjerne · ⌥-dra gjør det samme fra alle verktøy' }]} />
        {erase && <span className="v-bsel"><button className={eraseSup ? '' : 'on'} onClick={() => setEraseSup(null)}>Alle</button>{supList.map(c => <button key={c.id} className={c.id === eraseSup ? 'on' : ''} onClick={() => setEraseSup(c.id)} title={'Fjern bare ' + c.name}>{vSup(c)}</button>)}</span>}
        {brush && <span className="v-bsel">{supList.map((c, i) => <button key={c.id} className={c.id === brush ? 'on' : ''} onClick={() => setBrush(c.id)} title={c.name + ' (' + (i + 1) + ')'}>{vSup(c)}</button>)}</span>}
        <span className="il-hint">{erase ? 'Dra over dager for å fjerne ' + (eraseSup ? ctrBy[eraseSup].name : 'alle bestillinger') + ' · klikk en bestilling for å fjerne den' : brush ? 'Dra over dager for å bestille ' + ctrBy[brush].name + ' · ⌥-dra fjerner · Esc avslutter' : uf ? uf.comp + ' · ' + vRangeLbl(uf.days) + ' · ← → flytter, ⇧ utvider · Esc folder sammen' : 'Klikk en dag for å bemanne · dra over flere dager for å bemanne en periode'}</span>
      </div>
      <div className="il-z il-zr">
        {firstPend && <button className="il-al pend" onClick={() => { setSide({ kind: 'ctr', id: firstPend.cid }); setInsp(true); }} title="Vis bestillingen som venter på svar"><VGlyph st="req" size={14} /><span>{fmtH(pendH) + ' t venter på svar'}</span></button>}
        {nShort === 0 && !firstPend && <span className="v-alldone"><Icon name="check" size={14} />Alt dekket og bekreftet</span>}
        {nShort > 0 && <button className="il-al block" onClick={() => { const j = shortDays.findIndex(Boolean), c = strip.find(c => covOf(c.id, j).st === 'short'); unfold(c.id, [j]); }}><Icon name="triangle-alert" size={14} /><span>{nShort + (nShort === 1 ? ' dag' : ' dager') + ' udekket'}</span></button>}
        <button className="il-btn" onClick={() => uf ? selDays(TODAY) : scrollTo(TODAY)}>I dag</button>
        <button className={'il-ib' + (insp && side.kind === 'help' ? ' on' : '')} onClick={() => openSide('help')} title="Grep og hurtigtaster (?)"><Icon name="circle-help" size={16} /></button>
      </div>
    </div>
    <div className="il-work">
      <div className="il-scroll" ref={scrollRef} onScroll={() => pop && setPop(null)} onMouseLeave={() => setHov(null)}>
        <div className="il-grid" style={{ '--cols': tpl, width: ilLW + DAYS.length * ilW }}>
          <div className="il-head">
            <div className="il-row il-date">
              <div className="il-lab"><span className="il-eb">Dato</span><span className="il-range">5.–16. okt 2026</span></div>
              {DAYS.map((d, j) => <div key={j} className={dc(j, ' il-dh' + (uf && uf.days.includes(j) ? ' sel' : '') + (uf ? ' pick' : ''))} onClick={e => uf && selDays(j, e.shiftKey)} title={uf ? 'Velg ' + d.wd + ' ' + d.d + '. · ⇧ utvider' : ''}>
                <span className="il-wk">{wkLabel(j)}</span><span className="il-dd"><span>{d.wd}</span><b>{d.d}</b></span>
              </div>)}
            </div>
            <div className="il-todayln" style={{ left: todayX }}></div>
          </div>
          <div className="il-body">
            <div className="il-row il-sec"><div className="il-lab"><span className="il-eb">Restbehov etter faste</span><span className="il-eb r">timer</span></div>{DAYS.map((d, j) => <div key={j} className={dc(j)}></div>)}</div>
            {(() => { const un = b => b.conf == null ? b.fte : Math.max(0, b.fte - b.conf);
              const dev = DAYS.map((d, j) => { const cs = strip.map(c => covOf(c.id, j)); if (cs.every(v => v.st === 'none')) return null; const s = sumBy(cs, v => v.st === 'short' ? v.rem : 0); return { st: s > 0.01 ? 'under' : cs.some(v => v.st === 'over') ? 'over' : 'ok', v: s > 0.01 ? -s : sumBy(cs, v => Math.max(0, -v.rem)), p: sumBy(bks.filter(b => b.day === j), b => un(b) * vH(b)) }; });
              const maxS = Math.max(1, ...dev.map(d => d && d.v < 0 ? -d.v : 0)), maxO = Math.max(1, ...dev.map(d => d && d.st === 'over' ? d.v : 0)), cm = (c, p) => 'color-mix(in oklab, ' + c + ' ' + Math.round(p) + '%, rgb(var(--canvas)))';
              // three states: under = red scale · ok = flat green (within one shift-person) · over = ochre scale, capped below red. Waiting = dot, not colour.
              const heat = d => { if (d.st === 'under') { const s = Math.min(1, -d.v / maxS); return { bg: cm('rgb(var(--danger))', 22 + s * 63), ink: s > 0.5 ? '#fff' : 'rgb(var(--danger))', t: 'Underbemannet ' }; }
                if (d.st === 'over') { const t = Math.min(1, d.v / Math.max(maxS, maxO)); return { bg: cm('rgb(var(--draft))', 18 + t * 37), ink: 'rgb(var(--ink))', t: 'Overbemannet ' }; }
                return { bg: cm('rgb(var(--committed))', 20), ink: 'rgb(var(--committed))', t: 'Ok ' }; };
              const sg = v => v < 0 ? '−' + fmtH(-v) : v > 0.01 ? '+' + fmtH(v) : '0';
              return <div className="il-row il-ro v-avvik"><div className="il-lab"><span className="v-avlab">Avvik<span className="v-heatlg" title="Rødt: underbemannet (mørkere = mer). Grønt: ok. Oker: overbemannet (mørkere = mer). Prikk: venter på svar."><i style={{ background: cm('rgb(var(--danger))', 70) }}></i><i style={{ background: cm('rgb(var(--committed))', 20) }}></i><i style={{ background: cm('rgb(var(--draft))', 45) }}></i></span></span></div>
                {DAYS.map((d, j) => { const x = dev[j]; if (!x) return <div key={j} className={dc(j)}></div>; const hs = heat(x);
                  return <div key={j} className={dc(j)} title={hs.t + sg(x.v) + ' t' + (x.p > 0.01 ? ' · ' + fmtH(x.p) + ' t venter på svar' : '')}><span className="v-heat" style={{ background: hs.bg }}></span>{Math.abs(x.v) > 0.01 && <span className="v-hv" style={{ color: hs.ink }}>{sg(x.v)}</span>}{x.p > 0.01 && <span className="v-hp"><VGlyph st="req" size={13} /></span>}</div>; })}
              </div>; })()}
            {strip.map(c => { const open = uf && uf.comp === c.id, tot = sumBy(DAYS, (d, j) => { const v = covOf(c.id, j); return v.st === 'short' ? v.rem : 0; });
              const erasing = erase || alt;
              const pv = !erasing && brush && canBrush(c.id) ? (rng && rng.comp === c.id && rng.brush ? planRun(c.id, range(rng.d0, rng.d1), brush, true) : !rng && hov && hov.comp === c.id ? planRun(c.id, [hov.j], brush, true) : []) : [];
              return <div key={c.id} className={'il-row v-row' + (open ? ' open' : '') + (erasing ? ' erase' : brush ? canBrush(c.id) ? ' brush' : ' nobrush' : '')} style={{ '--cc': c.color }}>
                {open ? <VPane comp={c.id} days={uf.days} groups={ufGroups} fit={fitFor(c.id).length} noNeed={uf.days.every(j => covOf(c.id, j).st !== 'short')} onMatrix={() => { setSide({ kind: 'matrix' }); setInsp(true); }} sel={uf.sel} ctrBy={ctrBy} sum={ufSum} onFold={() => setUf(null)} onStep={stepComp} onShift={shiftDays}
                    onSel={g => setUf(u => ({ ...u, sel: ids(g) }))} onMenu={(e, g) => openPop('sup', e, g)} onConf={(e, g) => openPop('conf', e, g)} onTime={(e, g) => openPop('time', e, g)} onShiftMenu={(e, g) => openPop('shift', e, g)}
                    onCrew={crew} onSetShift={(g, s, e) => patchIds(ids(g), { s, e })} onRemove={g => rmIds(ids(g))} onFill={fill} onAdd={e => openPop('add', e, null)} />
                  : <div className="il-lab v-lab" onClick={() => unfold(c.id, [firstShort(c.id)])} title={brush && !canBrush(c.id) ? ctrBy[brush].name + ' tilbyr ikke ' + c.id : 'Bemann ' + c.id}><Icon name="chevrons-up-down" size={13} /><i className="il-dot"></i><span className="il-nm">{c.id}</span><span className="il-tot">{tot > 0.01 ? '−' + fmtH(tot) + ' t' : '✓'}</span></div>}
                {DAYS.map((d, j) => { const list = listOf(c.id, j).sort(supOrder), cv = vCov(RESID[c.id][j], list), inR = rng && rng.comp === c.id && range(rng.d0, rng.d1).includes(j);
                  const erR = inR && rng.erase, noNeed = !erasing && brush && canBrush(c.id) && cv.st !== 'short';
                  return <div key={j} className={dc(j, ' v-c' + (open && uf.days.includes(j) ? ' cur' : '') + (inR ? erR ? ' rng-x' : noNeed ? '' : ' rng' : '') + (noNeed ? ' noneed' : ''))} title={noNeed ? (cv.R > 0 ? 'Dekket – penselen hopper over' : 'Ingen restbehov – penselen hopper over') : undefined} onMouseDown={e => cellDown(c.id, j, e)} onMouseEnter={() => cellEnter(c.id, j)}>
                    <VSx cv={cv} />
                    {(list.length > 0 || pv.some(p => p.day === j)) && <div className="v-chips">{(() => { const ms = open ? list.map(b => [b]) : [...list.reduce((m, b) => m.set(b.cid, [...(m.get(b.cid) || []), b]), new Map()).values()], cap = open ? ms : ms.slice(0, ms.length > 3 ? 2 : 3);
                      return <>{cap.map(ps => <VChip key={ps[0].id} b={ps[0]} parts={ps} sup={ctrBy[ps[0].cid]} on={open && uf.sel && uf.sel.includes(ps[0].id)} gone={erR && (!rng.erase.cid || rng.erase.cid === ps[0].cid)} onDown={e => chipDown(ps[0], e)} />)}{!open && ms.length > 3 && <button className="v-more" onMouseDown={e => { e.stopPropagation(); e.preventDefault(); unfold(c.id, [j]); }} title={ms.slice(2).map(ps => ctrBy[ps[0].cid].name + ' ' + sumBy(ps, b => b.fte) + ' pers.').join('\n')}>+{ms.length - 2} til</button>}</>; })()}{pv.filter(p => p.day === j).map((p, i) => <VChip key={'g' + i} b={p} sup={ctrBy[p.cid]} ghost />)}</div>}
                  </div>; })}
              </div>; })}
            <div className="il-row il-sec"><div className="il-lab"><span className="il-eb">Leverandører{uf && !allSup ? ' · ' + uf.comp : ''}</span>{uf && ctrs.length > supList.length && <button className="v-lnk v-all" onClick={() => setAllSup(true)}>Vis alle ({ctrs.length})</button>}{uf && allSup && <button className="v-lnk v-all" onClick={() => setAllSup(false)}>Bare {uf.comp}</button>}<span className="il-eb r">pers.</span></div>{DAYS.map((d, j) => <div key={j} className={dc(j)}></div>)}</div>
            {uf && !supList.length && <div className="il-row il-ro"><div className="il-lab"><span className="v-empty">Ingen leverandør tilbyr {uf.comp}</span></div>{DAYS.map((d, j) => <div key={j} className={dc(j)}></div>)}</div>}
            {supList.map(c => { const mine = bks.filter(b => b.cid === c.id), tot = sumBy(mine, b => b.fte), pend = mine.some(b => vStat(b) !== 'ok');
              return <div key={c.id} className={'il-row il-ro v-sr' + (side.kind === 'ctr' && side.id === c.id ? ' sel' : '') + (brush === c.id ? ' br' : '') + (uf && !c.comps.includes(uf.comp) ? ' off' : '')}>
                <div className="il-lab" onClick={() => { setSide({ kind: 'ctr', id: c.id }); setInsp(true); setErase(false); setBrush(c.id); }} title={'Bestilling ' + c.name + ' · velger pensel'}>
                  <button className={'v-pb' + (brush === c.id ? ' on' : '')} onClick={e => { e.stopPropagation(); pickBrush(c.id); }} title={(brush === c.id ? 'Slipp pensel' : 'Pensel: ' + c.name) + ' (' + (supList.indexOf(c) + 1) + ')'}><Icon name="paintbrush" size={12} /></button><span className="il-nm">{c.name}</span>{pend && <VGlyph st="req" size={12} title="Har bestillinger som venter på svar" />}
                  <span className="il-cm">{COMPS.map(k => <i key={k.id} className={c.comps.includes(k.id) ? 'on' : ''} style={{ '--cc': k.color }} title={k.id}></i>)}</span>
                  <span className="il-tot">{tot || '–'}</span>
                </div>
                {DAYS.map((d, j) => { const l = mine.filter(b => b.day === j), n = sumBy(l, b => b.fte), p = l.some(b => vStat(b) !== 'ok');
                  return <div key={j} className={dc(j)} title={l.map(b => b.comp + ' ' + b.fte + ' pers. ' + IX.fmtT(b.s) + '–' + IX.fmtT(b.e) + ' · ' + V_ST[vStat(b)]).join('\n')}><span className="il-num v-sn">{p && <VGlyph st="req" size={12} />}{n || ''}</span></div>; })}
              </div>; })}
            <div className="il-todayln" style={{ left: todayX }}></div>
          </div>
        </div>
      </div>
      {insp && <aside className="il-insp" data-surface="raised"><button className="il-ib il-close" onClick={() => setInsp(false)} title="Lukk (Esc)"><Icon name="x" size={16} /></button>
        {side.kind === 'ctr' && ctrBy[side.id]
          ? <VOrder c={ctrBy[side.id]} bks={bks} brush={brush === side.id} onDropBrush={() => setBrush(null)} onBack={() => setSide({ kind: 'matrix' })} onPatchC={p => commit(c => ({ ...c, ctrs: c.ctrs.map(x => x.id === side.id ? { ...x, ...p } : x) }))} onConfIds={(is, m) => setConf(is, m)} onOpen={b => unfold(b.comp, [b.day], [b.id])} />
          : side.kind === 'help' ? <div className="il-card"><span className="il-eb">Hjelp</span><h2>Slik leser og bruker du rutenettet</h2>
            <div className="il-how"><span className="il-eb">Tallene</span><dl className="v-keys"><dt>−7,5</dt><dd>Underbemannet: timer som mangler (rødt)</dd><dt>+7,5</dt><dd>Overbemannet: timer over behovet (oker)</dd><dt>Grønt</dt><dd>Ok – innenfor ett skift</dd><dt><VGlyph st="req" size={13} /></dt><dd>Venter på svar</dd><dt><VGlyph st="ok" size={13} /></dt><dd>Bekreftet – bestillinger uten merke er bekreftet. Stiller de færre, juster antallet.</dd></dl></div>
            <div className="il-how"><span className="il-eb">Grep i rutenettet</span><dl className="v-keys"><dt>Klikk</dt><dd>Åpne dagen</dd><dt>Dra</dt><dd>Velg flere dager</dd><dt>⇧-klikk</dt><dd>Utvid utvalget</dd><dt>Pensel + dra</dt><dd>Bestill valgt leverandør</dd><dt>⌥-dra</dt><dd>Fjern</dd><dt>Esc</dt><dd>Avslutt verktøy, fold sammen</dd></dl></div>
            <div className="il-how"><span className="il-eb">Slik fungerer det</span><ol><li><b>Klikk en dag</b> på en kompetanse, eller <b>dra over flere</b> for å bemanne en periode. Endringer gjelder alle valgte dager.</li><li><b>+ Leverandør</b> fyller det som gjenstår. Samme leverandør kan ha flere skift.</li><li><b>Pensel</b> (B eller 1–5): velg leverandør og dra over dager – bestillingen legges inn og åpnes for justering. <b>Tøm</b> (T) eller <b>⌥-dra</b> fjerner.</li><li>Alt starter som <b>venter</b>. Registrer svaret – bekreftet eller delvis – så teller bare det som er lovet.</li><li>Åpne en leverandør for <b>bestillingen</b> du sender.</li></ol></div>
          </div>
          : <div className="il-card"><span className="il-eb">Leverandører</span><h2>Kompetansematrise</h2><p className="il-meta">Hva hver leverandør kan stille med. Bare leverandører med kompetansen kan velges på et behov.</p>
            <IlMatrix ctrs={ctrs} brush={uf ? uf.comp : null} onToggle={(cid, comp) => commit(cc => ({ ...cc, ctrs: cc.ctrs.map(x => x.id === cid ? { ...x, comps: x.comps.includes(comp) ? x.comps.filter(y => y !== comp) : [...x.comps, comp] } : x) }))} onOpen={id => setSide({ kind: 'ctr', id })} />
            
          </div>}
      </aside>}
    </div>
    {pop && pop.kind === 'add' && uf && <VMenu at={pop.r} comp={uf.comp} ctrs={ctrs} onPick={cid => addRun(uf.comp, uf.days, cid)} onClose={() => setPop(null)} />}
    {pop && pop.kind === 'sup' && popG && <VMenu at={pop.r} comp={uf.comp} ctrs={ctrs} cur={popG.cid} onPick={cid => patchIds(ids(popG), { cid })} onClose={() => setPop(null)} />}
    {pop && pop.kind === 'conf' && popG && <VConfPop at={pop.r} g={popG} sup={ctrBy[popG.cid]} onSet={m => setConf(ids(popG), m)} onGot={setGot} onClose={() => setPop(null)} />}
    {pop && pop.kind === 'shift' && popG && <VShiftMenu at={pop.r} g={popG} sup={ctrBy[popG.cid]} onPick={(s, e) => patchIds(ids(popG), { s, e })} onCustom={() => setPop(p => ({ ...p, kind: 'time' }))} onClose={() => setPop(null)} />}
    {pop && pop.kind === 'time' && popG && <VTimePop at={pop.r} g={popG} sup={ctrBy[popG.cid]} crew={vCrewLbl(popG.list)} live={liveFor(ids(popG))} onTime={p => patchIds(ids(popG), p)} onStep={d => crew(popG, d)} onClose={() => setPop(null)} />}
  </div>;
}
window.InnleidApp = InnleidApp;
ReactDOM.createRoot(document.getElementById('root')).render(<InnleidApp />);
