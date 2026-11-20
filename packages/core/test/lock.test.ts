import { test } from 'node:test'; import assert from 'node:assert/strict'; import { AppLock, type KV } from '../src/lock.ts';
const kv = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: k => m.get(k), set: (k, v) => void m.set(k, v), del: k => void m.delete(k) }; };
test('PIN is never stored; correct and wrong PINs; 4 and 6 digits', async () => {
  const s = kv(), l = new AppLock(s, () => 0, 1000); assert.equal(l.isEnabled(), false); await l.enable('4821', 4);
  assert.equal(JSON.stringify([...s.m]).includes('4821'), false); assert.equal((await l.verify('4821')).ok, true); assert.equal((await l.verify('0000')).ok, false);
  await assert.rejects(l.enable('123', 4)); await assert.rejects(l.enable('12345', 4)); await assert.rejects(l.enable('abcd', 4)); await l.enable('123456', 6); assert.equal(l.digits(), 6); assert.equal((await l.verify('123456')).ok, true);
});
test('lockout after 5 failures, backoff grows, survives restart, success resets', async () => {
  let now = 0; const s = kv(), l = new AppLock(s, () => now, 1000); await l.enable('1111', 4);
  for (let i = 0; i < 4; i++) assert.deepEqual(await l.verify('0000'), { ok: false }); assert.equal((await l.verify('0000')).lockedForMs, 30000);
  assert.equal((await l.verify('1111')).ok, false);                       // correct PIN refused while locked
  const l2 = new AppLock(s, () => now, 1000); assert.equal((await l2.verify('1111')).ok, false);   // "restart"
  now = 31000; assert.equal((await l2.verify('0000')).lockedForMs, 60000); now += 61000; assert.equal((await l2.verify('1111')).ok, true); assert.equal(s.m.has('lock_fails'), false);
});
test('disable and change require the current PIN', async () => {
  const s = kv(), l = new AppLock(s, () => 0, 1000); await l.enable('1111', 4); await assert.rejects(l.disable('2222')); await l.change('1111', '2222', 4);
  assert.equal((await l.verify('2222')).ok, true); await l.disable('2222'); assert.equal(l.isEnabled(), false);
});
