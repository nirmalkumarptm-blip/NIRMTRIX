import type { Db } from './db.ts';
export const FORMAT = 'nirmtrix-backup';
const TABLES = ['categories', 'tasks', 'completions', 'reminders', 'attachments', 'task_history', 'settings'] as const;
const DELETE_ORDER = ['reminders', 'attachments', 'completions', 'task_history', 'tasks', 'categories'] as const;
const SYNC_COLS = new Set(['dirty', 'base_version']);
const skipSetting = (k: string) => k.startsWith('lock_') || k === 'sync_cursor';   // never export PIN verifier or sync position
const te = new TextEncoder(), td = new TextDecoder();
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const cols = (db: Db, t: string): string[] => db.prepare(`PRAGMA table_info(${t})`).all().map((r: any) => r.name);
const schemaOf = (db: Db): number => (db.prepare('PRAGMA user_version').get() as any).user_version;
export async function sealBackup(schema: number, createdAt: number, tables: Record<string, any[]>): Promise<string> {
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  return JSON.stringify({ format: FORMAT, formatVersion: 1, schema, createdAt, counts, checksum: await sha(JSON.stringify(tables)), tables });
}
export async function exportBackup(db: Db, now = Date.now()): Promise<string> {
  const tables: Record<string, any[]> = {};
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t}`).all().map((r: any) => Object.fromEntries(Object.entries(r).filter(([k]) => !SYNC_COLS.has(k)))).filter((r: any) => t !== 'settings' || !skipSetting(r.key));
  return sealBackup(schemaOf(db), now, tables);
}
export type Validation = { ok: true; schema: number; createdAt: number; counts: Record<string, number> } | { ok: false; error: string };
export async function validateBackup(text: string, currentSchema: number): Promise<Validation> {
  const bad = (error: string): Validation => ({ ok: false, error });
  if (text.length > 50_000_000) return bad('file too large');
  let b: any; try { b = JSON.parse(text); } catch { return bad('not a NIRMTRIX backup (unreadable)'); }
  if (b?.format !== FORMAT || b.formatVersion !== 1) return bad('not a NIRMTRIX backup');
  if (!Number.isInteger(b.schema) || b.schema > currentSchema) return bad('backup is from a newer app version');
  if (!b.tables || typeof b.tables !== 'object') return bad('missing data');
  if ((await sha(JSON.stringify(b.tables))) !== b.checksum) return bad('backup is damaged or was modified');
  for (const t of TABLES) if (!Array.isArray(b.tables[t])) return bad(`missing table ${t}`);
  const ids = new Set<string>();
  for (const r of b.tables.tasks) {
    if (typeof r?.id !== 'string' || typeof r.title !== 'string' || !r.title.trim()) return bad('invalid task record');
    if (!Number.isInteger(r.priority) || r.priority < 0 || r.priority > 3) return bad('invalid task priority');
    if (ids.has(r.id)) return bad('duplicate task id'); ids.add(r.id);
  }
  for (const t of ['reminders', 'attachments', 'completions']) for (const r of b.tables[t]) if (!ids.has(r?.task_id)) return bad(`${t} refer to a missing task`);
  return { ok: true, schema: b.schema, createdAt: b.createdAt, counts: b.counts };
}
/** All-or-nothing. Returns a snapshot of the PREVIOUS data so a bad restore can always be undone. */
export async function restoreBackup(db: Db, text: string): Promise<{ counts: Record<string, number>; previous: string }> {
  const v = await validateBackup(text, schemaOf(db)); if (!v.ok) throw new Error(v.error);
  const previous = await exportBackup(db), b = JSON.parse(text);
  db.exec('BEGIN');
  try {
    db.exec('PRAGMA defer_foreign_keys=ON');
    for (const t of DELETE_ORDER) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare("DELETE FROM settings WHERE key NOT LIKE 'lock\\_%' ESCAPE '\\' AND key<>'sync_cursor'").run();
    for (const t of TABLES) {
      const known = new Set(cols(db, t));
      for (const r of b.tables[t]) { if (t === 'settings' && skipSetting(r.key)) continue;
        const c = Object.keys(r).filter(k => known.has(k) && !SYNC_COLS.has(k));
        db.prepare(`INSERT OR REPLACE INTO ${t}(${c.join(',')}) VALUES(${c.map(() => '?').join(',')})`).run(...c.map(k => r[k])); }
    }
    db.prepare("DELETE FROM settings WHERE key='sync_cursor'").run();
    db.prepare('UPDATE categories SET dirty=0 WHERE updated_at=0').run();   // restored rows are dirty by default so a paired device re-reconciles them
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw new Error('restore failed, nothing was changed: ' + (e as Error).message); }
  return { counts: v.counts, previous };
}
/** Optional passphrase encryption (AES-256-GCM, PBKDF2-SHA256) for backups leaving the device, e.g. Google Drive. */
async function key(pass: string, salt: Uint8Array, iters: number) {
  const k = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptBackup(text: string, pass: string, iters = 210_000): Promise<string> {
  if (pass.length < 8) throw new Error('passphrase must be at least 8 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt, iters), te.encode(text)));
  return JSON.stringify({ format: FORMAT + '-enc', v: 1, iters, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}
export async function decryptBackup(text: string, pass: string): Promise<string> {
  try { const e = JSON.parse(text); if (e.format !== FORMAT + '-enc') throw 0;
    return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, await key(pass, unb64(e.salt), e.iters), unb64(e.ct)));
  } catch { throw new Error('wrong passphrase or damaged file'); }
}
/** Automatic local backups with rotation. Only ever touches files it created (prefix match). */
export interface Sink { write(name: string, text: string): Promise<void>; read(name: string): Promise<string>; list(): Promise<string[]>; remove(name: string): Promise<void> }
const PFX = 'nirmtrix-auto-', stamp = (n: number) => new Date(n).toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const parseStamp = (name: string) => { const m = name.match(/^nirmtrix-auto-(\d{8})-(\d{6})\.json$/); return m ? Date.parse(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4)}Z`) : null; };
export async function autoBackup(db: Db, sink: Sink, now = Date.now(), o = { keep: 7, minIntervalMs: 20 * 3600_000 }): Promise<string | null> {
  const mine = (await sink.list()).filter(n => parseStamp(n) !== null).sort();
  const last = mine.length ? parseStamp(mine[mine.length - 1])! : 0; if (now - last < o.minIntervalMs) return null;
  const name = `${PFX}${stamp(now)}.json`, text = await exportBackup(db, now);
  await sink.write(name, text);
  const v = await validateBackup(await sink.read(name), schemaOf(db));
  if (!v.ok) { await sink.remove(name).catch(() => {}); throw new Error('backup verification failed: ' + v.error); }
  for (const old of [...mine, name].sort().slice(0, -o.keep)) await sink.remove(old);
  return name;
}
