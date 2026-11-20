import type { Db } from './db.ts';
import { randomUUID } from 'node:crypto';
function tzOffset(utc: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(new Date(utc)).map(x => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(utc / 60000) * 60000;
}
/** Local wall-clock date+time in an IANA zone -> UTC ms. Two passes handle DST offsets. */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number), wall = Date.UTC(y, m - 1, d, h, mi);
  let g = wall; for (let i = 0; i < 2; i++) g = wall - tzOffset(g, tz); return g;
}
export interface Alarm { id: string; taskId: string; title: string; priority: number; at: number }
export class ReminderRepo {
  private db: Db; private clock: () => number;
  constructor(db: Db, clock: () => number = () => Date.now()) { this.db = db; this.clock = clock; }
  /** Either a relative offset (0,5,10,30...) from the task start, or a fixed custom moment. */
  add(taskId: string, o: { offsetMinutes?: number; fireAt?: number }, tz: string): string {
    const id = randomUUID(), n = this.clock();
    if (o.offsetMinutes == null && o.fireAt == null) throw new Error('offset or fireAt required');
    this.db.prepare('INSERT INTO reminders(id,task_id,offset_minutes,fire_at_utc,tz,updated_at) VALUES(?,?,?,?,?,?)').run(id, taskId, o.offsetMinutes ?? null, o.fireAt ?? null, tz, n);
    if (o.offsetMinutes != null) this.recompute(taskId, tz); return id;
  }
  /** Re-derives offset reminders from the task's local date/time. Call after edits, time-zone changes or clock changes. */
  recompute(taskId: string, tz: string) {
    const t = this.db.prepare('SELECT date,start_time FROM tasks WHERE id=?').get(taskId), n = this.clock();
    if (!t?.date || !t.start_time) return;
    for (const r of this.db.prepare('SELECT id,offset_minutes,state FROM reminders WHERE task_id=? AND offset_minutes IS NOT NULL AND deleted_at IS NULL').all(taskId)) {
      const fire = zonedToUtc(t.date, t.start_time, tz) - r.offset_minutes * 60000;
      const reopen = fire > n && r.state !== 'pending';
      this.db.prepare(`UPDATE reminders SET fire_at_utc=?,tz=?,updated_at=?,version=version+1${reopen ? ",state='pending',snoozed_until=NULL" : ''} WHERE id=?`).run(fire, tz, n, r.id);
    }
  }
  recomputeAll(tz: string) { for (const r of this.db.prepare('SELECT DISTINCT task_id FROM reminders WHERE offset_minutes IS NOT NULL').all()) this.recompute(r.task_id, tz); }
  /** Full schedule to hand to the OS after boot / time change / app start. `missed` = should have fired within the last 24h while the device was off. */
  rebuild(): { register: Alarm[]; missed: Alarm[] } {
    const now = this.clock(), register: Alarm[] = [], missed: Alarm[] = [];
    const rows = this.db.prepare(`SELECT r.id,r.task_id,r.state,r.fire_at_utc,r.snoozed_until,t.title,t.priority FROM reminders r JOIN tasks t ON t.id=r.task_id
      WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL AND t.completed_at IS NULL AND r.state IN('pending','snoozed') AND r.fire_at_utc IS NOT NULL`).all();
    for (const r of rows) {
      const at = r.state === 'snoozed' && r.snoozed_until ? r.snoozed_until : r.fire_at_utc, a = { id: r.id, taskId: r.task_id, title: r.title, priority: r.priority, at };
      if (at > now) register.push(a); else if (at > now - 86400000) missed.push(a);
    }
    register.sort((a, b) => a.at - b.at); return { register, missed };
  }
  private set(id: string, sql: string, ...a: any[]) { this.db.prepare(`UPDATE reminders SET ${sql},updated_at=?,version=version+1 WHERE id=?`).run(...a, this.clock(), id); }
  markFired(id: string) { this.set(id, "state='fired'"); }
  dismiss(id: string) { this.set(id, "state='dismissed'"); }
  snoozeUntil(id: string, until: number) { this.set(id, "state='snoozed',snoozed_until=?", until); }
  snooze(id: string, minutes = 10) { if (minutes < 1) throw new Error('minutes>=1'); this.set(id, "state='snoozed',snoozed_until=?", this.clock() + minutes * 60000); }
}
