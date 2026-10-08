const PSd = window.PS;
const psT = (m, full) => full || m % 60 ? PSd.fmtT(m) : String(Math.floor(m / 60)).padStart(2, '0');
// approx text widths: 11.5px semibold UI ≈ 6.7px/char, 10.5px numeric ≈ 6px/char
const psLabel = (c, w, mode, hTxt) => { const pad = 13, hw = hTxt ? hTxt.length * 6 + 6 : 0, full = c.id.length * 6.7, sh = c.short.length * 7;
  if (mode === 'short') return w - pad >= sh ? { t: c.short, h: w - pad >= sh + hw } : { t: '', h: false };
  if (w - pad >= full + hw) return { t: c.id, h: true };
  if (mode === 'full') return w - pad >= full ? { t: c.id, h: false } : { t: c.short, h: false, cut: true };
  if (w - pad >= sh + hw) return { t: c.short, h: true };
  return { t: w - pad >= sh ? c.short : '', h: false }; };
const psSpanT = (s, e, W) => W >= 112 ? PSd.fmtT(s) + '–' + PSd.fmtT(e) : psT(s) + '–' + psT(e);
const psComp = Object.fromEntries(PSd.COMPS.map(c => [c.id, c]));
const psCross = j => { document.querySelectorAll('.hx').forEach(e => e.classList.remove('hx')); if (j != null) document.querySelectorAll('[data-col="' + j + '"]').forEach(e => e.classList.add('hx')); };
const psSpanOf = p => { const v = Object.values(p.phases); return [Math.min(...v.map(x => x[0])), Math.max(...v.map(x => x[1]))]; };

function PsProjectLines({ W, open, onToggle, dayCls, selNo, onPick, onLeave, scrollRef, dense, setDense }) {
  const { DAYS, PROJECTS, PHASE_CODES, PHASE_NAMES } = window.EP;
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const N = DAYS.length, RH = dense ? 12 : 22;
  const [vis, setVis] = React.useState([0, 9]);
  React.useEffect(() => {
    const el = scrollRef && scrollRef.current; if (!el) return;
    const f = () => { const side = document.querySelector('.kwork > .kinsp'), vwp = el.clientWidth - 400 - (side ? side.offsetWidth : 0); const a = Math.max(0, Math.floor(el.scrollLeft / W)), b = Math.min(N - 1, Math.max(a, Math.floor((el.scrollLeft + vwp - 1) / W))); setVis(v => v[0] === a && v[1] === b ? v : [a, b]); };
    f(); el.addEventListener('scroll', f); window.addEventListener('resize', f); const t = setInterval(f, 600);
    return () => { el.removeEventListener('scroll', f); window.removeEventListener('resize', f); clearInterval(t); };
  }, [W]);
  const spans = React.useMemo(() => PROJECTS.map(p => { const s = psSpanOf(p); return { p, s, ev: (p.phases.event || s)[0] }; }), []);
  const n = vis[1] - vis[0] + 1;
  const HY = 2; // hysteresis in days: enter when visible, leave only when > HY days outside
  const slots = React.useMemo(() => { let m = 1; for (let a = -HY; a + n - 1 + HY < N + HY; a++) { const c = spans.filter(x => x.s[1] >= a - HY && x.s[0] <= a + n - 1 + HY).length; if (c > m) m = c; } return m; }, [n]);
  const keepRef = React.useRef(new Set());
  const ids = new Set(spans.filter(x => (x.s[1] >= vis[0] && x.s[0] <= vis[1]) || (keepRef.current.has(x.p.no) && x.s[1] >= vis[0] - HY && x.s[0] <= vis[1] + HY)).map(x => x.p.no));
  keepRef.current = ids;
  const inView = spans.filter(x => ids.has(x.p.no)).sort((x, y) => x.ev - y.ev || x.s[0] - y.s[0]).slice(0, slots);
  const key = inView.map(x => x.p.no).join(',');
  // leaving rows fade out from their last slot
  const prevRef = React.useRef([]); const [leaving, setLeaving] = React.useState([]);
  React.useEffect(() => { const prev = prevRef.current, gone = prev.filter(q => !ids.has(q.no)); prevRef.current = inView.map((x, k) => ({ no: x.p.no, k }));
    if (gone.length) { setLeaving(l => [...l.filter(q => !ids.has(q.no) && !gone.some(g => g.no === q.no)), ...gone]); const t = setTimeout(() => setLeaving(l => l.filter(q => !gone.some(g => g.no === q.no))), 280); return () => clearTimeout(t); } }, [key]);
  React.useEffect(() => { if (selNo && !ids.has(selNo) && onLeave) onLeave(selNo); }, [key, selNo]);
  const bars = p => Object.entries(p.phases).map(([ph, [s, e]]) => { const ev = ph === 'event', c = VPC[ph], w = (e - s + 1) * W - 2;
    return <div key={ph} className="kbar" title={p.name + ' · ' + PHASE_NAMES[ph]} style={{ left: s * W + 1, width: w, background: ev ? c : epTint(c, 34), color: ev ? 'var(--on-line)' : 'rgb(var(--ink))', textAlign: ev ? 'left' : 'center', fontFamily: ev ? 'var(--font-ui)' : 'var(--font-numeric)', fontWeight: ev ? 600 : 400 }}>{ev ? p.name : w > 84 ? PHASE_NAMES[ph] : PHASE_CODES[ph]}</div>; });
  return (
    <>
      <div className="ksec"><div className="klab"><button className="ksectog" onClick={onToggle} aria-expanded={open}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /><span className="keb">Prosjekter</span></button>{setDense && <button className="ps-dens" aria-pressed={!!dense} onClick={() => setDense(!dense)} title={dense ? 'Vis detaljert (fasenavn i stolpene)' : 'Vis kompakt (tynne fasestolper)'} aria-label={dense ? 'Vis detaljert' : 'Vis kompakt'}><Icon name={dense ? 'chevrons-up-down' : 'chevrons-down-up'} size={14} /></button>}<span className="kmeta" style={{ whiteSpace: 'nowrap' }}>{inView.length} av {PROJECTS.length}</span></div>{open && <div className="klegend wp">{['assembly', 'movingIn', 'event', 'movingOut', 'dismantle'].map(ph => <span key={ph}><i style={{ background: ph === 'event' ? VPC[ph] : epTint(VPC[ph], 34) }}></i>{PHASE_NAMES[ph]}</span>)}</div>}<div style={{ width: N * W, flex: 'none' }}></div></div>
      {open && <div className={'ps-plbox' + (dense ? ' dense' : '')} style={{ height: slots * RH }}>
        {Array.from({ length: slots }, (_, k) => <div key={'bg' + k} className="krow khall ps-plbg"><div className="klab"></div><div className="ktrack" style={{ width: N * W }}>{DAYS.map((d, i) => <div key={i} className={dayCls(i)}></div>)}</div></div>)}
        {leaving.filter(q => !ids.has(q.no)).map(q => { const p = PROJECTS.find(z => z.no === q.no); return <div key={'out' + q.no} className="krow khall ps-pl abs out" style={{ top: q.k * RH }}><div className="klab"><span className="ps-pn">{p.name}</span><span className="khname">{p.halls.join(' · ')}</span></div><div className="ktrack" style={{ width: N * W }}>{bars(p)}</div></div>; })}
        {inView.map((x, k) => { const p = x.p;
          return <div key={p.no} className={'krow khall ps-pl abs' + (selNo === p.no ? ' sel' : selNo ? ' dim' : '')} style={{ top: k * RH }}>
            <div className="klab" onClick={onPick ? () => onPick(p.no) : undefined} title={selNo === p.no ? 'Vis behov for alle prosjekter' : 'Vis behovet for ' + p.name}><span className="ps-pn">{p.name}</span><span className="khname" title={'Haller: ' + p.halls.join(', ')}>{p.halls.join(' · ')}</span></div>
            <div className="ktrack" style={{ width: N * W }}>{bars(p)}</div>
          </div>; })}
      </div>}
    </>
  );
}

function PsCompStrip({ W, open, onToggle, dayCls, dem, asg, brush, onPick, onCell, scope, setScope, project, focusDay, onFocus, dense, setDense }) {
  const { DAYS, PROJECTS } = window.EP;
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const pname = project && PROJECTS.find(p => p.no === project).name;
  return (
    <>
      <div className="ksec ps-csec"><div className="klab">
        <button className="ksectog" onClick={onToggle} aria-expanded={open}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /><span className="keb">Kompetanse</span></button>{setDense && <button className="ps-dens" aria-pressed={!!dense} onClick={() => setDense(!dense)} title={dense ? 'Vis detaljert (timer igjen per dag)' : 'Vis kompakt (én tynn linje per kompetanse)'} aria-label={dense ? 'Vis detaljert' : 'Vis kompakt'}><Icon name={dense ? 'chevrons-up-down' : 'chevrons-down-up'} size={14} /></button>}
        <span className="kmeta" style={{ marginLeft: 'auto' }}>t igjen</span>
        
      </div></div>
      {open && PSd.COMPS.map((c, k) => {
        const tot = DAYS.reduce((a, d, i) => a + Math.max(0, dem[c.id][i] - asg[c.id][i]), 0);
        return (
          <div key={c.id} className={'krow ps-cr' + (dense ? ' dense' : '') + (brush === c.id ? ' on' : brush ? ' off' : '')} style={{ '--cc': c.color }}>
            <div className="klab" onClick={() => onPick(c.id)} title={'Velg ' + c.id + ' som pensel (' + (k + 1) + '). Folder sammen åpen person.'}><i className="ps-sw"></i><span className="ps-cn">{c.id}</span>{!dense && <kbd>{k + 1}</kbd>}<span className="ps-tot">{tot > 0.05 ? PSd.fmtH(tot) + ' t' : '✓'}</span></div>
            {DAYS.map((d, i) => {
              const r = dem[c.id][i], a = asg[c.id][i];
              const body = !r && !a ? null : dense ? (() => { const rem = r - a, cov = Math.min(1, a / Math.max(r, 0.1)); return <div className={'ps-dl' + (rem < -0.05 ? ' over' : rem <= 0.05 ? ' ok' : '')} title={c.id + ' · ' + (rem > 0.05 ? PSd.fmtH(rem) + ' t igjen av ' + PSd.fmtH(r) : rem < -0.05 ? '+' + PSd.fmtH(-rem) + ' t over' : 'dekket')}><i style={{ width: (1 - cov) * 100 + '%' }}></i></div>; })() : (() => { const rem = r - a, cls = rem > 0.05 ? 'unc' : rem < -0.05 ? 'over' : 'ok';
                return <div className="ps-dc"><span className="ps-dv"><span className={'ps-n ' + cls}>{rem > 0.05 ? PSd.fmtH(rem) : rem < -0.05 ? '+' + PSd.fmtH(-rem) : '✓'}</span>{W >= 80 && r < 100 && Math.abs(rem) < 100 && <em>av {PSd.fmtH(r)}</em>}</span><span className="ps-mb"><i style={{ width: Math.min(100, a / Math.max(r, 0.1) * 100) + '%' }}></i></span></div>; })();
              return <div key={i} data-col={i} className={dayCls(i) + ' ps-cc' + (i === focusDay ? ' fd' : '')} onClick={e => { onPick(c.id, true); onFocus(i); onCell && onCell(c.id, i, e); }}>{body}</div>;
            })}
          </div>
        );
      })}
    </>
  );
}

function PsPreview({ iv, W, half }) {
  const span = PSd.E - PSd.S, inner = W - 8, h = iv.reduce((a, [s, e]) => a + PSd.hrs(s, e), 0);
  return <>{iv.map(([s, e], k) => { const w = (Math.min(e, PSd.E) - Math.max(s, PSd.S)) / span * inner; return <div key={k} className={'ps-pv' + (half ? ' half' : '')} style={{ left: 4 + (Math.max(s, PSd.S) - PSd.S) / span * inner, width: Math.max(3, w - 1) }}>{k === iv.length - 1 && w > 30 && <span>+{PSd.fmtH(h)}</span>}</div>; })}</>;
}
function PsBlocks({ bl, W, sick, otTag, erasing, label = 'auto' }) {
  const span = PSd.E - PSd.S, inner = W - 8;
  return <>
    {bl.filter(b => b.e > PSd.S && b.s < PSd.E).map(b => { const s = Math.max(b.s, PSd.S), e = Math.min(b.e, PSd.E), w = (e - s) / span * inner, c = psComp[b.comp];
      return <div key={b.id} className={'ps-b' + (sick ? ' unres' : '') + (erasing ? ' erasing' : '')} style={{ '--cc': c.color, left: 4 + (s - PSd.S) / span * inner, width: Math.max(3, w - 1) }} title={b.comp + ' ' + PSd.fmtT(b.s) + '–' + PSd.fmtT(b.e)}>{(() => { const hT = PSd.fmtH(PSd.hrs(b.s, b.e)), L = psLabel(c, w, label, hT); return <>{L.t && <b>{L.t}</b>}{L.h && <em>{hT}</em>}</>; })()}</div>; })}
    {otTag > 0.05 && <span className="ps-ot" title="Overtid">+{PSd.fmtH(otTag)}</span>}
    {sick && <span className="ps-sick">Syk</span>}
  </>;
}

function PsPeople({ W, label, dayCls, people, crews = [], hired = [], crewTarget, onCrewStep, onCrewOpen, selRect, onSelRect, onMoveDay, clip, onHoverDay, otLimit = 10, blocksOf, availOf, isSick, brush, tool, selPid, onSelect, onPaint, onErase, onCtx, focusDay, onFocus, weekOf, vPid, vrow, onFold }) {
  const { DAYS } = window.EP;
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const [drag, setDrag] = React.useState(null);
  const [hover, setHover] = React.useState(null);
  const [shift, setShift] = React.useState(false);
  const dragRef = React.useRef(null);
  const elig = p => !brush || p.comps.includes(brush);
  const extra = crews.length || hired.length ? [{ id: '__hdr', hdr: true }, ...crews.map(c => ({ ...c, crew: true, comps: [c.comp], name: c.supplier })), ...hired] : [];
  const rowsV = [...(brush ? [...people.filter(elig), ...people.filter(p => !elig(p))] : people), ...extra];
  const split = brush ? people.filter(elig).length : -1;
  const rect = d => d && { r0: Math.min(d.r0, d.r1), r1: Math.max(d.r0, d.r1), d0: Math.min(d.d0, d.d1), d1: Math.max(d.d0, d.d1) };
  const cellsOf = d => { const r = rect(d), out = []; for (let i = r.r0; i <= r.r1; i++) for (let j = r.d0; j <= r.d1; j++) if (!PSd.we(j) && rowsV[i] && !rowsV[i].hdr && rowsV[i].id !== vPid) out.push({ crew: !!rowsV[i].crew, pid: rowsV[i].id, day: j }); return out; };
  const L = React.useRef(); const contRef = React.useRef(null); L.current = { cellsOf, onPaint, onErase, onSelRect, onMoveDay, rowsV, W, nD: DAYS.length, cont: contRef.current };
  React.useEffect(() => {
    const up = () => { const d = dragRef.current; if (!d) return; dragRef.current = null; setDrag(null); psCross(null); if (d.mode === 'move') { const R = L.current.rowsV; if (d.r1 === d.r0 && d.d1 === d.d0) L.current.onSelRect && L.current.onSelRect({ pids: [R[d.r0].id], d0: d.d0, d1: d.d0 }); else L.current.onMoveDay(R[d.r0].id, d.d0, R[d.r1].id, d.d1, d.alt); return; } if (d.mode === 'select') { const R = L.current.rowsV, r0 = Math.min(d.r0, d.r1), r1 = Math.max(d.r0, d.r1), pids = R.slice(r0, r1 + 1).filter(x => !x.hdr && !x.crew).map(x => x.id); L.current.onSelRect && L.current.onSelRect(pids.length ? { pids, d0: Math.min(d.d0, d.d1), d1: Math.max(d.d0, d.d1) } : null); return; } const cells = L.current.cellsOf(d); d.mode === 'erase' ? L.current.onErase(cells) : L.current.onPaint(cells, d.half); };
    const kd = e => e.key === 'Shift' && setShift(true), ku = e => e.key === 'Shift' && setShift(false), bl = () => setShift(false);
    const mv = e => { const d = dragRef.current, C = L.current.cont; if (!d || !C) return;
      const K = document.querySelector('.kal'), side = document.querySelector('.kwork > .kinsp');
      if (K) { const kr = K.getBoundingClientRect(), right = side ? Math.min(kr.right, side.getBoundingClientRect().left) : kr.right;
        if (e.clientX > right - 40) K.scrollLeft += 14; else if (e.clientX < kr.left + 416 && K.scrollLeft > 0) K.scrollLeft -= 14;
        if (e.clientY > kr.bottom - 24) K.scrollTop += 10; }
      const cr = C.getBoundingClientRect(), W = L.current.W, nD = L.current.nD;
      const j = Math.max(0, Math.min(nD - 1, Math.floor((e.clientX - cr.left - 400) / W)));
      const firsts = [...C.querySelectorAll('[data-ri][data-j="0"]')]; if (!firsts.length) return;
      let best = firsts[0], bd = Infinity; for (const el of firsts) { const r = el.getBoundingClientRect(); const dd = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0; if (dd < bd) { bd = dd; best = el; } if (!dd) break; }
      const ri = +best.dataset.ri; psCross(j); if (d.r1 !== ri || d.d1 !== j || d.alt !== e.altKey) { const n = { ...d, r1: ri, d1: j, alt: e.altKey }; dragRef.current = n; setDrag(n); } };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up); window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', bl);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', bl); };
  }, []);
  const selIdx = !drag && selRect ? (() => { const ix = selRect.pids.map(id => rowsV.findIndex(x => x.id === id)).filter(i => i >= 0); return ix.length ? { r0: Math.min(...ix), r1: Math.max(...ix), d0: selRect.d0, d1: selRect.d1 } : null; })() : null;
  const rr = drag ? (drag.mode === 'move' ? null : rect(drag)) : selIdx;
  const inRect = (ri, j) => rr && ri >= rr.r0 && ri <= rr.r1 && j >= rr.d0 && j <= rr.d1;
  const [box, setBox] = React.useState(null);
  React.useLayoutEffect(() => {
    const C = contRef.current; if (!rr || !C) { if (box) setBox(null); return; }
    const a = C.querySelector('[data-ri="' + rr.r0 + '"][data-j="' + rr.d0 + '"]'), b = C.querySelector('[data-ri="' + rr.r1 + '"][data-j="' + rr.d1 + '"]');
    if (!a || !b) return; const cr = C.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    setBox({ left: 400 + rr.d0 * W + 1, top: ra.top - cr.top + 1, width: (rr.d1 - rr.d0 + 1) * W - 2, height: rb.bottom - ra.top - 2 });
  }, [rr && rr.r0, rr && rr.r1, rr && rr.d0, rr && rr.d1, !!drag, W]);
  React.useEffect(() => { const k = e => { if (e.key === 'Escape' && dragRef.current) { dragRef.current = null; setDrag(null); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const half = drag ? drag.half : shift;
  const canP = (p, j) => p.crew ? brush === p.comp && !PSd.we(j) : brush && p.comps.includes(brush) && availOf(p.id, j).s != null && !isSick(p.id, j) && !PSd.we(j);
  const prevIv = (p, j) => { const bl = blocksOf(p.id, j); let iv = PSd.freeIv(half ? { s: PSd.S, e: PSd.L0 } : { s: PSd.S, e: PSd.E }, bl); if (half && !iv.length) iv = PSd.freeIv({ s: PSd.L1, e: PSd.E }, bl); return iv; };
  let stat = null;
  if (drag && drag.mode !== 'move') {
    const all = drag.mode === 'select' ? [] : cellsOf(drag), cc = all.filter(c => c.crew), cells = all.filter(c => !c.crew), crewBy = Object.fromEntries(crews.map(c => [c.id, c]));
    if (drag.mode === 'select') stat = { sel: true };
    else if (drag.mode === 'erase') { const bl = cells.flatMap(c => blocksOf(c.pid, c.day)), ce = cc.filter(c => crewBy[c.pid].counts[c.day]); stat = { n: cells.filter(c => blocksOf(c.pid, c.day).length).length + ce.length, h: bl.reduce((a, b) => a + PSd.hrs(b.s, b.e), 0) + ce.reduce((a, c) => a + crewBy[c.pid].counts[c.day] * 7.5, 0), people: new Set(bl.map(b => b.pid)).size }; }
    else { const byId = Object.fromEntries([...people, ...hired].map(q => [q.id, q])); const ok = cells.filter(c => canP(byId[c.pid], c.day)); const hh = ok.reduce((a, c) => a + prevIv(byId[c.pid], c.day).reduce((x, [s, e]) => x + PSd.hrs(s, e), 0), 0); const cOk = cc.filter(c => crewBy[c.pid].comp === brush), cAdd = cOk.reduce((a, c) => a + Math.max(0, crewTarget(brush, c.day, c.pid) - (crewBy[c.pid].counts[c.day] || 0)), 0);
      stat = { n: ok.filter(c => prevIv(byId[c.pid], c.day).length).length + cOk.filter(c => crewTarget(brush, c.day, c.pid) > (crewBy[c.pid].counts[c.day] || 0)).length, h: hh + cAdd * 7.5, people: new Set(ok.map(c => c.pid)).size + (cAdd ? 1 : 0), skip: cells.length - ok.length + cc.length - cOk.length }; }
  }
  const down = (ri, j, e) => {
    if (e.button !== 0) return;
    if (!rowsV[ri].crew) onSelect(rowsV[ri].id); onFocus(j);
    if (tool === 'select' && onMoveDay && !e.altKey && !rowsV[ri].crew && e.target.closest('.ps-b')) { e.preventDefault(); const d = { mode: 'move', r0: ri, d0: j, r1: ri, d1: j, alt: false }; dragRef.current = d; setDrag(d); return; }
    const mode = tool === 'erase' || e.altKey ? 'erase' : tool === 'paint' && brush ? 'paint' : tool === 'select' && onSelRect && !rowsV[ri].crew ? 'select' : null;
    if (!mode) return;
    e.preventDefault();
    const d = { mode, half: mode === 'paint' && e.shiftKey, r0: ri, d0: j, r1: ri, d1: j }; dragRef.current = d; setDrag(d);
  };
  const enter = (ri, j) => { psCross(j); onHoverDay && onHoverDay(j); if (!dragRef.current) setHover({ ri, j }); };
  const pastePrev = {}; if (clip && hover && !drag && tool === 'select') clip.items.forEach(it => { const d = hover.j + it.off; if (d >= DAYS.length) return; const av = availOf(it.pid, d); if (av.off || isSick(it.pid, d)) return; let ex = blocksOf(it.pid, d).slice(); const iv = []; it.blocks.forEach(b => PSd.freeIv({ s: b.s, e: b.e }, ex).forEach(([s, e]) => { iv.push([s, e]); ex.push({ s, e }); })); if (iv.length) pastePrev[it.pid + '|' + d] = { iv, comp: it.blocks[0].comp }; });
  let moveNo = null;
  if (drag && drag.mode === 'move' && (drag.r1 !== drag.r0 || drag.d1 !== drag.d0)) { const sp = rowsV[drag.r0], tp = rowsV[drag.r1], td = drag.d1, src = sp ? blocksOf(sp.id, drag.d0) : [];
    const ok = tp && !tp.crew && !tp.hdr && !PSd.we(td) && !availOf(tp.id, td).off && !isSick(tp.id, td) && src.length && src.every(b => tp.comps.includes(b.comp));
    if (!ok) moveNo = tp && tp.id + '|' + td; else { let ex = blocksOf(tp.id, td).slice(); const iv = []; src.forEach(b => PSd.freeIv({ s: b.s, e: b.e }, ex).forEach(([s, e]) => { iv.push([s, e]); ex.push({ s, e }); })); if (iv.length) pastePrev[tp.id + '|' + td] = { iv, comp: src[0].comp }; else moveNo = tp.id + '|' + td; } }
  return (
    <div className="ps-people" ref={contRef} data-t={tool === 'paint' && brush ? 'paint' : tool} data-drag={drag ? drag.mode : null} onMouseLeave={() => { setHover(null); psCross(null); }} style={brush ? { '--bc': psComp[brush].color } : undefined}>
      {box && !drag && selIdx && <div className="ps-selbox select" style={box}><span className={'ps-selpill' + (box.top < 30 ? ' below' : '')}><b>{selRect.d1 - selRect.d0 + 1} {selRect.d1 > selRect.d0 ? 'dager' : 'dag'} × {selRect.pids.length} pers.</b>{clip && clip.src === selRect ? <em>Kopiert · ⌘V limer inn ved markøren</em> : <em>⌘C kopier · Esc fjern</em>}</span></div>}
      {drag && box && stat && <div className={'ps-selbox ' + drag.mode} style={box}><span className={'ps-selpill' + (box.top < 30 ? ' below' : '')}>{drag.mode === 'select' ? <b>{Math.abs(drag.d1 - drag.d0) + 1} dager × {Math.abs(drag.r1 - drag.r0) + 1} rader</b> : drag.mode === 'erase' ? <><b>Tøm</b>{stat.n} {stat.n === 1 ? 'dag' : 'dager'} · {PSd.fmtH(stat.h)} t</> : <><i></i><b>{brush}</b>{stat.n ? stat.n + (stat.n === 1 ? ' dag' : ' dager') + ' · +' + PSd.fmtH(stat.h) + ' t' + (stat.people > 1 ? ' · ' + stat.people + ' pers.' : '') : 'ingen ledig tid'}{drag.half && <em>halv dag</em>}{stat.skip > 0 && <em>{stat.skip} hoppes over</em>}</>}</span></div>}
      {vPid && vrow && <div className="ps-pin"><PsVRow {...vrow} W={W} dayCls={dayCls} /></div>}
      {rowsV.map((p, ri) => {
        if (p.hdr) return <div key="__hdr" className="krow ps-sec2"><div className="klab"><span className="keb">Innleid</span><span className="kmeta" style={{ marginLeft: 10 }}>{crews.length} mannskap · {hired.length} navngitt</span><span className="kmeta" style={{ marginLeft: 'auto' }}>dagsverk</span></div><span className="kmeta">Antall per dag teller som «Innleid» i Behov · mal med kompetansen for å fylle hullet</span></div>;
        if (p.crew) { const c = psComp[p.comp], dimC = brush && brush !== p.comp, tot = Object.values(p.counts).reduce((a, b) => a + b, 0);
          return <div key={p.id} className={'krow ps-pr ps-crew' + (dimC ? ' dim' : '')}>
            <div className="klab" onClick={() => onCrewOpen(p.id)} title="Åpne mannskapet"><div className="ps-pnw"><span className="ps-nm">{p.supplier}</span><span className="ps-ctag" style={{ '--cc': c.color }}><i></i>{p.comp}</span></div><span className="ps-pw"><b>{tot}</b> dagsverk</span></div>
            {DAYS.map((d, j) => { const n = p.counts[j] || 0, weD = PSd.we(j), inR = drag && inRect(ri, j), er = inR ? drag.mode === 'erase' : tool === 'erase' && hover && hover.ri === ri && hover.j === j;
              const pv = (inR ? drag.mode === 'paint' : tool === 'paint' && hover && hover.ri === ri && hover.j === j) && canP(p, j) ? crewTarget(brush, j, p.id) : 0;
              return <div key={j} data-ri={ri} data-j={j} className={dayCls(j) + ' ps-c' + (brush && tool === 'paint' && (dimC || weD) ? ' no' : '')} onMouseDown={e => down(ri, j, e)} onMouseEnter={() => enter(ri, j)}>
                {n > 0 && <div className={'ps-cb' + (er ? ' erasing' : '')} style={{ '--cc': c.color }}><b>{n} ×</b>{W >= 90 && <span>{p.comp}</span>}</div>}
                {pv > n && <div className="ps-pv" style={{ left: 4, right: 4, width: 'auto' }}><span>{n ? n + ' → ' : ''}{pv} ×</span></div>}
                {tool === 'select' && <span className="ps-step" onMouseDown={e => e.stopPropagation()}><button disabled={!n} onClick={() => onCrewStep(p.id, j, -1)} aria-label="Én færre">−</button><button onClick={() => onCrewStep(p.id, j, 1)} aria-label="Én til">+</button></span>}
              </div>; })}
          </div>; }
        const wk = weekOf(p.id), dim = !elig(p);
        if (p.id === vPid) return null;
        return (
          <React.Fragment key={p.id}>
            {ri === split && split < people.length && <div className="krow ps-div"><div className="klab"><Icon name="chevron-down" size={14} />Uten {brush} · {people.length - split}</div><span className="kmeta">Kan ikke tildeles {brush}</span></div>}
            <div className={'krow ps-pr' + (dim ? ' dim' : '') + (p.id === selPid ? ' sel' : '')}>
              <div className="klab" onClick={() => onSelect(p.id, true)} title="Brett ut timer (klikk, dobbeltklikk en dag eller E)">
                <div className="ps-pnw"><span className="ps-nm">{p.name}</span>{p.kind === 'hired' && <span className="ps-hire" title={'Innleid · ' + p.supplier}>{p.supplier}</span>}<span className="ps-pc">{PSd.COMPS.map(c => <i key={c.id} className={p.comps.includes(c.id) ? 'has' : ''} style={{ '--cc': c.color }} title={c.id}></i>)}</span></div>
                <span className={'ps-pw' + (wk.ot > otLimit + 0.05 ? ' otw' : '')} title={wk.ot > otLimit + 0.05 ? 'Over overtidsgrensen: ' + PSd.fmtH(wk.ot) + ' t denne uka (grense ' + otLimit + ' t)' : 'Normaltid denne uka (overtid)'}><b>{PSd.fmtH(wk.a)}</b>/{PSd.fmtH(wk.c)}{wk.ot > 0.05 && <em> +{PSd.fmtH(wk.ot)}</em>}</span>
              </div>
              {DAYS.map((d, j) => {
                const av = availOf(p.id, j), bl = blocksOf(p.id, j), sk = isSick(p.id, j), weD = PSd.we(j);
                const no = brush && tool === 'paint' && (dim || av.s == null);
                const ot = bl.reduce((a, b) => a + PSd.otH(b, weD), 0);
                return (
                  <div key={j} data-ri={ri} data-j={j} className={dayCls(j) + ' ps-c' + (no || moveNo === p.id + '|' + j ? ' no' : '') + (drag && drag.mode === 'move' && !drag.alt && drag.r0 === ri && drag.d0 === j && (drag.r1 !== ri || drag.d1 !== j) ? ' mvsrc' : '') + (sk ? ' sk' : '') + (av.off ? ' off' : '') + (j === focusDay ? ' fd' : '')}
                    onMouseDown={e => down(ri, j, e)} onDoubleClick={() => tool !== 'paint' && tool !== 'erase' && onSelect(p.id, true)} onMouseEnter={() => enter(ri, j)} onContextMenu={e => { e.preventDefault(); onCtx(p, j, e); }}>
                    {av.off ? <span className="ps-offl">{av.off}</span> : weD ? (bl.length ? <span className="ps-wec">{bl.map(b => <i key={b.id} style={{ background: psComp[b.comp].color }}></i>)}<span className="ps-ot we">+{PSd.fmtH(ot)}</span></span> : null) : <>{pastePrev[p.id + '|' + j] && <div style={{ '--bc': psComp[pastePrev[p.id + '|' + j].comp].color, display: 'contents' }}><PsPreview iv={pastePrev[p.id + '|' + j].iv} W={W} /></div>}<PsBlocks bl={bl} W={W} label={label} sick={sk} otTag={ot} erasing={drag ? drag.mode === 'erase' && inRect(ri, j) : (tool === 'erase' && hover && hover.ri === ri && hover.j === j)} />{(drag ? drag.mode === 'paint' && inRect(ri, j) : tool === 'paint' && hover && hover.ri === ri && hover.j === j) && canP(p, j) && <PsPreview iv={prevIv(p, j)} W={W} half={half} />}</>}
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}
      <div style={{ height: 120 }}></div>
    </div>
  );
}

function PsVRow({ p, W, label = 'auto', dayCls, blocksOf, availOf, isSick, brush, setBrush, selBlock, onSelBlock, ops, project, onFold, onStep, wk, per, wkNo }) {
  const { DAYS } = window.EP;
  const { Icon, IconButton } = window.WarmMinimalDesignSystem_58386e;
  const H = 340, y = t => (t - PSd.T0) / (PSd.T1 - PSd.T0) * H;
  const tOf = py => Math.max(PSd.T0, Math.min(PSd.T1, Math.round((PSd.T0 + py / H * (PSd.T1 - PSd.T0)) / 30) * 30));
  const comp = brush && p.comps.includes(brush) ? brush : p.comps[0];
  const [dr, setDr] = React.useState(null);
  const drRef = React.useRef(null);
  const L = React.useRef(); L.current = { ops, comp, p, project };
  React.useEffect(() => {
    const mv = e => { const d = drRef.current; if (!d) return; let n;
      if (d.kind === 'move') { const el = document.elementFromPoint(e.clientX, e.clientY), td = el && el.closest('[data-vday]'); const dur = d.e0 - d.s0; n = { ...d, day: td ? +td.dataset.vday : d.day, s: Math.min(tOf(e.clientY - d.top - d.off), PSd.T1 - dur), moved: d.moved || Math.abs(e.clientY - d.cy) > 4 || Math.abs(e.clientX - d.cx) > 4 }; }
      else n = { ...d, t: tOf(e.clientY - d.top) };
      drRef.current = n; setDr(n); };
    const up = () => { const d = drRef.current; if (!d) return; drRef.current = null; setDr(null); const C = L.current;
      if (d.kind === 'new') { const s = Math.min(d.t0, d.t), e = Math.max(d.t0, d.t); if (e - s >= 30) C.ops.create(C.p.id, d.day, C.comp, s, e, C.project || undefined); }
      else if (d.kind === 'move') { if (d.moved && (d.day !== d.day0 || d.s !== d.s0)) C.ops.move(d.id, d.day, d.s, d.s + d.e0 - d.s0); }
      else { let s = d.s0, e = d.e0; if (d.kind === 't') s = Math.min(d.t, e - 30); else e = Math.max(d.t, s + 30); C.ops.update(d.id, s, e); } };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);
  const trackDown = (day, e) => { if (e.button !== 0 || e.target.closest('.ps-vb')) return; if (availOf(p.id, day).off || isSick(p.id, day)) return; const top = e.currentTarget.getBoundingClientRect().top, t0 = tOf(e.clientY - top); const d = { kind: 'new', day, top, t0, t: t0 }; drRef.current = d; setDr(d); e.preventDefault(); };
  const blockDown = (b, e) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); onSelBlock(b.id); const top = e.currentTarget.parentElement.getBoundingClientRect().top; const d = { kind: 'move', id: b.id, day: b.day, day0: b.day, s: b.s, s0: b.s, e0: b.e, top, off: e.clientY - top - y(b.s), cx: e.clientX, cy: e.clientY, moved: false }; drRef.current = d; setDr(d); };
  const hDown = (b, kind, e) => { e.stopPropagation(); e.preventDefault(); const top = e.currentTarget.closest('.ps-vt').getBoundingClientRect().top; const d = { kind, id: b.id, day: b.day, s0: b.s, e0: b.e, top, t: kind === 't' ? b.s : b.e }; drRef.current = d; setDr(d); onSelBlock(b.id); };
  const view = b => !dr || dr.id !== b.id ? b : dr.kind === 't' ? { ...b, s: Math.min(dr.t, b.e - 30) } : dr.kind === 'b' ? { ...b, e: Math.max(dr.t, b.s + 30) } : b;
  const moving = dr && dr.kind === 'move' && dr.moved ? dr : null;
  const Blk = ({ b, weD, sk, cls = '' }) => { const c = psComp[b.comp], h = y(b.e) - y(b.s), segs = weD ? [[b.s, b.e]] : [[b.s, Math.min(b.e, PSd.S)], [Math.max(b.s, PSd.E), b.e]];
    return <div className={'ps-vb' + (b.id === selBlock ? ' sel' : '') + (sk ? ' unres' : '') + cls} style={{ '--cc': c.color, top: y(b.s) + 1, height: Math.max(8, h - 2) }} onMouseDown={e => blockDown(b, e)} title={b.comp + ' ' + PSd.fmtT(b.s) + '–' + PSd.fmtT(b.e)}>
      {segs.filter(([s, e]) => e > s).map(([s, e], k) => <span key={k} className="ps-vot" style={{ top: y(s) - y(b.s), height: y(e) - y(s) }}></span>)}
      {h > 18 && <b>{label === 'short' ? c.short : label === 'full' || (W - 18) >= c.id.length * 6.7 ? b.comp : c.short}</b>}{h > 34 && <em title={PSd.fmtT(b.s) + '–' + PSd.fmtT(b.e)}>{psSpanT(b.s, b.e, W)}</em>}
      <span className="ps-wh-h t" onMouseDown={e => hDown(b, 't', e)}></span><span className="ps-wh-h b" onMouseDown={e => hDown(b, 'b', e)}></span>
    </div>; };
  return (
    <div className="krow ps-vrow">
      <div className="klab">
        <div className="ps-vl-info">
          <div className="ps-vl-top"><button className="ps-vl-fold" onClick={onFold} title="Fold sammen (E)"><Icon name="chevrons-down-up" size={14} /><span className="ps-vl-nm">{p.name}</span></button><span className="ps-vl-nav"><IconButton label="Forrige person (↑)" icon="chevron-up" onClick={() => onStep(-1)} /><IconButton label="Neste person (↓)" icon="chevron-down" onClick={() => onStep(1)} /></span></div>
          <div className="ps-vl-tot">
            <div><span>Uke {wkNo}</span><b>{PSd.fmtH(wk.a)}<i>/ {PSd.fmtH(wk.c)}</i></b></div>
            <div><span>Overtid uka</span><b className={wk.ot > 0.05 ? 'ot' : ''}>{PSd.fmtH(wk.ot)}</b></div>
            <div><span>Perioden</span><b>{PSd.fmtH(per.a)}{per.ot > 0.05 && <i className="ot">+{PSd.fmtH(per.ot)}</i>}</b></div>
          </div>
          <ul className="ps-vl-comps">{p.comps.map(id => { const c = psComp[id]; let hh = 0; for (let i = 0; i < DAYS.length; i++) blocksOf(p.id, i).forEach(x => { if (x.comp === id && !isSick(p.id, i)) hh += PSd.hrs(x.s, x.e); });
            return <li key={id}><button className={comp === id ? 'on' : ''} style={{ '--cc': c.color }} onClick={() => setBrush(id)} title={'Tegn med ' + id}><i></i><span>{id}</span><kbd>{PSd.COMPS.indexOf(c) + 1}</kbd><em className={hh ? '' : 'z'}>{hh ? PSd.fmtH(hh) + ' t' : '–'}</em></button></li>; })}</ul>
          <p className="ps-vl-hint">Dra i en dag for å legge til {comp}. Dra en blokk for å flytte, kantene for å endre.</p>
        </div>
        <div className="ps-vax">{[360, 420, 540, 660, 780, 900, 1020, 1140, 1260].map(t => <span key={t} className={t === 420 || t === 900 ? 'n' : ''} style={{ top: y(t) }}>{PSd.fmtT(t)}</span>)}</div>
      </div>
      {DAYS.map((d, i) => { const av = availOf(p.id, i), sk = isSick(p.id, i), weD = PSd.we(i), na = av.off || sk;
        return (
          <div key={i} className={dayCls(i) + ' ps-vc'}>
            <div className={'ps-vt' + (na ? ' na' : '')} data-vday={i} onMouseDown={e => trackDown(i, e)}>
              {weD ? <div className="ps-wot" style={{ inset: 0 }}></div> : <><div className="ps-wot" style={{ top: 0, height: y(PSd.S) }}></div><div className="ps-wot" style={{ top: y(PSd.E), bottom: 0 }}></div><div className="ps-wl" style={{ top: y(PSd.L0), height: y(PSd.L1) - y(PSd.L0) }}></div><div className="ps-vline" style={{ top: y(PSd.S) }}></div><div className="ps-vline" style={{ top: y(PSd.E) }}></div></>}
              {(av.off || sk) && <div className={'ps-woff' + (sk && !av.off ? ' sick' : '')}>{av.off || 'Syk'}</div>}
              {blocksOf(p.id, i).map(b => <Blk key={b.id} b={view(b)} weD={weD} sk={sk} cls={moving && moving.id === b.id ? ' orig' : ''} />)}
              {moving && moving.day === i && (() => { const b = blocksOf(p.id, moving.day0).find(x => x.id === moving.id); return b ? <Blk b={{ ...b, s: moving.s, e: moving.s + moving.e0 - moving.s0 }} weD={weD} cls=" drag" /> : null; })()}
              {dr && dr.kind === 'new' && dr.day === i && Math.abs(dr.t - dr.t0) >= 30 && <div className="ps-vb ghost" style={{ '--cc': psComp[comp].color, top: y(Math.min(dr.t0, dr.t)), height: y(Math.max(dr.t0, dr.t)) - y(Math.min(dr.t0, dr.t)) }}><b>{comp}</b><em>{psSpanT(Math.min(dr.t0, dr.t), Math.max(dr.t0, dr.t), W)}</em></div>}
            </div>
          </div>
        ); })}
    </div>
  );
}
Object.assign(window, { PsProjectLines, PsCompStrip, PsPeople, PsVRow, psComp, psSpanOf });
