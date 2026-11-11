// Pure merge logic between the local store and Supabase rows. Newest updated_at wins.
import type { Measurement, Settings, State, WeighIn, Workout } from './store';

export interface WorkoutRow { id: string; data: Omit<Workout, 'updatedAt'>; deleted: boolean; updated_at: string }
export interface WeighInRow { date: string; weight: number; body_fat: number | null; source: string; deleted: boolean; updated_at: string }
export interface MeasurementRow { date: string; data: Omit<Measurement, 'updatedAt' | 'date'>; deleted: boolean; updated_at: string }
export interface SettingsRow { data: Settings; updated_at: string }

export interface Remote {
  workouts: WorkoutRow[];
  weigh_ins: WeighInRow[];
  measurements: MeasurementRow[];
  settings: SettingsRow | null;
}

const ts = (s?: string) => (s ? Date.parse(s) : 0);

export function mergeRemote(s: State, r: Remote): State {
  const tomb = (table: string, key: string) => ts(s.tombstones.find((t) => t.table === table && t.key === key)?.at);

  const workouts = new Map(s.workouts.map((w) => [w.id, w]));
  for (const row of r.workouts) {
    const local = workouts.get(row.id);
    if (ts(row.updated_at) <= Math.max(ts(local?.updatedAt), tomb('workouts', row.id))) continue;
    if (row.deleted) workouts.delete(row.id);
    else workouts.set(row.id, { ...row.data, id: row.id, updatedAt: row.updated_at });
  }

  const weighIns = new Map(s.weighIns.map((w) => [w.date, w]));
  for (const row of r.weigh_ins) {
    const local = weighIns.get(row.date);
    if (ts(row.updated_at) <= Math.max(ts(local?.updatedAt), tomb('weigh_ins', row.date))) continue;
    if (row.deleted) weighIns.delete(row.date);
    else {
      const w: WeighIn = { date: row.date, weight: Number(row.weight), source: row.source === 'scale' ? 'scale' : 'manual', updatedAt: row.updated_at };
      if (row.body_fat != null) w.bodyFat = Number(row.body_fat);
      weighIns.set(row.date, w);
    }
  }

  const measurements = new Map(s.measurements.map((m) => [m.date, m]));
  for (const row of r.measurements) {
    const local = measurements.get(row.date);
    if (ts(row.updated_at) <= Math.max(ts(local?.updatedAt), tomb('measurements', row.date))) continue;
    if (row.deleted) measurements.delete(row.date);
    else measurements.set(row.date, { ...row.data, date: row.date, updatedAt: row.updated_at } as Measurement);
  }

  let settings = s.settings;
  let settingsUpdatedAt = s.settingsUpdatedAt;
  if (r.settings && ts(r.settings.updated_at) > ts(s.settingsUpdatedAt)) {
    settings = { ...s.settings, ...r.settings.data };
    settingsUpdatedAt = r.settings.updated_at;
  }

  // Drop tombstones the server already has.
  const confirmed = (table: string, key: string, at: string) => {
    const rows: { key: string; deleted: boolean; updated_at: string }[] =
      table === 'workouts' ? r.workouts.map((x) => ({ key: x.id, deleted: x.deleted, updated_at: x.updated_at }))
        : table === 'weigh_ins' ? r.weigh_ins.map((x) => ({ key: x.date, deleted: x.deleted, updated_at: x.updated_at }))
          : r.measurements.map((x) => ({ key: x.date, deleted: x.deleted, updated_at: x.updated_at }));
    return rows.some((x) => x.key === key && x.deleted && ts(x.updated_at) >= ts(at));
  };

  return {
    ...s,
    workouts: [...workouts.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    weighIns: [...weighIns.values()].sort((a, b) => a.date.localeCompare(b.date)),
    measurements: [...measurements.values()].sort((a, b) => a.date.localeCompare(b.date)),
    settings,
    settingsUpdatedAt,
    tombstones: s.tombstones.filter((t) => !confirmed(t.table, t.key, t.at)),
  };
}

/** Local changes newer than `since` (ISO), as rows ready to upsert. Empty `since` = everything. */
export function collectPush(s: State, since: string, fallbackTs: string) {
  const after = (u?: string) => !since || ts(u ?? fallbackTs) > ts(since);
  const stamp = (u?: string) => u ?? fallbackTs;
  const workouts: WorkoutRow[] = s.workouts.filter((w) => after(w.updatedAt)).map(({ updatedAt, ...data }) => ({ id: data.id, data, deleted: false, updated_at: stamp(updatedAt) }));
  const weigh_ins: WeighInRow[] = s.weighIns.filter((w) => after(w.updatedAt)).map((w) => ({ date: w.date, weight: w.weight, body_fat: w.bodyFat ?? null, source: w.source, deleted: false, updated_at: stamp(w.updatedAt) }));
  const measurements: MeasurementRow[] = s.measurements.filter((m) => after(m.updatedAt)).map(({ updatedAt, date, ...data }) => ({ date, data, deleted: false, updated_at: stamp(updatedAt) }));
  for (const t of s.tombstones.filter((t) => after(t.at))) {
    if (t.table === 'workouts') workouts.push({ id: t.key, data: {} as WorkoutRow['data'], deleted: true, updated_at: t.at });
    if (t.table === 'weigh_ins') weigh_ins.push({ date: t.key, weight: 0, body_fat: null, source: 'manual', deleted: true, updated_at: t.at });
    if (t.table === 'measurements') measurements.push({ date: t.key, data: {} as MeasurementRow['data'], deleted: true, updated_at: t.at });
  }
  const settings: SettingsRow | null = after(s.settingsUpdatedAt) ? { data: s.settings, updated_at: stamp(s.settingsUpdatedAt) } : null;
  return { workouts, weigh_ins, measurements, settings };
}
