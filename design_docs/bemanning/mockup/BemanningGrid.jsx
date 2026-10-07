const BMg = window.BM;
const bmPct = m => (m - BMg.S) / (BMg.E - BMg.S) * 100;
const bmSnap = m => Math.round(m / 15) * 15;
const bmClamp = (v, a, b) => Math.max(a, Math.min(b, v));

function Hatch({ from, to, cls = '' }) {
  if (to <= from) return null;
  return <i className={'bm-hat ' + cls} style={{ left: bmPct(from) + '%', width: (bmPct(to) - bmPct(from)) + '%' }}></i>;
}

const clipN = b => ({ ...b, s: Math.max(b.s, BMg.S), e: Math.min(b.e, BMg.E) });
function OtTag({ blocks, we }) {
  const ot = blocks.reduce((a, b) => a + BMg.otH(b, we), 0);
  return ot > 0.05 ? <span className={'bm-ottag' + (we ? ' we' : '')} title={BMg.fmtH(ot) + ' t overtid'}>+{BMg.fmtH(ot)}</span> : null;
}
function CollapsedCell({ av, blocks: raw, sick, compById, brush, multi }) {
  if (av.we) return raw.length ? <span className="bm-wec">{raw.map(b => <i key={b.id} style={{ '--cc': compById[b.comp].color }} className={brush && brush !== b.comp ? 'other' : ''}></i>)}<OtTag blocks={raw} we /></span> : null;
  const blocks = raw.map(clipN).filter(b => b.e > b.s);
  if (av.off && !sick) return <span className="bm-off">{av.off}</span>;
  const full = blocks.length === 1 && !sick && blocks[0].s <= av.s && blocks[0].e >= av.e;
  if (multi === 'chips' && blocks.length > 1 && !sick) {
    return <span className="bm-chips">{blocks.map(b => { const c = compById[b.comp]; return <span key={b.id} className={brush && brush !== b.comp ? 'other' : ''} style={{ '--cc': c.color }}><i></i>{c.short} {BMg.fmtH(BMg.hrs(b.s, b.e))}</span>; })}</span>;
  }
  return (
    <span className="bm-mtl">
      {!sick && <><Hatch from={BMg.S} to={av.s} /><Hatch from={av.e} to={BMg.E} /></>}
      {blocks.map(b => {
        const c = compById[b.comp], w = bmPct(b.e) - bmPct(b.s);
        const label = full ? <><b>{c.name}</b><em>hel dag</em></> : w >= 44 ? <b>{c.name}</b> : w >= 20 ? <b>{c.short}</b> : null;
        return <span key={b.id} className={'bm-b' + (sick ? ' unres' : '') + (brush && brush !== b.comp ? ' other' : '')} style={{ left: bmPct(b.s) + '%', width: w + '%', '--cc': c.color }} title={c.name + ' · ' + BMg.fmtT(b.s) + '–' + BMg.fmtT(b.e) + ' · ' + BMg.fmtH(BMg.hrs(b.s, b.e)) + ' t' + (sick ? ' · uløst' : '')}>{label}</span>;
      })}
      {sick && <span className="bm-sick">Syk{blocks.length ? ' · ' + blocks.length + ' uløst' : ''}</span>}
      {av.note && !sick && <span className="bm-note">{av.note}</span>}
      {!sick && <OtTag blocks={raw} />}
    </span>
  );
}

function ExpandedCell({ p, av, blocks, sick, compById, brush, tool, eligible, ops }) {
  const track = React.useRef(null);
  const [draft, setDraft] = React.useState(null);
  const dref = React.useRef(null);
  const set = d => { dref.current = d; setDraft(d); };
  if (av.we) return <span className="bm-xt we"><span className="bm-xwe">Helg · overtid</span>{blocks.length > 0 && <OtTag blocks={blocks} we />}</span>;
  const toMin = x => { const r = track.current.getBoundingClientRect(); return bmSnap(BMg.S + (x - r.left) / r.width * (BMg.E - BMg.S)); };
  const listen = (mv, up) => { const u = ev => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', u); up(ev); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', u); };
  const downBlock = (e, b, mode) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    if (tool === 'erase' || e.altKey) return ops.del(b.id);
    if (sick) return;
    if (tool === 'paint' && brush && brush !== b.comp && mode === 'move') { if (eligible) ops.recolor(b.id, brush); return; }
    if (b.s < BMg.S || b.e > BMg.E) return;
    const others = blocks.filter(o => o.id !== b.id);
    const lo = Math.max(av.s, ...others.filter(o => o.e <= b.s).map(o => o.e));
    const hi = Math.min(av.e, ...others.filter(o => o.s >= b.e).map(o => o.s));
    const t0 = toMin(e.clientX), dur = b.e - b.s;
    listen(ev => {
      const dm = toMin(ev.clientX) - t0; let s = b.s, en = b.e;
      if (mode === 'move') { s = bmClamp(b.s + dm, lo, hi - dur); en = s + dur; }
      else if (mode === 'l') s = bmClamp(b.s + dm, lo, b.e - 15);
      else en = bmClamp(b.e + dm, b.s + 15, hi);
      set({ id: b.id, s, e: en });
    }, () => { const d = dref.current; set(null); if (d && (d.s !== b.s || d.e !== b.e)) ops.update(b.id, d.s, d.e); });
  };
  const downTrack = e => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    if (tool !== 'paint' || !brush || !eligible || av.s == null) return;
    const t0 = toMin(e.clientX);
    const iv = BMg.freeIv(av, blocks).find(([a, z]) => t0 >= a && t0 <= z);
    if (!iv) return;
    let moved = false;
    listen(ev => {
      const t = toMin(ev.clientX); if (Math.abs(t - t0) >= 15) moved = true; if (!moved) return;
      set({ id: '_new', comp: brush, s: bmClamp(Math.min(t0, t), iv[0], iv[1]), e: bmClamp(Math.max(t0, t), iv[0], iv[1]) });
    }, () => { const d = dref.current; set(null); if (!moved) ops.create(p.id, brush, iv[0], iv[1]); else if (d && d.e - d.s >= 15) ops.create(p.id, brush, d.s, d.e); });
  };
  const shown = blocks.map(b => draft && draft.id === b.id ? { ...b, s: draft.s, e: draft.e } : clipN(b)).filter(b => b.e > b.s);
  if (draft && draft.id === '_new') shown.push({ ...draft, ghost: true });
  return (
    <span className={'bm-xt' + (tool === 'paint' && brush && eligible && !sick && !av.off ? ' paint' : '')}>
      <span className="bm-ruler">{[7, 9, 11, 13, 15].map(h => <span key={h} style={{ left: bmPct(h * 60) + '%' }}>{String(h).padStart(2, '0')}</span>)}</span>
      <span className="bm-xtrack" ref={track} onMouseDown={downTrack}>
        <Hatch from={BMg.L0} to={BMg.L1} cls="lunch" />
        {av.off && !sick ? <><Hatch from={BMg.S} to={BMg.E} /><span className="bm-off">{av.off}</span></> : !sick && <><Hatch from={BMg.S} to={av.s} /><Hatch from={av.e} to={BMg.E} /></>}
        {shown.map(b => {
          const c = compById[b.comp], w = bmPct(b.e) - bmPct(b.s);
          return (
            <span key={b.id} className={'bm-xb' + (sick ? ' unres' : '') + (b.ghost ? ' ghost' : '') + (brush && brush !== b.comp ? ' other' : '') + (draft && draft.id === b.id ? ' drag' : '')} style={{ left: bmPct(b.s) + '%', width: w + '%', '--cc': c.color }}
              onMouseDown={e => downBlock(e, b, 'move')} onDoubleClick={e => { e.stopPropagation(); const t = toMin(e.clientX); if (t - b.s >= 30 && b.e - t >= 30) ops.split(b.id, t); }}
              title={c.name + ' · ' + BMg.fmtT(b.s) + '–' + BMg.fmtT(b.e) + '\nDra for å flytte · dra kantene · dobbeltklikk for å dele' + (brush && brush !== b.comp ? '\nKlikk for å bytte til pensel' : '')}>
              {!b.ghost && !sick && <><i className="bm-hd l" onMouseDown={e => downBlock(e, b, 'l')}></i><i className="bm-hd r" onMouseDown={e => downBlock(e, b, 'r')}></i></>}
              {w >= 16 && <b>{w >= 34 ? c.name : c.short}</b>}
              {w >= 22 && <em>{BMg.fmtT(b.s)}–{BMg.fmtT(b.e)}{w >= 40 ? ' · ' + BMg.fmtH(BMg.hrs(b.s, b.e)) + ' t' : ''}</em>}
              {!b.ghost && <button className="bm-x" onMouseDown={e => { e.stopPropagation(); e.preventDefault(); ops.del(b.id); }} aria-label="Fjern blokk">×</button>}
            </span>
          );
        })}
        {sick && <span className="bm-sick">Syk · {blocks.length ? blocks.length + ' uløst, timene er tilbake i behovet' : 'ingen blokker'}</span>}
        {!sick && <OtTag blocks={blocks} />}
      </span>
    </span>
  );
}

function PersonRow(props) {
  if (props.exp && props.ctx.vmode) return <VRow {...props} />;
  return <HRow {...props} />;
}
function HRow({ p, ri, exp, dim, days, comps, compById, ctx }) {
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const { availOf, blocksOf, isSick, brush, tool, focusDay, sel, inRect, dragMode, weekOf, multi, ops } = ctx;
  const eligible = !brush || p.comps.includes(brush);
  const wk = weekOf(p.id);
  return (
    <div className={'bm-r bm-pr' + (exp ? ' exp' : '') + (dim ? ' dim' : '')}>
      <div className="bm-l bm-pl" onClick={() => ctx.toggleExp(p.id)}>
        <button className="kchev" aria-label={exp ? 'Fold sammen' : 'Utvid til timer'} title={exp ? 'Fold sammen' : 'Utvid til timer (E)'}><Icon name={exp ? 'chevron-down' : 'chevron-right'} size={14} /></button>
        <span className="bm-pn">
          <span className="bm-nm">{p.name}</span>
          {exp ? <span className="bm-qc">{comps.map((c, ci) => p.comps.includes(c.id) && <button key={c.id} className={brush === c.id ? 'on' : ''} style={{ '--cc': c.color }} onClick={e => { e.stopPropagation(); ctx.pickBrush(c.id); }} title={brush === c.id ? 'Slå av pensel (Esc)' : 'Mal med ' + c.name + ' (' + (ci + 1) + ')'}><i></i>{c.short}</button>)}</span> :
          <span className="bm-pc">{comps.map(c => <i key={c.id} className={(p.comps.includes(c.id) ? 'has' : '') + (brush === c.id ? ' f' : '')} style={{ '--cc': c.color }} title={p.comps.includes(c.id) ? c.name : ''}></i>)}</span>}
        </span>
        <span className="bm-pw" title={BMg.fmtH(wk.a) + ' av ' + BMg.fmtH(wk.c) + ' t tildelt denne uka'}>
          <span><b>{BMg.fmtH(wk.a)}</b>/{BMg.fmtH(wk.c)}{wk.ot > 0.05 && <em className="bm-otw"> +{BMg.fmtH(wk.ot)}</em>}</span>
          <i><i style={{ width: (wk.c ? Math.min(1, wk.a / wk.c) * 100 : 0) + '%' }}></i></i>
        </span>
      </div>
      {days.map(d => {
        const av = availOf(p.id, d.i), bl = blocksOf(p.id, d.i), sk = isSick(p.id, d.i) && !d.we;
        const rect = inRect(ri, d.i);
        const cls = 'bm-c' + (d.we ? ' we' : '') + (av.off && !sk ? ' off' : '') + (sk ? ' sk' : '') + (focusDay === d.i ? ' fd' : '') + (sel && sel.pid === p.id && sel.day === d.i ? ' sel' : '') + (rect ? ' rect ' + dragMode : '') + (tool === 'paint' && brush && (!eligible || av.s == null) ? ' no' : '');
        return (
          <div key={d.i} className={cls} style={brush ? { '--bc': compById[brush].color } : null}
            onMouseDown={e => ctx.cellDown(ri, d.i, e)} onMouseEnter={() => ctx.cellEnter(ri, d.i)} onDoubleClick={() => !exp && ctx.toggleExp(p.id)}
            onContextMenu={e => { e.preventDefault(); ctx.cellCtx(p, d.i, e); }}>
            {exp ? <ExpandedCell p={p} av={av} blocks={bl} sick={sk} compById={compById} brush={brush} tool={tool} eligible={eligible} ops={{ ...ops, create: (pid, comp, s, e) => ops.create(pid, d.i, comp, s, e) }} />
              : <CollapsedCell av={av} blocks={bl} sick={sk} compById={compById} brush={brush} multi={multi} />}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { PersonRow });
