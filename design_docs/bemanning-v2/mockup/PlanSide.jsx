const PSs = window.PS;
const psDayTxt = i => { const d = window.EP.DAYS[i]; return d.wd + ' ' + d.day + '. ' + d.month; };
const psRangeTxt = (a, b) => { const D = window.EP.DAYS, A = D[a], B = D[b]; return a === b ? A.day + '. ' + A.month : A.day + '.' + (A.month !== B.month ? ' ' + A.month : '') + '–' + B.day + '. ' + B.month; };

function PsSideHead({ kind, title, sw, sub, acts, picker }) {
  return (
    <>
      <header className="ki-head">
        <div className="ki-head-t"><div className="ki-title ps-st">{sw && <i className="ps-sw" style={{ '--cc': sw }}></i>}{title}</div>{sub && <div className="ki-sub">{sub}</div>}</div>
        <div className="ki-acts">{acts}</div>
      </header>
      {picker}
    </>
  );
}

function PsGap(x) {
  const { comp, day } = x;
  const { DAYS, PROJECTS } = window.EP;
  const { IconButton, Icon } = window.WarmMinimalDesignSystem_58386e;
  const [showOut, setShowOut] = React.useState(false);
  const N = DAYS.length, weD = PSs.we(day), c = psComp[comp];
  const r = x.dem[comp][day], a = x.asg[comp][day], rem = r - a;
  const pname = x.project && PROJECTS.find(p => p.no === x.project).name;
  let m = day; while (m > 0 && DAYS[m].wd !== 'man') m--;
  const list = x.people.filter(p => p.comps.includes(comp)).map(p => {
    const av = x.availOf(p.id, day), bl = x.blocksOf(p.id, day);
    if (av.off) return { p, out: av.off };
    if (x.isSick(p.id, day)) return { p, out: 'Syk' };
    const free = PSs.freeH({ s: PSs.S, e: PSs.E }, bl);
    if (free < 0.5) return { p, out: 'Opptatt · ' + [...new Set(bl.map(b => b.comp))].join(', ') };
    const cont = [day - 1, day + 1].some(d => d >= 0 && d < N && x.blocksOf(p.id, d).some(b => b.comp === comp));
    let onProj = false; if (x.project) for (let i = m; i < Math.min(N, m + 7); i++) if (x.blocksOf(p.id, i).some(b => b.proj === x.project)) onProj = true;
    const wk = x.weekOf(p.id), ot = weD || wk.a + free > wk.c + 0.05;
    return { p, free, cont, onProj, ot, partial: bl.length > 0, score: free * 10 + (cont ? 6 : 0) + (onProj ? 4 : 0) - (ot ? 30 : 0) };
  });
  const ok = list.filter(z => !z.out).sort((u, v) => v.score - u.score), out = list.filter(z => z.out);
  const step = dir => { let i = day + dir; while (i >= 0 && i < N && !PSs.COMPS.some(k => x.dem[k.id][i] > 0) && PSs.we(i)) i += dir; if (i >= 0 && i < N) { x.setSide({ kind: 'gap', comp, day: i }); x.setFocusDay(i); } };
  return (
    <div className="ps-panel">
      <PsSideHead picker={x.picker} kind="Fyll behov" sw={c.color} title={comp} sub={<><span>{psDayTxt(day)}</span>{weD && <><span className="ki-sep">·</span><span>helg, overtid</span></>}{pname && x.scopeNo && <><span className="ki-sep">·</span><span className="ki-trunc">{pname}</span></>}</>}
        acts={<><IconButton label="Forrige dag" icon="chevron-left" onClick={() => step(-1)} disabled={day === 0} /><IconButton label="Neste dag" icon="chevron-right" onClick={() => step(1)} disabled={day === N - 1} /><IconButton label="Lukk" icon="x" onClick={x.onClose} /></>} />
      <div className="kinsp-body">
        <section className="ki-sec">
          <div className="ps-gchips">{PSs.COMPS.map(k => { const rr = x.dem[k.id][day] - x.asg[k.id][day]; return <button key={k.id} className={k.id === comp ? 'on' : ''} style={{ '--cc': k.color }} onClick={() => x.setSide({ kind: 'gap', comp: k.id, day })}><i></i>{k.short}{rr > 0.05 && <em>{PSs.fmtH(rr)}</em>}</button>; })}</div>
          <div className="ki-stats"><div><span>Behov</span><b>{PSs.fmtH(r)}</b><em>timer</em></div><div><span>Tildelt</span><b>{PSs.fmtH(a)}</b><em>{r ? Math.round(Math.min(a, r) / r * 100) + ' %' : '–'}</em></div><div><span>Gjenstår</span><b style={{ color: rem > 0.05 ? 'rgb(var(--danger))' : 'rgb(var(--committed))' }}>{rem > 0.05 ? PSs.fmtH(rem) : rem < -0.05 ? '+' + PSs.fmtH(-rem) : '✓'}</b><em>{rem < -0.05 ? 'overdekket' : rem > 0.05 ? '≈ ' + Math.ceil(rem / 7.5) + ' dagsverk' : 'dekket'}</em></div></div>
        </section>
        <section className="ki-sec">
          <h3 className="ki-h">Ledige med {comp}<span>{ok.length}</span></h3>
          {ok.length ? <ul className="ps-cand">{ok.map(z => (
            <li key={z.p.id}>
              <div className="ps-cand-t"><b>{z.p.name}</b><span className="ps-tags"><span>{PSs.fmtH(z.free)} t ledig</span>{z.cont && <span className="g" title={'Jobber ' + comp + ' dagen før eller etter'}>fortsetter</span>}{z.onProj && <span className="g">på {pname.replace(' 2026', '')}</span>}{z.ot && <span className="w">overtid</span>}</span></div>
              <div className="ps-cand-a"><button onClick={() => x.assignDay(z.p.id, day, comp, false)} title={'Tildel all ledig tid ' + psDayTxt(day)}>{z.partial ? 'Resten' : 'Hel dag'}</button>{z.free >= 4 && <button onClick={() => x.assignDay(z.p.id, day, comp, true)} title="Før lunsj (07:00–11:00)">Halv</button>}</div>
            </li>))}</ul> : <p className="ps-empty">Ingen med {comp} er ledige {psDayTxt(day)}.</p>}
        </section>
        {(x.crews || []).filter(c => c.comp === comp).length > 0 && <section className="ki-sec">
          <h3 className="ki-h">Innleid<span>mannskap · dagsverk</span></h3>
          {x.crews.filter(c => c.comp === comp).map(c => { const n = c.counts[day] || 0; return <div key={c.id} className="ps-crewrow"><b>{c.supplier}</b><span>{n ? n + ' × på dagen' : 'ingen på dagen'}{rem > 0.05 ? ' · ' + Math.ceil(rem / 7.5) + ' til dekker' : ''}</span><div className="ps-cand-a"><button disabled={!n} onClick={() => x.onCrewStep(c.id, day, -1)}>−1</button><button onClick={() => x.onCrewStep(c.id, day, 1)}>+1</button></div></div>; })}
        </section>}
        {out.length > 0 && <section className="ki-sec">
          <button className="ps-outtog" onClick={() => setShowOut(!showOut)}><Icon name={showOut ? 'chevron-down' : 'chevron-right'} size={14} />Ikke tilgjengelig<span>{out.length}</span></button>
          {showOut && <ul className="ps-out">{out.map(z => <li key={z.p.id}><span>{z.p.name}</span><em>{z.out}</em></li>)}</ul>}
        </section>}
      </div>
    </div>
  );
}

function PsHelp(x) {
  const p = x.personBy[x.pid];
  const { DAYS } = window.EP;
  const { IconButton } = window.WarmMinimalDesignSystem_58386e;
  const N = DAYS.length;
  const [only, setOnly] = React.useState(null);
  const anchor = x.selDay != null ? x.selDay : x.focusDay, monOf = d => { let m = d; while (m > 0 && DAYS[m].wd !== 'man') m--; return m; };
  const [wk0, setWk0] = React.useState(() => monOf(anchor));
  React.useEffect(() => { if (anchor < wk0 || anchor >= wk0 + 14) setWk0(monOf(anchor)); }, [anchor]);
  const days = []; for (let i = wk0; i < Math.min(N, wk0 + 14); i++) days.push(i);
  const comps = p.comps.filter(c => !only || c === only);
  const rows = days.map(i => {
    const weD = PSs.we(i), av = x.availOf(p.id, i), sk = x.isSick(p.id, i), bl = x.blocksOf(p.id, i);
    const short = comps.map(c => ({ c, h: x.dem[c][i] - x.asg[c][i] })).filter(z => z.h > 0.05).sort((a, b) => b.h - a.h);
    if (weD && !short.length) return null;
    if (av.off || sk) return { i, out: av.off || 'Syk' };
    const free = PSs.freeH({ s: PSs.S, e: PSs.E }, bl);
    return { i, weD, free, short, bl };
  }).filter(Boolean);
  const canH = rows.reduce((a, r) => a + (r.out ? 0 : Math.min(r.free, r.short.reduce((s, z) => s + z.h, 0))), 0);
  const freeH = rows.reduce((a, r) => a + (r.out || r.weD ? 0 : r.free), 0);
  const match = rows.filter(r => !r.out && r.free >= 0.5 && r.short.length).length;
  const d0 = DAYS[days[0]], d1 = DAYS[days[days.length - 1]];
  return (
    <div className="ps-panel">
      <PsSideHead picker={x.picker} title={'Hvor kan ' + p.name.split(' ')[0] + ' hjelpe?'} sub={<><span>U{d0.week}–{d1.week}</span><span className="ki-sep">·</span><span>{psRangeTxt(days[0], days[days.length - 1])}</span></>}
        acts={<><IconButton label="Forrige uke" icon="chevron-left" onClick={() => setWk0(Math.max(0, wk0 - 7))} disabled={wk0 === 0} /><IconButton label="Neste uke" icon="chevron-right" onClick={() => setWk0(Math.min(N - 7, wk0 + 7))} disabled={wk0 + 14 >= N} /><IconButton label="Lukk" icon="x" onClick={x.onClose} /></>} />
      <div className="kinsp-body">
        <section className="ki-sec">
          <div className="ps-gchips"><button className={!only ? 'on all' : 'all'} onClick={() => setOnly(null)}>Alle</button>{p.comps.map(c => <button key={c} className={only === c ? 'on' : ''} style={{ '--cc': psComp[c].color }} onClick={() => setOnly(only === c ? null : c)}><i></i>{psComp[c].short}</button>)}</div>
          <div className="ki-stats"><div><span>Ledig</span><b>{PSs.fmtH(freeH)}</b><em>normaltid, t</em></div><div><span>Kan dekke</span><b style={{ color: canH > 0.05 ? 'rgb(var(--danger))' : undefined }}>{PSs.fmtH(canH)}</b><em>t av underdekning</em></div><div><span>Treff</span><b>{match}</b><em>{match === 1 ? 'dag' : 'dager'}</em></div></div>
        </section>
        <section className="ki-sec">
          <h3 className="ki-h">Dager<span>{only || p.comps.join(' · ')}</span></h3>
          <ul className="ps-help">{rows.map(r => { const d = DAYS[r.i];
            const dayL = <button className={'ps-hd' + (r.i === x.selDay ? ' on' : '')} onClick={() => x.setFocusDay(r.i)} title="Vis dagen i rutenettet"><span>{d.wd}</span><b>{d.day}.</b></button>;
            if (r.out) return <li key={r.i} className="out">{dayL}<em className="ps-hx">{r.out}</em></li>;
            if (r.free < 0.5) return <li key={r.i} className="busy">{dayL}<em className="ps-hx">Opptatt · {[...new Set(r.bl.map(b => psComp[b.comp].short))].join(', ')}</em></li>;
            if (!r.short.length) return <li key={r.i} className="none">{dayL}<em className="ps-hx">{PSs.fmtH(r.free)} t ledig · ikke behov</em></li>;
            return <li key={r.i}>{dayL}
              <div className="ps-hm"><span className="ps-hf">{PSs.fmtH(r.free)} t ledig{r.weD ? ' · helg, overtid' : r.bl.length ? ' · delvis booket' : ''}</span>
                <div className="ps-hs">{r.short.map(z => <span key={z.c} className="ps-hchip" style={{ '--cc': psComp[z.c].color }}>
                  <button className="ps-hgo" onClick={() => x.setSide({ kind: 'gap', comp: z.c, day: r.i })} title={'Se alle kandidater for ' + z.c + ' ' + psDayTxt(r.i)}><i></i>{psComp[z.c].short}<em>−{PSs.fmtH(z.h)}</em></button>
                  <button onClick={() => x.assignDay(p.id, r.i, z.c, false)} title={'Tildel ' + p.name.split(' ')[0] + ' ' + z.c + ', ledig tid ' + psDayTxt(r.i)}>{r.bl.length ? 'Resten' : 'Dag'}</button>
                  {r.free >= 4 && !r.weD && <button onClick={() => x.assignDay(p.id, r.i, z.c, true)} title="Halv dag">½</button>}
                </span>)}</div>
              </div>
            </li>; })}</ul>
          <p className="ps-hint">Klikk en kompetanse for å se alle kandidater den dagen. Klikk et navn eller en dag i rutenettet for å bytte person.</p>
        </section>
      </div>
    </div>
  );
}
function PsCrewPanel(x) {
  const c = x.crews.find(q => q.id === x.cid);
  const { DAYS } = window.EP;
  const { IconButton, Button } = window.WarmMinimalDesignSystem_58386e;
  const [name, setName] = React.useState('');
  if (!c) return null;
  const cc = psComp[c.comp], days = Object.keys(c.counts).map(Number).sort((a, b) => a - b), tot = days.reduce((a, d) => a + c.counts[d], 0);
  const named = (x.hired || []).filter(p => p.fromCrew === c.id);
  const lo = days.length ? days[0] : x.focusDay, hi = days.length ? days[days.length - 1] : x.focusDay; const show = []; for (let i = Math.max(0, lo - 1); i <= Math.min(DAYS.length - 1, hi + 1); i++) if (!PSs.we(i) || c.counts[i]) show.push(i);
  return (
    <div className="ps-panel">
      <PsSideHead picker={x.picker} sw={cc.color} title={c.supplier + ' · ' + c.comp} sub={<span>Innleid mannskap · teller i «Innleid» i Behov</span>} acts={<IconButton label="Lukk" icon="x" onClick={x.onClose} />} />
      <div className="kinsp-body">
        <section className="ki-sec">
          <div className="ki-stats"><div><span>Dagsverk</span><b>{tot}</b><em>{days.length} dager</em></div><div><span>Timer</span><b>{PSs.fmtH(tot * 7.5)}</b><em>{c.comp}</em></div><div><span>Navngitt</span><b>{named.length}</b><em>personer</em></div></div>
        </section>
        <section className="ki-sec">
          <h3 className="ki-h">Per dag<span>antall</span></h3>
          <ul className="ps-cdays">{show.map(i => { const n = c.counts[i] || 0, rem = x.dem[c.comp][i] - x.asg[c.comp][i]; return <li key={i}><span>{psDayTxt(i)}</span>{rem > 0.05 && <em className="ps-tags"><span style={{ color: 'rgb(var(--danger))' }}>−{PSs.fmtH(rem)} t</span></em>}<button disabled={!n} onClick={() => x.onCrewStep(c.id, i, -1)} aria-label="Én færre">−</button><b>{n || '–'}</b><button onClick={() => x.onCrewStep(c.id, i, 1)} aria-label="Én til">+</button></li>; })}</ul>
          <p className="ps-hint">Eller mal med {c.comp} på mannskapsraden: antallet settes til det som dekker hullet.</p>
        </section>
        <section className="ki-sec">
          <h3 className="ki-h">Gi navn<span>én fra mannskapet</span></h3>
          <div className="ps-namerow"><input className="ps-note" value={name} placeholder="Navn" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { x.nameOne(c.id, name); setName(''); } }} /><Button size="sm" variant="secondary" disabled={!name.trim() || !tot} onClick={() => { x.nameOne(c.id, name); setName(''); }}>Legg til</Button></div>
          <p className="ps-hint">Personen får {c.comp} hele dagen på alle {days.length} dagene, og mannskapet blir én mindre de dagene. Etterpå kan timene redigeres som for faste.</p>
          {named.length > 0 && <ul className="ps-out" style={{ marginTop: 10 }}>{named.map(p => <li key={p.id} style={{ cursor: 'pointer' }} onClick={() => x.setSide({ kind: 'person', pid: p.id })}><span>{p.name}</span><em>åpne</em></li>)}</ul>}
        </section>
      </div>
    </div>
  );
}
function PsBlockPanel(x) {
  const b = x.b, p = x.personBy[b.pid], c = psComp[b.comp];
  const { DAYS, PROJECTS } = window.EP;
  const { IconButton, Button } = window.WarmMinimalDesignSystem_58386e;
  const N = DAYS.length, weD = PSs.we(b.day), h = PSs.hrs(b.s, b.e), ot = PSs.otH(b, weD);
  const [note, setNote] = React.useState(b.note || '');
  React.useEffect(() => setNote(b.note || ''), [b.id]);
  const work = (a, z) => { const o = []; for (let i = a; i <= z && i < N; i++) if (!PSs.we(i)) o.push(i); return o; };
  const next = work(b.day + 1, N - 1).slice(0, 1);
  let we2 = b.day + 1; while (we2 < N && DAYS[we2].wd !== 'man') we2++;
  const week = work(b.day + 1, we2 - 1);
  const pr = b.proj && PROJECTS.find(q => q.no === b.proj), projDays = pr ? work(b.day + 1, psSpanOf(pr)[1]) : [];
  return (
    <div className="ps-panel">
      <PsSideHead picker={x.picker} kind="Blokk" sw={c.color} title={b.comp} sub={<><span>{p.name}</span><span className="ki-sep">·</span><span>{psDayTxt(b.day)}</span></>}
        acts={<><IconButton label="Vis person" icon="user" onClick={() => x.setSide({ kind: 'person', pid: p.id })} /><IconButton label="Lukk" icon="x" onClick={x.onClose} /></>} />
      <div className="kinsp-body">
        <section className="ki-sec">
          <dl className="ps-idl ps-bdl">
            <dt>Tid</dt><dd>{PSs.fmtT(b.s)}–{PSs.fmtT(b.e)}</dd>
            <dt>Timer</dt><dd>{PSs.fmtH(h)} t{ot > 0.05 && <span className="ps-otx"> · {PSs.fmtH(ot)} overtid</span>}</dd>
            <dt>Kompetanse</dt><dd><select className="ps-sel" value={b.comp} onChange={e => x.ops.recolor(b.id, e.target.value)}>{p.comps.map(k => <option key={k}>{k}</option>)}</select></dd>
            <dt>Prosjekt</dt><dd><select className="ps-sel" value={b.proj || ''} onChange={e => x.ops.tag(b.id, e.target.value || undefined)}><option value="">Ikke merket</option>{PROJECTS.map(q => <option key={q.no} value={q.no}>{q.name}</option>)}</select></dd>
            <dt>Notat</dt><dd><input className="ps-note" value={note} placeholder="F.eks. stand 14, ta med lift" onChange={e => setNote(e.target.value)} onBlur={() => note !== (b.note || '') && x.ops.note(b.id, note || undefined)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} /></dd>
          </dl>
          <p className="ps-hint">Prosjekt er valgfritt. Merkede blokker teller når behovet vises for ett prosjekt.</p>
        </section>
        <section className="ki-sec">
          <h3 className="ki-h">Gjenta<span>{PSs.fmtT(b.s)}–{PSs.fmtT(b.e)} · {b.comp}</span></h3>
          <div className="ps-rep">
            <button disabled={!next.length} onClick={() => x.ops.repeat(b.id, next)}>Neste arbeidsdag{next.length ? <em>{psDayTxt(next[0])}</em> : null}</button>
            <button disabled={!week.length} onClick={() => x.ops.repeat(b.id, week)}>Ut uka<em>{week.length} {week.length === 1 ? 'dag' : 'dager'}</em></button>
            {pr && <button disabled={!projDays.length} onClick={() => x.ops.repeat(b.id, projDays)}>Ut {pr.name}<em>{projDays.length ? psRangeTxt(projDays[0], projDays[projDays.length - 1]) : 'ingen dager igjen'}</em></button>}
          </div>
          <p className="ps-hint">Fyller bare ledig tid. Fravær og syke dager hoppes over.</p>
        </section>
      </div>
      <footer className="ki-foot"><Button size="sm" variant="ghost" icon="trash-2" onClick={() => { x.ops.del(b.id); x.setSide({ kind: 'person', pid: p.id }); }}>Fjern blokk</Button></footer>
    </div>
  );
}

function PsProfile(x) {
  const p = x.p;
  const { DAYS, PROJECTS } = window.EP;
  const { IconButton, Button } = window.WarmMinimalDesignSystem_58386e;
  const N = DAYS.length, per = x.periodOf(p.id);
  const abs = []; let cur = null;
  for (let i = 0; i < N; i++) {
    const why = x.availOf(p.id, i).off;
    if (PSs.we(i)) continue;
    if (why && cur && cur.why === why && DAYS.slice(cur.b + 1, i).every((d, k) => PSs.we(cur.b + 1 + k))) cur.b = i;
    else if (why) { cur = { why, a: i, b: i }; abs.push(cur); } else cur = null;
  }
  const sickRs = (x.sickR || {})[p.id] || [];
  const sickDays = DAYS.filter((d, i) => !PSs.we(i) && x.isSick(p.id, i)).length;
  const otWeeks = []; for (let m = 0; m < N; m++) { if (DAYS[m].wd !== 'man' && m !== 0) continue; let ot = 0; for (let d = m; d < Math.min(N, m + 7); d++) { if (x.isSick(p.id, d)) continue; x.blocksOf(p.id, d).forEach(b => { ot += PSs.otH(b, PSs.we(d)); }); } if (ot > 0.05) otWeeks.push({ m, ot }); }
  const absDays = abs.reduce((s, r) => s + DAYS.slice(r.a, r.b + 1).filter((d, k) => !PSs.we(r.a + k)).length, 0) + sickDays;
  const groups = {}; x.blocks.filter(b => b.pid === p.id && !x.isSick(p.id, b.day)).forEach(b => { const k = b.proj || ''; const g = groups[k] || (groups[k] = { h: 0, a: N, z: -1, comps: new Set() }); g.h += PSs.hrs(b.s, b.e); g.a = Math.min(g.a, b.day); g.z = Math.max(g.z, b.day); g.comps.add(b.comp); });
  const compH = {}; x.blocks.filter(b => b.pid === p.id && !x.isSick(p.id, b.day)).forEach(b => { compH[b.comp] = (compH[b.comp] || 0) + PSs.hrs(b.s, b.e); });
  const maxH = Math.max(0, ...Object.values(compH));
  const gl = Object.entries(groups).sort((u, v) => u[0] === '' ? 1 : v[0] === '' ? -1 : u[1].a - v[1].a);
  const open = x.vPid === p.id;
  const [form, setForm] = React.useState(null);
  const fk = x.side && x.side.form ? x.side.form.n : null;
  React.useEffect(() => { if (x.side && x.side.form) setForm(x.side.form); else setForm(null); }, [fk, p.id]);
  const wdays = []; for (let i = 0; i < N; i++) if (!PSs.we(i)) wdays.push(i);
  const saveForm = () => { const a = Math.min(form.from, form.to), b = Math.max(form.from, form.to); x.absOps.add(p.id, a, b, form.kind); setForm(null); };
  return (
    <div className="ps-panel">
      <PsSideHead picker={x.picker} kind="Person" title={p.name} sub={<span>{p.kind === 'hired' ? 'Innleid · ' + p.supplier : 'Fast ansatt'} · {p.comps.length} av {PSs.COMPS.length} kompetanser</span>}
        acts={<IconButton label="Lukk" icon="x" onClick={x.onClose} />} />
      <div className="kinsp-body">
        <section className="ki-sec">
          <h3 className="ki-h">Hele perioden<span>{psRangeTxt(0, N - 1)}</span></h3>
          <div className="ki-stats"><div><span>Normaltid</span><b>{PSs.fmtH(per.a)}</b><em>av {PSs.fmtH(per.c)} t</em></div><div><span>Overtid</span><b style={per.ot > 0.05 ? { color: 'rgb(var(--draft))' } : null}>{PSs.fmtH(per.ot)}</b><em>{otWeeks.filter(w => w.ot > (x.otLimit || 10) + 0.05).length ? otWeeks.filter(w => w.ot > (x.otLimit || 10) + 0.05).length + ' uker over grensen' : 'timer'}</em></div><div><span>Fravær</span><b>{absDays}</b><em>{absDays === 1 ? 'dag' : 'dager'}</em></div></div>
          {otWeeks.length > 0 && <ul className="ps-out" style={{ marginTop: 12 }}>{otWeeks.map(w => <li key={w.m} style={w.ot > (x.otLimit || 10) + 0.05 ? { color: 'rgb(var(--draft))' } : null}><span>Uke {DAYS[w.m].week} · overtid</span><em style={w.ot > (x.otLimit || 10) + 0.05 ? { color: 'rgb(var(--draft))', fontWeight: 600 } : null}>{PSs.fmtH(w.ot)} t{w.ot > (x.otLimit || 10) + 0.05 ? ' · over ' + (x.otLimit || 10) : ''}</em></li>)}</ul>}
          <div style={{ marginTop: 14 }}><Button size="sm" variant="secondary" icon={open ? 'chevrons-down-up' : 'chevrons-up-down'} onClick={() => x.toggleV(p.id)}>{open ? 'Fold sammen timer' : 'Brett ut timer i rutenettet'}</Button></div>
        </section>
        <section className="ki-sec">
          <h3 className="ki-h">Kompetanse<span>timer i perioden</span></h3>
          <ul className="ps-comps">{[...PSs.COMPS.filter(k => p.comps.includes(k.id)), ...PSs.COMPS.filter(k => !p.comps.includes(k.id))].map(k => { const has = p.comps.includes(k.id), hh = compH[k.id] || 0;
            return <li key={k.id} className={(has ? 'has' : 'no') + (x.brush === k.id ? ' on' : '')} style={{ '--cc': k.color }} onClick={has ? () => x.setBrush(k.id) : undefined} title={has ? 'Velg ' + k.id + ' som pensel (' + (PSs.COMPS.indexOf(k) + 1) + ')' : 'Har ikke ' + k.id}>
              <i></i><span className="ps-cn">{k.id}</span>{has ? <><span className="ps-cbar"><b style={{ width: (maxH ? hh / maxH * 100 : 0) + '%' }}></b></span><em>{hh > 0.05 ? PSs.fmtH(hh) + ' t' : '–'}</em><kbd>{PSs.COMPS.indexOf(k) + 1}</kbd></> : <em className="ps-cno">mangler</em>}
            </li>; })}</ul>
        </section>
        <section className="ki-sec">
          <h3 className="ki-h">Fravær<span>{abs.length + sickRs.length || 'ingen'}</span></h3>
          {sickRs.map(r => { const opts = []; for (let i = r.from; i < N; i++) if (!PSs.we(i)) opts.push(i); return <div key={r.from} className="ps-sickr"><b>Syk</b><span>fra {psDayTxt(r.from)}</span><select className="ps-sel" value={r.to == null ? '' : r.to} onChange={e => x.setSickTo(p.id, r.from, e.target.value === '' ? null : +e.target.value)} title="Til og med"><option value="">pågår</option>{opts.map(i => <option key={i} value={i}>til {psDayTxt(i)}</option>)}</select>{r.to == null && <button onClick={() => { const t = x.focusDay > r.from ? x.focusDay : r.from + 1; x.recoverDay(p.id, t); }} title="Friskmeld fra første synlige dag">Friskmeld</button>}</div>; })}
          {abs.length ? <ul className="ps-abs">{abs.map(r => <li key={r.a} className={r.why === 'Syk' ? 'sick' : ''} onClick={() => x.setFocusDay(r.a)}><b>{r.why}</b><span>{psRangeTxt(r.a, r.b)}</span>{x.absOps && <button className="ps-absx" title="Fjern fraværet" aria-label="Fjern fraværet" onClick={e => { e.stopPropagation(); x.absOps.remove(p.id, r.a, r.b); }}>×</button>}</li>)}</ul> : !sickRs.length && <p className="ps-empty">Ingen registrert fravær.</p>}
          {x.absOps && (form ? <div className="ps-absform">
            <label>Type<select className="ps-sel" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{['Syk', 'Ferie', 'Kurs', 'Annet'].map(k => <option key={k}>{k}</option>)}</select></label>
            <label>Fra<select className="ps-sel" value={form.from} onChange={e => { const v = +e.target.value; setForm({ ...form, from: v, to: Math.max(v, form.to) }); }}>{wdays.map(i => <option key={i} value={i}>{psDayTxt(i)}</option>)}</select></label>
            <label>Til<select className="ps-sel" value={form.to} onChange={e => setForm({ ...form, to: +e.target.value })}>{wdays.filter(i => i >= form.from).map(i => <option key={i} value={i}>{psDayTxt(i)}</option>)}</select></label>
            <div><Button size="sm" variant="ghost" onClick={() => setForm(null)}>Avbryt</Button><Button size="sm" variant="primary" onClick={saveForm}>Lagre</Button></div>
          </div> : <div style={{ marginTop: 10 }}><Button size="sm" variant="secondary" icon="plus" onClick={() => { const f = wdays.find(i => i >= (x.focusDay || 0)) ?? wdays[0]; setForm({ kind: 'Ferie', from: f, to: f }); }}>Legg til fravær</Button></div>)}
          <p className="ps-hint">Eller høyreklikk en dag i rutenettet.</p>
        </section>
        {!window.PS_V2 && <section className="ki-sec">
          <h3 className="ki-h">Oppdrag per prosjekt<span>{PSs.fmtH(gl.reduce((s, [, g]) => s + g.h, 0))} t</span></h3>
          {gl.length ? <ul className="ps-proj">{gl.map(([k, g]) => <li key={k || 'none'} onClick={() => x.setFocusDay(g.a)} title="Gå til første dag">
            <div><b className={k ? '' : 'none'}>{k ? PROJECTS.find(q => q.no === k).name : 'Uten prosjekt'}</b><span>{psRangeTxt(g.a, g.z)}</span></div>
            <div><span className="ps-pc">{[...g.comps].map(cc => <i key={cc} className="has" style={{ '--cc': psComp[cc].color }} title={cc}></i>)}</span><em>{PSs.fmtH(g.h)} t</em></div>
          </li>)}</ul> : <p className="ps-empty">Ingen oppdrag ennå.</p>}
        </section>}
      </div>
    </div>
  );
}

function PsSidePicker({ x, cur }) {
  const { Segmented } = window.WarmMinimalDesignSystem_58386e;
  const m = x.mem || {}, b = m.block && x.blocks.find(q => q.id === m.block), p = x.personBy[x.selPid];
  const go = { gap: () => x.setSide(m.gap || { kind: 'gap', comp: PSs.COMPS[0].id, day: x.focusDay }), person: () => p && x.setSide({ kind: 'person', pid: p.id }), block: () => b && x.setSide({ kind: 'block', id: b.id }) };
  return <div className={'ps-pick' + (b ? '' : ' noblk')}><Segmented block size="compact" aria-label="Panel" value={cur} onChange={k => go[k]()} options={[
    { value: 'gap', label: 'Behov', title: m.gap && m.gap.pid ? 'Hvor kan ' + (x.personBy[m.gap.pid] || {}).name + ' hjelpe?' : 'Hvem kan dekke behovet? Også: klikk en celle i kompetansebehovet.' },
    { value: 'person', label: 'Person', title: p ? p.name + ' · profil, fravær og oppdrag. Også: klikk et navn.' : 'Ingen person valgt' },
    { value: 'block', label: 'Blokk', title: b ? 'Valgt blokk: ' + b.comp : 'Ingen blokk valgt. Klikk en blokk i en utbrettet person.' }]} /></div>;
}
function PsSide(x) {
  const s = x.side || {};
  let cur = 'gap';
  if (s.kind === 'block' && x.blocks.find(q => q.id === s.id)) cur = 'block';
  else if (s.kind === 'crew' && (x.crews || []).find(q => q.id === s.id)) cur = 'crew';
  else if (s.kind === 'person' && x.personBy[s.pid]) cur = 'person';
  if (window.PS_V2 && cur !== 'person') return null;
  const y = { ...x, picker: window.PS_V2 ? null : <PsSidePicker x={x} cur={cur === 'crew' ? 'person' : cur} /> };
  const body = cur === 'crew' ? <PsCrewPanel {...y} cid={s.id} /> : cur === 'block' ? <PsBlockPanel {...y} b={x.blocks.find(q => q.id === s.id)} /> : cur === 'person' ? <PsProfile {...y} p={x.personBy[s.pid]} /> : s.pid && x.personBy[s.pid] ? <PsHelp key={s.pid} {...y} pid={s.pid} /> : <PsGap {...y} comp={s.comp || PSs.COMPS[0].id} day={s.day != null ? s.day : x.focusDay} />;
  return <aside data-surface="raised" className="kinsp ps-side">{body}</aside>;
}
Object.assign(window, { PsSide });
