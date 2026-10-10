function GroupingBar({ grouping, onChange }) {
  const { DIMENSIONS, DIM_LABELS } = window.EP;
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const unused = DIMENSIONS.filter(d => !grouping.includes(d));
  const [addOpen, setAddOpen] = React.useState(false);
  const place = (d, i) => { const n = grouping.filter(x => x !== d); n.splice(Math.max(0, Math.min(n.length, i)), 0, d); onChange(n); };
  return (
    <div className="kgroupbar">
      <span className="kzlab">Grupper</span>
      {grouping.length > 0 && <span className="kgtrack">{grouping.map((d, i) => (
        <React.Fragment key={d}>
          {i > 0 && <Icon name="chevron-right" size={14} color="rgb(var(--ink-faint))" />}
          <span className="kgchip">
            <button disabled={i === 0} title="Et nivå opp" onClick={() => place(d, i - 1)}><Icon name="chevron-left" size={12} /></button>
            <span>{DIM_LABELS[d]}</span>
            <button disabled={i === grouping.length - 1} title="Et nivå ned" onClick={() => place(d, i + 1)}><Icon name="chevron-right" size={12} /></button>
            <button title="Ikke grupper etter denne" onClick={() => onChange(grouping.filter(x => x !== d))}><Icon name="x" size={12} /></button>
          </span>
        </React.Fragment>
      ))}</span>}
      {grouping.length === 0 && <span style={{ fontSize: 13, color: 'rgb(var(--ink-muted))' }}>Ingen nivåer: radene vises som en flat liste.</span>}
      {unused.length > 0 && <span style={{ position: 'relative' }}>
        <button className="kgadd" title="Legg til nivå" aria-label="Legg til nivå" onClick={() => setAddOpen(o => !o)}><Icon name="plus" size={14} /></button>
        {addOpen && <div data-surface="raised" className="kmenu" style={{ left: 0, right: 'auto', width: 200 }}>
          <div className="grp">Legg til nivå</div>
          {unused.map(d => <button key={d} className="it" onClick={() => { onChange([...grouping, d]); setAddOpen(false); }}>{DIM_LABELS[d]}</button>)}
        </div>}
      </span>}
    </div>
  );
}

function GroupingMenu({ grouping, onChange }) {
  const { DIMENSIONS, DIM_LABELS } = window.EP;
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const [open, setOpen] = React.useState(false);
  const unused = DIMENSIONS.filter(d => !grouping.includes(d));
  const swap = (i, j) => { const n = [...grouping]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  React.useEffect(() => { if (!open) return; const c = () => setOpen(false); window.addEventListener('mousedown', c); return () => window.removeEventListener('mousedown', c); }, [open]);
  return (
    <span style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
      <button className="kfbtn kgbtn" onClick={() => setOpen(o => !o)} aria-expanded={open} title={'Grupper: ' + (grouping.map(d => DIM_LABELS[d]).join(' › ') || 'ingen')}><Icon name="layers" size={14} /><span className="kgbtn-l">{grouping.length ? grouping.map(d => DIM_LABELS[d]).join(' › ') : 'Ingen gruppering'}</span><Icon name="chevron-down" size={12} /></button>
      {open && <div data-surface="raised" className="kmenu kgmenu" style={{ left: 0, right: 'auto', width: 260 }}>
        <div className="grp">Grupper etter</div>
        {grouping.length === 0 && <div style={{ padding: '4px 10px 8px', fontSize: 13, color: 'rgb(var(--ink-muted))' }}>Flat liste</div>}
        {grouping.map((d, i) => <div key={d} className="kglvl"><span className="kglvl-n">{i + 1}</span><span style={{ flex: 1 }}>{DIM_LABELS[d]}</span>
          <button disabled={i === 0} title="Et nivå opp" onClick={() => swap(i, i - 1)}><Icon name="chevron-up" size={14} /></button>
          <button disabled={i === grouping.length - 1} title="Et nivå ned" onClick={() => swap(i, i + 1)}><Icon name="chevron-down" size={14} /></button>
          <button title="Fjern nivå" onClick={() => onChange(grouping.filter(x => x !== d))}><Icon name="x" size={14} /></button></div>)}
        {unused.length > 0 && <><div className="grp" style={{ borderTop: '1px solid rgb(var(--border))', marginTop: 4, paddingTop: 10 }}>Legg til nivå</div>
        {unused.map(d => <button key={d} className="it" onClick={() => onChange([...grouping, d])}><Icon name="plus" size={14} />{DIM_LABELS[d]}</button>)}</>}
      </div>}
    </span>
  );
}
function RowInspector({ row, rows, needByDay, onSpread, onClose, workStyle = 'mono', staff }) {
  const { Eyebrow, Button, IconButton } = window.WarmMinimalDesignSystem_58386e;
  const { DAYS, SETTINGS, HIRED, ABSENT, fmt, PROJECTS } = window.EP;
  if (!row) return (
    <aside data-surface="raised" className="kinsp"><div style={{ padding: '20px 24px' }}><Eyebrow as="h2">Rad</Eyebrow><p style={{ fontSize: 14, color: 'rgb(var(--ink-muted))', marginTop: 12 }}>Velg en planleggingsrad for å se behov, vindu og dagene i den.</p></div></aside>
  );
  const p = PROJECTS.find(x => x.no === row.projectNo), c = WPC[row.phase], mono = workStyle !== 'color';
  const need = needF(row), plan = sumF(row.fte), outside = Object.entries(row.fte).filter(([i]) => !row.window.includes(+i)).reduce((a, [, v]) => a + v, 0);
  const rest = need - plan;
  const days = Object.keys(row.fte).map(Number).filter(i => row.fte[i]).sort((a, b) => a - b);
  const dLabel = i => DAYS[i].wd + ' ' + DAYS[i].day + '. ' + DAYS[i].month;
  const avail = i => (DAYS[i].type === 'Arbeidsdag' ? SETTINGS.baseCrew : 0) + (HIRED[i] || 0) - (ABSENT[i] || 0);
  const scope = [['Prosjekt', row.projectName + ' · ' + row.projectNo], ['Data fra', row.refYear], ['Grunnlag', row.basis], ['Hall/Sted', row.hall === undefined ? 'Alle haller' : row.hall], ['Avd.', row.avdeling === undefined ? 'Alle' : row.avdeling]];
  const w0 = row.window[0], w1 = row.window[row.window.length - 1];
  const st = rest > 0.05 ? 'open' : rest < -0.05 ? 'over' : 'done';
  const pct = need ? Math.min(100, plan / need * 100) : 0;
  const stCol = st === 'open' ? 'rgb(var(--ink))' : st === 'over' ? 'rgb(var(--draft))' : 'rgb(var(--committed))';
  return (
    <aside data-surface="raised" className="kinsp">
      <header className="ki-head">
        <div className="ki-head-t">
          <div className="ki-title">{row.competence}</div>
          <div className="ki-sub"><WorkMark phase={row.phase} /><span>{row.phase}</span><span className="ki-sep">·</span><span className="ki-trunc">{row.projectName}</span></div>
        </div>
        <div className="ki-acts"><IconButton label="Endre rad" icon="pencil" /><IconButton label="Lukk" icon="x" onClick={onClose} /></div>
      </header>
      <div className="kinsp-body">
        <section className="ki-sec">
          <h3 className="ki-h">Fremdrift<span>FTE-dager</span></h3>
          <div className="ki-stats">
            <div><span>Behov</span><b>{fmt(need)}</b><em>{fmt(row.hours)} t</em></div>
            <div><span>Planlagt</span><b>{fmt(plan)}</b><em>{fmt(plan * SETTINGS.hoursPerDay)} t</em></div>
            <div><span>{st === 'open' ? 'Gjenstår' : st === 'over' ? 'Over' : 'Dekket'}</span><b style={{ color: stCol }}>{st === 'done' ? '✓' : (st === 'over' ? '+' : '') + fmt(Math.abs(rest))}</b><em>{Math.round(pct)} %</em></div>
          </div>
          <div className="ki-bar"><span style={{ width: pct + '%', background: st === 'over' ? 'rgb(var(--draft))' : st === 'done' ? 'rgb(var(--committed))' : 'var(--work-m)' }}></span></div>
          {outside > 0 && <p className="ki-warn">{fmt(outside)} FTE-dager ligger utenfor vinduet.</p>}
        </section>
        {staff && days.length > 0 && (() => { const H = SETTINGS.hoursPerDay, ds = days.filter(i => row.window.includes(i)); const pl = ds.reduce((a, i) => a + row.fte[i] * H, 0), st = ds.reduce((a, i) => a + Math.min(row.fte[i] * H, staff.staffed(row, i)), 0), gap = pl - st, first = ds.find(i => row.fte[i] * H - staff.staffed(row, i) > 0.05);
          return <section className="ki-sec">
            <h3 className="ki-h">Bemanning<span>timer · merket {row.projectName.replace(' 2026', '')}</span></h3>
            <div className="ki-stats"><div><span>Planlagt</span><b>{fmt(pl)}</b><em>timer</em></div><div><span>Bemannet</span><b>{fmt(st)}</b><em>{pl ? Math.round(st / pl * 100) + ' %' : '–'}</em></div><div><span>Hull</span><b style={{ color: gap > 0.05 ? 'rgb(var(--danger))' : 'rgb(var(--committed))' }}>{gap > 0.05 ? fmt(gap) : '✓'}</b><em>{gap > 0.05 ? '≈ ' + Math.ceil(gap / H) + ' dagsverk' : 'dekket'}</em></div></div>
            <table className="kdays kstaff"><thead><tr><th>Dag</th><th>Plan</th><th>Bemannet</th><th>Hull</th></tr></thead><tbody>
              {ds.map(i => { const p0 = row.fte[i] * H, s0 = staff.staffed(row, i), g0 = p0 - s0; return <tr key={i} onClick={() => staff.onFill(row, i)} title={'Åpne ' + dLabel(i) + ' i Bemanning'}><td>{dLabel(i)}</td><td>{fmt(p0)}</td><td>{fmt(s0)}</td><td style={{ color: g0 > 0.05 ? 'rgb(var(--danger))' : 'rgb(var(--committed))' }}>{g0 > 0.05 ? fmt(g0) : g0 < -0.05 ? '+' + fmt(-g0) : '✓'}</td></tr>; })}
            </tbody></table>
            <div style={{ marginTop: 12 }}><Button variant="secondary" size="sm" icon="users" onClick={() => staff.onFill(row, first != null ? first : ds[0])}>{first != null ? 'Fyll i Bemanning' : 'Vis i Bemanning'}</Button></div>
          </section>; })()}
        <section className="ki-sec">
          <h3 className="ki-h">Vindu</h3>
          <dl className="ki-dl">
            <dt>Periode</dt><dd className="font-numeric">{dLabel(w0)} – {dLabel(w1)}</dd>
            <dt>Arbeidsdager</dt><dd className="font-numeric">{row.window.length}</dd>
            <dt>Hallfaser</dt><dd>{row.phase === 'Montering' ? 'Assembly, moving in' : 'Moving out, dismantle'}</dd>
            <dt>Haller</dt><dd>{p.halls.join(', ')}</dd>
          </dl>
        </section>
        <section className="ki-sec">
          <h3 className="ki-h">Omfang</h3>
          <dl className="ki-dl">{scope.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        </section>
        {days.length > 0 && <section className="ki-sec">
          <h3 className="ki-h">Dager med FTE<span>{days.length}</span></h3>
          <table className="kdays"><thead><tr><th>Dag</th><th>Raden</th><th>Behov</th><th>Avvik</th></tr></thead><tbody>
            {days.map(i => { const dev = avail(i) - needByDay[i]; return <tr key={i}><td>{dLabel(i)}{!row.window.includes(i) && <span className="kout" title="Utenfor vinduet"> · utenfor</span>}</td><td>{fmt(row.fte[i])}</td><td>{fmt(needByDay[i])}</td><td style={{ color: dev < 0 ? 'rgb(var(--danger))' : 'rgb(var(--committed))' }}>{fmt(dev)}</td></tr>; })}
          </tbody></table>
        </section>}
      </div>
      <footer className="ki-foot">
        {st === 'open'
          ? <Button variant="secondary" size="sm" icon="pencil" onClick={() => onSpread(row.id)} title="Fordel det som gjenstår på arbeidsdagene i radens vindu">Fordel {fmt(rest)} over vinduet</Button>
          : <span className="ki-done" style={{ color: stCol }}>{st === 'done' ? 'Behovet er dekket' : fmt(-rest) + ' FTE-dager over behovet'}</span>}
      </footer>
    </aside>
  );
}
function FilterMenu({ project, setProject, hideEmpty, setHideEmpty, onlyOpen, setOnlyOpen }) {
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const [open, setOpen] = React.useState(false);
  const pName = project && window.EP.PROJECTS.find(x => x.no === project).name;
  const n = (project ? 1 : 0) + (hideEmpty ? 1 : 0) + (onlyOpen ? 1 : 0);
  return (
    <span style={{ position: 'relative' }}>
      <button className={'kfbtn' + (n ? ' on' : '')} onClick={() => setOpen(o => !o)} aria-expanded={open}><Icon name="filter" size={14} /><span>{pName || 'Alle prosjekter'}</span>{n > (project ? 1 : 0) && <b>+{n - (project ? 1 : 0)}</b>}<Icon name="chevron-down" size={12} /></button>
      {open && <div data-surface="raised" className="kmenu kfmenu" style={{ left: 0, right: 'auto', width: 260 }}>
        <div className="grp">Prosjekt</div>
        {[['', 'Alle prosjekter'], ...window.EP.PROJECTS.map(x => [x.no, x.name])].map(([no, nm]) => <button key={no} className={'it' + (project === no ? ' sel' : '')} onClick={() => setProject(no)}>{nm}{project === no && <Icon name="check" size={14} style={{ marginLeft: 'auto' }} />}</button>)}
        <div className="grp" style={{ borderTop: '1px solid rgb(var(--border))', marginTop: 4, paddingTop: 10 }}>Vis</div>
        <label className="it"><input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} />Skjul tomme prosjekter</label>
        <label className="it"><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />Bare det som gjenstår</label>
      </div>}
    </span>
  );
}
Object.assign(window, { GroupingBar, GroupingMenu, RowInspector, FilterMenu });
