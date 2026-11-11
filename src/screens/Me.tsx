import { useRef, useState } from 'react';
import { actions, getState, MEASURE_KEYS, todayISO, useStore, type Measurement, type MeasureKey } from '../lib/store';
import { navyBodyFat, parseDate } from '../lib/stats';
import { SAMPLE } from '../lib/avatar';
import { FrontAvatar, SideAvatar, setHeightCm } from '../components/Avatar';
import { Sheet } from '../components/ui';
import { SyncCard } from '../components/SyncCard';
import { GoogleCard } from '../components/GoogleCard';

const LABELS: Record<MeasureKey, string> = { neck: 'Neck', shoulders: 'Shoulders', chest: 'Chest', biceps: 'Biceps (flexed)', waist: 'Waist (at navel)', hips: 'Hips', thigh: 'Mid-thigh', calf: 'Calf' };

function MeasureSheet({ onClose }: { onClose: () => void }) {
  const last = useStore((s) => s.measurements[s.measurements.length - 1]);
  const [date, setDate] = useState(todayISO());
  const [vals, setVals] = useState<Record<MeasureKey, string>>(() => Object.fromEntries(MEASURE_KEYS.map((k) => [k, last ? String(last[k]) : ''])) as Record<MeasureKey, string>);
  const nums = MEASURE_KEYS.map((k) => parseFloat(vals[k]));
  const ok = nums.every((n) => n > 5 && n < 80);
  return (
    <Sheet title="Log measurements" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>Inches, in the morning before eating, tape snug but not tight. Same spots every 2 weeks.</p>
      <div className="grid2" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
        {MEASURE_KEYS.map((k) => (
          <div key={k} className="field">
            <label htmlFor={`m-${k}`}>{LABELS[k]}</label>
            <input id={`m-${k}`} className="input" inputMode="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          </div>
        ))}
        <div className="field">
          <label htmlFor="m-date">Date</label>
          <input id="m-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <button className="btn big-btn" disabled={!ok} onClick={() => {
        const m = { date, ...Object.fromEntries(MEASURE_KEYS.map((k, i) => [k, nums[i]])) } as Measurement;
        actions.logMeasurement(m);
        onClose();
      }}>Save</button>
    </Sheet>
  );
}

export function Me() {
  const s = useStore((x) => x);
  const [sheet, setSheet] = useState(false);
  const [ghost, setGhost] = useState(true);
  const [idx, setIdx] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  setHeightCm(s.settings.heightCm);

  const ms = s.measurements;
  const sel = idx ?? ms.length - 1;
  const cur = ms[sel] ?? null;
  const m = cur ?? SAMPLE;
  const startM = ms.length > 1 ? ms[0] : null;
  const bf = navyBodyFat(m, s.settings.heightCm);
  const set = s.settings;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-tracker-${todayISO()}.json`;
    a.click();
  };

  return (
    <main className="screen">
      <div className="between">
        <h1>You</h1>
        {!cur && <span className="pill">SAMPLE SHAPE</span>}
      </div>

      <section className="card col" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-end', gap: 18 }}>
          <div className="col" style={{ alignItems: 'center' }}><FrontAvatar m={m} bf={bf} ghost={ghost && sel > 0 ? startM : null} height={300} id="me-f" /><span className="small muted" style={{ fontWeight: 800 }}>Front</span></div>
          <div className="col" style={{ alignItems: 'center' }}><SideAvatar m={m} bf={bf} ghost={ghost && sel > 0 ? startM : null} height={300} id="me-s" /><span className="small muted" style={{ fontWeight: 800 }}>Side</span></div>
        </div>
        {ms.length > 1 && (
          <div className="field">
            <label htmlFor="when">Showing {parseDate(ms[sel].date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</label>
            <input id="when" type="range" min={0} max={ms.length - 1} value={sel} onChange={(e) => setIdx(parseInt(e.target.value, 10))} style={{ accentColor: '#FFB547' }} />
          </div>
        )}
        <div className="between">
          <div className="col" style={{ gap: 0 }}>
            <span className="eyebrow">Body fat (tape est.)</span>
            <span className="mid" style={{ color: 'var(--gold)' }}>{bf.toFixed(1)}%</span>
          </div>
          {ms.length > 1 && <button className="btn ghost" aria-pressed={ghost} onClick={() => setGhost(!ghost)}>{ghost ? 'Hide start' : 'Compare to start'}</button>}
        </div>
        <button className="btn big-btn" onClick={() => setSheet(true)}>{cur ? 'Log new measurements' : 'Add your measurements'}</button>
        {cur && <span className="tiny muted">Last measured {parseDate(ms[ms.length - 1].date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}. Next one due in 2 weeks.</span>}
      </section>

      <section className="card col" style={{ gap: 12 }}>
        <h2>Settings</h2>
        <div className="grid2">
          <div className="field">
            <label htmlFor="s-goal">Goal weight (lb)</label>
            <input id="s-goal" className="input" inputMode="decimal" defaultValue={set.goalWeight} onBlur={(e) => { const n = parseFloat(e.target.value); if (n > 60) actions.updateSettings({ goalWeight: n }); }} />
          </div>
          <div className="field">
            <label htmlFor="s-target">Sessions per week</label>
            <select id="s-target" className="input" value={set.weeklyTarget} onChange={(e) => actions.updateSettings({ weeklyTarget: parseInt(e.target.value, 10) })}>
              {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-height">Height (cm)</label>
            <input id="s-height" className="input" inputMode="decimal" defaultValue={set.heightCm} onBlur={(e) => { const n = parseFloat(e.target.value); if (n > 120 && n < 230) actions.updateSettings({ heightCm: n }); }} />
          </div>
          <div className="field">
            <label htmlFor="s-rem">Weigh-in reminder</label>
            <input id="s-rem" className="input" type="time" value={set.reminderTime} onChange={(e) => actions.updateSettings({ reminderTime: e.target.value })} />
          </div>
        </div>
        <span className="tiny muted">Reminders, Renpho and Fitbit sync, and the AI coach arrive in the next phases.</span>
      </section>

      <SyncCard />
      <GoogleCard />

      <section className="card col" style={{ gap: 10 }}>
        <h2>Your data</h2>
        <span className="small muted">Stored on this phone, and in the cloud once you sign in above. You can also export a file backup.</span>
        <div className="row">
          <button className="btn subtle" onClick={exportData}>Export backup</button>
          <button className="btn subtle" onClick={() => file.current?.click()}>Import</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { actions.importData(await f.text()); setMsg('Backup restored.'); } catch (err) { setMsg((err as Error).message); }
          }} />
        </div>
        {msg && <span className="small up">{msg}</span>}
      </section>
      {sheet && <MeasureSheet onClose={() => setSheet(false)} />}
    </main>
  );
}
