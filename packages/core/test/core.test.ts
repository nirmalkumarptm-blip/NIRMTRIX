import { test } from 'node:test'; import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/db.ts'; import { TaskRepo } from '../src/tasks.ts';
import { expand } from '../src/recurrence.ts'; import { conflicts, overloadedDays, proposals } from '../src/smart.ts';
const dir = new URL('../migrations', import.meta.url).pathname;
const mk = (clock = () => 1_000_000_000_000) => { const db = new DatabaseSync(':memory:'); migrate(db as any, dir); return { db, repo: new TaskRepo(db as any, 'dev1', clock) }; };
const one = (db: any, sql: string, ...a: any[]) => db.prepare(sql).get(...a);
test('migration applies, is idempotent, seeds categories', () => {
  const { db } = mk(); assert.equal(migrate(db as any, dir), 2); assert.equal(one(db, 'SELECT count(*) c FROM categories').c, 6);
});
test('rejects empty title and bad priority', () => {
  const { repo } = mk(); assert.throws(() => repo.create({ title: '  ' })); assert.throws(() => repo.create({ title: 'x', priority: 9 as any }));
});
test('complete / undo / history', () => {
  const { repo, db } = mk(); const id = repo.create({ title: 'A' }); repo.complete(id);
  assert.ok(one(db, 'SELECT completed_at c FROM tasks WHERE id=?', id).c); repo.undoComplete(id);
  assert.equal(one(db, 'SELECT completed_at c FROM tasks WHERE id=?', id).c, null);
  assert.deepEqual(db.prepare('SELECT action FROM task_history ORDER BY id').all().map((r: any) => r.action), ['created', 'completed', 'undo']);
});
test('recycle bin: delete, restore, 30-day purge', () => {
  let now = 1_000_000_000_000; const { repo } = mk(() => now); const a = repo.create({ title: 'A' }), b = repo.create({ title: 'B' });
  repo.softDelete(a); repo.softDelete(b); assert.equal(repo.list().length, 0); repo.restore(b); assert.equal(repo.list().length, 1);
  now += 29 * 86400000; assert.equal(repo.purgeExpired(), 0); now += 2 * 86400000; assert.equal(repo.purgeExpired(), 1);
  assert.equal(repo.list({ includeDeleted: true }).length, 0);
});
test('duplicate and search', () => {
  const { repo } = mk(); const id = repo.create({ title: 'Buy milk' }); repo.duplicate(id); assert.equal(repo.list({ search: 'milk' }).length, 2);
});
test('recurring completion only closes that occurrence', () => {
  const { repo, db } = mk(); const id = repo.create({ title: 'Gym', recurrence: { freq: 'daily', start: '2026-11-01' } });
  repo.complete(id, '2026-11-02'); assert.equal(one(db, 'SELECT count(*) c FROM completions').c, 1);
  assert.equal(one(db, 'SELECT completed_at c FROM tasks WHERE id=?', id).c, null);
  repo.undoComplete(id, '2026-11-02'); assert.equal(one(db, 'SELECT count(*) c FROM completions').c, 0);
});
test('recurrence: interval, weekdays, monthly clamp, end, paused', () => {
  assert.deepEqual(expand({ freq: 'daily', interval: 2, start: '2026-11-01' }, '2026-11-01', '2026-11-07'), ['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-07']);
  assert.deepEqual(expand({ freq: 'weekly', weekdays: [1, 3], start: '2026-11-02' }, '2026-11-02', '2026-11-11'), ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']);
  assert.deepEqual(expand({ freq: 'monthly', start: '2026-01-31' }, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(expand({ freq: 'daily', start: '2026-11-01', end: '2026-11-02' }, '2026-11-01', '2026-11-30'), ['2026-11-01', '2026-11-02']);
  assert.deepEqual(expand({ freq: 'daily', start: '2026-11-01' }, '2026-11-01', '2026-11-30', true), []);
});
test('smart: conflicts, overload, proposals respect manual priority', () => {
  const ts = [{ id: 'a', title: 'A', date: 'd', start: '09:00', end: '10:00', priority: 1 }, { id: 'b', title: 'B', date: 'd', start: '09:30', end: '11:00', priority: 1 },
    { id: 'c', title: 'C', date: 'd', start: '10:00', end: '10:30', priority: 1, due: '2026-11-19' }];
  assert.deepEqual(conflicts(ts), [['a', 'b'], ['b', 'c']]);
  assert.equal(overloadedDays(ts, 120).length, 1);
  assert.equal(proposals(ts, '2026-11-19').some(p => p.kind === 'raise_priority'), true);
  assert.equal(proposals(ts, '2026-11-19', new Set(['c'])).some(p => p.kind === 'raise_priority'), false);
  assert.equal(proposals([{ id: 'o', title: 'O', due: '2026-11-01', priority: 1 }], '2026-11-19')[0].kind, 'reschedule');
});
