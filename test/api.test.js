'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const L = require('../src/logic');

function client(base) {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
}

test('two people make a pact and hold each other accountable', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const yesterday = L.addDays(today, -1);

  const hank = client(base);
  const jake = client(base);

  assert.equal((await hank('GET', '/api/me')).status, 401);
  assert.equal((await hank('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'short' })).status, 400);
  assert.equal((await hank('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' })).status, 200);
  assert.equal((await jake('POST', '/api/signup', { name: 'Jake', username: 'HANK', password: 'password123' })).status, 409);
  assert.equal((await jake('POST', '/api/signup', { name: 'Jake', username: 'jake', password: 'password123' })).status, 200);

  const created = await hank('POST', '/api/partnerships', { name: 'Hank & Jake', stakes: 'Loser buys coffee', today });
  assert.equal(created.status, 200);
  const { id: pid, invite_code } = created.data.partnership;

  // Jake can't peek before joining.
  assert.equal((await jake('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).status, 404);
  assert.equal((await jake('POST', '/api/partnerships/join', { code: invite_code.toLowerCase() })).status, 200);

  // It's 1-on-1: a third person is turned away.
  const third = client(base);
  await third('POST', '/api/signup', { name: 'Ty', username: 'tyler', password: 'password123' });
  assert.equal((await third('POST', '/api/partnerships/join', { code: invite_code })).status, 409);

  const habit = (await hank('POST', '/api/habits', { partnership_id: pid, title: 'Edit a video', why: 'Content pays for travel', target_per_week: 5, today })).data.habit;
  assert.equal(habit.target_per_week, 5);

  // Jake can't check in on Hank's habit.
  assert.equal((await jake('POST', '/api/checkins', { habit_id: habit.id, status: 'done', today })).status, 404);

  // A miss needs a reason.
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'missed', today })).status, 400);
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'missed', note: 'Bus took 9 hours', today })).status, 200);
  // Flip it to done; only one feed entry should remain for today.
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'done', today })).status, 200);

  // No backfilling beyond yesterday, and not before the habit existed.
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'done', day: L.addDays(today, -3), today })).status, 400);
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'done', day: yesterday, today })).status, 400);

  // Jake nudges and cheers; he can't nudge himself.
  assert.equal((await jake('POST', `/api/partnerships/${pid}/nudges`, { kind: 'cheer', to_user_id: habit.user_id, habit_id: habit.id })).status, 200);
  const jakeId = (await jake('GET', '/api/me')).data.user.id;
  assert.equal((await jake('POST', `/api/partnerships/${pid}/nudges`, { kind: 'nudge', to_user_id: jakeId })).status, 400);

  const dash = (await jake('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.members.length, 2);
  assert.equal(dash.partnership.stakes, 'Loser buys coffee');
  assert.equal(dash.week.members[habit.user_id].habits[0].done, 1);
  assert.equal(dash.week.members[jakeId].met, false);
  const checkinEvents = dash.events.filter((e) => e.habit_id === habit.id && (e.kind === 'done' || e.kind === 'missed'));
  assert.equal(checkinEvents.length, 1);
  assert.equal(checkinEvents[0].kind, 'done');
  assert.ok(dash.events.some((e) => e.kind === 'cheer'));

  // Seen marker advances.
  const again = (await jake('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(again.last_seen_event_id, dash.events[0].id);

  // Dropping a habit shows up in the feed.
  assert.equal((await hank('PATCH', `/api/habits/${habit.id}`, { archived: true, today })).status, 200);
  const after = (await hank('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(after.events[0].kind, 'habit_archived');
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'done', today })).status, 400);
});

test('rejects non-JSON writes and bogus dates', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(base + '/api/signup', { method: 'POST', body: 'name=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(res.status, 415);

  const c = client(base);
  await c('POST', '/api/signup', { name: 'A', username: 'aaa', password: 'password123' });
  assert.equal((await c('POST', '/api/partnerships', { today: '1999-01-01' })).status, 400);

  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /AccountAbility/);
  // Nothing outside public/ is served.
  assert.equal((await fetch(base + '/package.json')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
});

test('health check and login lockout', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');

  const c = client(base);
  await c('POST', '/api/signup', { name: 'A', username: 'victim', password: 'password123' });
  const attacker = client(base);
  for (let i = 0; i < 10; i++) {
    assert.equal((await attacker('POST', '/api/login', { username: 'victim', password: 'wrong-guess' })).status, 401);
  }
  // Locked out, even with the right password, until the window passes.
  assert.equal((await attacker('POST', '/api/login', { username: 'victim', password: 'password123' })).status, 429);
});
