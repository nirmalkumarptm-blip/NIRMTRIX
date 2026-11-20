import { test } from 'node:test'; import assert from 'node:assert/strict'; import { parseCommand as p } from '../src/voice.ts';
const now = new Date(2026, 10, 19, 10, 0);
test('add with Thanglish date/time', () => {
  const c = p('Tomorrow morning 9 mani ku meeting add pannu.', now);
  assert.equal(c.intent, 'add'); assert.equal(c.title, 'meeting'); assert.equal(c.date, '2026-11-20'); assert.equal(c.time, '09:00'); assert.deepEqual(c.missing, []);
});
test('show pending tasks today', () => { const c = p('Innaiku pending tasks kaattu.', now); assert.equal(c.intent, 'show'); assert.equal(c.filter, 'pending'); assert.equal(c.date, '2026-11-19'); assert.equal(c.needsConfirm, false); });
test('reminder with missing info is reported, not guessed', () => { const c = p('Naalaikku reminder set pannu.', now); assert.equal(c.intent, 'reminder'); assert.equal(c.date, '2026-11-20'); assert.deepEqual(c.missing, ['title', 'time']); });
test('complete by name needs confirmation', () => { const c = p('Complete my shopping task.', now); assert.equal(c.intent, 'complete'); assert.equal(c.query, 'shopping'); assert.equal(c.needsConfirm, true); });
test('show urgent', () => { const c = p('Show my urgent tasks.', now); assert.equal(c.intent, 'show'); assert.equal(c.filter, 'urgent'); });
test('update "this task" to evening 6', () => { const c = p('Indha task-a evening 6 mani ku change pannu.', now); assert.equal(c.intent, 'update'); assert.equal(c.thisTask, true); assert.equal(c.time, '18:00'); assert.equal(c.needsConfirm, true); });
test('Tamil script words and ambiguity flag', () => {
  const c = p('நாளைக்கு காலை 9 மணிக்கு meeting add', now); assert.equal(c.script, 'tamil'); assert.equal(c.date, '2026-11-20'); assert.equal(c.time, '09:00'); assert.equal(c.title, 'meeting');
  assert.equal(p('meeting 9 mani ku add pannu', now).ambiguousTime, true);
});
test('garbage and unsupported input fail gracefully', () => { assert.equal(p('blah blah', now).intent, 'unknown'); assert.equal(p('வணக்கம்', now).intent, 'unknown'); });
