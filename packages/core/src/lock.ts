/** PIN app lock. Stores only a salted PBKDF2 verifier, never the PIN. `KV` should be the platform secure store (Android Keystore-backed / Windows Credential Manager) when available. */
export interface KV { get(k: string): string | undefined; set(k: string, v: string): void; del(k: string): void }
const te = new TextEncoder();
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, k, 256));
}
const same = (a: Uint8Array, b: Uint8Array) => { let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a[i] ^ b[i]; return d === 0; };
export class AppLock {
  private kv: KV; private clock: () => number; private iters: number;
  constructor(kv: KV, clock: () => number = () => Date.now(), iterations = 210_000) { this.kv = kv; this.clock = clock; this.iters = iterations; }
  isEnabled() { return this.kv.get('lock_v') !== undefined; }
  digits(): 4 | 6 | null { const v = this.kv.get('lock_v'); return v ? JSON.parse(v).digits : null; }
  async enable(pin: string, digits: 4 | 6) {
    if (!new RegExp(`^\\d{${digits}}$`).test(pin)) throw new Error(`PIN must be exactly ${digits} digits`);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    this.kv.set('lock_v', JSON.stringify({ digits, iters: this.iters, salt: b64(salt), hash: b64(await derive(pin, salt, this.iters)) })); this.kv.del('lock_fails'); this.kv.del('lock_until');
  }
  /** Failed attempts back off: after 5 in a row, 30 s doubling up to 15 min. Counters survive restarts. */
  async verify(pin: string): Promise<{ ok: boolean; lockedForMs?: number }> {
    const raw = this.kv.get('lock_v'); if (!raw) return { ok: true };
    const now = this.clock(), until = Number(this.kv.get('lock_until') ?? 0); if (now < until) return { ok: false, lockedForMs: until - now };
    const v = JSON.parse(raw), ok = /^\d+$/.test(pin) && same(await derive(pin, unb64(v.salt), v.iters), unb64(v.hash));
    if (ok) { this.kv.del('lock_fails'); this.kv.del('lock_until'); return { ok: true }; }
    const f = Number(this.kv.get('lock_fails') ?? 0) + 1; this.kv.set('lock_fails', String(f));
    if (f >= 5) { const wait = Math.min(15 * 60_000, 30_000 * 2 ** (f - 5)); this.kv.set('lock_until', String(now + wait)); return { ok: false, lockedForMs: wait }; }
    return { ok: false };
  }
  async disable(pin: string) { const r = await this.verify(pin); if (!r.ok) throw new Error('wrong PIN'); ['lock_v', 'lock_fails', 'lock_until'].forEach(k => this.kv.del(k)); }
  async change(oldPin: string, newPin: string, digits: 4 | 6) { const r = await this.verify(oldPin); if (!r.ok) throw new Error('wrong PIN'); await this.enable(newPin, digits); }
}
