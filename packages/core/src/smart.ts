/** Smart assistance. Every function only RETURNS proposals; nothing here mutates tasks (approval is the caller's job). */
export interface T { id: string; title: string; date?: string; start?: string; end?: string; due?: string; priority: number; done?: boolean }
const m = (hm: string) => { const [h, mi] = hm.split(':').map(Number); return h * 60 + mi; };
export function conflicts(ts: T[]): [string, string][] {
  const out: [string, string][] = [], a = ts.filter(t => !t.done && t.date && t.start && t.end);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++)
    if (a[i].date === a[j].date && m(a[i].start!) < m(a[j].end!) && m(a[j].start!) < m(a[i].end!)) out.push([a[i].id, a[j].id]);
  return out;
}
export function overloadedDays(ts: T[], maxMinutes = 480): { date: string; minutes: number }[] {
  const by = new Map<string, number>();
  for (const t of ts) if (!t.done && t.date && t.start && t.end) by.set(t.date, (by.get(t.date) ?? 0) + m(t.end) - m(t.start));
  return [...by].filter(([, v]) => v > maxMinutes).map(([date, minutes]) => ({ date, minutes }));
}
export interface Proposal { taskId: string; kind: 'reschedule' | 'raise_priority'; reason: string; suggested: Record<string, unknown> }
export function proposals(ts: T[], today: string, manualPriority: Set<string> = new Set()): Proposal[] {
  const out: Proposal[] = [];
  for (const t of ts) {
    if (t.done) continue;
    const when = t.due ?? t.date;
    if (when && when < today) out.push({ taskId: t.id, kind: 'reschedule', reason: `Overdue since ${when}`, suggested: { date: today } });
    if (t.due === today && t.priority < 2 && !manualPriority.has(t.id)) out.push({ taskId: t.id, kind: 'raise_priority', reason: 'Due today', suggested: { priority: 2 } });
  }
  return out;
}
