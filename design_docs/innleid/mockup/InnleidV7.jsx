// v7 — signed hours, three-state Avvik, two answer states, local icons, slide-over panel. Based on v6: subcontractor planner: demand-first, how many (not when), requested vs confirmed, multi-day runs, supplier order.
const IX = window.IL;
const Icon = window.IlIcon;
const ilComp = Object.fromEntries(IX.COMPS.map(c => [c.id, c]));
const ilW = 92;
const sumBy = (a, f) => a.reduce((t, x, i) => t + f(x, i), 0);
const V_PH = IX.shH(IX.SHIFTS.dag.s, IX.SHIFTS.dag.e); // hours per person-shift, for "≈ N pers."
const vPers = h => Math.ceil(h / V_PH - 1e-6);
function IlSeg({ value, options, onChange, size }) {
  return <div className={'il-seg' + (size ? ' ' + size : '')} role="radiogroup">{options.map(o => <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
function IlMatrix({ ctrs, brush, onToggle, onOpen }) {
  return <table className="il-mx"><thead><tr><th></th>{IX.COMPS.map(c => <th key={c.id} className={brush === c.id ? 'hl' : ''} title={c.id}><i className="il-dot" style={{ '--cc': c.color }}></i><span>{c.short}</span></th>)}</tr></thead>
    <tbody>{ctrs.map(k => <tr key={k.id}><td><button className="il-lnk" onClick={() => onOpen(k.id)}>{k.name}</button></td>{IX.COMPS.map(c => { const on = k.comps.includes(c.id); return <td key={c.id} className={brush === c.id ? 'hl' : ''}><button className={'il-mxc' + (on ? ' on' : '')} style={{ '--cc': c.color }} onClick={() => onToggle(k.id, c.id)} title={(on ? 'Fjern ' : 'Legg til ') + c.id + ' for ' + k.name} aria-pressed={on}></button></td>; })}</tr>)}</tbody></table>;
}
const vEf = b => b.conf == null ? b.fte : Math.min(b.conf, b.fte);
const vH = b => IX.shH(b.s, b.e);
// Two answer states. conf == null → waiting; otherwise confirmed (a short answer lowers fte, see setGot).
const vStat = b => b.conf == null ? 'req' : 'ok';
const V_ST = { req: 'venter på svar', ok: 'bekreftet' };
const vSup = c => c.short || c.name.replace(/\s/g, '').slice(0, 3).toUpperCase();
const vAx = t => (t - 360 + 1440) % 1440;
const vNear = s => Object.entries(IX.SHIFTS).map(([id, v]) => [id, Math.min(Math.abs(v.s - s), 1440 - Math.abs(v.s - s))]).sort((x, y) => x[1] - y[1])[0][0];
const vKey = b => b.cid + '|' + b.s + '|' + b.e;
// R = rest demand; P = planned (pending counts as asked, partial counts what they confirmed); C = confirmed.
// Over-cover smaller than one shift-person is rounding, not a deviation.
function vCov(R, list) {
  const P = sumBy(list, b => vEf(b) * vH(b)), C = sumBy(list.filter(b => b.conf != null), b => Math.min(b.conf, b.fte) * vH(b)), rem = R - P;
  const tol = list.length ? Math.min(...list.map(vH)) : 0;
  const st = R <= 0 && !list.length ? 'none' : rem > 0.01 ? 'short' : -rem < Math.max(0.01, tol - 1e-6) ? 'ok' : 'over';
  return { R, P, C, rem, st };
}
function vNorm(bks) {
  const m = new Map(), out = [];
  bks.forEach(b => { const k = b.cid + '|' + b.comp + '|' + b.day + '|' + b.s + '|' + b.e, ex = m.get(k);
    if (ex) { ex.fte += b.fte; ex.conf = ex.conf == null || b.conf == null ? null : ex.conf + b.conf; } else { const n = { ...b }; m.set(k, n); out.push(n); } });
  return out.length === bks.length ? bks : out;
}
function vGroups(list, ctrs) {
  const m = new Map(), ci = id => ctrs.findIndex(c => c.id === id);
  list.forEach(b => { const k = vKey(b); if (!m.has(k)) m.set(k, { key: k, cid: b.cid, s: b.s, e: b.e, list: [] }); m.get(k).list.push(b); });
  return [...m.values()].sort((a, b) => ci(a.cid) - ci(b.cid) || vAx(a.s) - vAx(b.s));
}
const vGStat = g => g.list.some(b => vStat(b) === 'req') ? 'req' : 'ok';
const vRangeLbl = days => { const a = IX.DAYS[days[0]], b = IX.DAYS[days[days.length - 1]]; return days.length === 1 ? a.wd + ' ' + a.d + '. okt' : a.wd + ' ' + a.d + '.–' + b.wd + ' ' + b.d + '. okt'; };
// Popover dismissal: the first click outside only closes — it is swallowed so it can't select another day or press a button underneath.
function vOutside(cls, onClose, onEnter) {
  React.useEffect(() => { let eat = false;
    const md = e => { if (e.target.closest(cls)) return; e.preventDefault(); e.stopPropagation(); eat = true; onClose(); };
    const ck = e => { if (eat) { e.preventDefault(); e.stopPropagation(); eat = false; } };
    const kd = e => { if (e.target.closest('input')) return; if (e.key === 'Escape' || (e.key === 'Enter' && onEnter)) { e.preventDefault(); e.stopPropagation(); (e.key === 'Enter' ? onEnter : onClose)(); } };
    const t = setTimeout(() => { addEventListener('mousedown', md, true); addEventListener('click', ck, true); }); addEventListener('keydown', kd, true);
    return () => { clearTimeout(t); removeEventListener('mousedown', md, true); removeEventListener('click', ck, true); removeEventListener('keydown', kd, true); }; }, []);
}
const vPos = (r, W, H) => { const x = Math.max(8, Math.min(r.left + r.width / 2 - W / 2, innerWidth - W - 8)); return r.bottom + H < innerHeight ? { left: x, top: r.bottom + 6 } : { left: x, bottom: innerHeight - r.top + 6 }; };

// Status glyph — shape carries the meaning, ink only (hues are taken by under/ok/over).
// req = clock in a ring (waiting) · ok = solid disc with check. Confirmed chips carry no glyph.
function VGlyph({ st, size = 14, title }) {
  return <svg className={'v-gl st-' + st} width={size} height={size} viewBox="0 0 16 16" aria-hidden={title ? undefined : 'true'}>{title && <title>{title}</title>}
    {st === 'ok' ? <><circle cx="8" cy="8" r="7.25" fill="currentColor"></circle><path d="M4.9 8.2l2.1 2.1 4.1-4.4" fill="none" stroke="rgb(var(--canvas))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path></>
    : <><circle cx="8" cy="8" r="6.5" fill="rgb(var(--canvas))" stroke="currentColor" strokeWidth="1.5"></circle><path d="M8 4.6V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path></>}
  </svg>;
}
// Grid chip: count + supplier. Shift/time is order detail (tooltip, pane, order) — coverage is hours only.
function VChip({ b, sup, on, gone, ghost, onDown, parts }) {
  const ps = parts || [b], st = ps.some(x => vStat(x) === 'req') ? 'req' : 'ok', n = sumBy(ps, x => x.fte);
  const tip = sup.name + '\n' + ps.map(x => x.fte + ' pers. ' + IX.fmtT(x.s) + '–' + IX.fmtT(x.e) + ' · ' + V_ST[vStat(x) === 'req' ? 'req' : 'ok']).join('\n');
  return <div className={'v-ch st-' + st + (on ? ' on' : '') + (gone ? ' gone' : '') + (ghost ? ' ghost' : '')} style={{ '--cc': ilComp[b.comp].color }} onMouseDown={onDown} title={tip}>
    {st === 'req' && !ghost && <VGlyph st="req" size={12} />}<b>{n}</b><span>{sup.name}</span>
  </div>;
}
// Shift menu for the pane row: supplier's shifts + custom time.
function VShiftMenu({ at, g, sup, onPick, onCustom, onClose }) {
  vOutside('.v-menu', onClose);
  const k = IX.shKey(g.s, g.e);
  return <div className="v-pop v-menu" style={{ width: 210, ...vPos(at, 210, 200) }}>
    <span className="il-eb">Skift</span>
    {Object.entries(IX.SHIFTS).map(([id, s]) => <button key={id} className={'v-mi' + (k === id ? ' on' : '')} disabled={!sup.shifts.includes(id)} onClick={() => { onPick(s.s, s.e); onClose(); }}><span>{s.label}</span><small>{sup.shifts.includes(id) ? IX.fmtT(s.s) + '–' + IX.fmtT(s.e) : sup.name + ' tilbyr ikke'}</small>{k === id && <Icon name="check" size={13} />}</button>)}
    <button className={'v-mi' + (k === 'egen' ? ' on' : '')} onClick={onCustom}><span>Egen tid…</span><small>{k === 'egen' ? IX.fmtT(g.s) + '–' + IX.fmtT(g.e) : 'Velg fra og til'}</small>{k === 'egen' && <Icon name="check" size={13} />}</button>
  </div>;
}
// One line: bar (flex) + signed hours on the right; the bar shortens when a number shows.
function VSx({ cv, bar = true }) {
  if (cv.st === 'none') return <div className="v-sx"></div>;
  const c = cv.R > 0 ? Math.min(100, cv.C / cv.R * 100) : 0, p = cv.R > 0 ? Math.max(0, Math.min(100 - c, (cv.P - cv.C) / cv.R * 100)) : 0;
  const num = cv.st === 'short' ? <b title={'Mangler ' + IX.fmtH(cv.rem) + ' t ≈ ' + vPers(cv.rem) + ' pers. på dagskift'}>−{IX.fmtH(cv.rem)}</b> : cv.st === 'over' ? <b className="over" title="Mer enn ett skift over behovet">+{IX.fmtH(-cv.rem)}</b> : null;
  return <div className="v-sx v-sx1">{bar && cv.R > 0 && <span className="v-bar"><i className="c" style={{ width: c + '%' }}></i><i className="p" style={{ width: p + '%' }}></i></span>}{num}</div>;
}
// Status chip: text instead of icon. Venter = hollow ring (open), Bekreftet = check, Delvis = inverted count.
// compact (pane rows): OK instead of Bekreftet, Delvis = badge only.
function VStatChip({ st, onClick, compact }) {
  const s = st === 'req' ? 'req' : 'ok';
  return <button className={'v-sc st-' + s + (compact ? ' cp' : '')} onClick={onClick} title={V_ST[s] + ' · klikk for å endre svar'}><VGlyph st={s} size={14} /><span>{s === 'req' ? 'Venter' : compact ? 'OK' : 'Bekreftet'}</span></button>;
}
function VMenu({ at, comp, ctrs, cur, onPick, onClose }) {
  vOutside('.v-menu', onClose);
  const yes = ctrs.filter(c => c.comps.includes(comp)), no = ctrs.filter(c => !c.comps.includes(comp));
  return <div className="v-pop v-menu" style={{ width: 230, ...vPos(at, 230, 280) }}>
    <span className="il-eb">Tilbyr {comp}</span>
    {!yes.length && <span className="v-empty v-mpad">Ingen leverandør tilbyr {comp} ennå.</span>}{yes.map(c => <button key={c.id} className={'v-mi' + (c.id === cur ? ' on' : '')} onClick={() => { onPick(c.id); onClose(); }}><span>{c.name}</span><small>{c.shifts.map(s => IX.SHIFTS[s].label).join(' · ')} · kr {c.rate}/t</small>{c.id === cur && <Icon name="check" size={13} />}</button>)}
    {no.length > 0 && <><span className="il-eb">Tilbyr ikke {comp}</span>{no.map(c => <button key={c.id} className="v-mi" disabled><span>{c.name}</span></button>)}</>}
  </div>;
}
// Two states only. A short answer is not a third state: the planner sets the real headcount, the rest becomes uncovered again.
// asked = what was originally requested (kept for the order/history, never shown on the grid).
function VConfPop({ at, g, sup, onSet, onGot, onClose }) {
  vOutside('.v-conf', onClose, onClose);
  const st = g.list.every(b => b.conf == null) ? 'req' : 'ok', many = g.list.length > 1, ask = b => b.asked ?? b.fte;
  const list = [...g.list].sort((x, y) => x.day - y.day), same = list.every(b => b.fte === list[0].fte && ask(b) === ask(list[0]));
  const step = (is, n, max) => <span className="v-step"><button onClick={() => onGot(is, Math.max(1, n - 1))} disabled={n <= 1} aria-label="Færre"><Icon name="minus" size={12} /></button><b>{n}</b><button onClick={() => onGot(is, Math.min(max, n + 1))} disabled={n >= max} aria-label="Flere"><Icon name="plus" size={12} /></button></span>;
  return <div className="v-pop v-conf" style={{ width: 260, ...vPos(at, 260, 170) }}>
    <div className="v-ph"><b>Svar fra {sup.name}</b><span>{many ? g.list.length + ' dager' : ''}</span></div>
    <IlSeg value={st} onChange={v => { onSet(v); if (v === 'req') onClose(); }} options={[{ value: 'req', label: 'Venter' }, { value: 'ok', label: 'Bekreftet' }]} />
    {st === 'ok' && (same ? <div className="v-cf"><span>Stiller</span>{step(list.map(b => b.id), list[0].fte, ask(list[0]))}<span>av {ask(list[0])}{many ? ' per dag' : ''}</span></div>
      : <div className="v-pd"><span className="il-eb">Stiller per dag</span>{list.map(b => { const d = IX.DAYS[b.day]; return <div key={b.id} className="v-pdr"><span>{d.wd} {d.d}.</span>{step([b.id], b.fte, ask(b))}<small>av {ask(b)}</small></div>; })}</div>)}
    {st === 'ok' && <p className="v-note">Kan de stille færre? Juster antallet – resten blir udekket igjen.</p>}
    <div className="v-pfoot"><span className="v-note">Lagres med en gang</span><button className="v-done" onClick={onClose}>Ferdig<kbd>↵</kbd></button></div>
  </div>;
}
const VT = { SPAN: 1560, SNAP: 30 };
const vParse = v => { const m = String(v).trim().replace(/[.,]/g, ':').match(/^(\d{1,2})(?::?(\d{2}))?$/); if (!m) return null; const h = +m[1], mi = +(m[2] || 0); return h < 24 && mi < 60 ? h * 60 + mi : null; };
function VTimeField({ value, label, onCommit }) {
  const [v, setV] = React.useState(IX.fmtT(value)), [foc, setFoc] = React.useState(false);
  React.useEffect(() => { if (!foc) setV(IX.fmtT(value)); }, [value, foc]);
  const done = () => { const t = vParse(v); if (t != null && t !== value) onCommit(t); else setV(IX.fmtT(value)); setFoc(false); };
  return <label className="v-tf"><span className="il-eb">{label}</span><input value={v} inputMode="numeric" onFocus={e => { setFoc(true); e.target.select(); }} onChange={e => setV(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.stopPropagation(); setV(IX.fmtT(value)); setFoc(false); e.target.blur(); } }} /></label>;
}
function VTimePop({ at, g, sup, crew, live, onTime, onStep, onClose }) {
  vOutside('.v-time', onClose);
  const trk = React.useRef(null), [act, setAct] = React.useState(null), b = g.list[0];
  const a0 = vAx(b.s), a1 = a0 + IX.dur(b.s, b.e), pct = a => a / VT.SPAN * 100, toT = (n0, n1) => ({ s: (n0 + 360) % 1440, e: (n1 + 360) % 1440 });
  const drag = (mode, ev) => { ev.preventDefault(); ev.stopPropagation(); const r = trk.current.getBoundingClientRect(), x0 = ev.clientX, o0 = a0, o1 = a1; let last = null; live.start(); setAct(mode);
    const sn = x => Math.round(x / VT.SNAP) * VT.SNAP, at2 = m => sn((m.clientX - r.left) / r.width * VT.SPAN);
    const mv = m => { let n0 = o0, n1 = o1;
      if (mode === 's') n0 = Math.max(0, Math.min(at2(m), o1 - 60)); else if (mode === 'e') n1 = Math.min(VT.SPAN, Math.max(at2(m), o0 + 60));
      else { const d = Math.max(-o0, Math.min(VT.SPAN - o1, sn((m.clientX - x0) / r.width * VT.SPAN))); n0 = o0 + d; n1 = o1 + d; }
      if (n1 - n0 > 960) { if (mode === 's') n0 = n1 - 960; else n1 = n0 + 960; }
      if (!last || last[0] !== n0 || last[1] !== n1) { last = [n0, n1]; live.set(toT(n0, n1)); } };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); setAct(null); live.end(); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up); };
  const commit = (w, t) => { let s = w === 's' ? t : b.s, e = w === 'e' ? t : b.e; const d = IX.dur(s, e); if (s === e || d < 60) return; if (d > 960) { if (w === 's') s = (e - 960 + 1440) % 1440; else e = (s + 960) % 1440; } onTime({ s, e }); };
  const k = IX.shKey(b.s, b.e), many = g.list.length > 1, totH = sumBy(g.list, x => x.fte * vH(x));
  return <div className="v-pop v-time" style={{ width: 288, '--cc': ilComp[b.comp].color, ...vPos(at, 288, 200) }}>
    <div className="v-ph"><div><b>{sup.name}</b><span>{many ? g.list.length + ' dager' : IX.DAYS[b.day].wd + ' ' + IX.DAYS[b.day].d + '. okt'} · {k === 'egen' ? 'egen tid' : IX.SHIFTS[k].label.toLowerCase() + 'skift'}</span></div>
      <span className="v-step"><button onClick={() => onStep(-1)} disabled={g.list.every(x => x.fte <= 1)} aria-label="Færre"><Icon name="minus" size={12} /></button><b>{crew}</b><button onClick={() => onStep(1)} aria-label="Flere"><Icon name="plus" size={12} /></button></span></div>
    <div className="v-tfs"><VTimeField label="Fra" value={b.s} onCommit={t => commit('s', t)} /><span className="v-dash">–</span><VTimeField label="Til" value={b.e} onCommit={t => commit('e', t)} /><span className="v-td"><b>{IX.fmtH(vH(b))} t</b><small>{IX.fmtH(totH)} t totalt</small></span></div>
    <div className={'v-sl' + (act ? ' act-' + act : '')}>
      <div className="v-trk" ref={trk}>
        {Object.entries(IX.SHIFTS).map(([id, v]) => { const s0 = vAx(v.s); return <em key={id} className={sup.shifts.includes(id) ? '' : 'na'} style={{ left: pct(s0) + '%', width: pct(IX.dur(v.s, v.e)) + '%' }} title={v.label}></em>; })}
        <i className="v-rng" style={{ left: pct(a0) + '%', width: pct(a1 - a0) + '%' }} onMouseDown={e => drag('m', e)}></i>
        <b className="v-hd" style={{ left: pct(a0) + '%' }} onMouseDown={e => drag('s', e)}></b><b className="v-hd" style={{ left: pct(a1) + '%' }} onMouseDown={e => drag('e', e)}></b>
      </div>
      <div className="v-ax">{[6, 12, 18, 0, 6].map((h, i) => <span key={i} style={{ left: pct(i * 360) + '%' }}>{String(h).padStart(2, '0')}</span>)}</div>
    </div>
  </div>;
}
const vCrewLbl = list => { const f = list.map(b => b.fte), lo = Math.min(...f), hi = Math.max(...f); return lo === hi ? String(lo) : lo + '–' + hi; };
const vConfLbl = list => { const c = list.map(b => b.conf == null ? 0 : Math.min(b.conf, b.fte)), lo = Math.min(...c), hi = Math.max(...c), f = vCrewLbl(list); return (lo === hi ? lo : lo + '–' + hi) + '/' + f; };

function VPane({ onShiftMenu,  comp, days, groups, sel, ctrBy, sum, fit, noNeed, onMatrix, onFold, onStep, onShift, onSel, onMenu, onConf, onTime, onCrew, onSetShift, onRemove, onFill, onAdd }) {
  const cc = ilComp[comp], multi = days.length > 1;
  return <div className="il-lab v-pane" style={{ '--cc': cc.color }}>
    <div className="v-hd1"><button className="v-fold" onClick={onFold} title="Fold sammen (Esc)"><Icon name="chevrons-down-up" size={14} /><i className="il-dot"></i><span>{comp}</span></button>
      <span className="v-nav"><button className="il-ib" onClick={() => onStep(-1)} title="Forrige kompetanse"><Icon name="chevron-up" size={15} /></button><button className="il-ib" onClick={() => onStep(1)} title="Neste kompetanse"><Icon name="chevron-down" size={15} /></button></span></div>
    <div className="v-day"><span className="v-dnav"><button className="il-ib" disabled={days[0] === 0} onClick={e => onShift(-1, e.shiftKey)} title="Forrige dag (←) · ⇧ utvider"><Icon name="chevron-left" size={15} /></button><b>{vRangeLbl(days)}</b><button className="il-ib" disabled={days[days.length - 1] === IX.DAYS.length - 1} onClick={e => onShift(1, e.shiftKey)} title="Neste dag (→) · ⇧ utvider"><Icon name="chevron-right" size={15} /></button></span>
      <span className="v-sum">{sum.R <= 0 && !sum.n ? <span className="v-ok">Ingen restbehov</span> : sum.short > 0.01 ? <b>−{IX.fmtH(sum.short)} t ≈ {sum.pers} pers.</b> : sum.over > 0.01 ? <b>+{IX.fmtH(sum.over)} t over</b> : <span className="v-ok">✓ dekket</span>}<small>{sum.crew} {multi ? 'persondager' : 'pers.'} · {IX.fmtH(sum.P)} av {IX.fmtH(sum.R)} t</small></span></div>
    <div className={'v-rows' + (groups.length ? '' : ' empty')}>
      {groups.map(g => { const s = ctrBy[g.cid], k = IX.shKey(g.s, g.e), st = vGStat(g), on = sel && g.list.some(b => sel.includes(b.id)), have = new Set(g.list.map(b => b.day));
        return <div key={g.key} className={'v-r' + (on ? ' on' : '')} onClick={() => onSel(g)}>
          <div className="v-r1">
            <button className="v-sup" onClick={e => { e.stopPropagation(); onSel(g); onMenu(e, g); }} title="Bytt leverandør"><span>{s.name}</span><Icon name="chevron-down" size={11} /></button>
            <button className={'v-shb' + (k === 'egen' ? ' egen' : '')} onClick={e => { e.stopPropagation(); onSel(g); onShiftMenu(e, g); }} title={'Skift: ' + IX.fmtT(g.s) + '–' + IX.fmtT(g.e)}><span>{k === 'egen' ? IX.fmtT(g.s).slice(0, 5) + '–' + IX.fmtT(g.e).slice(0, 5) : IX.SHIFTS[k].label}</span><Icon name="chevron-down" size={11} /></button>
            <span className="v-step" onClick={e => e.stopPropagation()}><button onClick={() => onCrew(g, -1)} disabled={g.list.every(b => b.fte <= 1)} aria-label="Færre"><Icon name="minus" size={12} /></button><b>{vCrewLbl(g.list)}</b><button onClick={() => onCrew(g, 1)} aria-label="Flere"><Icon name="plus" size={12} /></button></span>
            <VStatChip st={st} compact onClick={e => { e.stopPropagation(); onSel(g); onConf(e, g); }} />
            <button className="v-x" onClick={e => { e.stopPropagation(); onRemove(g); }} title={multi ? 'Fjern fra valgte dager' : 'Fjern'}><Icon name="x" size={13} /></button>
          </div>
          {multi && have.size < days.length && <div className="v-r2"><span className="v-pips">{days.map(j => <i key={j} className={(have.has(j) ? 'on' : '') + (IX.DAYS[j].we ? ' we' : '')} title={IX.DAYS[j].wd + ' ' + IX.DAYS[j].d + '.'}></i>)}</span><span>{have.size} av {days.length} dager</span><button className="v-lnk" onClick={e => { e.stopPropagation(); onFill(g); }}>Legg til resten</button></div>}
        </div>; })}
      {!groups.length && (fit ? <span className="v-empty">Ingen innleid {multi ? 'disse dagene' : 'denne dagen'}{noNeed ? ' – og ikke noe restbehov' : ''}</span> : <span className="v-empty">Ingen leverandør tilbyr {comp}. <button className="v-lnk" onClick={onMatrix}>Rediger kompetansematrise</button></span>)}
    </div>
    <div className="v-add"><button className="v-addb" onClick={e => onAdd(e)} disabled={!fit}><Icon name="plus" size={13} />Leverandør<Icon name="chevron-down" size={12} /></button><span className="v-hint">{noNeed ? 'Ingen restbehov – legges til som ekstra' : multi ? 'Endringer gjelder alle ' + days.length + ' dager · Enter: svar · +/−: antall' : '⇧-klikk eller dra over dager for flere · Enter: svar'}</span></div>
  </div>;
}

function VOrder({ c, bks, brush, onDropBrush, onBack, onPatchC, onConfIds, onOpen }) {
  const mine = bks.filter(b => b.cid === c.id).sort((a, b) => a.day - b.day || IX.COMPS.findIndex(x => x.id === a.comp) - IX.COMPS.findIndex(x => x.id === b.comp) || vAx(a.s) - vAx(b.s));
  const h = sumBy(mine, b => b.fte * vH(b)), pd = sumBy(mine, b => b.fte), cnt = { ok: 0, req: 0 }; mine.forEach(b => cnt[vStat(b) === 'req' ? 'req' : 'ok']++);
  const [copied, setCopied] = React.useState(false), [set, setSet] = React.useState(false);
  const days = [...new Set(mine.map(b => b.day))];
  const tog = (key, v) => onPatchC({ [key]: c[key].includes(v) ? c[key].filter(x => x !== v) : [...c[key], v] });
  const copy = () => { const t = 'Bestilling – ' + c.name + '\n' + days.map(j => { const d = IX.DAYS[j]; return d.wd + ' ' + d.d + '. okt\n' + mine.filter(b => b.day === j).map(b => '  ' + b.comp + ': ' + b.fte + ' pers. ' + IX.fmtT(b.s) + '–' + IX.fmtT(b.e)).join('\n'); }).join('\n');
    try { navigator.clipboard.writeText(t); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return <div className="il-card">
    <button className="il-lnk il-back" onClick={onBack}><Icon name="chevron-left" size={14} />Kompetansematrise</button>
    <div><h2>{c.name}</h2><p className="il-meta v-meta">{c.contact}</p></div>
    {brush && <div className="v-armed"><Icon name="paintbrush" size={14} /><span><b>Pensel aktiv</b> – dra over dager for å bestille {c.name}</span><button className="v-btn" onClick={onDropBrush}>Slipp<kbd>Esc</kbd></button></div>}
    <div className="v-stats"><div><span>Persondager</span><b>{pd}</b></div><div><span>Timer</span><b>{IX.fmtH(h)}</b></div><div><span>Estimert</span><b>{Math.round(h * c.rate / 1000)}k</b><small>kr {c.rate}/t</small></div></div>
    {mine.length > 0 ? <>
      <div className="v-ostat"><span className="st-ok"><VGlyph st="ok" size={13} />{cnt.ok} bekreftet</span><span className="st-req"><VGlyph st="req" size={13} />{cnt.req} venter</span></div>
      <div className="v-oact"><button className="v-btn" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={13} />{copied ? 'Kopiert' : 'Kopier bestilling'}</button>{cnt.req > 0 && <button className="v-btn" onClick={() => onConfIds(mine.filter(b => b.conf == null).map(b => b.id), 'ok')}><Icon name="check" size={13} />Alle bekreftet</button>}</div>
      <div className="v-olist">{days.map(j => { const d = IX.DAYS[j]; return <div key={j} className="v-od"><span className="il-eb">{d.wd} {d.d}. okt</span>
        {mine.filter(b => b.day === j).map(b => { const st = vStat(b); return <div key={b.id} className="v-ol" style={{ '--cc': ilComp[b.comp].color }}>
          <button className="v-oll" onClick={() => onOpen(b)} title="Vis i rutenettet"><i className="il-dot"></i><span>{b.comp}</span><small>{IX.fmtT(b.s).slice(0, 5)}–{IX.fmtT(b.e).slice(0, 5)}</small><b>{b.fte}</b>{b.asked > b.fte && <em className="v-asked" title={'Bestilt ' + b.asked + ', bekreftet ' + b.fte}>av {b.asked}</em>}</button>
          <VStatChip st={st} onClick={() => onConfIds([b.id], st === 'ok' ? 'req' : 'ok')} />
        </div>; })}</div>; })}</div>
    </> : <p className="il-meta v-meta">Ingen bestilling ennå. Velg {c.name} som pensel og dra over dager på {c.comps.slice(0, 2).join(' eller ')}{c.comps.length > 2 ? ' m.fl.' : ''}.</p>}
    <div className="v-set"><button className="v-lnk" onClick={() => setSet(!set)}><Icon name={set ? 'chevron-down' : 'chevron-right'} size={13} />Kompetanser og skift</button>
      {set && <><div className="il-tags">{Object.entries(IX.SHIFTS).map(([id, v]) => <button key={id} className={'il-tag' + (c.shifts.includes(id) ? ' on' : '')} onClick={() => tog('shifts', id)}>{v.label}<small>{IX.fmtT(v.s)}–{IX.fmtT(v.e)}</small></button>)}</div>
        <div className="il-tags">{IX.COMPS.map(k => <button key={k.id} className={'il-tag' + (c.comps.includes(k.id) ? ' on' : '')} style={{ '--cc': k.color }} onClick={() => tog('comps', k.id)}><i className="il-dot"></i>{k.id}</button>)}</div></>}
    </div>
  </div>;
}
Object.assign(window, { IX, Icon, ilComp, ilW, sumBy, IlSeg, IlMatrix, vPers, V_ST, vRangeLbl, vCrewLbl, vConfLbl, vEf, vH, vStat, vCov, vNorm, vGroups, vGStat, vKey, vAx, vSup, VChip, VSx, VStatChip, VShiftMenu, VGlyph, VMenu, VConfPop, VTimePop, VPane, VOrder });
