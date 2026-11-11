import { collectPush, mergeRemote } from './merge';
import { DEFAULT_SETTINGS, type State } from './store';

const base = (): State => ({
  version: 1,
  workouts: [{ id: 'a', startedAt: '2026-11-10T23:00:00Z', endedAt: '2026-11-11T00:00:00Z', label: null, rawText: '', exercises: [], updatedAt: '2026-11-11T00:00:00Z' }],
  weighIns: [{ date: '2026-11-11', weight: 171.2, source: 'manual', updatedAt: '2026-11-11T12:00:00Z' }],
  measurements: [],
  settings: { ...DEFAULT_SETTINGS },
  settingsUpdatedAt: '2026-11-11T12:00:00Z',
  active: null,
  tombstones: [],
});

describe('merge', () => {
  it('takes newer remote rows and keeps newer local ones', () => {
    const s = mergeRemote(base(), {
      workouts: [{ id: 'b', data: { id: 'b', startedAt: '2026-11-09T23:00:00Z', endedAt: '2026-11-10T00:00:00Z', label: 'Push', rawText: '', exercises: [] }, deleted: false, updated_at: '2026-11-10T00:00:00Z' }],
      weigh_ins: [{ date: '2026-11-11', weight: 170, body_fat: null, source: 'scale', deleted: false, updated_at: '2026-11-11T11:00:00Z' }],
      measurements: [],
      settings: { data: { ...DEFAULT_SETTINGS, goalWeight: 158 }, updated_at: '2026-11-12T00:00:00Z' },
    });
    expect(s.workouts.map((w) => w.id)).toEqual(['b', 'a']);
    expect(s.weighIns[0].weight).toBe(171.2); // local is newer
    expect(s.settings.goalWeight).toBe(158);
  });

  it('applies remote deletes and honours local tombstones', () => {
    const st = { ...base(), tombstones: [{ table: 'workouts' as const, key: 'z', at: '2026-11-11T05:00:00Z' }] };
    const s = mergeRemote(st, {
      workouts: [
        { id: 'a', data: {} as never, deleted: true, updated_at: '2026-11-11T01:00:00Z' },
        { id: 'z', data: { id: 'z', startedAt: '2026-11-01T00:00:00Z', endedAt: '2026-11-01T01:00:00Z', label: null, rawText: '', exercises: [] }, deleted: false, updated_at: '2026-11-01T01:00:00Z' },
      ],
      weigh_ins: [], measurements: [], settings: null,
    });
    expect(s.workouts).toEqual([]);
  });

  it('collects only changes since the last push, plus deletions', () => {
    const st = { ...base(), tombstones: [{ table: 'workouts' as const, key: 'old', at: '2026-11-11T13:00:00Z' }] };
    const p = collectPush(st, '2026-11-11T06:00:00Z', '2026-11-11T14:00:00Z');
    expect(p.workouts.map((w) => [w.id, w.deleted])).toEqual([['old', true]]);
    expect(p.weigh_ins).toHaveLength(1);
    expect(p.settings).not.toBeNull();
    expect(collectPush(st, '', 'x').workouts).toHaveLength(2);
  });
});
