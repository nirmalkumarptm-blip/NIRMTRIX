import type { Db } from './db.ts';
import { randomUUID } from 'node:crypto';
export interface NewTask { title: string; categoryId?: string; priority?: 0|1|2|3; date?: string; startTime?: string; endTime?: string; dueDate?: string; recurrence?: object }
const hist = (db: Db, id: string, action: string, now: number, detail?: string) =>
  db.prepare('INSERT INTO task_history(task_id,action,at,detail) VALUES(?,?,?,?)').run(id, action, now, detail ?? null);
export class TaskRepo {
  private db: Db; private deviceId: string; private clock: () => number;
  constructor(db: Db, deviceId = 'local', clock: () => number = () => Date.now()) { this.db = db; this.deviceId = deviceId; this.clock = clock; }
  create(t: NewTask): string {
    if (!t.title?.trim()) throw new Error('Title required');
    const id = randomUUID(), n = this.clock();
    this.db.prepare(`INSERT INTO tasks(id,title,category_id,priority,date,start_time,end_time,due_date,recurrence_json,created_at,updated_at,device_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, t.title.trim(), t.categoryId ?? null, t.priority ?? 1, t.date ?? null, t.startTime ?? null,
      t.endTime ?? null, t.dueDate ?? null, t.recurrence ? JSON.stringify(t.recurrence) : null, n, n, this.deviceId);
    hist(this.db, id, 'created', n); return id;
  }
  private touch(id: string, set: string, action: string, ...a: any[]) {
    const n = this.clock();
    this.db.prepare(`UPDATE tasks SET ${set},updated_at=?,version=version+1 WHERE id=?`).run(...a, n, id); hist(this.db, id, action, n);
  }
  /** One-off tasks set completed_at; recurring tasks record per-occurrence completion so future instances stay open. */
  complete(id: string, occurrence?: string) {
    const r = this.db.prepare('SELECT recurrence_json FROM tasks WHERE id=?').get(id);
    if (r?.recurrence_json && occurrence) {
      this.db.prepare('INSERT OR REPLACE INTO completions VALUES(?,?,?)').run(id, occurrence, this.clock()); hist(this.db, id, 'completed', this.clock(), occurrence);
    } else this.touch(id, 'completed_at=?', 'completed', this.clock());
  }
  undoComplete(id: string, occurrence?: string) {
    if (occurrence) { this.db.prepare('DELETE FROM completions WHERE task_id=? AND occurrence_date=?').run(id, occurrence); hist(this.db, id, 'undo', this.clock(), occurrence); }
    else this.touch(id, 'completed_at=NULL', 'undo');
  }
  softDelete(id: string) { this.touch(id, 'deleted_at=?', 'deleted', this.clock()); }
  restore(id: string) { this.touch(id, 'deleted_at=NULL', 'restored'); }
  /** Permanently removes bin items older than 30 days (and their dependent rows). */
  purgeExpired(): number {
    const cut = this.clock() - 30 * 86400000;
    const ids = this.db.prepare('SELECT id FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at<?').all(cut).map((r: any) => r.id);
    for (const id of ids) for (const t of ['reminders','attachments','completions']) this.db.prepare(`DELETE FROM ${t} WHERE task_id=?`).run(id);
    for (const id of ids) this.db.prepare('DELETE FROM tasks WHERE id=?').run(id);
    return ids.length;
  }
  duplicate(id: string): string {
    const r = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
    return this.create({ title: r.title + ' (copy)', categoryId: r.category_id ?? undefined, priority: r.priority, date: r.date ?? undefined,
      startTime: r.start_time ?? undefined, endTime: r.end_time ?? undefined, dueDate: r.due_date ?? undefined, recurrence: r.recurrence_json ? JSON.parse(r.recurrence_json) : undefined });
  }
  list(opts: { includeDeleted?: boolean; search?: string } = {}) {
    const q = opts.search ? `%${opts.search}%` : '%';
    return this.db.prepare(`SELECT * FROM tasks WHERE (deleted_at IS NOT NULL)=? AND (title LIKE ? OR description LIKE ?) ORDER BY date,start_time`).all(opts.includeDeleted ? 1 : 0, q, q);
  }
}
