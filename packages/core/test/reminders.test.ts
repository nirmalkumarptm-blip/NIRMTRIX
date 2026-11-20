import { test } from 'node:test'; import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/db.ts'; import { TaskRepo } from '../src/tasks.ts'; import { ReminderRepo, zonedToUtc } from '../src/reminders.ts';
const dir = new URL('../migrations', import.meta.url).pathname, IST = 'Asia/Kolkata', NY = 'America/New_York';
const setup = (now: number) => { const db = new DatabaseSync(':memory:'); migrate(db as any, dir); const c = () => now;
  return { db, tasks: new TaskRepo(db as any, 'd', c), rem: new ReminderRepo(db as any, c), tick: (n: number) => { now = n; } }; };
const T0 = Date.UTC(2026, 10, 19, 0, 0);
test('zonedToUtc: IST and New York (standard + DST)', () => {
  assert.equal(zonedToUtc('2026-11-20', '09:00', IST), Date.UTC(2026, 10, 20, 3, 30));
  assert.equal(zonedToUtc('2026-11-20', '09:00', NY), Date.UTC(2026, 10, 20, 14, 0));
  assert.equal(zonedToUtc('2026-07-01', '09:00', NY), Date.UTC(2026, 6, 1, 13, 0));
});
test('multiple reminders: 30/10/5/0 min before start', () => {
  const { tasks, rem, db } = setup(T0); const id = tasks.create({ title: 'Meet', date: '2026-11-20', startTime: '09:00' });
  for (const o of [30, 10, 5, 0]) rem.add(id, { offsetMinutes: o }, IST);
  const at = rem.rebuild().register.map(a => a.at), s = Date.UTC(2026, 10, 20, 3, 30);
  assert.deepEqual(at, [s - 30 * 60000, s - 10 * 60000, s - 5 * 60000, s]);
});
test('custom fixed reminder; offset required check', () => {
  const { tasks, rem } = setup(T0); const id = tasks.create({ title: 'X' }); rem.add(id, { fireAt: T0 + 5000 }, IST);
  assert.equal(rem.rebuild().register.length, 1); assert.throws(() => rem.add(id, {}, IST));
});
test('snooze / dismiss / complete / delete remove or move alarms', () => {
  const { tasks, rem, tick } = setup(T0); const id = tasks.create({ title: 'X' }), r1 = rem.add(id, { fireAt: T0 + 60000 }, IST), r2 = rem.add(id, { fireAt: T0 + 120000 }, IST);
  rem.snooze(r1, 10); assert.equal(rem.rebuild().register.find(a => a.id === r1)!.at, T0 + 600000);
  rem.dismiss(r2); assert.equal(rem.rebuild().register.length, 1);
  tasks.complete(id); assert.equal(rem.rebuild().register.length, 0);
  tasks.undoComplete(id); assert.equal(rem.rebuild().register.length, 1); tasks.softDelete(id); assert.equal(rem.rebuild().register.length, 0);
});
test('device restart: future re-registered, recent past reported missed, old ignored', () => {
  const { tasks, rem, tick } = setup(T0); const id = tasks.create({ title: 'X' });
  rem.add(id, { fireAt: T0 + 3600000 }, IST); rem.add(id, { fireAt: T0 + 7200000 }, IST); rem.add(id, { fireAt: T0 - 3 * 86400000 }, IST);
  tick(T0 + 5400000); const r = rem.rebuild(); assert.equal(r.register.length, 1); assert.equal(r.missed.length, 1);
});
test('time zone change recomputes absolute fire time; edits recompute too', () => {
  const { tasks, rem, db } = setup(T0); const id = tasks.create({ title: 'M', date: '2026-11-20', startTime: '09:00' }); rem.add(id, { offsetMinutes: 0 }, IST);
  rem.recomputeAll(NY); assert.equal(rem.rebuild().register[0].at, Date.UTC(2026, 10, 20, 14, 0));
  db.prepare("UPDATE tasks SET start_time='10:00' WHERE id=?").run(id); rem.recompute(id, NY); assert.equal(rem.rebuild().register[0].at, Date.UTC(2026, 10, 20, 15, 0));
});
test('rescheduling a fired reminder into the future reopens it', () => {
  const { tasks, rem, db } = setup(T0); const id = tasks.create({ title: 'M', date: '2026-11-20', startTime: '09:00' }); const r = rem.add(id, { offsetMinutes: 0 }, IST);
  rem.markFired(r); assert.equal(rem.rebuild().register.length, 0);
  db.prepare("UPDATE tasks SET date='2026-11-25' WHERE id=?").run(id); rem.recompute(id, IST); assert.equal(rem.rebuild().register.length, 1);
});
