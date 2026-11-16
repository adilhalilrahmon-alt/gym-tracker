import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { actions, getState, todayISO, useStore } from '../lib/store';
import { SyncCard } from '../components/SyncCard';
import { GoogleCard } from '../components/GoogleCard';
import { NotifyCard } from '../components/NotifyCard';
import { Icon } from '../components/ui';
import { maxHrFromAge } from '../lib/zones';
import { feetInches, showHeight, showW, toCm, toLb, type BodyUnit, type WeightUnit } from '../lib/units';
import { bodyCsv, download, setsCsv } from '../lib/export';

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => value !== o.v && onChange(o.v)}>{o.t}</button>)}
    </div>
  );
}

/** Settings, backup, connections and data. Opened from the gear on Me. */
export function Settings({ onClose }: { onClose: () => void }) {
  const set = useStore((x) => x.settings);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const unit: BodyUnit = set.bodyUnit ?? 'in';
  const wu: WeightUnit = set.weightUnit ?? 'lb';
  // Older saves only kept max HR. If it came from the age formula, show that age back.
  const guessAge = set.maxHr ? Math.round((208 - set.maxHr) / 0.7) : undefined;
  const shownAge = set.age ?? (guessAge && maxHrFromAge(guessAge) === set.maxHr ? guessAge : undefined);
  const fi = feetInches(set.heightCm);
  const setFtIn = (ft: number, inch: number) => { const cm = (ft * 12 + inch) * 2.54; if (cm > 120 && cm < 230) actions.updateSettings({ heightCm: Math.round(cm * 10) / 10 }); };
  const exportData = () => download(`gym-tracker-${todayISO()}.json`, JSON.stringify(getState(), null, 2), 'application/json');

  // Drawn on <body> so it covers the tab bar.
  return createPortal(
    <div className="overlay">
      <main className="screen">
        <div className="row">
          <button className="icon-btn" aria-label="Back" onClick={onClose}>{Icon.back}</button>
          <h1>Settings</h1>
        </div>

      <section className="card col" style={{ gap: 12 }}>
        <h2>Goals and body</h2>
        <div className="grid2">
          <div className="field">
            <label htmlFor="s-goal">Goal weight ({wu})</label>
            <input id="s-goal" className="input" inputMode="decimal" key={`g-${wu}`} defaultValue={showW(set.goalWeight, wu)} onBlur={(e) => { const n = toLb(parseFloat(e.target.value), wu); if (n > 60 && n < 500) actions.updateSettings({ goalWeight: Math.round(n * 10) / 10 }); }} />
          </div>
          <div className="field">
            <label htmlFor="s-target">Sessions per week</label>
            <select id="s-target" className="input" value={set.weeklyTarget} onChange={(e) => actions.updateSettings({ weeklyTarget: parseInt(e.target.value, 10) })}>
              {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {unit === 'cm' ? (
            <div className="field">
              <label htmlFor="s-height">Height (cm)</label>
              <input id="s-height" className="input" inputMode="decimal" key="h-cm" defaultValue={showHeight(set.heightCm, 'cm')} onBlur={(e) => { const n = toCm(parseFloat(e.target.value), 'cm'); if (n > 120 && n < 230) actions.updateSettings({ heightCm: Math.round(n * 10) / 10 }); }} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="s-ft">Height (ft, in)</label>
              <div className="row" style={{ gap: 6 }}>
                <input id="s-ft" className="input" inputMode="numeric" aria-label="Feet" key={`ft-${fi.ft}`} defaultValue={fi.ft} onBlur={(e) => setFtIn(parseInt(e.target.value, 10) || fi.ft, fi.inch)} />
                <input className="input" inputMode="numeric" aria-label="Inches" key={`in-${fi.inch}`} defaultValue={fi.inch} onBlur={(e) => { const n = parseInt(e.target.value, 10); setFtIn(fi.ft, n >= 0 && n < 12 ? n : fi.inch); }} />
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="s-age">Age</label>
            <input id="s-age" className="input" inputMode="numeric" key={`age-${shownAge ?? ''}`} defaultValue={shownAge ?? ''} placeholder="e.g. 28" onBlur={(e) => { const a = parseInt(e.target.value, 10); if (a > 12 && a < 90 && a !== shownAge) actions.updateSettings({ age: a, maxHr: maxHrFromAge(a) }); }} />
          </div>
          <div className="field">
            <label htmlFor="s-maxhr">Max heart rate</label>
            <input id="s-maxhr" className="input" inputMode="numeric" key={set.maxHr ?? 'none'} defaultValue={set.maxHr ?? ''} placeholder="from age" onBlur={(e) => { const n = parseInt(e.target.value, 10); if (n > 120 && n < 230) actions.updateSettings({ maxHr: n }); }} />
          </div>
          <div className="field">
            <label htmlFor="s-rem">Weigh-in reminder</label>
            <input id="s-rem" className="input" type="time" value={set.reminderTime} onChange={(e) => actions.updateSettings({ reminderTime: e.target.value })} />
          </div>
        </div>
        <div className="between">
          <span className="small" style={{ fontWeight: 800, color: 'var(--muted)' }}>Body weight in</span>
          <Seg label="Body weight units" value={wu} options={[{ v: 'lb', t: 'lb' }, { v: 'kg', t: 'kg' }]} onChange={(v) => actions.updateSettings({ weightUnit: v })} />
        </div>
        <div className="between">
          <span className="small" style={{ fontWeight: 800, color: 'var(--muted)' }}>Measurements and height in</span>
          <Seg label="Measurement units" value={unit} options={[{ v: 'in', t: 'in' }, { v: 'cm', t: 'cm' }]} onChange={(v) => actions.updateSettings({ bodyUnit: v })} />
        </div>
        <div className="between">
          <span className="small" style={{ fontWeight: 800, color: 'var(--muted)' }}>Rest clock while logging</span>
          <Seg label="Rest clock" value={set.restTimer === false ? 'off' : 'on'} options={[{ v: 'on', t: 'On' }, { v: 'off', t: 'Off' }]} onChange={(v) => actions.updateSettings({ restTimer: v === 'on' })} />
        </div>
        <span className="tiny muted">Age sets your max heart rate (208 − 0.7 × age) for the heart-rate zones. Type a measured max instead if you know it. Lifts are always in lb.</span>
      </section>

      <SyncCard />
      <GoogleCard />
      <NotifyCard />

      <section className="card col" style={{ gap: 10 }}>
        <h2>Your data</h2>
        <span className="small muted">Stored on this phone, and in the cloud once you sign in above. You can also export a file backup.</span>
        <div className="row">
          <button className="btn subtle" onClick={exportData}>Backup file</button>
          <button className="btn subtle" onClick={() => file.current?.click()}>Import</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { actions.importData(await f.text()); setMsg('Backup restored.'); } catch (err) { setMsg((err as Error).message); }
          }} />
        </div>
        <span className="small muted">For a spreadsheet:</span>
        <div className="row">
          <button className="btn subtle" onClick={() => download(`gym-sets-${todayISO()}.csv`, setsCsv(getState()))}>Workouts (CSV)</button>
          <button className="btn subtle" onClick={() => download(`gym-body-${todayISO()}.csv`, bodyCsv(getState()))}>Weight (CSV)</button>
        </div>
        {msg && <span className="small up">{msg}</span>}
      </section>
      </main>
    </div>,
    document.body,
  );
}
