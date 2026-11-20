import { test } from 'node:test'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/db.ts'; import { TaskRepo } from '../src/tasks.ts'; import { ReminderRepo } from '../src/reminders.ts'; import { applyNativeActions } from '../src/native-bridge.ts';
const dir = new URL('../migrations', import.meta.url).pathname, T0 = Date.UTC(2026, 10, 20, 3, 30);
const mk = () => { const db: any = new DatabaseSync(':memory:'); migrate(db, dir); const c = () => T0; return { db, tasks: new TaskRepo(db, 'd', c), rem: new ReminderRepo(db, c) }; };
const state = (db: any, id: string) => db.prepare('SELECT state,snoozed_until u FROM reminders WHERE id=?').get(id);
test('fired -> snooze keeps the alarm scheduled; dismiss ends it', () => {
  const { db, tasks, rem } = mk(); const t = tasks.create({ title: 'X' }), r = rem.add(t, { fireAt: T0 - 1000 }, 'Asia/Kolkata');
  assert.deepEqual(applyNativeActions(db, [{ id: r, taskId: t, action: 'snooze', at: T0, minutes: 10 }, { id: r, taskId: t, action: 'fired', at: T0 - 500 }], tasks, rem), { applied: 2, skipped: 0 });
  assert.deepEqual({ ...state(db, r) }, { state: 'snoozed', u: T0 + 600000 });   // processed oldest first: fired, then snooze
  assert.equal(rem.rebuild().register.length, 1);
  applyNativeActions(db, [{ id: r, taskId: t, action: 'dismiss', at: T0 + 700000 }], tasks, rem); assert.equal(rem.rebuild().register.length, 0);
});
test('complete: one-off task done; recurring only closes that local day', () => {
  const { db, tasks, rem } = mk(); const a = tasks.create({ title: 'one' }), b = tasks.create({ title: 'rec', recurrence: { freq: 'daily', start: '2026-11-01' } });
  const ra = rem.add(a, { fireAt: T0 }, 'Asia/Kolkata'), rb = rem.add(b, { fireAt: T0 }, 'Asia/Kolkata');
  applyNativeActions(db, [{ id: ra, taskId: a, action: 'complete', at: T0 }, { id: rb, taskId: b, action: 'complete', at: T0 }], tasks, rem);
  assert.ok((db.prepare('SELECT completed_at c FROM tasks WHERE id=?').get(a) as any).c); assert.equal((db.prepare('SELECT completed_at c FROM tasks WHERE id=?').get(b) as any).c, null);
  assert.equal((db.prepare('SELECT occurrence_date d FROM completions WHERE task_id=?').get(b) as any).d, '2026-11-20'); assert.equal(rem.rebuild().register.length, 0);
});
test('unknown reminder ids are skipped, not fatal', () => { const { db, tasks, rem } = mk(); assert.deepEqual(applyNativeActions(db, [{ id: 'ghost', taskId: 'x', action: 'dismiss', at: 1 }], tasks, rem), { applied: 0, skipped: 1 }); });
