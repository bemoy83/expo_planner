const BMv = window.BM;
const vPct = m => (m - BMv.VS) / (BMv.VE - BMv.VS) * 100;
const V_PPH = 28;
const vSnap = m => { let r = Math.round(m / 15) * 15; if (Math.abs(m - BMv.S) <= 10) r = BMv.S; if (Math.abs(m - BMv.E) <= 10) r = BMv.E; return r; };
const vClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = h => String(h).padStart(2, '0');

function VBand({ from, to, cls }) {
  if (to <= from) return null;
  return <i className={'bm-vband ' + cls} style={{ top: vPct(from) + '%', height: (vPct(to) - vPct(from)) + '%' }}></i>;
}

function VDay({ p, d, av, blocks, sick, eligible, brush, tool, ops, compById, narrow }) {
  const track = React.useRef(null);
  const [draft, setDraft] = React.useState(null);
  const dref = React.useRef(null);
  const set = x => { dref.current = x; setDraft(x); };
  const vav = sick ? null : BMv.vAvail(av);
  const toMin = cy => { const r = track.current.getBoundingClientRect(); return vSnap(BMv.VS + (cy - r.top) / r.height * (BMv.VE - BMv.VS)); };
  const listen = (mv, up) => { const u = ev => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', u); up(ev); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', u); };
  const downBlock = (e, b, mode) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault(); ops.focus(d.i);
    if (tool === 'erase' || e.altKey) return ops.del(b.id);
    if (sick || !vav) return;
    if (tool === 'paint' && brush && brush !== b.comp && mode === 'move') { if (eligible) ops.recolor(b.id, brush); return; }
    const others = blocks.filter(o => o.id !== b.id);
    const lo = Math.max(vav.s, ...others.filter(o => o.e <= b.s).map(o => o.e));
    const hi = Math.min(vav.e, ...others.filter(o => o.s >= b.e).map(o => o.s));
    const t0 = toMin(e.clientY), dur = b.e - b.s;
    listen(ev => {
      const dm = toMin(ev.clientY) - t0; let s = b.s, en = b.e;
      if (mode === 'move') { s = vClamp(vSnap(b.s + dm), lo, hi - dur); en = s + dur; }
      else if (mode === 't') s = vClamp(vSnap(b.s + dm), lo, b.e - 15);
      else en = vClamp(vSnap(b.e + dm), b.s + 15, hi);
      set({ id: b.id, s, e: en });
    }, () => { const x = dref.current; set(null); if (x && (x.s !== b.s || x.e !== b.e)) ops.update(b.id, x.s, x.e); });
  };
  const downTrack = e => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault(); ops.focus(d.i);
    if (tool !== 'paint' || !brush || !eligible || !vav) return;
    const t0 = toMin(e.clientY);
    const iv = BMv.freeIv(vav, blocks).find(([a, z]) => t0 >= a && t0 <= z);
    if (!iv) return;
    let moved = false;
    listen(ev => {
      const t = toMin(ev.clientY); if (Math.abs(t - t0) >= 15) moved = true; if (!moved) return;
      set({ id: '_new', comp: brush, s: vClamp(Math.min(t0, t), iv[0], iv[1]), e: vClamp(Math.max(t0, t), iv[0], iv[1]) });
    }, () => {
      const x = dref.current; set(null);
      if (moved) { if (x && x.e - x.s >= 15) ops.create(p.id, d.i, brush, x.s, x.e); return; }
      const a = Math.max(iv[0], BMv.S), z = Math.min(iv[1], BMv.E);
      if (t0 >= BMv.S && t0 < BMv.E && z - a >= 15) ops.create(p.id, d.i, brush, a, z);
      else { const s = vClamp(Math.floor(t0 / 60) * 60, iv[0], iv[1] - 15); ops.create(p.id, d.i, brush, s, Math.min(s + 60, iv[1])); }
    });
  };
  const shown = blocks.map(b => draft && draft.id === b.id ? { ...b, s: draft.s, e: draft.e } : b);
  if (draft && draft.id === '_new') shown.push({ ...draft, ghost: true });
  return (
    <span className={'bm-vt' + (tool === 'paint' && brush && eligible && vav ? ' paint' : '')} ref={track} onMouseDown={downTrack}>
      {d.we ? <VBand from={BMv.VS} to={BMv.VE} cls="ot" /> : <><VBand from={BMv.VS} to={BMv.S} cls="ot" /><VBand from={BMv.E} to={BMv.VE} cls="ot" /><VBand from={BMv.L0} to={BMv.L1} cls="lunch" /></>}
      {!d.we && <><i className="bm-vline" style={{ top: vPct(BMv.S) + '%' }}></i><i className="bm-vline" style={{ top: vPct(BMv.E) + '%' }}></i></>}
      {!vav && <><VBand from={BMv.VS} to={BMv.VE} cls="na" /><span className="bm-voff">{av.off}</span></>}
      {vav && av.note && <><VBand from={BMv.VS} to={av.s} cls="na" /><VBand from={av.e} to={BMv.VE} cls="na" /><span className="bm-vnote" style={{ top: vPct(av.e < BMv.E ? av.e : BMv.VS) + '%' }}>{av.note}</span></>}
      {shown.map(b => {
        const c = compById[b.comp], px = (b.e - b.s) / 60 * V_PPH, dur = b.e - b.s;
        const ot = BMv.otH(b, d.we), tot = BMv.hrs(b.s, b.e);
        const segs = d.we ? [[0, 100]] : [b.s < BMv.S ? [0, (Math.min(b.e, BMv.S) - b.s) / dur * 100] : null, b.e > BMv.E ? [(Math.max(b.s, BMv.E) - b.s) / dur * 100, 100] : null].filter(Boolean);
        return (
          <span key={b.id} className={'bm-vb' + (sick ? ' unres' : '') + (b.ghost ? ' ghost' : '') + (brush && brush !== b.comp ? ' other' : '') + (draft && draft.id === b.id ? ' drag' : '')}
            style={{ top: vPct(b.s) + '%', height: (vPct(b.e) - vPct(b.s)) + '%', '--cc': c.color }} onMouseDown={e => downBlock(e, b, 'move')}
            onDoubleClick={e => { e.stopPropagation(); const t = toMin(e.clientY); if (t - b.s >= 30 && b.e - t >= 30) ops.split(b.id, t); }}
            title={c.name + ' · ' + BMv.fmtT(b.s) + '–' + BMv.fmtT(b.e) + ' · ' + BMv.fmtH(tot) + ' t' + (ot > 0.05 ? ' (' + BMv.fmtH(ot) + ' t overtid)' : '') + '\nDra for å flytte · dra kantene · dobbeltklikk for å dele'}>
            {segs.map(([a, z], k) => <i key={k} className="bm-vot" style={{ top: a + '%', height: (z - a) + '%' }}></i>)}
            {!b.ghost && !sick && <><i className="bm-vh t" onMouseDown={e => downBlock(e, b, 't')}></i><i className="bm-vh b" onMouseDown={e => downBlock(e, b, 'b')}></i></>}
            {px >= 18 && <b>{narrow ? c.short : c.name}</b>}
            {px >= 34 && <em>{BMv.fmtT(b.s)}–{BMv.fmtT(b.e)}</em>}
            {px >= 50 && !narrow && <em>{BMv.fmtH(tot - ot)} t{ot > 0.05 ? ' + ' + BMv.fmtH(ot) + ' OT' : ''}</em>}
            {!b.ghost && <button className="bm-x" onMouseDown={e => { e.stopPropagation(); e.preventDefault(); ops.del(b.id); }} aria-label="Fjern blokk">×</button>}
          </span>
        );
      })}
      {sick && <span className="bm-sick" style={{ top: 12, transform: 'none' }}>Syk{blocks.length ? ' · ' + blocks.length + ' uløst' : ''}</span>}
    </span>
  );
}

function VRow({ p, ri, dim, days, comps, compById, ctx }) {
  const { Icon, IconButton } = window.WarmMinimalDesignSystem_58386e;
  const { availOf, blocksOf, isSick, brush, tool, focusDay, weekOf, ops } = ctx;
  const eligible = !brush || p.comps.includes(brush);
  const wk = weekOf(p.id);
  const hours = []; for (let h = BMv.VS / 60; h <= BMv.VE / 60; h++) hours.push(h);
  return (
    <div className={'bm-r bm-pr vexp' + (dim ? ' dim' : '')} data-vrow={p.id} style={{ '--vh': ((BMv.VE - BMv.VS) / 60 * V_PPH) + 'px' }}>
      <div className="bm-l bm-vl">
        <div className="bm-vl-info">
          <div className="bm-vl-top" onClick={() => ctx.toggleExp(p.id)} title="Fold sammen (E)"><button className="kchev" aria-label="Fold sammen"><Icon name="chevron-down" size={14} /></button><span className="bm-nm">{p.name}</span></div>
          <div className="bm-qc">{comps.map((c, ci) => p.comps.includes(c.id) && <button key={c.id} className={brush === c.id ? 'on' : ''} style={{ '--cc': c.color }} onMouseDown={e => e.stopPropagation()} onClick={() => ctx.pickBrush(c.id)} title={brush === c.id ? 'Slå av pensel (Esc)' : 'Mal med ' + c.name + ' (' + (ci + 1) + ')'}><i></i>{c.name}<kbd>{ci + 1}</kbd></button>)}</div>
          <dl className="bm-vl-dl"><dt>Normaltid</dt><dd>{BMv.fmtH(wk.a)} / {BMv.fmtH(wk.c)} t</dd><dt>Overtid</dt><dd className={wk.ot > 0.05 ? 'ot' : ''}>{BMv.fmtH(wk.ot)} t</dd></dl>
          <div className="bm-vl-nav">
            <IconButton label="Forrige person" tooltip="Forrige person (↑)" icon="chevron-up" onClick={() => ctx.stepV(-1)} />
            <IconButton label="Neste person" tooltip="Neste person (↓)" icon="chevron-down" onClick={() => ctx.stepV(1)} />
          </div>
          <span className="bm-vl-hint">Dra en blokk forbi 15:00 for overtid</span>
        </div>
        <div className="bm-axis">{hours.map(h => <span key={h} className={h * 60 === BMv.S || h * 60 === BMv.E ? 'n' : ''} style={{ top: vPct(h * 60) + '%' }}>{pad2(h)}</span>)}</div>
      </div>
      {days.map(d => {
        const av = availOf(p.id, d.i), sk = isSick(p.id, d.i) && !d.we;
        return (
          <div key={d.i} className={'bm-c bm-vc' + (d.we ? ' vwe' : '') + (focusDay === d.i ? ' fd' : '')} onMouseEnter={() => ctx.cellEnter(ri, d.i)} onContextMenu={e => { e.preventDefault(); ctx.cellCtx(p, d.i, e); }}>
            <VDay p={p} d={d} av={av} blocks={blocksOf(p.id, d.i)} sick={sk} eligible={eligible} brush={brush} tool={tool} ops={ops} compById={compById} narrow={d.we} />
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { VRow });
