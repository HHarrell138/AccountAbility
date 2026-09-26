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
  assert.equal(habit.icon, 'check');
  const water = await hank('POST', '/api/habits', { partnership_id: pid, title: 'Drink 1 gallon of water', icon: 'water', target_per_week: 7, today });
  assert.equal(water.data.habit.icon, 'water');
  assert.equal((await hank('POST', '/api/habits', { partnership_id: pid, title: 'X', icon: '<script>', target_per_week: 7, today })).status, 400);

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

test('older databases get the habit icon column added', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { DatabaseSync } = require('node:sqlite');
  const { openDb } = require('../src/db');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aa-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE habits (id INTEGER PRIMARY KEY, partnership_id INTEGER, user_id INTEGER, title TEXT,
    why TEXT, target_per_week INTEGER, created_day TEXT, archived_day TEXT, created_at TEXT)`);
  old.exec(`INSERT INTO habits (title, target_per_week) VALUES ('Old habit', 3)`);
  old.close();
  const db = openDb(file);
  assert.equal(db.prepare('SELECT icon FROM habits').get().icon, 'check');
  db.close();
});

test('shared goals: propose, agree, compare, and end together', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const a = client(base);
  const b = client(base);
  await a('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await b('POST', '/api/signup', { name: 'Jake', username: 'jake', password: 'password123' });
  const { id: pid, invite_code } = (await a('POST', '/api/partnerships', { today })).data.partnership;

  // Propose before the partner even joins; it waits for them.
  const water = (await a('POST', '/api/goals', { partnership_id: pid, title: 'Drink 1 gallon of water', icon: 'water', target_per_week: 1, today })).data.goal;
  assert.equal(water.status, 'proposed');
  await b('POST', '/api/partnerships/join', { code: invite_code });
  const gym = (await b('POST', '/api/goals', { partnership_id: pid, title: 'Work out', icon: 'workout', target_per_week: 4, today })).data.goal;

  // You can't accept your own proposal, and nothing counts until it's agreed.
  assert.equal((await a('POST', `/api/goals/${water.id}/respond`, { answer: 'accept', today })).status, 403);
  let dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.habits.length, 0);
  assert.equal(dash.goals.length, 2);

  assert.equal((await b('POST', `/api/goals/${water.id}/respond`, { answer: 'accept', today })).status, 200);
  assert.equal((await a('POST', `/api/goals/${gym.id}/respond`, { answer: 'decline' })).status, 200);
  assert.equal((await a('POST', `/api/goals/${gym.id}/respond`, { answer: 'accept', today })).status, 409);

  // A side goal is personal and stays out of the pair streak.
  await a('POST', '/api/habits', { partnership_id: pid, title: 'Edit a video', target_per_week: 1, today });

  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  const shared = dash.habits.filter((h) => h.goal_id === water.id);
  assert.equal(shared.length, 2); // one for each of you
  assert.deepEqual(dash.goals.map((g) => g.status), ['active']);

  const mine = shared.find((h) => h.user_id === dash.me);
  const theirs = shared.find((h) => h.user_id !== dash.me);
  await a('POST', '/api/checkins', { habit_id: mine.id, status: 'done', today });
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.sharedWeek.members[dash.me].met, true);
  assert.equal(dash.sharedWeek.allMet, false);
  assert.equal(dash.streak.weeks, 0);

  await b('POST', '/api/checkins', { habit_id: theirs.id, status: 'done', today });
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.sharedWeek.allMet, true);
  assert.deepEqual(dash.streak, { weeks: 1, currentWeekMet: true }); // side goal not done, streak still counts

  // Either of you can end it, and it ends for both.
  assert.equal((await b('PATCH', `/api/habits/${theirs.id}`, { archived: true, today })).status, 200);
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.goals.length, 0);
  assert.equal(dash.events[0].kind, 'goal_ended');
  assert.equal((await a('POST', '/api/checkins', { habit_id: mine.id, status: 'done', today })).status, 400);
});

test('one-tap done can be undone, a miss cannot', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const c = client(base);
  await c('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  const { id: pid } = (await c('POST', '/api/partnerships', { today })).data.partnership;
  const h = (await c('POST', '/api/habits', { partnership_id: pid, title: 'Read', target_per_week: 3, today })).data.habit;

  await c('POST', '/api/checkins', { habit_id: h.id, status: 'done', today });
  assert.equal((await c('POST', '/api/checkins/undo', { habit_id: h.id, today })).status, 200);
  let dash = (await c('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.checkins.length, 0);
  assert.ok(!dash.events.some((e) => e.kind === 'done'));
  assert.equal((await c('POST', '/api/checkins/undo', { habit_id: h.id, today })).status, 404);

  await c('POST', '/api/checkins', { habit_id: h.id, status: 'missed', note: 'Travel day', today });
  assert.equal((await c('POST', '/api/checkins/undo', { habit_id: h.id, today })).status, 400);
});
