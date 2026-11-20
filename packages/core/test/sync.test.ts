import { test } from 'node:test'; import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/db.ts'; import { TaskRepo } from '../src/tasks.ts'; import { syncOnce, type Transport, type PushRec } from '../src/sync.ts';
const dir = new URL('../migrations', import.meta.url).pathname;
/** In-memory stand-in mirroring the version rules of supabase sync_push (SQL itself is not executed here). */
class Server { rows = new Map<string, any>(); seq = 0; online = true; dropResponse = false;
  one(r: PushRec): any { const k = r.tbl + '/' + r.id, ex = this.rows.get(k), id = { tbl: r.tbl, id: r.id };
    if (!ex) { this.rows.set(k, { ...id, data: r.data, version: 1, deleted: r.deleted, seq: ++this.seq }); return { ...id, status: 'ok', version: 1 }; }
    if (JSON.stringify(ex.data) === JSON.stringify(r.data) && ex.deleted === r.deleted) return { ...id, status: 'ok', version: ex.version };
    if (ex.version === r.base_version) { Object.assign(ex, { data: r.data, deleted: r.deleted, version: ex.version + 1, seq: ++this.seq }); return { ...id, status: 'ok', version: ex.version }; }
    return { ...id, status: 'conflict', version: ex.version, data: ex.data, deleted: ex.deleted }; }
  tp: Transport = {
    push: async recs => { if (!this.online) throw new Error('offline'); const o = recs.map(r => this.one(r)); if (this.dropResponse) { this.dropResponse = false; throw new Error('lost response'); } return o; },
    pull: async (s, l) => { if (!this.online) throw new Error('offline'); return [...this.rows.values()].filter(r => r.seq > s).sort((a, b) => a.seq - b.seq).slice(0, l); } }; }
const dev = (srv: Server) => { const db = new DatabaseSync(':memory:'); migrate(db as any, dir); return { db, repo: new TaskRepo(db as any, 'd'), sync: (o = {}) => syncOnce(db as any, srv.tp, o) }; };
const titles = (d: any) => d.repo.list().map((t: any) => t.title).sort();
const edit = (d: any, id: string, title: string) => d.db.prepare('UPDATE tasks SET title=?,version=version+1 WHERE id=?').run(title, id);
test('create on A appears on B; seeded categories never conflict', async () => {
  const s = new Server(), a = dev(s), b = dev(s); a.repo.create({ title: 'Hello' }); await a.sync(); const r = await b.sync();
  assert.equal(r.pulled, 1); assert.deepEqual(titles(b), ['Hello']); assert.equal((await dev(s).sync()).conflicts, 0);
  assert.equal((b.db.prepare('SELECT count(*) c FROM categories').get() as any).c, 6);
});
test('offline work is kept and syncs when back online', async () => {
  const s = new Server(), a = dev(s), b = dev(s); s.online = false; a.repo.create({ title: 'Offline' });
  await assert.rejects(a.sync()); assert.deepEqual(titles(a), ['Offline']); s.online = true; await a.sync(); await b.sync(); assert.deepEqual(titles(b), ['Offline']);
});
test('edit on both devices: server wins, other edit kept as conflict copy, devices converge', async () => {
  const s = new Server(), a = dev(s), b = dev(s); const id = a.repo.create({ title: 'T' }); await a.sync(); await b.sync();
  edit(a, id, 'A-edit'); edit(b, id, 'B-edit'); await a.sync(); const r = await b.sync(); await a.sync();
  assert.equal(r.conflicts, 1); assert.deepEqual(titles(b), ['A-edit', 'B-edit (conflict copy)']); assert.deepEqual(titles(a), titles(b));
  assert.equal((b.db.prepare('SELECT count(*) c FROM sync_conflicts').get() as any).c, 1);
});
test('edit beats delete in both directions', async () => {
  const s = new Server(), a = dev(s), b = dev(s); const id = a.repo.create({ title: 'T' }); await a.sync(); await b.sync();
  a.repo.softDelete(id); await a.sync(); edit(b, id, 'B-edit'); await b.sync(); await a.sync(); assert.deepEqual(titles(a), ['B-edit']); assert.deepEqual(titles(b), ['B-edit']);
  edit(a, id, 'A-edit'); await a.sync(); b.repo.softDelete(id); await b.sync(); assert.deepEqual(titles(b), ['A-edit']);
});
test('lost push response is retried without duplicates or false conflicts', async () => {
  const s = new Server(), a = dev(s); a.repo.create({ title: 'Once' }); s.dropResponse = true; await assert.rejects(a.sync());
  const r = await a.sync(); assert.equal(r.conflicts, 0); assert.equal(s.rows.size, 1); assert.equal((a.db.prepare('SELECT count(*) c FROM tasks WHERE dirty=1').get() as any).c, 0);
});
test('paged pull and reminders sync', async () => {
  const s = new Server(), a = dev(s), b = dev(s); for (let i = 0; i < 7; i++) a.repo.create({ title: 'T' + i });
  a.db.prepare("INSERT INTO reminders(id,task_id,fire_at_utc,updated_at) SELECT 'r1',id,1,0 FROM tasks LIMIT 1").run(); await a.sync();
  await b.sync({ pullLimit: 3 }); assert.equal(titles(b).length, 7); assert.equal((b.db.prepare('SELECT count(*) c FROM reminders').get() as any).c, 1);
});
