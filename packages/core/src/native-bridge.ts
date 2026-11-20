import type { Db } from './db.ts'; import type { TaskRepo } from './tasks.ts'; import type { ReminderRepo } from './reminders.ts';
export interface NativeAction { id: string; taskId: string; action: 'fired' | 'snooze' | 'dismiss' | 'complete'; at: number; minutes?: number }
/** Applies alarm outcomes recorded natively (alarm screen buttons, fired alarms) to SQLite, oldest first. Call after plugin.drainActions() on every app start/resume. */
export function applyNativeActions(db: Db, actions: NativeAction[], tasks: TaskRepo, rem: ReminderRepo): { applied: number; skipped: number } {
  let applied = 0, skipped = 0;
  for (const a of [...actions].sort((x, y) => x.at - y.at)) {
    const r = db.prepare('SELECT r.task_id,r.tz,(t.recurrence_json IS NOT NULL) rec FROM reminders r JOIN tasks t ON t.id=r.task_id WHERE r.id=?').get(a.id);
    if (!r) { skipped++; continue; }
    if (a.action === 'fired') rem.markFired(a.id);
    else if (a.action === 'snooze') rem.snoozeUntil(a.id, a.at + (a.minutes || 10) * 60000);
    else if (a.action === 'dismiss') rem.dismiss(a.id);
    else if (a.action === 'complete') { tasks.complete(r.task_id, r.rec ? new Date(a.at).toLocaleDateString('en-CA', { timeZone: r.tz || 'UTC' }) : undefined); rem.dismiss(a.id); }
    else { skipped++; continue; }
    applied++;
  }
  return { applied, skipped };
}
