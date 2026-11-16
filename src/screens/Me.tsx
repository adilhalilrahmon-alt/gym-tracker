import { useRef, useState } from 'react';
import { actions, MEASURE_KEYS, todayISO, useStore, type Measurement, type MeasureKey } from '../lib/store';
import { bodyFatOn, parseDate } from '../lib/stats';
import { SAMPLE } from '../lib/avatar';
import { FrontAvatar, SideAvatar, setHeightCm } from '../components/Avatar';
import { Icon, Sheet } from '../components/ui';
import { Settings } from './Settings';
import { avatarFromPhoto, useSyncStatus } from '../lib/sync';
import { showLen, toInches, type BodyUnit } from '../lib/units';

/** Inches / cm switch. Changing it here changes it everywhere. */
function UnitSwitch({ unit, onChange }: { unit: BodyUnit; onChange?: (u: BodyUnit) => void }) {
  const pick = (u: BodyUnit) => { if (u !== unit) { actions.updateSettings({ bodyUnit: u }); onChange?.(u); } };
  return (
    <div className="seg" role="group" aria-label="Measurement units">
      <button type="button" aria-pressed={unit === 'in'} onClick={() => pick('in')}>in</button>
      <button type="button" aria-pressed={unit === 'cm'} onClick={() => pick('cm')}>cm</button>
    </div>
  );
}

const LABELS: Record<MeasureKey, string> = { neck: 'Neck', shoulders: 'Shoulders', chest: 'Chest', biceps: 'Biceps (flexed)', waist: 'Waist (at navel)', hips: 'Hips', thigh: 'Mid-thigh', calf: 'Calf' };

function MeasureSheet({ onClose }: { onClose: () => void }) {
  const last = useStore((s) => s.measurements[s.measurements.length - 1]);
  const unit = useStore((s) => s.settings.bodyUnit ?? 'in');
  const [date, setDate] = useState(todayISO());
  const [vals, setVals] = useState<Record<MeasureKey, string>>(() => Object.fromEntries(MEASURE_KEYS.map((k) => [k, last ? String(showLen(last[k], unit)) : ''])) as Record<MeasureKey, string>);
  const inches = MEASURE_KEYS.map((k) => toInches(parseFloat(vals[k]), unit));
  const ok = inches.every((n) => n > 5 && n < 80);
  // Switching units converts whatever is already typed, so nothing has to be re-entered.
  const convert = (to: BodyUnit) => setVals(Object.fromEntries(MEASURE_KEYS.map((k) => {
    const n = parseFloat(vals[k]);
    return [k, Number.isFinite(n) ? String(showLen(toInches(n, unit), to)) : vals[k]];
  })) as Record<MeasureKey, string>);
  return (
    <Sheet title="Log measurements" onClose={onClose}>
      <div className="between">
        <p className="muted small" style={{ margin: 0 }}>Morning, before eating. Tape snug, not tight.</p>
        <UnitSwitch unit={unit} onChange={convert} />
      </div>
      <div className="grid2" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
        {MEASURE_KEYS.map((k) => (
          <div key={k} className="field">
            <label htmlFor={`m-${k}`}>{LABELS[k]} ({unit})</label>
            <input id={`m-${k}`} className="input" inputMode="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          </div>
        ))}
        <div className="field">
          <label htmlFor="m-date">Date</label>
          <input id="m-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <button className="btn big-btn" disabled={!ok} onClick={() => {
        const m = { date, ...Object.fromEntries(MEASURE_KEYS.map((k, i) => [k, Math.round(inches[i] * 100) / 100])) } as Measurement;
        actions.logMeasurement(m);
        onClose();
      }}>Save</button>
    </Sheet>
  );
}

export function Me() {
  const s = useStore((x) => x);
  const [sheet, setSheet] = useState(false);
  const [compare, setCompare] = useState<'none' | 'start' | 'goal'>('start');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [idx, setIdx] = useState<number | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const sync = useSyncStatus();
  const onPhoto = async (f: File) => {
    setPhotoBusy(true); setPhotoMsg('');
    try {
      const img = await createImageBitmap(f);
      const k = Math.min(1, 768 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const features = await avatarFromPhoto(c.toDataURL('image/jpeg', 0.82));
      actions.updateSettings({ avatar: features });
      setPhotoMsg('Avatar updated. The photo was not saved anywhere.');
    } catch (e) { setPhotoMsg((e as Error).message); } finally { setPhotoBusy(false); }
  };
  setHeightCm(s.settings.heightCm);

  const ms = s.measurements;
  const sel = idx ?? ms.length - 1;
  const cur = ms[sel] ?? null;
  const m = cur ?? SAMPLE;
  const startM = ms.length > 1 ? ms[0] : null;
  // Scale reading for the day being shown (latest, or the selected measurement's date).
  const bfr = bodyFatOn(s.weighIns, cur, s.settings.heightCm, cur && sel < ms.length - 1 ? cur.date : todayISO());
  const bf = bfr?.value ?? 18;
  const set = s.settings;
  const unit: BodyUnit = set.bodyUnit ?? 'in';
  // Rough picture of the same body at goal weight: girths shrink with weight, the waist fastest.
  const curW = s.weighIns[s.weighIns.length - 1]?.weight;
  const ratio = curW ? set.goalWeight / curW : 1;
  const goalM = cur && curW && Math.abs(ratio - 1) > 0.01 ? { ...cur, waist: cur.waist * ratio ** 1.1, hips: cur.hips * ratio ** 0.8, chest: cur.chest * ratio ** 0.6, thigh: cur.thigh * ratio ** 0.7, neck: cur.neck * ratio ** 0.4, biceps: cur.biceps * ratio ** 0.4, calf: cur.calf * ratio ** 0.4, shoulders: cur.shoulders * ratio ** 0.3 } : null;
  const ghostM = compare === 'goal' ? goalM : compare === 'start' && sel > 0 ? startM : null;
  const dueIn = cur ? 14 - Math.round((+parseDate(todayISO()) - +parseDate(ms[ms.length - 1].date)) / 864e5) : 0;

  return (
    <main className="screen">
      <div className="between">
        <h1>You</h1>
        <div className="row">
          {!cur && <span className="pill">SAMPLE SHAPE</span>}
          <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>{Icon.gear}</button>
        </div>
      </div>

      <section className="card col" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-end', gap: 18 }}>
          <div className="col" style={{ alignItems: 'center' }}><FrontAvatar m={m} bf={bf} ghost={ghostM} height={300} id="me-f" look={set.avatar} /><span className="small muted" style={{ fontWeight: 800 }}>Front</span></div>
          <div className="col" style={{ alignItems: 'center' }}><SideAvatar m={m} bf={bf} ghost={ghostM} height={300} id="me-s" look={set.avatar} /><span className="small muted" style={{ fontWeight: 800 }}>Side</span></div>
        </div>
        {ms.length > 1 && (
          <div className="field">
            <label htmlFor="when">Showing {parseDate(ms[sel].date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</label>
            <input id="when" type="range" min={0} max={ms.length - 1} value={sel} onChange={(e) => setIdx(parseInt(e.target.value, 10))} style={{ accentColor: '#FFB547' }} />
          </div>
        )}
        <div className="between">
          <div className="col" style={{ gap: 0 }}>
            <span className="eyebrow">Body fat {bfr?.source === 'scale' ? '(Renpho, 7-day avg)' : bfr ? '(tape est.)' : ''}</span>
            <span className="mid" style={{ color: 'var(--gold)' }}>{bfr ? `${bf.toFixed(1)}%` : '—'}</span>
            {bfr?.source === 'scale' && bfr.tape != null && <span className="tiny muted">Tape estimate {bfr.tape.toFixed(1)}%</span>}
            {bfr?.source === 'tape' && <span className="tiny muted">Step on the Renpho to use its reading</span>}
          </div>
          {(startM || goalM) && (
            <div className="seg" role="group" aria-label="Outline to compare with">
              <button aria-pressed={compare === 'none'} onClick={() => setCompare('none')}>Now</button>
              {startM && <button aria-pressed={compare === 'start'} onClick={() => setCompare('start')}>vs start</button>}
              {goalM && <button aria-pressed={compare === 'goal'} onClick={() => setCompare('goal')}>vs goal</button>}
            </div>
          )}
        </div>
        {cur && (
          <div className="col" style={{ gap: 6 }}>
            <div className="between">
              <span className="eyebrow">Measurements{startM && sel > 0 ? ' · change since start' : ''}</span>
              <UnitSwitch unit={unit} />
            </div>
            <div className="grid2" style={{ rowGap: 4 }}>
              {MEASURE_KEYS.map((k) => {
                const d = startM && sel > 0 ? showLen(cur[k], unit) - showLen(startM[k], unit) : 0;
                return (
                  <div key={k} className="between small" style={{ borderTop: '1px solid #22346e', paddingTop: 4 }}>
                    <span className="muted">{LABELS[k].replace(/ \(.*\)/, '')}</span>
                    <span><strong>{showLen(cur[k], unit)}</strong> {unit}{d ? <span className={k === 'waist' ? (d < 0 ? 'up' : 'warn') : 'muted'}> {d > 0 ? '+' : ''}{Math.round(d * 10) / 10}</span> : null}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {compare === 'goal' && goalM && <span className="tiny muted">The outline is a rough estimate of your shape at {set.goalWeight} lb, scaled from today's measurements. It can't know where you'll lose it from.</span>}
        <button className="btn big-btn" onClick={() => setSheet(true)}>{cur ? 'Log new measurements' : 'Add your measurements'}</button>
        {sync.email && (
          <>
            <button className="btn subtle" disabled={photoBusy} onClick={() => photo.current?.click()}>{photoBusy ? 'Reading photo…' : set.avatar ? 'Update face from a photo' : 'Set face and hair from a photo'}</button>
            <input ref={photo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ''; }} />
            <span className="tiny muted">The AI only picks skin tone, hair and facial hair for the drawing. Your photo isn't stored. Body shape always comes from your measurements.</span>
            {photoMsg && <span className="small up">{photoMsg}</span>}
          </>
        )}
        {cur && <span className="tiny muted">Last measured {parseDate(ms[ms.length - 1].date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}. {dueIn > 0 ? `Next one due in ${dueIn} day${dueIn === 1 ? '' : 's'}.` : 'Time for a new one.'} You get a reminder if measurement notifications are on.</span>}
      </section>

      {sheet && <MeasureSheet onClose={() => setSheet(false)} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
