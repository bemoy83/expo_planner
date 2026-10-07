const { fmtH: bmH } = window.BM;

function DemandStrip({ days, comps, demand, assigned, assignedOT, freeElig, brush, onPick, preview, focusDay, setFocusDay, onCellClick, stripMode, cap, carry, collapsed, onToggle }) {
  const { Icon } = window.WarmMinimalDesignSystem_58386e;
  const mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; }, []);
  const wkRem = c => days.filter(d => !d.we).reduce((a, d) => a + Math.max(0, demand[c][d.i] - assigned[c][d.i]), 0);
  return (
    <div className={'bm-strip' + (mounted.current ? ' live' : '')}>
      <div className="bm-r bm-dh">
        <div className="bm-l bm-dl0"><span className="keb">Dato</span><span className="bm-lh">U42 · 12.–18. okt 2026</span></div>
        {days.map(d => (
          <button key={d.i} className={'bm-dhc' + (d.we ? ' we' : '') + (focusDay === d.i ? ' on' : '')} onClick={() => setFocusDay(d.i)}>
            <span>{d.wd.toLowerCase()}</span><b>{d.d}</b>
          </button>
        ))}
      </div>
      <div className="bm-r bm-sec"><div className="bm-l"><button className="bm-sectog" onClick={onToggle} aria-expanded={!collapsed} title={collapsed ? 'Vis alle kompetanser' : 'Vis bare fokusert kompetanse'}><Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={12} /><span className="keb">Behov</span></button><span className="bm-lh">{collapsed ? (comps.length - (brush ? 1 : 0)) + ' skjult' : stripMode === 'rest' ? 'gjenstår · timer' : 'tildelt / behov · timer'}</span></div><span></span></div>
      {comps.map((c, ci) => {
        const on = brush === c.id, dim = brush && !on;
        if (collapsed && !on) return null;
        return (
          <div key={c.id} className={'bm-r bm-dr' + (on ? ' on' : '') + (dim ? ' dim' : '')} style={{ '--cc': c.color }}>
            <button className="bm-l bm-dl" onClick={() => onPick(c.id)} title={on ? 'Slå av fokus og pensel (Esc)' : 'Fokuser på ' + c.name + ' og mal med den (' + (ci + 1) + ')'}>
              <i className="bm-sw"></i><span className="bm-cn">{c.name}</span><kbd>{ci + 1}</kbd>
              <span className="bm-wk">{bmH(wkRem(c.id))}<em> t igjen</em></span>
            </button>
            {days.map(d => {
              const req = demand[c.id][d.i], asg = assigned[c.id][d.i], rem = req - asg;
              const fe = freeElig[c.id][d.i], unc = d.we ? 0 : Math.max(0, rem - fe);
              const pv = on ? (preview[d.i] || 0) : 0;
              const cr = carry[c.id + '|' + d.i];
              const aot = assignedOT[c.id][d.i];
              if (d.we && req === 0 && asg === 0) return <div key={d.i} className="bm-dc we"><span className="bm-nil">–</span></div>;
              let num, cls = '';
              if (req === 0 && asg === 0) { num = '–'; cls = 'nil'; }
              else if (stripMode === 'ratio') { num = bmH(asg) + ' / ' + bmH(req); cls = rem < -0.05 ? 'over' : Math.abs(rem) < .05 ? 'ok' : unc > .05 ? 'unc' : ''; }
              else if (rem > 0.05) { num = bmH(rem); cls = unc > .05 ? 'unc' : ''; }
              else if (rem < -0.05) { num = '+' + bmH(-rem); cls = 'over'; }
              else { num = <Icon name="check" size={14} />; cls = 'ok'; }
              const base = Math.max(req, asg) || 1;
              const regCov = Math.min(asg - aot, req), otCov = Math.min(asg, req) - regCov;
              const fillW = regCov / base * 100, otW = otCov / base * 100, overW = Math.max(0, asg - req) / base * 100;
              const pvW = Math.min(pv, Math.max(0, rem)) / base * 100, uncW = unc / base * 100;
              const tip = c.name + ' · ' + d.long + (d.we ? ' (overtid)' : '') + '\nBehov ' + bmH(req) + ' t · tildelt ' + bmH(asg) + ' t' + (aot > 0.05 ? ' (herav ' + bmH(aot) + ' t overtid)' : '') + ' · gjenstår ' + bmH(Math.max(0, rem)) + ' t' + (unc > .05 ? '\nLedig hos faste med kompetansen: ' + bmH(fe) + ' t. ' + bmH(unc) + ' t kan ikke dekkes av faste i normaltid.' : '');
              return (
                <button key={d.i} className={'bm-dc' + (d.we ? ' we' : '') + (focusDay === d.i ? ' fd' : '')} title={tip} onClick={e => onCellClick(c.id, d.i, e)}>
                  <span className="bm-dv">
                    {pv > 0.05 && !d.we && <span className="bm-pv">−{bmH(Math.min(pv, Math.max(rem, 0)) || pv)}</span>}
                    {cr && !d.we && <span className="bm-cr" title={bmH(cr) + ' t overført fra dagen før'}>+{bmH(cr)}</span>}
                    <b key={String(rem)} className={'bm-n ' + cls}>{num}</b>
                    {stripMode === 'rest' && req > 0 && !d.we && <em>av {bmH(req)}</em>}
                  </span>
                  {(req > 0 || asg > 0) && <span className="bm-bar">
                    <i className="f" style={{ width: fillW + '%' }}></i>
                    {otW > 0 && <i className="ot" style={{ left: fillW + '%', width: otW + '%' }}></i>}
                    {overW > 0 && <i className="o" style={{ left: (fillW + otW) + '%', width: overW + '%' }}></i>}
                    {pvW > 0 && <i className="p" style={{ left: (fillW + otW) + '%', width: pvW + '%' }}></i>}
                    {uncW > 0 && <i className="u" style={{ width: uncW + '%' }}></i>}
                  </span>}
                </button>
              );
            })}
          </div>
        );
      })}
      <div className="bm-r bm-cap">
        <div className="bm-l"><span className="bm-capl">{brush ? 'Ledig med ' + comps.find(c => c.id === brush).name : 'Ledig kapasitet, faste'}</span></div>
        {days.map(d => (
          <div key={d.i} className={'bm-capc' + (d.we ? ' we' : '') + (focusDay === d.i ? ' fd' : '')}>
            {!d.we && <><b>{bmH(cap[d.i].h)}</b><em>t · {cap[d.i].n} pers</em></>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DemandPopover({ pop, comps, days, demand, assigned, freeElig, onClose, onCarry, onPick, brush }) {
  const { Button } = window.WarmMinimalDesignSystem_58386e;
  const c = comps.find(x => x.id === pop.comp), d = days[pop.day];
  const req = demand[c.id][d.i], asg = assigned[c.id][d.i], rem = Math.max(0, req - asg);
  const next = days[d.i + 1];
  const [amt, setAmt] = React.useState('3');
  const v = parseFloat(String(amt).replace(',', '.')) || 0;
  return (
    <div data-surface="raised" className="bm-pop" style={{ left: Math.min(pop.x, window.innerWidth - 316), top: pop.y + 8, '--cc': c.color }} onMouseDown={e => e.stopPropagation()}>
      <div className="bm-pop-h"><i className="bm-sw"></i><b>{c.name}</b><span>{d.long} {d.d}. okt</span></div>
      <div className="bm-pop-stats">
        <div><span>Behov</span><b>{bmH(req)}</b></div>
        <div><span>Tildelt</span><b>{bmH(asg)}</b></div>
        <div><span>Gjenstår</span><b>{bmH(rem)}</b></div>
      </div>
      <p className="bm-pop-p">Ledig hos faste med {c.name}: <b className="font-numeric">{bmH(freeElig[c.id][d.i])} t</b></p>
      {next && <div className="bm-pop-carry">
        <span className="bm-pop-lab">Ikke fullført? Flytt arbeid til {next.long}{next.we ? ' (overtid)' : ''}</span>
        <div className="bm-pop-row">
          <input value={amt} onChange={e => setAmt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && v > 0) onCarry(c.id, d.i, v); }} />
          <span className="bm-pop-u">t</span>
          <Button size="sm" variant="secondary" disabled={v <= 0} onClick={() => onCarry(c.id, d.i, v)}>Flytt til {next.wd.toLowerCase()}</Button>
        </div>
      </div>}
      <div className="bm-pop-f">
        <Button size="sm" variant="ghost" onClick={onClose}>Lukk</Button>
        <Button size="sm" variant="accent" onClick={() => { onPick(c.id, true); onClose(); }}>{brush === c.id ? 'Maler med ' + c.name : 'Mal med ' + c.name}</Button>
      </div>
    </div>
  );
}

Object.assign(window, { DemandStrip, DemandPopover });
