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

function RowInspector({ row, rows, needByDay, onSpread, onClose, workStyle = 'mono' }) {
  const { Eyebrow, CommitBlock, IconButton } = window.WarmMinimalDesignSystem_58386e;
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
  return (
    <aside data-surface="raised" className="kinsp">
      <div style={{ background: mono ? 'var(--total-1)' : c, color: mono ? 'rgb(var(--ink))' : 'var(--on-line)', borderBottom: mono ? '1px solid rgb(var(--border))' : 'none', padding: '18px 24px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: 'var(--type-line-title)', letterSpacing: '-.02em' }}>{row.competence}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="konchip" style={mono ? { background: 'rgb(var(--surface))', display: 'flex', alignItems: 'center', gap: 6 } : undefined}>{mono && <WorkMark phase={row.phase} style="mono" />}{row.phase}</span><span className="konchip" style={mono ? { background: 'rgb(var(--surface))' } : undefined}>{row.projectName}</span>
          </div>
        </div>
        <IconButton label="Endre rad" icon="pencil" style={{ color: mono ? 'rgb(var(--ink-muted))' : 'var(--on-line)', background: 'transparent' }} />
        <IconButton label="Lukk" icon="x" onClick={onClose} style={{ color: mono ? 'rgb(var(--ink-muted))' : 'var(--on-line)', background: 'transparent' }} />
      </div>
      <div className="kinsp-body">
        <dl className="kscope">{scope.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        <section>
          <Eyebrow>Vindu</Eyebrow>
          <p className="kinsp-p">{row.phase === 'Montering' ? 'Assembly og moving in' : 'Moving out og dismantle'} i {p.halls.join(', ')}: <span className="font-numeric">{dLabel(w0)} – {dLabel(w1)}</span> · {row.window.length} arbeidsdager</p>
        </section>
        <section className="ktotals">
          <div><span>Behov</span><b className="font-numeric">{fmt(row.hours)} t</b><em className="font-numeric">{fmt(need)} FTE-dager</em></div>
          <div><span>Planlagt</span><b className="font-numeric">{fmt(plan)}</b><em className="font-numeric">{days.length ? dLabel(days[0]) + ' – ' + dLabel(days[days.length - 1]) : 'Ingen dager'}</em></div>
        </section>
        {days.length > 0 && <section>
          <Eyebrow>Dager med FTE</Eyebrow>
          <table className="kdays"><thead><tr><th>Dag</th><th>Raden</th><th>Behov</th><th>Avvik</th></tr></thead><tbody>
            {days.map(i => { const dev = avail(i) - needByDay[i]; return <tr key={i}><td>{dLabel(i)}{!row.window.includes(i) && <span className="kout" title="Utenfor vinduet"> · utenfor</span>}</td><td>{fmt(row.fte[i])}</td><td>{fmt(needByDay[i])}</td><td style={{ color: dev < 0 ? 'rgb(var(--danger))' : 'rgb(var(--committed))' }}>{fmt(dev)}</td></tr>; })}
          </tbody></table>
        </section>}
      <div style={{ marginTop: 'auto' }}>
        <CommitBlock layout="stack" label={(rest > 0.05 ? 'Gjenstår å planlegge' : rest < -0.05 ? 'Planlagt over behovet' : 'Behovet er dekket') + ' · FTE-dager'} amount={fmt(Math.abs(rest))}
          actionLabel="Fordel over vinduet" actionDisabled={rest <= 0.05} onAction={() => onSpread(row.id)} />
        {outside > 0 && <p style={{ margin: '10px 2px 0', fontSize: 12, color: 'rgb(var(--draft))' }}>{fmt(outside)} FTE-dager ligger utenfor vinduet.</p>}
      </div>
      </div>
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
Object.assign(window, { GroupingBar, RowInspector, FilterMenu });
