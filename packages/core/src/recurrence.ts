export interface Rule { freq: 'daily'|'weekly'|'monthly'; interval?: number; weekdays?: number[]; start: string; end?: string }
const D = 86400000, p = (s: string) => Date.parse(s + 'T00:00:00Z'), f = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Occurrence dates (YYYY-MM-DD) within [from,to]. Weekdays: 0=Sun. Paused rules yield nothing. */
export function expand(rule: Rule, from: string, to: string, paused = false): string[] {
  if (paused) return [];
  const iv = Math.max(1, rule.interval ?? 1), s = p(rule.start), out: string[] = [];
  const hi = Math.min(p(to), rule.end ? p(rule.end) : Infinity);
  if (rule.freq === 'monthly') {
    const sd = new Date(s), day = sd.getUTCDate();
    for (let k = 0; ; k++) {
      const m = sd.getUTCMonth() + k * iv, y = sd.getUTCFullYear() + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
      const last = new Date(Date.UTC(y, mm + 1, 0)).getUTCDate();
      const t = Date.UTC(y, mm, Math.min(day, last));
      if (t > hi) break; if (t >= p(from)) out.push(f(t));
    }
    return out;
  }
  for (let t = Math.max(s, p(from)); t <= hi; t += D) {
    const days = Math.round((t - s) / D);
    if (rule.freq === 'daily') { if (days % iv === 0) out.push(f(t)); }
    else {
      const wd = new Date(t).getUTCDay(), wk = Math.floor(days / 7);
      const set = rule.weekdays?.length ? rule.weekdays : [new Date(s).getUTCDay()];
      if (wk % iv === 0 && set.includes(wd)) out.push(f(t));
    }
  }
  return out;
}
