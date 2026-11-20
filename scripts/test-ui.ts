// Runs the real UI script in a fake DOM with a fake native plugin, to test the alarm scheduling/outcome logic.
import vm from 'node:vm'; import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict';
const js = readFileSync('nirmtrix-ui-preview.html', 'utf8').match(/<script>([\s\S]*)<\/script>/)[1], calls = [];
const NAfake = { replaceAll: async a => { calls.push(a.alarms); }, drainActions: async () => ({ actions: [] }), status: async () => ({ notifications: true, exactAlarms: true }) };
const el = (): any => new Proxy(function () {}, { get: (_t, k) => k === 'querySelectorAll' ? () => [] : k === 'classList' ? { toggle() {}, add() {} } : k === 'dataset' ? {} : k === 'style' ? { setProperty() {} } : el(), set: () => true, apply: () => el() });
const ctx: any = { document: { querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, body: el(), documentElement: el() }, localStorage: { getItem: () => null, setItem() {} },
  window: { Capacitor: { isNativePlatform: () => true, registerPlugin: () => NAfake } }, matchMedia: () => ({ matches: false }), setInterval: () => 0, setTimeout, clearTimeout, console };
vm.createContext(ctx); vm.runInContext(js, ctx); const run = (c: string) => vm.runInContext(c, ctx);
const tm = run('ymd(new Date(Date.now()+864e5))'), at = (o: number) => new Date(`${tm}T09:00`).getTime() - o * 60000;
run(`S.tasks.push({id:"a1",title:"Meet",cat:"work",pri:2,date:"${tm}",start:"09:00",end:"",rec:null,done:false,del:null,occ:{},rem:[30,10,0]})`);
await ctx.pushAlarms(); let L = calls.at(-1)!;
assert.deepEqual([...L.map((a: any) => a.at)], [at(30), at(10), at(0)]); assert.equal(L[0].id, `a1|${tm}|30`);
run(`S.tasks.push({id:"r1",title:"Gym",cat:"health",pri:1,date:"${tm}",start:"07:00",rec:{freq:"daily",interval:1},done:false,del:null,occ:{},rem:[0]})`);
await ctx.pushAlarms(); L = calls.at(-1)!; assert.ok(L.filter((a: any) => a.taskId === 'r1').length >= 14, 'recurring tasks get an alarm per day');
ctx.applyActions([{ id: `a1|${tm}|10`, taskId: 'a1', action: 'snooze', at: Date.now(), minutes: 10 }]); await ctx.pushAlarms(); L = calls.at(-1)!;
assert.ok(Math.abs(L.find((a: any) => a.id === `a1|${tm}|10`).at - (Date.now() + 600000)) < 5000, 'snooze moves that alarm to now+10min');
ctx.applyActions([{ id: `a1|${tm}|10`, taskId: 'a1', action: 'dismiss', at: Date.now() }]); await ctx.pushAlarms(); L = calls.at(-1)!;
assert.ok(Math.abs(L.find((a: any) => a.id === `a1|${tm}|10`).at - at(10)) < 1, 'dismiss clears the snooze');
ctx.applyActions([{ id: `r1|${tm}|0`, taskId: 'r1', action: 'complete', at: Date.now() }, { id: `a1|${tm}|0`, taskId: 'a1', action: 'complete', at: Date.now() }, { id: 'ghost|x|0', taskId: 'ghost', action: 'complete', at: Date.now() }]);
await ctx.pushAlarms(); L = calls.at(-1)!;
assert.equal(L.some((a: any) => a.taskId === 'a1'), false, 'completed one-off task has no alarms'); assert.equal(L.some((a: any) => a.id === `r1|${tm}|0`), false, 'completed occurrence has no alarm');
assert.ok(L.some((a: any) => a.taskId === 'r1'), 'other days of the recurring task still ring');
run('S.test=Date.now()+15000'); await ctx.pushAlarms(); assert.equal(calls.at(-1)!.some((a: any) => a.taskId === 'test'), true);
console.log('ui native tests passed');
