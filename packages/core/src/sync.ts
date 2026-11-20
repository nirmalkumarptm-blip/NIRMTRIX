import type { Db } from './db.ts';
import { randomUUID } from 'node:crypto';
export const SYNC_TABLES = ['categories', 'tasks', 'reminders'] as const;
type Data = Record<string, any>;
export interface PushRec { tbl: string; id: string; data: Data; base_version: number; deleted: boolean }
export type PushResult = { tbl: string; id: string; status: 'ok'; version: number } | { tbl: string; id: string; status: 'conflict'; version: number; data: Data; deleted: boolean };
export interface Remote { tbl: string; id: string; data: Data; version: number; deleted: boolean; seq: number }
export interface Transport { push(r: PushRec[]): Promise<PushResult[]>; pull(since: number, limit: number): Promise<Remote[]> }
const META = new Set(['dirty', 'base_version']);
const cols = (db: Db, t: string): string[] => db.prepare(`PRAGMA table_info(${t})`).all().map((r: any) => r.name);
function tx(db: Db, fn: () => void) { db.exec('BEGIN'); try { db.exec('PRAGMA defer_foreign_keys=ON'); fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } }
const getSet = (db: Db, k: string) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value as string | undefined;
const putSet = (db: Db, k: string, v: string) => db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(k, v, Date.now());
/** Writes a server row locally as clean (dirty=0). Unknown remote columns (newer schema) are ignored. */
function apply(db: Db, tbl: string, id: string, data: Data, version: number) {
  const known = new Set(cols(db, tbl)), c = Object.keys(data).filter(k => known.has(k) && !META.has(k)), names = [...c, 'dirty', 'base_version'];
  db.prepare(`UPDATE ${tbl} SET dirty=2 WHERE id=?`).run(id);
  db.prepare(`INSERT INTO ${tbl}(${names.join(',')}) VALUES(${names.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${names.filter(n => n !== 'id').map(n => `${n}=excluded.${n}`).join(',')}`)
    .run(...c.map(k => data[k]), 0, version);
}
function dirtyRows(db: Db, tbl: string): PushRec[] {
  return db.prepare(`SELECT * FROM ${tbl} WHERE dirty=1`).all().map((r: any) => { const { dirty, base_version, ...data } = r; return { tbl, id: r.id, data, base_version, deleted: data.deleted_at != null }; });
}
function resolve(db: Db, rec: PushRec, srv: { version: number; data: Data; deleted: boolean }) {
  db.prepare('INSERT INTO sync_conflicts(tbl,record_id,local_json,server_version,at) VALUES(?,?,?,?,?)').run(rec.tbl, rec.id, JSON.stringify(rec.data), srv.version, Date.now());
  if (srv.deleted && !rec.deleted) { db.prepare(`UPDATE ${rec.tbl} SET base_version=? WHERE id=?`).run(srv.version, rec.id); return; } // local edit resurrects a deleted record; re-pushed next round
  if (!srv.deleted && !rec.deleted && rec.tbl === 'tasks') { // both edited: server wins, local version survives as a new task
    const known = new Set(cols(db, 'tasks')), d = { ...rec.data, id: randomUUID(), title: `${rec.data.title} (conflict copy)`, parent_id: null }, c = Object.keys(d).filter(k => known.has(k) && !META.has(k));
    db.prepare(`INSERT INTO tasks(${c.join(',')}) VALUES(${c.map(() => '?').join(',')})`).run(...c.map(k => d[k]));
  }
  apply(db, rec.tbl, rec.id, srv.data, srv.version); // otherwise adopt server state (edit beats delete: a locally deleted task comes back)
}
export async function syncOnce(db: Db, tp: Transport, opt: { pullLimit?: number } = {}) {
  const st = { pushed: 0, conflicts: 0, pulled: 0 }, lim = opt.pullLimit ?? 500;
  for (let round = 0; round < 5; round++) {
    const recs = SYNC_TABLES.flatMap(t => dirtyRows(db, t)).slice(0, 100); if (!recs.length) break;
    const res = await tp.push(recs); // throws when offline/unauthorised: local data untouched, rows stay dirty
    tx(db, () => { for (const r of res) {
      const rec = recs.find(x => x.tbl === r.tbl && x.id === r.id)!;
      if (r.status === 'ok') { st.pushed++; db.prepare(`UPDATE ${r.tbl} SET base_version=?,dirty=CASE WHEN version=? THEN 0 ELSE 1 END WHERE id=?`).run(r.version, rec.data.version, r.id); } // edited mid-flight stays dirty
      else { st.conflicts++; resolve(db, rec, r); } } });
  }
  let cur = Number(getSet(db, 'sync_cursor') ?? 0);
  for (;;) {
    const rs = await tp.pull(cur, lim);
    tx(db, () => { for (const r of rs) {
      const l = db.prepare(`SELECT dirty,base_version FROM ${r.tbl} WHERE id=?`).get(r.id);
      if (!l || (l.dirty !== 1 && l.base_version < r.version)) apply(db, r.tbl, r.id, r.data, r.version); // dirty rows are reconciled at push time
      cur = Math.max(cur, r.seq); } putSet(db, 'sync_cursor', String(cur)); });
    st.pulled += rs.length; if (rs.length < lim) break;
  }
  return st;
}
