import { readdirSync, readFileSync } from 'node:fs';
export interface Db { exec(sql: string): void; prepare(sql: string): { run(...a: any[]): any; get(...a: any[]): any; all(...a: any[]): any[] } }
/** Applies numbered migrations atomically; tracks progress in PRAGMA user_version. */
export function migrate(db: Db, dir: string): number {
  const files = readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
  let v = (db.prepare('PRAGMA user_version').get() as any).user_version as number;
  for (const f of files) {
    const n = parseInt(f, 10);
    if (n <= v) continue;
    db.exec('BEGIN');
    try { db.exec(readFileSync(`${dir}/${f}`, 'utf8')); db.exec(`PRAGMA user_version=${n}`); db.exec('COMMIT'); v = n; }
    catch (e) { db.exec('ROLLBACK'); throw new Error(`Migration ${f} failed: ${(e as Error).message}`); }
  }
  return v;
}
