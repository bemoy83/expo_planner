const VPC = { assembly: 'var(--line-blue)', movingIn: 'var(--line-teal)', event: 'var(--line-violet)', movingOut: 'var(--line-amber)', dismantle: 'var(--line-rose)' };
const WPC = { Montering: 'var(--line-blue)', Demontering: 'var(--line-rose)' };
const MIX = (c, p, base = 'rgb(var(--surface))') => `color-mix(in oklab, ${c} ${p}%, ${base})`;
const TONE = { Montering: 'var(--work-m)', Demontering: 'var(--work-d)' };
const TONE_INK = { Montering: 'var(--work-m-ink)', Demontering: 'var(--work-d-ink)' };
const WE_BG = 'var(--sunken-2)';
const WorkMark = ({ phase }) => <span className={'kphase ' + (phase === 'Montering' ? 'm' : 'd')} title={phase} style={{ background: TONE[phase] }}></span>;
const venueDays = {};
window.EP.PROJECTS.forEach(p => { const m = {}; ['assembly', 'movingIn', 'event', 'movingOut', 'dismantle'].forEach(ph => { const s = p.phases[ph]; if (s) for (let i = s[0]; i <= s[1]; i++) m[i] = ph; }); venueDays[p.no] = m; });
const epTint = (c, p) => `color-mix(in oklab, ${c} ${p}%, rgb(var(--surface)))`;
const sumF = fte => Object.values(fte).reduce((a, b) => a + b, 0);
const needF = r => r.hours / window.EP.SETTINGS.hoursPerDay;

function dimVal(r, d) {
  if (d === 'project') return { k: r.projectNo, l: r.projectName };
  if (d === 'phase') return { k: r.phase, l: r.phase };
  if (d === 'competence') return { k: r.competence, l: r.competence };
  if (d === 'hall') return r.hall === undefined ? { k: '*', l: 'Alle haller', all: true } : { k: r.hall, l: 'Hall ' + r.hall };
  return r.avdeling === undefined ? { k: '*', l: 'Alle avd.', all: true } : { k: r.avdeling, l: 'Avd. ' + r.avdeling };
}
function buildItems(rows, grouping, collapsed, { hideEmpty }) {
  const out = [];
  const rec = (rs, dims, depth, prefix) => {
    if (!dims.length) { rs.forEach(r => out.push({ kind: 'row', row: r, depth })); return; }
    const d = dims[0], buckets = new Map();
    if (depth === 0 && d === 'project' && !hideEmpty) window.EP.PROJECTS.forEach(p => buckets.set(p.no, { l: p.name, rows: [] }));
    rs.forEach(r => { const v = dimVal(r, d); if (!buckets.has(v.k)) buckets.set(v.k, { l: v.l, rows: [] }); buckets.get(v.k).rows.push(r); });
    for (const [k, b] of buckets) {
      const key = prefix + '/' + d + ':' + k;
      out.push({ kind: 'group', key, label: b.l, depth, dim: d, rows: b.rows, projectNo: d === 'project' ? k : b.rows[0] && b.rows[0].projectNo });
      if (!collapsed.has(key) && b.rows.length) rec(b.rows, dims.slice(1), depth + 1, key);
    }
  };
  rec(rows, grouping, 0, '');
  return out;
}
const leafLabel = (r, grouping) => window.EP.DIMENSIONS.filter(d => !grouping.includes(d)).map(d => dimVal(r, d)).filter(v => !v.all).map(v => v.l).join(' · ') || 'rad';

function Progress({ need, plan }) {
  if (!need) return null;
  const p = plan / need, over = p > 1.05, done = p >= 0.995 && !over;
  const c = over ? 'rgb(var(--accent))' : done ? 'rgb(var(--committed))' : 'var(--line-blue)';
  return <span className="kprog"><span style={{ width: Math.min(100, p * 100) + '%', background: c }}></span></span>;
}
function Nums({ need, plan, strong }) {
  const { fmt } = window.EP, d = plan - need, over = d > 0.05 * need && d > 0.5, done = Math.abs(d) < 0.05;
  return (
    <span className="knums" style={{ fontWeight: strong ? 600 : 400 }}>
      <span className="knum">{fmt(need)}</span>
      <span className="knum">{fmt(plan)}</span>
      <span className="knum" style={{ color: over ? 'rgb(var(--draft))' : done ? 'rgb(var(--committed))' : 'rgb(var(--ink-faint))' }}>{done ? '✓' : (d > 0 ? '+' : '') + fmt(d)}</span>
    </span>
  );
}

function KalenderGrid({ items, grouping, rows, W, selection, setSelection, onCommit, tool, onRange, onSuggest, onAddRow, collapsed, onToggle, scrollRef, needByDay, projectTotal = 'venue', sums = 'folded', windowDot = true, heat = false, onFoldAll, foldLabel, planBar, onSpreadRow, onShowDetails, mode = 'behov', staff }) {
  const bem = mode === 'bemanning';
  const [showProj, setShowProj] = React.useState(true);
  const [showStrip, setShowStrip] = React.useState(true);
  const { DAYS, HALLS, PROJECTS, HIRED, ABSENT, SETTINGS, fmt, PHASE_CODES, TODAY } = window.EP;
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const [edit, setEdit] = React.useState(null);
  const [drag, setDrag] = React.useState(null);
  const tall = window.innerHeight >= 1100;
  const [showHalls, setShowHalls] = React.useState(tall);
  const [showCap, setShowCap] = React.useState(tall);
  const leafIds = items.filter(i => i.kind === 'row').map(i => i.row.id);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const avail = DAYS.map((d, i) => (d.type === 'Arbeidsdag' ? SETTINGS.baseCrew : 0) + (HIRED[i] || 0) - (ABSENT[i] || 0));
  const N = DAYS.length;
  const devs = avail.map((a, i) => a - needByDay[i]);
  const maxShort = Math.max(1, ...devs.map(d => -d)), maxFree = Math.max(1, ...devs);
  const cm = (c, p) => 'color-mix(in oklab, ' + c + ' ' + Math.round(p) + '%, rgb(var(--canvas)))';
  const heatStyle = v => {
    if (v < 0) { const s = Math.min(1, -v / maxShort); return { bg: cm('rgb(var(--danger))', 22 + s * 63), ink: s > 0.5 ? '#fff' : 'rgb(var(--danger))' }; }
    if (v < 2) return { bg: cm('rgb(var(--draft))', 22), ink: 'rgb(var(--ink))' };
    const t = Math.min(1, v / maxFree); return { bg: cm('rgb(var(--committed))', 8 + t * 20), ink: 'rgb(var(--committed))' };
  };
  const [vw, setVw] = React.useState(0);
  const [mod, setMod] = React.useState(null);
  const [ctx, setCtx] = React.useState(null);
  const barRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = barRef.current; if (!el) return;
    const zs = [...el.querySelectorAll('.kzone')], one = () => zs.every(z => z.offsetTop === zs[0].offsetTop);
    for (const f of ['0', '1', '2', '3']) { el.dataset.fit = f; if (one()) return; }
    for (const f of ['w0', 'w240', 'w160', 'w110', 'w70']) { el.dataset.fit = f; if (new Set(zs.map(z => z.offsetTop)).size <= 2 && el.scrollWidth <= el.offsetWidth + 1) return; }
  });
  React.useEffect(() => { const el = scrollRef.current; if (!el) return; const ro = new ResizeObserver(() => setVw(el.clientWidth)); ro.observe(el); return () => ro.disconnect(); }, []);
  React.useEffect(() => {
    const f = e => setMod(e.altKey ? 'clear' : e.shiftKey ? 'distribute' : null), b = () => setMod(null);
    window.addEventListener('keydown', f); window.addEventListener('keyup', f); window.addEventListener('blur', b);
    return () => { window.removeEventListener('keydown', f); window.removeEventListener('keyup', f); window.removeEventListener('blur', b); };
  }, []);
  React.useEffect(() => {
    if (!ctx) return; const c = () => setCtx(null), k = e => e.key === 'Escape' && setCtx(null);
    window.addEventListener('mousedown', c); window.addEventListener('keydown', k); return () => { window.removeEventListener('mousedown', c); window.removeEventListener('keydown', k); };
  }, [ctx]);

  React.useEffect(() => {
    if (!drag) return;
    const up = () => { onRange(drag.rowId, Math.min(drag.a, drag.b), Math.max(drag.a, drag.b), drag.tool); setDrag(null); };
    window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up);
  }, [drag]);

  const move = (dr, dc) => {
    if (!selection) return;
    const ri = Math.max(0, Math.min(leafIds.length - 1, leafIds.indexOf(selection.rowId) + dr));
    const col = Math.max(0, Math.min(N - 1, selection.col + dc));
    setSelection({ rowId: leafIds[ri], col });
    const el = scrollRef.current; if (el) { const x = 400 + col * W; if (x + W > el.scrollLeft + el.clientWidth) el.scrollLeft = x + W - el.clientWidth + 8; if (x - 400 < el.scrollLeft) el.scrollLeft = x - 400; }
  };
  const commitEdit = (dr, dc) => {
    const t = edit.text.trim().replace(',', '.');
    const v = t === '' ? null : Number(t);
    if (v === null || isFinite(v)) onCommit(edit.rowId, edit.col, v);
    setEdit(null); move(dr, dc);
  };
  const onKey = e => {
    if (bem) return;
    if (edit) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.shiftKey ? -1 : 1, 0); }
      else if (e.key === 'Tab') { e.preventDefault(); commitEdit(0, e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') setEdit(null);
      return;
    }
    if (!selection) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'Enter') { e.preventDefault(); move(1, 0); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
    else if (k === 'ArrowRight' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); move(0, 1); }
    else if (k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); move(0, -1); }
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); onCommit(selection.rowId, selection.col, null); }
    else if (k === 'F2') { const r = byId[selection.rowId]; setEdit({ ...selection, text: r.fte[selection.col] != null ? String(r.fte[selection.col]).replace('.', ',') : '' }); }
    else if (/^[0-9,.]$/.test(k) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setEdit({ ...selection, text: k }); }
  };

  const dayCls = i => 'kcell' + (DAYS[i].type !== 'Arbeidsdag' ? ' we' : '') + (DAYS[i].type === 'Helligdag' ? ' red' : '') + (i === TODAY ? ' today' : '') + (i < DAYS.length - 1 && DAYS[i + 1].wd === 'man' ? ' wke' : '') + (heat && devs[i] < 0 ? ' short' : '');
  const Row = ({ cls = '', label, cells, h }) => (
    <div className={'krow ' + cls} style={h ? { height: h } : undefined}>
      <div className="klab">{label}</div>
      {DAYS.map((d, i) => <div key={i} className={dayCls(i)}>{cells ? cells(i) : null}</div>)}
    </div>
  );

  const hallBars = hall => {
    const bars = [];
    PROJECTS.filter(p => p.halls.includes(hall)).forEach(p => {
      Object.entries(p.phases).forEach(([ph, [a, b]]) => {
        const ev = ph === 'event', c = VPC[ph];
        bars.push(<div key={p.no + ph} className="kbar" title={p.name + ' · ' + window.EP.PHASE_NAMES[ph]}
          style={{ left: a * W + 1, width: (b - a + 1) * W - 2, background: ev ? c : epTint(c, 34), color: ev ? 'var(--on-line)' : 'rgb(var(--ink))', textAlign: ev ? 'left' : 'center', fontFamily: ev ? 'var(--font-ui)' : 'var(--font-numeric)', fontWeight: ev ? 600 : 400 }}>{ev ? p.name : PHASE_CODES[ph]}</div>);
      });
    });
    return bars;
  };

  const capRow = (key, label, vals, opt = {}) => (
    <Row key={key} cls={(opt.cls || '') + (opt.strong && !opt.avvik ? ' ktotal' : '') + (opt.avvik ? ' kavvik' : '')} label={<span className={'kcap' + (opt.strong ? ' strong' : '')}>{label}</span>} cells={i => {
      const v = vals[i];
      if (opt.avvik) {
        if (!avail[i] && !needByDay[i]) return null;
        const neg = v < 0;
        if (heat) {
          const hs = heatStyle(v);
          return <><span className="kheat" style={{ background: hs.bg }} title={(neg ? 'Underdekning ' : v < 2 ? 'Stramt ' : 'Ledig ') + fmt(v) + ' FTE'}></span><span className="kv" style={{ color: hs.ink, fontWeight: 600, position: 'relative', zIndex: 1 }}>{fmt(v)}</span></>;
        }
        return <span className="kv" style={{ color: neg ? 'rgb(var(--danger))' : 'rgb(var(--committed))', background: neg ? 'rgb(var(--danger-bg))' : 'transparent', fontWeight: 600 }}>{fmt(v)}</span>;
      }
      return v ? <span className="kv" style={{ color: opt.strong ? 'rgb(var(--ink))' : 'rgb(var(--ink-muted))', fontWeight: opt.strong ? 600 : 400 }}>{opt.minus ? '−' : ''}{fmt(v)}</span> : null;
    }} />
  );

  return (
    <div className="kal" ref={scrollRef} tabIndex={0} onKeyDown={onKey} onScroll={() => ctx && setCtx(null)} data-t={(drag && drag.tool) || mod || tool} style={{ '--w': W + 'px' }}>
      <div className="kinner" key={mode} style={{ width: 400 + N * W }}>
        <div className="khead">
          <Row cls="kdate1" h={20} label={<span className="keb">Dato</span>} cells={i => (i === 0 || DAYS[i].wd === 'man') ? <span className="kwk">U{DAYS[i].week}{(i === 0 || DAYS[i].day <= 7) ? ' · ' + DAYS[i].month : ''}</span> : null} />
          <Row cls="kdate2" h={30} label={<span className="kmeta">{DAYS[0].day}. {DAYS[0].month} – {DAYS[N - 1].day}. {DAYS[N - 1].month} 2026</span>} cells={i => <span data-col={bem ? i : undefined} onClick={bem ? () => staff.onDay(i) : undefined} title={bem ? 'Vis behov og ledige denne dagen' : undefined} className={'kdd' + ((bem ? staff.focusDay === i : selection && selection.col === i) ? ' on' : '')}><span>{DAYS[i].wd.slice(0, W < 36 ? 1 : 3)}</span><b>{DAYS[i].day}</b></span>} />
          {bem ? (staff.compact ? null : <PsProjectLines W={W} open={showProj} onToggle={() => setShowProj(!showProj)} dayCls={dayCls} selNo={staff.project} onPick={staff.onProject} onLeave={staff.onProjectLeave} scrollRef={scrollRef} dense={staff.projDense} setDense={staff.setProjDense} />) : <>
          <div className="ksec"><div className="klab"><button className="ksectog" onClick={() => setShowHalls(!showHalls)} aria-expanded={showHalls}><Icon name={showHalls ? 'chevron-down' : 'chevron-right'} size={14} /><span className="keb">Haller</span>{!showHalls && <span className="kmeta">{HALLS.length} skjult</span>}</button>{showHalls && <span className="klegend">{[['assembly', 'A'], ['movingIn', 'MI'], ['event', 'Event'], ['movingOut', 'MO'], ['dismantle', 'D']].map(([ph, c]) => <span key={c} title={window.EP.PHASE_NAMES[ph]} style={{ background: ph === 'event' ? VPC[ph] : epTint(VPC[ph], 34), color: ph === 'event' ? 'var(--on-line)' : 'rgb(var(--ink))' }}>{c}</span>)}</span>}</div></div>
          {showHalls && HALLS.map(h => (
            <div key={h} className="krow khall">
              <div className="klab" style={{ justifyContent: 'flex-end' }}><span className="khname">{h}</span></div>
              <div className="ktrack" style={{ width: N * W }}>{DAYS.map((d, i) => <div key={i} className={dayCls(i)}></div>)}{hallBars(h)}</div>
            </div>
          ))}
          </>}
          {bem ? (staff.compact ? null : <PsCompStrip W={W} open={showStrip} onToggle={() => setShowStrip(!showStrip)} dayCls={dayCls} {...staff.strip} />) : <>
          <div className="ksec"><div className="klab"><button className="ksectog" onClick={() => setShowCap(!showCap)} aria-expanded={showCap}><Icon name={showCap ? 'chevron-down' : 'chevron-right'} size={14} /><span className="keb">Bemanning</span>{!showCap && <span className="kmeta">bare avvik</span>}</button></div></div>
          {showCap && capRow('base', 'Faste (FTE)', DAYS.map(d => d.type === 'Arbeidsdag' ? SETTINGS.baseCrew : 0))}
          {showCap && capRow('hired', 'Innleid (FTE)', DAYS.map((d, i) => HIRED[i] || 0))}
          {showCap && capRow('abs', 'Fravær', DAYS.map((d, i) => ABSENT[i] || 0), { minus: true })}
          {showCap && capRow('need', 'Planlagt behov', needByDay, { strong: true, cls: 'ktop' })}
          {showCap && capRow('avail', 'Tilgjengelig', avail, { strong: true })}
          {capRow('dev', heat ? <span className="kheatlab">Avvik<span className="kheatlg" title="Rødt: underdekning (mørkere = større). Gult: stramt (under 2 FTE ledig). Grønt: ledig kapasitet."><i style={{ background: cm('rgb(var(--danger))', 85) }}></i><i style={{ background: cm('rgb(var(--danger))', 35) }}></i><i style={{ background: cm('rgb(var(--draft))', 22) }}></i><i style={{ background: cm('rgb(var(--committed))', 22) }}></i></span></span> : 'Avvik', devs, { strong: true, avvik: true, cls: heat ? 'kheatrow' : '' })}
          </>}
          {planBar && <div className="krow kpbarrow"><div className="kpbar-in" ref={barRef} style={{ width: vw || '100%' }}>{planBar}</div></div>}
          {bem ? <div className="krow kplanhead"><div className="klab"><span className="keb">Personell</span><span className="kmeta" style={{ marginLeft: 10 }}>{staff.brush ? staff.people.filter(p => p.comps.includes(staff.brush)).length + ' med ' + staff.brush : staff.people.length + ' faste'}</span><span style={{ flex: 1 }}></span><span className="knum" style={{ width: 'auto' }}>uke · normal/kap.</span></div><div className="klegend wp"><span>Klikk et navn eller dobbeltklikk en dag for å brette ut timer (E) · høyreklikk en dag for fravær</span></div><div style={{ width: N * W, flex: 'none' }}></div></div> :
          <div className="krow kplanhead">
            <div className="klab"><span className="keb">Planlegging</span><span style={{ flex: 1 }}></span><span className="knums"><span className="knum">Behov</span><span className="knum">Plan</span><span className="knum">Δ</span></span></div>
            <div className="klegend wp">{Object.keys(WPC).map(k => <span key={k}><WorkMark phase={k} />{k}</span>)}<span><i className="koutsw"></i>Utenfor</span></div>
            <div style={{ width: N * W, flex: "none" }}></div>
          </div>}
        </div>
        {bem ? <PsPeople W={W} dayCls={dayCls} {...staff.peopleProps} /> : items.map(it => {
          if (it.kind === 'group') {
            const need = it.rows.reduce((a, r) => a + needF(r), 0), plan = it.rows.reduce((a, r) => a + sumF(r.fte), 0);
            const daily = DAYS.map((d, i) => it.rows.reduce((a, r) => a + (r.fte[i] || 0), 0));
            const open = !collapsed.has(it.key), top = it.depth === 0;
            const isPhase = it.dim === 'phase', isProj = it.dim === 'project';
            const showVals = sums === 'always' || !open;
            const dm = DAYS.map((d, i) => it.rows.reduce((a, r) => a + (r.phase === 'Montering' ? r.fte[i] || 0 : 0), 0));
            const vd = venueDays[it.projectNo] || {};
            const workOf = i => !daily[i] ? null : isPhase ? it.label : dm[i] >= daily[i] - dm[i] ? 'Montering' : 'Demontering';
            // Project total: hall-phase strip (always). Other groups: work-phase strip, only when folded.
            const venue = isProj && projectTotal === 'venue';
            const key = i => venue ? (vd[i] || null) : (!open || (isProj && projectTotal === 'work')) ? workOf(i) : null;
            const fill = k => !k ? null : venue ? MIX(VPC[k], k === 'event' ? 52 : 40) : TONE[k];
            const ink = (i, k) => venue || !k ? undefined : TONE_INK[k];
            return (
              <div key={it.key} className={'krow kgroup' + (top ? ' top' : ' sub') + (open ? '' : ' folded')}>
                <div className="klab" style={{ paddingLeft: 10 + it.depth * 16 }}>
                  <button className="kchev" onClick={() => onToggle(it.key)} aria-label={open ? 'Fold sammen' : 'Utvid'} disabled={!it.rows.length}><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /></button>
                  {isPhase && <WorkMark phase={it.label} />}
                  <span className="kname">{it.label}</span>
                  {!it.rows.length && <span className="kmuted">ingen rader</span>}
                  {it.dim === 'project' && <span className="kact"><button title="Foreslå plan: fordel behovet til radene under på monterings- og demonteringsdagene i hallene. Rader som allerede har FTE røres ikke." onClick={() => onSuggest(it.projectNo)} disabled={!it.rows.length}>✦</button><button title="Legg til rad i prosjektet" onClick={() => onAddRow(it.projectNo)}><Icon name="plus" size={14} /></button></span>}
                  {it.rows.length > 0 && <Nums need={need} plan={plan} strong={top} />}
                </div>
                {DAYS.map((d, i) => { const k = key(i), s = fill(k), sL = s && key(i - 1) !== k, sR = s && key(i + 1) !== k, r = 5;
                  return <div key={i} className={dayCls(i)}>{s && <span className={'kstrip' + (venue ? '' : ' work')} title={venue ? window.EP.PHASE_NAMES[k] : k} style={{ background: s, borderRadius: `${sL ? r : 0}px ${sR ? r : 0}px ${sR ? r : 0}px ${sL ? r : 0}px`, left: sL ? 2 : 0, right: sR ? 2 : 0 }}></span>}{showVals && daily[i] ? <span className="kv ksum" style={{ color: ink(i, k) }}>{fmt(daily[i])}</span> : null}</div>; })}
              </div>
            );
          }
          const r = it.row, c = WPC[r.phase], vd = venueDays[r.projectNo] || {}, sel = selection && selection.rowId === r.id, win = new Set(r.window);
          const inDrag = i => drag && drag.rowId === r.id && i >= Math.min(drag.a, drag.b) && i <= Math.max(drag.a, drag.b);
          return (
            <div key={r.id} className={'krow kleaf' + (sel ? ' sel' : '')}>
              <div className="klab" style={{ paddingLeft: 10 + it.depth * 16 + 22 }} onClick={() => setSelection({ rowId: r.id, col: selection && selection.rowId === r.id ? selection.col : (r.window[0] || 0) })}>
                <WorkMark phase={r.phase} />
                {!grouping.includes('project') && <span className="kmuted" style={{ fontStyle: 'normal' }}>{r.projectName}</span>}
                <span className="kname">{leafLabel(r, grouping)}</span>
                <span className="kact" onClick={e => e.stopPropagation()}><button title="Fordel det som gjenstår over vinduet" disabled={needF(r) - sumF(r.fte) <= 0.05} onClick={() => onSpreadRow(r.id)}><Icon name="pencil" size={14} /></button><button title="Tøm raden" disabled={!sumF(r.fte)} onClick={() => onRange(r.id, 0, N - 1, 'clear')}><Icon name="eraser" size={14} /></button></span>
                <Nums need={needF(r)} plan={sumF(r.fte)} />
              </div>
              {DAYS.map((d, i) => {
                const v = r.fte[i], isSel = sel && selection.col === i, editing = edit && edit.rowId === r.id && edit.col === i;
                const we = d.type !== 'Arbeidsdag';
                // One background per cell, by priority: drag > planned FTE > weekend > editable surface.
                const bg = inDrag(i) ? (drag.tool === 'clear' ? 'rgb(var(--danger-bg))' : 'var(--accent-soft)')
                  : v ? TONE[r.phase] : we ? WE_BG : null;
                const out = v && !win.has(i);
                return (
                  <div key={i} className={dayCls(i) + ' kin' + (isSel ? ' cur' : '') + (win.has(i) ? ' win' : '') + (out ? ' koutw' : '')} title={out ? 'Utenfor radens vindu' : undefined} style={bg ? { backgroundColor: bg } : undefined}
                    onMouseDown={e => { if (e.button !== 0) return; const t = e.altKey ? 'clear' : e.shiftKey ? 'distribute' : tool; if (t === 'select') { setSelection({ rowId: r.id, col: i }); return; } e.preventDefault(); setDrag({ rowId: r.id, a: i, b: i, tool: t }); setSelection({ rowId: r.id, col: i }); }}
                    onContextMenu={e => { e.preventDefault(); setSelection({ rowId: r.id, col: i }); setCtx({ x: Math.min(e.clientX, window.innerWidth - 290), y: Math.min(e.clientY, window.innerHeight - 260), rowId: r.id, col: i }); }}
                    onMouseEnter={() => drag && drag.rowId === r.id && setDrag({ ...drag, b: i })}
                    onDoubleClick={() => tool === 'select' && setEdit({ rowId: r.id, col: i, text: v != null ? String(v).replace('.', ',') : '' })}>
                    {editing ? <input autoFocus className="kedit" value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} onBlur={() => setEdit(null)} /> : v ? <span className="kv" style={{ color: TONE_INK[r.phase], fontWeight: 500 }}>{fmt(v)}</span> : windowDot && win.has(i) ? <span className="kdotw"></span> : null}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!bem && <div style={{ height: 120 }}></div>}
      </div>
      {ctx && !bem && (() => {
        const r = byId[ctx.rowId], rest = needF(r) - sumF(r.fte), wEnd = r.window[r.window.length - 1], d = DAYS[ctx.col];
        const act = f => () => { f(); setCtx(null); };
        return (
          <div data-surface="raised" className="kmenu kctx" style={{ left: ctx.x, top: ctx.y }} onMouseDown={e => e.stopPropagation()}>
            <div className="grp">{r.competence} · {d.wd} {d.day}. {d.month}</div>
            <button className="it" disabled={rest <= 0.05} onClick={act(() => onSpreadRow(r.id))}><Icon name="pencil" size={14} />Fordel gjenstående over vinduet<span className="kk">{rest > 0.05 ? fmt(rest) : '—'}</span></button>
            <button className="it" disabled={rest <= 0.05 || ctx.col > wEnd} onClick={act(() => onRange(r.id, ctx.col, wEnd, 'distribute'))}><Icon name="arrow-right" size={14} />Fordel herfra til vindusslutt</button>
            <button className="it" disabled={!r.fte[ctx.col]} onClick={act(() => onCommit(r.id, ctx.col, null))}><Icon name="x" size={14} />Tøm cellen<span className="kk">Del</span></button>
            <button className="it" disabled={!sumF(r.fte)} onClick={act(() => onRange(r.id, 0, N - 1, 'clear'))}><Icon name="eraser" size={14} />Tøm raden</button>
            <div style={{ borderTop: '1px solid rgb(var(--border))', margin: '4px 0' }}></div>
            <button className="it" onClick={act(onShowDetails)}><Icon name="panel-right" size={14} />Vis raddetaljer</button>
          </div>
        );
      })()}
    </div>
  );
}
Object.assign(window, { WorkMark, TONE, KalenderGrid, buildItems, leafLabel, dimVal, VPC, WPC, epTint, sumF, needF });
