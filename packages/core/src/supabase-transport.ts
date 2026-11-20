// UNTESTED against a live project. Pass in a supabase-js client (anon key only; never a service-role key).
import type { Transport } from './sync.ts';
export interface Sb { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: any }>; from(t: string): any }
const ok = ({ data, error }: { data: any; error: any }) => { if (error) throw new Error(error.message); return data; };
export const supabaseTransport = (sb: Sb): Transport => ({
  push: async recs => ok(await sb.rpc('sync_push', { recs })),
  pull: async (since, limit) => ok(await sb.from('sync_records').select('tbl,id,data,version,deleted,seq').gt('seq', since).order('seq', { ascending: true }).limit(limit)),
});
/** Each device first calls sb.auth.signInAnonymously() (session lives in secure storage), then: */
export const pairing = {
  bootstrap: async (sb: Sb, name: string) => ok(await sb.rpc('bootstrap_device', { dev_name: name })),   // first device
  createCode: async (sb: Sb): Promise<string> => ok(await sb.rpc('pair_create')),                         // shown on device 1, valid 5 min, single use
  redeem: async (sb: Sb, code: string, name: string) => ok(await sb.rpc('pair_redeem', { code, dev_name: name })), // device 2; null = wrong/expired code
  approve: async (sb: Sb, device: string) => ok(await sb.rpc('pair_approve', { target: device })),         // device 1 confirms device 2
  revoke: async (sb: Sb, device: string) => ok(await sb.rpc('revoke_device', { target: device })),
};
