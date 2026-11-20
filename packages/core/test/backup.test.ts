import { test } from 'node:test'; import assert from 'node:assert/strict'; import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/db.ts'; import { TaskRepo } from '../src/tasks.ts';
import { exportBackup, validateBackup, restoreBackup, sealBackup, encryptBackup, decryptBackup, autoBackup, type Sink } from '../src/backup.ts';
const dir = new URL('../migrations', import.meta.url).pathname;
const mk = () => { const db = new DatabaseSync(':memory:'); migrate(db as any, dir); return { db: db as any, repo: new TaskRepo(db as any, 'd') }; };
const n = (db: any, t: string) => (db.prepare(`SELECT count(*) c FROM ${t}`).get() as any).c;
function seed() { const a = mk(); const id = a.repo.create({ title: 'Secret plan', date: '2026-11-20', startTime: '09:00', recurrence: { freq: 'daily', start: '2026-11-20' } });
  a.repo.complete(id, '2026-11-20'); a.db.prepare("INSERT INTO reminders(id,task_id,fire_at_utc,updated_at) VALUES('r',?,5,0)").run(id);
  a.db.prepare("INSERT INTO settings VALUES('theme','dark',0),('lock_v','SECRETVERIFIER',0),('sync_cursor','9',0)").run(); return a; }
test('export validates; excludes lock + sync settings and sync columns', async () => {
  const t = await exportBackup(seed().db), v = await validateBackup(t, 2); assert.equal(v.ok, true);
  assert.equal(t.includes('SECRETVERIFIER'), false); assert.equal(t.includes('sync_cursor'), false); assert.equal(t.includes('base_version'), false);
});
test('round trip into another device; own lock settings survive', async () => {
  const t = await exportBackup(seed().db), b = mk(); b.repo.create({ title: 'old' }); b.db.prepare("INSERT INTO settings VALUES('lock_v','MINE',0)").run();
  const r = await restoreBackup(b.db, t); assert.equal(r.counts.tasks, 1); assert.deepEqual(b.repo.list().map((x: any) => x.title), ['Secret plan']);
  assert.equal(n(b.db, 'reminders'), 1); assert.equal(n(b.db, 'completions'), 1); assert.equal((b.db.prepare("SELECT value v FROM settings WHERE key='lock_v'").get() as any).v, 'MINE');
  assert.equal((b.db.prepare("SELECT value v FROM settings WHERE key='theme'").get() as any).v, 'dark'); assert.equal((b.db.prepare('SELECT dirty d FROM tasks').get() as any).d, 1);
  assert.equal(JSON.parse(r.previous).tables.tasks[0].title, 'old');   // previous data is returned for undo
});
test('tampered, garbage, wrong-format, newer-schema and orphan backups are rejected', async () => {
  const s = seed(), t = await exportBackup(s.db); const rej = async (x: string, m: RegExp) => { const v = await validateBackup(x, 2); assert.equal(v.ok, false); assert.match((v as any).error, m); };
  await rej(t.replace('Secret plan', 'Hacked plan'), /damaged|modified/); await rej('hello', /unreadable/); await rej('{"format":"x"}', /not a NIRMTRIX/);
  const o = JSON.parse(t); await rej(await sealBackup(9, 0, o.tables), /newer/);
  o.tables.reminders[0].task_id = 'ghost'; await rej(await sealBackup(2, 0, o.tables), /missing task/);
});
test('failed restore changes nothing', async () => {
  const s = seed(), o = JSON.parse(await exportBackup(s.db)), b = mk(); b.repo.create({ title: 'keep me' });
  o.tables.tasks[0].priority_source = 'weird';   // passes validation, violates a DB CHECK constraint
  await assert.rejects(restoreBackup(b.db, await sealBackup(2, 0, o.tables)), /nothing was changed/); assert.deepEqual(b.repo.list().map((x: any) => x.title), ['keep me']);
});
test('encrypted backup: round trip, wrong/short passphrase, tampering, no plaintext', async () => {
  const t = await exportBackup(seed().db), e = await encryptBackup(t, 'correct horse', 1000);
  assert.equal(e.includes('Secret plan'), false); assert.equal(await decryptBackup(e, 'correct horse'), t);
  await assert.rejects(decryptBackup(e, 'wrong pass!!'), /wrong passphrase/); await assert.rejects(encryptBackup(t, 'short'));
  const j = JSON.parse(e); j.ct = (j.ct[0] === 'A' ? 'B' : 'A') + j.ct.slice(1); await assert.rejects(decryptBackup(JSON.stringify(j), 'correct horse'), /damaged/);
});
const sink = (corrupt = false): Sink & { f: Map<string, string> } => { const f = new Map<string, string>(); return { f, write: async (k, v) => void f.set(k, corrupt ? v.slice(0, -5) : v), read: async k => f.get(k)!, list: async () => [...f.keys()], remove: async k => void f.delete(k) }; };
test('auto backup: interval, rotation, only own files, verification', async () => {
  const s = seed(), k = sink(), day = 86400000, t0 = Date.UTC(2026, 10, 1); k.f.set('holiday-photos.json', 'x');
  assert.ok(await autoBackup(s.db, k, t0, { keep: 3, minIntervalMs: 20 * 3600e3 })); assert.equal(await autoBackup(s.db, k, t0 + 3600e3, { keep: 3, minIntervalMs: 20 * 3600e3 }), null);
  for (let i = 1; i <= 4; i++) await autoBackup(s.db, k, t0 + i * day, { keep: 3, minIntervalMs: 20 * 3600e3 });
  assert.equal([...k.f.keys()].filter(x => x.startsWith('nirmtrix-auto-')).length, 3); assert.ok(k.f.has('holiday-photos.json'));
  const bad = sink(true); await assert.rejects(autoBackup(s.db, bad, t0), /verification failed/); assert.equal(bad.f.size, 0);
});
