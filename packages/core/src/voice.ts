/** Rule-based parser for English / Thanglish / Tamil-script commands. Speech-to-text happens elsewhere; this only interprets the recognised text. */
export type Intent = 'add' | 'reminder' | 'show' | 'complete' | 'update' | 'delete' | 'unknown';
export interface Command { raw: string; script: 'tamil' | 'latin'; intent: Intent; title?: string; query?: string; filter?: 'pending' | 'urgent' | 'overdue' | 'completed';
  date?: string; time?: string; ambiguousTime?: boolean; thisTask?: boolean; needsConfirm: boolean; missing: string[] }
const TA: [RegExp, string][] = [[/இன்னைக்கு|இன்று/g, ' innaiku '], [/நாளைக்கு|நாளை/g, ' naalaikku '], [/காலை/g, ' morning '], [/மாலை/g, ' evening '], [/இரவு/g, ' night '],
  [/மணிக்கு|மணி/g, ' mani '], [/சேர்/g, ' add '], [/காட்டு/g, ' kaattu '], [/முடி/g, ' complete '], [/மாற்று/g, ' change '], [/நீக்கு/g, ' delete ']];
const W = {
  today: ['today', 'innaiku', 'inniku', 'indru'], tomorrow: ['tomorrow', 'naalaikku', 'naalaiku', 'naalai'],
  add: ['add', 'create', 'new', 'podu', 'serthu', 'schedule'], show: ['show', 'list', 'display', 'kaattu', 'kaatu', 'kaami'],
  complete: ['complete', 'finish', 'finished', 'done', 'mudichu', 'mudinjathu', 'mudi'], update: ['change', 'reschedule', 'update', 'move', 'maathu', 'mathu', 'maatru'],
  del: ['delete', 'remove', 'neekku', 'neeku'], reminder: ['reminder', 'remind', 'alarm'],
};
const AM = ['morning', 'kaalai', 'kalai'], PM = ['evening', 'maalai', 'malai', 'afternoon', 'mathiyam', 'night', 'iravu'];
const STOP = new Set(['my', 'the', 'a', 'an', 'to', 'for', 'me', 'ku', 'ah', 'a', 'pannu', 'pannunga', 'panni', 'set', 'kaattu', 'mani', 'task', 'tasks', 'task-a', 'taska', 'indha', 'intha', 'this', 'please', 'at', 'on', 'in', 'am', 'pm', 'of', 'i', 'have', 'need', 'oru', 'ennoda', 'enakku', 'tasks-a']);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function parseCommand(input: string, now: Date = new Date()): Command {
  const script = /[\u0B80-\u0BFF]/.test(input) ? 'tamil' : 'latin'; let s = input;
  for (const [re, to] of TA) s = s.replace(re, to);
  if (/[\u0B80-\u0BFF]/.test(s) && !/[a-z]/i.test(s.replace(/[\u0B80-\u0BFF\s]/g, ''))) return { raw: input, script, intent: 'unknown', needsConfirm: false, missing: ['unsupported words'] };
  s = s.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const toks = s.split(' '), has = (l: string[]) => toks.some(t => l.includes(t));
  const c: Command = { raw: input, script, intent: 'unknown', needsConfirm: false, missing: [] };
  if (has(W.today)) c.date = ymd(now); if (has(W.tomorrow)) c.date = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (toks.includes('pending')) c.filter = 'pending'; else if (toks.includes('urgent')) c.filter = 'urgent'; else if (toks.includes('overdue')) c.filter = 'overdue'; else if (toks.includes('completed')) c.filter = 'completed';
  const m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|mani)?\b/); const am = has(AM), pm = has(PM);
  if (m) { let h = +m[1]; const mi = m[2] ?? '00';
    if (m[3] === 'pm' || (pm && h < 12)) { if (h < 12) h += 12; } else if (m[3] === 'am' || am) { if (h === 12) h = 0; } else if (h >= 1 && h <= 11 && !m[2]) c.ambiguousTime = true;
    if (h <= 23) c.time = `${String(h).padStart(2, '0')}:${mi}`; }
  c.thisTask = toks.some(t => ['indha', 'intha', 'this'].includes(t));
  if (has(W.del)) c.intent = 'delete'; else if (has(W.update)) c.intent = 'update';
  else if (has(W.complete) && !c.filter) c.intent = 'complete'; else if (has(W.show) || (c.filter && !has(W.add))) c.intent = 'show';
  else if (has(W.reminder)) c.intent = 'reminder'; else if (has(W.add) || (c.time && toks.some(t => ['pannu', 'podu'].includes(t)))) c.intent = 'add';
  if (c.intent === 'add' && has(W.reminder)) c.intent = 'reminder';
  const drop = new Set([...W.today, ...W.tomorrow, ...W.add, ...W.show, ...W.complete, ...W.update, ...W.del, ...W.reminder, ...AM, ...PM, 'pending', 'urgent', 'overdue', 'completed']);
  const words = toks.filter(t => !STOP.has(t) && !drop.has(t) && !/^\d{1,2}(:\d{2})?(am|pm)?$/.test(t));
  const text = words.join(' ');
  if (c.intent === 'add' || c.intent === 'reminder') { if (text) c.title = text; else c.missing.push('title'); if (!c.time) c.missing.push('time'); if (!c.date) c.missing.push('date'); }
  else if (c.intent === 'complete' || c.intent === 'delete' || c.intent === 'update') { if (text) c.query = text; else if (!c.thisTask) c.missing.push('which task'); }
  else if (c.intent === 'show' && text) c.query = text;
  if (c.intent === 'update' && !c.time && !c.date) c.missing.push('new time or date');
  c.needsConfirm = ['complete', 'update', 'delete'].includes(c.intent);
  if (c.intent === 'unknown') c.missing.push('command not understood');
  return c;
}
