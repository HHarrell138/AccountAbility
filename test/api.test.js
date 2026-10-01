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
  const wake = await hank('POST', '/api/habits', { partnership_id: pid, title: 'Wake up by 6:00 AM', icon: 'wake', target_per_week: 5, today });
  assert.equal(wake.data.habit.icon, 'wake');
  assert.equal((await hank('POST', '/api/habits', { partnership_id: pid, title: 'X', icon: '<script>', target_per_week: 7, today })).status, 400);

  // Jake can't check in on Hank's habit.
  assert.equal((await jake('POST', '/api/checkins', { habit_id: habit.id, status: 'done', today })).status, 404);

  // A miss needs a reason.
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'missed', today })).status, 400);
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'missed', note: 'Bus took 9 hours', today })).status, 200);
  // Flip it to done; only one feed entry should remain for today.
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'done', today })).status, 200);

  // No backfilling beyond yesterday, the future, or before the habit existed.
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'done', day: L.addDays(today, -2), today })).status, 400);
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'done', day: L.addDays(today, 1), today })).status, 400);
  assert.equal((await hank('POST', '/api/checkins', { habit_id: habit.id, status: 'done', day: yesterday, today })).status, 400);

  // Jake nudges and cheers; he can't nudge himself.
  assert.equal((await jake('POST', `/api/partnerships/${pid}/nudges`, { kind: 'cheer', to_user_id: habit.user_id, habit_id: habit.id })).status, 200);
  const jakeId = (await jake('GET', '/api/me')).data.user.id;
  // The pact switcher lists who's in each pact.
  assert.deepEqual((await jake('GET', '/api/me')).data.partnerships[0].members.map((m) => m.name).sort(), ['Hank', 'Jake']);
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
  // Side goal not done, but the streak only counts shared goals: a perfect week, so green.
  assert.deepEqual([dash.streak.weeks, dash.streak.tier, dash.streak.currentWeekMet], [1, 'green', true]);

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

test('wake-up schedule: per-day times set the weekly target and carry into shared goals', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const a = client(base);
  const b = client(base);
  await a('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await b('POST', '/api/signup', { name: 'King', username: 'king', password: 'password123' });
  const { id: pid, invite_code } = (await a('POST', '/api/partnerships', { today })).data.partnership;
  await b('POST', '/api/partnerships/join', { code: invite_code });

  const schedule = { sat: '09:00', mon: '05:30', tue: '05:30', wed: '05:30', thu: '05:30', fri: '07:00', sun: '09:00' };
  const side = await a('POST', '/api/habits', { partnership_id: pid, title: 'Wake up on schedule', icon: 'wake', schedule, today });
  assert.equal(side.status, 200);
  assert.equal(side.data.habit.target_per_week, 7);
  assert.deepEqual(Object.keys(JSON.parse(side.data.habit.schedule)), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

  const weekdays = { mon: '06:00', tue: '06:00', wed: '06:00', thu: '06:00', fri: '06:00' };
  const goal = (await a('POST', '/api/goals', { partnership_id: pid, title: 'Wake up by 6:00 AM', icon: 'wake', schedule: weekdays, today })).data.goal;
  assert.equal(goal.target_per_week, 5);
  await b('POST', `/api/goals/${goal.id}/respond`, { answer: 'accept', today });
  const dash = (await b('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  const kingsCopy = dash.habits.find((h) => h.goal_id === goal.id && h.user_id !== side.data.habit.user_id);
  assert.equal(kingsCopy.schedule, JSON.stringify(weekdays));

  assert.equal((await a('POST', '/api/habits', { partnership_id: pid, title: 'X', schedule: { funday: '05:00' }, today })).status, 400);
  assert.equal((await a('POST', '/api/habits', { partnership_id: pid, title: 'X', schedule: { mon: '25:00' }, today })).status, 400);
  assert.equal((await a('POST', '/api/habits', { partnership_id: pid, title: 'X', schedule: {}, today })).status, 400);
});

test('shared wake-up goal: each of you keeps your own times', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const a = client(base);
  const b = client(base);
  await a('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await b('POST', '/api/signup', { name: 'King', username: 'king', password: 'password123' });
  const { id: pid, invite_code } = (await a('POST', '/api/partnerships', { today })).data.partnership;
  await b('POST', '/api/partnerships/join', { code: invite_code });
  const hankId = (await a('GET', '/api/me')).data.user.id;
  const kingId = (await b('GET', '/api/me')).data.user.id;

  const hanks = { mon: '05:30', tue: '05:30', wed: '05:30', thu: '05:30', fri: '07:00', sat: '09:00', sun: '09:00' };
  const kings = { mon: '06:45', tue: '06:45', wed: '06:45', thu: '06:45', fri: '06:45' };
  const goal = (await a('POST', '/api/goals', { partnership_id: pid, title: 'Wake up on schedule', icon: 'wake', schedule: hanks, today })).data.goal;
  assert.equal((await b('POST', `/api/goals/${goal.id}/respond`, { answer: 'accept', schedule: kings, today })).status, 200);

  let dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  const mine = dash.habits.find((h) => h.goal_id === goal.id && h.user_id === hankId);
  const his = dash.habits.find((h) => h.goal_id === goal.id && h.user_id === kingId);
  assert.equal(mine.schedule, JSON.stringify(hanks));
  assert.equal(mine.target_per_week, 7);
  assert.equal(his.schedule, JSON.stringify(kings));
  assert.equal(his.target_per_week, 5);

  // Changing your times is on the record, and only your own.
  const newer = { mon: '06:00', tue: '06:00', wed: '06:00' };
  assert.equal((await b('PATCH', `/api/habits/${mine.id}`, { schedule: newer })).status, 404);
  assert.equal((await a('PATCH', `/api/habits/${mine.id}`, { schedule: newer })).status, 200);
  dash = (await b('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.habits.find((h) => h.id === mine.id).target_per_week, 3);
  assert.equal(dash.events[0].kind, 'schedule_changed');
  assert.equal((await a('PATCH', `/api/habits/${mine.id}`, { schedule: {} })).status, 400);

  // Agreeing without times falls back to the proposer's.
  const g2 = (await a('POST', '/api/goals', { partnership_id: pid, title: 'Wake up by 6:00 AM', icon: 'wake', schedule: { sat: '06:00' }, today })).data.goal;
  await b('POST', `/api/goals/${g2.id}/respond`, { answer: 'accept', today });
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.habits.find((h) => h.goal_id === g2.id && h.user_id === kingId).schedule, JSON.stringify({ sat: '06:00' }));
});

test('log as you go: + adds up, hitting the amount counts as done, taking back undoes it', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const a = client(base);
  const b = client(base);
  await a('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await b('POST', '/api/signup', { name: 'King', username: 'king', password: 'password123' });
  const { id: pid, invite_code } = (await a('POST', '/api/partnerships', { today })).data.partnership;
  await b('POST', '/api/partnerships/join', { code: invite_code });

  const run = (await a('POST', '/api/habits', { partnership_id: pid, title: 'Run 3 miles', icon: 'run', target_per_week: 4, daily_amount: 3, unit: 'mi', step: 1, today })).data.habit;
  assert.equal(run.daily_amount, 3);
  const add = (delta, who = a) => who('POST', '/api/amounts', { habit_id: run.id, delta, today });

  assert.deepEqual((await add(1)).data, { amount: 1, total: 1, done: false, also: [] });
  assert.deepEqual((await add(1.4)).data, { amount: 2.4, total: 2.4, done: false, also: [] });
  let dash = (await b('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.amounts.find((x) => x.habit_id === run.id).amount, 2.4); // partner sees the running total
  assert.ok(!dash.checkins.some((c) => c.habit_id === run.id));

  assert.deepEqual((await add(1)).data, { amount: 3.4, total: 3.4, done: true, also: [] });
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.checkins.find((c) => c.habit_id === run.id).status, 'done');
  assert.equal(dash.events.filter((e) => e.kind === 'done' && e.habit_id === run.id).length, 1);
  assert.equal(dash.events[0].message, '3.4 mi');

  // Taking back below the amount removes the Done; never below zero.
  assert.deepEqual((await add(-1)).data, { amount: 2.4, total: 2.4, done: false, also: [] });
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.ok(!dash.checkins.some((c) => c.habit_id === run.id));
  assert.deepEqual((await add(-10)).data, { amount: 0, total: 0, done: false, also: [] });

  assert.equal((await add(1, b)).status, 404); // not King's goal
  const plain = (await a('POST', '/api/habits', { partnership_id: pid, title: 'Read', target_per_week: 3, today })).data.habit;
  assert.equal((await a('POST', '/api/amounts', { habit_id: plain.id, delta: 1, today })).status, 400);
  assert.equal((await a('POST', '/api/habits', { partnership_id: pid, title: 'X', target_per_week: 3, daily_amount: 3, unit: 'mi', step: 5, today })).status, 400);

  // Water: change the tap size. Protein: step 0 means type the amount each time.
  const water = (await a('POST', '/api/habits', { partnership_id: pid, title: 'Drink 1 gallon of water', icon: 'water', target_per_week: 7, daily_amount: 128, unit: 'oz', step: 8, today })).data.habit;
  assert.equal((await a('PATCH', `/api/habits/${water.id}`, { step: 16.9 })).status, 200);
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.habits.find((h) => h.id === water.id).step, 16.9);
  assert.equal((await a('PATCH', `/api/habits/${water.id}`, { step: 500 })).status, 400);
  assert.equal((await a('PATCH', `/api/habits/${plain.id}`, { step: 1 })).status, 400);
  const protein = (await a('POST', '/api/habits', { partnership_id: pid, title: 'Eat 150g of protein', icon: 'protein', target_per_week: 7, daily_amount: 150, unit: 'g', step: 0, today })).data.habit;
  assert.equal(protein.step, 0);
  assert.deepEqual((await a('POST', '/api/amounts', { habit_id: protein.id, delta: 42, today })).data, { amount: 42, total: 42, done: false, also: [] });

  // Shared goals carry the amount to both of you.
  const g = (await a('POST', '/api/goals', { partnership_id: pid, title: 'Drink 1 gallon of water', icon: 'water', target_per_week: 7, daily_amount: 128, unit: 'oz', step: 16, today })).data.goal;
  await b('POST', `/api/goals/${g.id}/respond`, { answer: 'accept', today });
  dash = (await b('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.deepEqual(dash.habits.filter((h) => h.goal_id === g.id).map((h) => [h.daily_amount, h.unit, h.step]), [[128, 'oz', 16], [128, 'oz', 16]]);

  // Protein and calories are always typed in: no fixed tap, even if one is sent.
  const cal = (await a('POST', '/api/habits', { partnership_id: pid, title: 'Eat at least 2,500 calories', icon: 'calories', target_per_week: 7, daily_amount: 2500, unit: 'cal', step: 100, today })).data.habit;
  assert.equal(cal.step, 0);
  assert.equal((await a('PATCH', `/api/habits/${protein.id}`, { step: 25 })).status, 400);
});

test('weekly run: miles add up across the week, and the total counts once', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const yesterday = L.addDays(today, -1);
  const a = client(base);
  await a('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  const { id: pid } = (await a('POST', '/api/partnerships', { today: yesterday })).data.partnership;
  // Created before this week so the full 15 mi applies.
  const run = (await a('POST', '/api/habits', { partnership_id: pid, title: 'Run 15 miles a week', icon: 'run', daily_amount: 15, unit: 'mi', step: 1, amount_period: 'week', today })).data.habit;
  assert.equal(run.target_per_week, 1);
  assert.equal(run.amount_period, 'week');

  const target = L.weeklyAmountTarget(run, L.weekStart(today)); // scaled if created mid-week
  const add = (delta) => a('POST', '/api/amounts', { habit_id: run.id, delta, today });
  let r = (await add(target - 1)).data;
  assert.equal(r.done, false);
  r = (await add(1)).data;
  assert.deepEqual([r.total, r.done], [target, true]);
  let dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.checkins.filter((c) => c.habit_id === run.id && c.status === 'done').length, 1);
  assert.equal(dash.week.members[dash.me].habits.find((x) => x.habit_id === run.id).met, true);
  assert.match(dash.events[0].message, /this week$/);

  // Taking miles back under the weekly total removes the Done.
  r = (await add(-1)).data;
  assert.equal(r.done, false);
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.checkins.filter((c) => c.habit_id === run.id).length, 0);

  assert.equal((await a('POST', '/api/habits', { partnership_id: pid, title: 'X', daily_amount: 5, unit: 'mi', step: 1, amount_period: 'month', today })).status, 400);
});

test('weekly amount target scales the week a goal starts', () => {
  const h = { daily_amount: 14, created_day: '2026-09-26' }; // a Saturday
  assert.equal(L.weeklyAmountTarget(h, '2026-09-21'), 4); // 2 of 7 days
  assert.equal(L.weeklyAmountTarget(h, '2026-09-28'), 14);
});

test('personal numbers: each partner sets their own protein goal', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const a = client(base);
  const b = client(base);
  await a('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await b('POST', '/api/signup', { name: 'King', username: 'king', password: 'password123' });
  const { id: pid, invite_code } = (await a('POST', '/api/partnerships', { today })).data.partnership;
  await b('POST', '/api/partnerships/join', { code: invite_code });
  const hankId = (await a('GET', '/api/me')).data.user.id;
  const kingId = (await b('GET', '/api/me')).data.user.id;

  const goal = (await a('POST', '/api/goals', { partnership_id: pid, title: 'Eat 180g of protein', icon: 'protein', target_per_week: 7, daily_amount: 180, unit: 'g', step: 0, personal: true, today })).data.goal;
  assert.equal(goal.personal, 1);
  assert.equal((await b('POST', `/api/goals/${goal.id}/respond`, { answer: 'accept', title: 'Eat 130g of protein', daily_amount: 130, today })).status, 200);

  let dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  const mine = dash.habits.find((h) => h.goal_id === goal.id && h.user_id === hankId);
  const his = dash.habits.find((h) => h.goal_id === goal.id && h.user_id === kingId);
  assert.deepEqual([mine.title, mine.daily_amount], ['Eat 180g of protein', 180]);
  assert.deepEqual([his.title, his.daily_amount], ['Eat 130g of protein', 130]);

  // King hits his own 130 g; that's done for him even though Hank's is 180.
  assert.equal((await b('POST', '/api/amounts', { habit_id: his.id, delta: 130, today })).data.done, true);
  assert.equal((await a('POST', '/api/amounts', { habit_id: mine.id, delta: 130, today })).data.done, false);

  // Changing your number is on the record.
  assert.equal((await a('PATCH', `/api/habits/${mine.id}`, { personal: { title: 'Eat 160g of protein', daily_amount: 160 } })).status, 200);
  dash = (await b('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  assert.equal(dash.habits.find((h) => h.id === mine.id).daily_amount, 160);
  assert.equal(dash.events[0].kind, 'amount_changed');
  assert.equal(dash.events[0].message, 'Eat 160g of protein');

  // A regular shared goal's number can't be changed by one person.
  const water = (await a('POST', '/api/goals', { partnership_id: pid, title: 'Drink 1 gallon of water', icon: 'water', target_per_week: 7, daily_amount: 128, unit: 'oz', step: 8, today })).data.goal;
  await b('POST', `/api/goals/${water.id}/respond`, { answer: 'accept', today });
  dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  const myWater = dash.habits.find((h) => h.goal_id === water.id && h.user_id === hankId);
  assert.equal((await a('PATCH', `/api/habits/${myWater.id}`, { personal: { title: 'Drink a cup', daily_amount: 8 } })).status, 400);
});

test('order: each person sets their own goal order', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const a = client(base);
  const b = client(base);
  await a('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await b('POST', '/api/signup', { name: 'King', username: 'king', password: 'password123' });
  const { id: pid, invite_code } = (await a('POST', '/api/partnerships', { today })).data.partnership;
  await b('POST', '/api/partnerships/join', { code: invite_code });

  const add = async (who, title) => (await who('POST', '/api/habits', { partnership_id: pid, title, target_per_week: 3, today })).data.habit.id;
  const read = await add(a, 'Read');
  const pray = await add(a, 'Pray');
  const kings = await add(b, 'Lift');

  // Hank's list, reversed. King's goal id in the list is ignored.
  assert.equal((await a('POST', `/api/partnerships/${pid}/order`, { habit_ids: [pray, read, kings] })).status, 200);
  const dash = (await a('GET', `/api/partnerships/${pid}/dashboard?today=${today}`)).data;
  const pos = (id) => dash.habits.find((h) => h.id === id).position;
  assert.deepEqual([pos(pray), pos(read), pos(kings)], [1, 2, 0]);
  assert.equal((await a('POST', `/api/partnerships/${pid}/order`, { habit_ids: 'nope' })).status, 400);
  assert.equal((await a('POST', `/api/partnerships/${pid}/order`, { habit_ids: ['x'] })).status, 400);
});

test('linked goals: log once, it counts in every pact with the same goal', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const hank = client(base);
  const king = client(base);
  const cash = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await king('POST', '/api/signup', { name: 'King', username: 'king', password: 'password123' });
  await cash('POST', '/api/signup', { name: 'Cash', username: 'cash', password: 'password123' });
  const withKing = (await hank('POST', '/api/partnerships', { name: 'Hank & King', today })).data.partnership;
  await king('POST', '/api/partnerships/join', { code: withKing.invite_code });
  const withCash = (await hank('POST', '/api/partnerships', { name: 'Hank & Cash', today })).data.partnership;
  await cash('POST', '/api/partnerships/join', { code: withCash.invite_code });
  const hankId = (await hank('GET', '/api/me')).data.user.id;

  const shared = async (pact, partner, goal) => {
    const g = (await hank('POST', '/api/goals', { partnership_id: pact.id, today, ...goal })).data.goal;
    await partner('POST', `/api/goals/${g.id}/respond`, { answer: 'accept', today });
    const dash = (await hank('GET', `/api/partnerships/${pact.id}/dashboard?today=${today}`)).data;
    return dash.habits.find((h) => h.goal_id === g.id && h.user_id === hankId);
  };
  const side = async (pact, goal) => (await hank('POST', '/api/habits', { partnership_id: pact.id, today, ...goal })).data.habit;
  const dashFor = async (pact) => (await hank('GET', `/api/partnerships/${pact.id}/dashboard?today=${today}`)).data;
  const doneIn = async (pact, id) => (await dashFor(pact)).checkins.some((c) => c.habit_id === id && c.day === today && c.status === 'done');

  // Water: a gallon with King, half a gallon with Cash. Same ounces, own targets.
  const waterK = await shared(withKing, king, { title: 'Drink 1 gallon of water', icon: 'water', target_per_week: 7, daily_amount: 128, unit: 'oz', step: 8 });
  const waterC = await side(withCash, { title: 'Drink 0.5 gallons of water', icon: 'water', target_per_week: 7, daily_amount: 64, unit: 'oz', step: 8 });
  assert.deepEqual((await dashFor(withKing)).habits.find((h) => h.id === waterK.id).links, ['Hank & Cash']);
  const res = (await hank('POST', '/api/amounts', { habit_id: waterK.id, delta: 64, today })).data;
  assert.deepEqual(res, { amount: 64, total: 64, done: false, also: ['Hank & Cash'] });
  assert.equal((await dashFor(withCash)).amounts.find((a) => a.habit_id === waterC.id).amount, 64);
  assert.equal(await doneIn(withCash, waterC.id), true); // Cash's half gallon is hit
  assert.equal(await doneIn(withKing, waterK.id), false); // King's gallon isn't yet
  // Cash sees it in his feed.
  const cashFeed = (await cash('GET', `/api/partnerships/${withCash.id}/dashboard?today=${today}`)).data.events;
  assert.equal(cashFeed[0].kind, 'done');
  assert.equal(cashFeed[0].actor_id, hankId);

  // Work out in both: done and undo carry over.
  const liftK = await shared(withKing, king, { title: 'Work out', icon: 'workout', target_per_week: 4 });
  const liftC = await shared(withCash, cash, { title: 'Work out', icon: 'workout', target_per_week: 3 });
  assert.deepEqual((await hank('POST', '/api/checkins', { habit_id: liftC.id, status: 'done', today })).data.also, ['Hank & King']);
  assert.equal(await doneIn(withKing, liftK.id), true);
  assert.equal((await hank('POST', '/api/checkins/undo', { habit_id: liftK.id, today })).status, 200);
  assert.equal(await doneIn(withCash, liftC.id), false);

  // Different numbers in the name: not the same goal.
  const read20 = await side(withKing, { title: 'Read 20 pages', icon: 'read', target_per_week: 5 });
  const read10 = await side(withCash, { title: 'Read 10 pages', icon: 'read', target_per_week: 5 });
  assert.deepEqual((await hank('POST', '/api/checkins', { habit_id: read10.id, status: 'done', today })).data.also, []);
  assert.equal(await doneIn(withKing, read20.id), false);

  // A miss carries over to a day with nothing logged.
  await hank('POST', '/api/checkins', { habit_id: liftK.id, status: 'missed', note: 'Sick', today });
  assert.equal((await dashFor(withCash)).checkins.find((c) => c.habit_id === liftC.id && c.day === today).status, 'missed');
  // King's partner-only view doesn't get link info about Hank's other pacts.
  assert.equal((await king('GET', `/api/partnerships/${withKing.id}/dashboard?today=${today}`)).data.habits.find((h) => h.id === waterK.id).links, undefined);
});

test('linked goals: a goal added later starts with what you logged today', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const hank = client(base);
  const king = client(base);
  const kona = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await king('POST', '/api/signup', { name: 'King', username: 'king', password: 'password123' });
  await kona('POST', '/api/signup', { name: 'Kona', username: 'kona', password: 'password123' });
  const withKing = (await hank('POST', '/api/partnerships', { name: 'Hank & King', today })).data.partnership;
  await king('POST', '/api/partnerships/join', { code: withKing.invite_code });
  const withKona = (await hank('POST', '/api/partnerships', { name: 'Hank & Kona', today })).data.partnership;
  await kona('POST', '/api/partnerships/join', { code: withKona.invite_code });
  const water = { title: 'Drink 1 gallon of water', icon: 'water', target_per_week: 7, daily_amount: 128, unit: 'oz', step: 8, today };
  const lift = { title: 'Work out', icon: 'workout', target_per_week: 4, today };

  // 16 oz and a workout logged with King first...
  const w1 = (await hank('POST', '/api/habits', { partnership_id: withKing.id, ...water })).data.habit;
  const l1 = (await hank('POST', '/api/habits', { partnership_id: withKing.id, ...lift })).data.habit;
  await hank('POST', '/api/amounts', { habit_id: w1.id, delta: 16, today });
  await hank('POST', '/api/checkins', { habit_id: l1.id, status: 'done', today });

  // ...then the same goals set up with Kona, as a proposal Kona accepts.
  const g = (await hank('POST', '/api/goals', { partnership_id: withKona.id, ...water })).data.goal;
  await kona('POST', `/api/goals/${g.id}/respond`, { answer: 'accept', today });
  const l2 = (await hank('POST', '/api/habits', { partnership_id: withKona.id, ...lift })).data.habit;

  const dash = (await hank('GET', `/api/partnerships/${withKona.id}/dashboard?today=${today}`)).data;
  const w2 = dash.habits.find((h) => h.goal_id === g.id && h.user_id === w1.user_id);
  assert.equal(dash.amounts.find((a) => a.habit_id === w2.id)?.amount, 16);
  assert.equal(dash.checkins.some((c) => c.habit_id === l2.id && c.status === 'done'), true);
  // Kona's own new water goal starts empty: nothing of his was logged.
  const konasWater = dash.habits.find((h) => h.goal_id === g.id && h.user_id !== w1.user_id);
  assert.equal(dash.amounts.some((a) => a.habit_id === konasWater.id), false);

  // From here on, one log counts in both.
  await hank('POST', '/api/amounts', { habit_id: w2.id, delta: 8, today });
  const kingDash = (await hank('GET', `/api/partnerships/${withKing.id}/dashboard?today=${today}`)).data;
  assert.equal(kingDash.amounts.find((a) => a.habit_id === w1.id).amount, 24);

  // Reset takes today back to 0 in both.
  const r = (await hank('POST', '/api/amounts', { habit_id: w2.id, reset: true, today })).data;
  assert.deepEqual([r.amount, r.also], [0, ['Hank & King']]);
  const after = (await hank('GET', `/api/partnerships/${withKing.id}/dashboard?today=${today}`)).data;
  assert.equal(after.amounts.find((a) => a.habit_id === w1.id).amount, 0);
});

test('leave a pact: your partner keeps it; the last one out deletes it; both undo', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const hank = client(base);
  const king = client(base);
  const jake = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await king('POST', '/api/signup', { name: 'King', username: 'king', password: 'password123' });
  await jake('POST', '/api/signup', { name: 'Jake', username: 'jake', password: 'password123' });
  const pact = (await hank('POST', '/api/partnerships', { name: 'Hank & King', today })).data.partnership;
  await king('POST', '/api/partnerships/join', { code: pact.invite_code });
  const g = (await hank('POST', '/api/goals', { partnership_id: pact.id, title: 'Work out', icon: 'workout', target_per_week: 4, today })).data.goal;
  await king('POST', `/api/goals/${g.id}/respond`, { answer: 'accept', today });
  const open = (await hank('POST', '/api/goals', { partnership_id: pact.id, title: 'Read', target_per_week: 3, today })).data.goal;
  const kingSide = (await king('POST', '/api/habits', { partnership_id: pact.id, title: 'Stretch', target_per_week: 3, today })).data.habit;
  const hankSide = (await hank('POST', '/api/habits', { partnership_id: pact.id, title: 'Journal', target_per_week: 3, today })).data.habit;
  const kingDash = async () => (await king('GET', `/api/partnerships/${pact.id}/dashboard?today=${today}`)).data;

  // Hank leaves.
  const left = (await hank('POST', `/api/partnerships/${pact.id}/leave`, { today })).data;
  assert.equal(left.deleted, false);
  const me = (await hank('GET', '/api/me')).data;
  assert.equal(me.partnerships.length, 0);
  assert.deepEqual(me.left.map((l) => [l.id, l.name, l.deleted]), [[left.undo_id, 'Hank & King', false]]);
  assert.equal((await hank('GET', `/api/partnerships/${pact.id}/dashboard?today=${today}`)).status, 404);

  let dash = await kingDash();
  assert.deepEqual(dash.members.map((m) => m.name), ['King']);
  assert.equal(dash.goals.length, 0); // the shared goal ended, the proposal was withdrawn
  assert.equal(dash.habits.find((h) => h.id === kingSide.id).archived_day, null); // his side goal stays
  assert.equal(dash.habits.find((h) => h.goal_id === g.id && h.user_id !== kingSide.user_id).archived_day, today);
  assert.equal(dash.events[0].kind, 'left');

  // Undo puts it all back, and the "left" line goes away.
  assert.equal((await hank('POST', `/api/leaves/${left.undo_id}/undo`, {})).status, 200);
  assert.equal((await hank('POST', `/api/leaves/${left.undo_id}/undo`, {})).status, 404); // once
  dash = await kingDash();
  assert.deepEqual(dash.members.map((m) => m.name).sort(), ['Hank', 'King']);
  assert.deepEqual(dash.goals.map((x) => [x.id, x.status]), [[g.id, 'active'], [open.id, 'proposed']]);
  assert.equal(dash.habits.filter((h) => h.archived_day).length, 0);
  assert.notEqual(dash.events[0].kind, 'left');
  assert.equal(dash.habits.find((h) => h.id === hankSide.id).archived_day, null);
  assert.equal((await hank('GET', '/api/me')).data.left.length, 0);

  // Can't undo into a pact someone else has taken your spot in.
  const again = (await hank('POST', `/api/partnerships/${pact.id}/leave`, { today })).data;
  await jake('POST', '/api/partnerships/join', { code: pact.invite_code });
  assert.equal((await hank('POST', `/api/leaves/${again.undo_id}/undo`, {})).status, 409);

  // Deleting a pact that's just you can be undone too, and while it's
  // deleted nobody can join it with the code.
  const solo = (await hank('POST', '/api/partnerships', { name: 'Test', today })).data.partnership;
  const del = (await hank('POST', `/api/partnerships/${solo.id}/leave`, { today })).data;
  assert.equal(del.deleted, true);
  assert.equal((await king('POST', '/api/partnerships/join', { code: solo.invite_code })).status, 404);
  assert.equal((await hank('POST', `/api/leaves/${del.undo_id}/undo`, {})).status, 200);
  assert.deepEqual((await hank('GET', '/api/me')).data.partnerships.map((p) => p.name), ['Test']);
});

test('change your password: needs the current one, logs out other devices', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const hank = client(base);
  const otherPhone = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  await otherPhone('POST', '/api/login', { login: 'hank', password: 'password123' });
  assert.equal((await hank('POST', '/api/password', { current: 'wrong-one', password: 'brandnew123' })).status, 400);
  assert.equal((await hank('POST', '/api/password', { current: 'password123', password: 'short' })).status, 400);
  assert.equal((await hank('POST', '/api/password', { current: 'password123', password: 'brandnew123' })).status, 200);
  assert.equal((await hank('GET', '/api/me')).status, 200); // still logged in here
  assert.equal((await otherPhone('GET', '/api/me')).status, 401); // logged out there
  assert.equal((await client(base)('POST', '/api/login', { login: 'hank', password: 'password123' })).status, 401);
  assert.equal((await client(base)('POST', '/api/login', { login: 'hank', password: 'brandnew123' })).status, 200);
});

test('sign up with email; log in with email or an old username; reset by email', async (t) => {
  const sent = [];
  const server = createApp({ sendMail: async (m) => sent.push(m) });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const jake = client(base);
  const jake2 = client(base);
  const old = client(base);

  // Names don't have to be unique; emails do.
  assert.equal((await jake('POST', '/api/signup', { name: 'Jake', email: 'Jake@Example.com ', password: 'password123' })).status, 200);
  assert.equal((await jake2('POST', '/api/signup', { name: 'Jake', email: 'jake.other@example.com', password: 'password123' })).status, 200);
  assert.equal((await client(base)('POST', '/api/signup', { name: 'Imposter', email: 'jake@example.com', password: 'password123' })).status, 409);
  assert.equal((await client(base)('POST', '/api/signup', { name: 'X', email: 'not-an-email', password: 'password123' })).status, 400);
  assert.equal((await client(base)('POST', '/api/login', { login: 'JAKE@example.com', password: 'password123' })).status, 200);

  // Older accounts log in with their username, and can add an email.
  await old('POST', '/api/signup', { name: 'Hank', username: 'hank', password: 'password123' });
  assert.equal((await client(base)('POST', '/api/login', { login: 'hank', password: 'password123' })).status, 200);
  assert.equal((await old('PATCH', '/api/me', { email: 'jake@example.com' })).status, 409);
  assert.equal((await old('PATCH', '/api/me', { email: 'hank@example.com' })).data.user.email, 'hank@example.com');
  assert.equal((await client(base)('POST', '/api/login', { login: 'hank@example.com', password: 'password123' })).status, 200);

  // Forgot password: the same answer for unknown emails, and nothing is sent.
  assert.deepEqual((await client(base)('POST', '/api/forgot', { email: 'nobody@example.com' })).data, { sent: true });
  assert.equal(sent.length, 0);
  assert.deepEqual((await client(base)('POST', '/api/forgot', { email: 'jake@example.com' })).data, { sent: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'jake@example.com');
  const code = /reset code is ([A-Z0-9]{8})/.exec(sent[0].text)[1];
  assert.match(sent[0].text, new RegExp(`/\\?reset=${code}&email=jake%40example.com`));

  const phone = client(base);
  assert.equal((await phone('POST', '/api/reset-password', { login: 'jake@example.com', code, password: 'newpassword1' })).status, 200);
  assert.equal((await jake('GET', '/api/me')).status, 401); // logged out elsewhere
  assert.equal((await client(base)('POST', '/api/login', { login: 'jake@example.com', password: 'newpassword1' })).status, 200);
  assert.equal((await client(base)('POST', '/api/reset-password', { login: 'jake@example.com', code, password: 'again12345' })).status, 400); // once

  // Without email set up on the server, it says to ask a partner.
  const noMail = createApp({ sendMail: null });
  await new Promise((r) => noMail.listen(0, r));
  t.after(() => noMail.close());
  assert.equal((await client(`http://127.0.0.1:${noMail.address().port}`)('POST', '/api/forgot', { email: 'jake@example.com' })).status, 503);
});

test('notifications: who gets buzzed, settings, and the evening reminder', async (t) => {
  const pushes = [];
  let status = 201;
  const server = createApp({ sendPush: async (sub, msg) => (pushes.push({ endpoint: sub.endpoint, ...msg }), status) });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const hank = client(base);
  const king = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', email: 'hank@example.com', password: 'password123' });
  await king('POST', '/api/signup', { name: 'King', email: 'king@example.com', password: 'password123' });
  const pact = (await hank('POST', '/api/partnerships', { name: 'Hank & King', today })).data.partnership;
  await king('POST', '/api/partnerships/join', { code: pact.invite_code });
  const kingId = (await king('GET', '/api/me')).data.user.id;
  const sub = (host, n) => ({ endpoint: `https://${host}/send/${n}`, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } });

  assert.match((await hank('GET', '/api/push/key')).data.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal((await hank('POST', '/api/push/subscribe', { subscription: sub('evil.example.com', 1) })).status, 400);
  assert.equal((await hank('POST', '/api/push/subscribe', { subscription: sub('web.push.apple.com', 'hank'), tz: 'UTC' })).data.user.push_count, 1);
  await king('POST', '/api/push/subscribe', { subscription: sub('fcm.googleapis.com', 'king'), tz: 'America/Regina' }); // UTC-6 all year
  assert.equal((await king('POST', '/api/push/subscribe', { subscription: sub('fcm.googleapis.com', 'x'), tz: 'Mars/Base' })).status, 400);

  // Hank's shared goal and a check-in: King hears about both.
  const g = (await hank('POST', '/api/goals', { partnership_id: pact.id, title: 'Work out', icon: 'workout', target_per_week: 4, today })).data.goal;
  await tick();
  assert.deepEqual(pushes.map((p) => [p.endpoint.split('/').pop(), p.title]), [['king', 'Hank proposed a shared goal']]);
  await king('POST', `/api/goals/${g.id}/respond`, { answer: 'accept', today });
  const dash = (await hank('GET', `/api/partnerships/${pact.id}/dashboard?today=${today}`)).data;
  const mine = dash.habits.find((h) => h.goal_id === g.id && h.user_id !== kingId);
  pushes.length = 0;
  await hank('POST', '/api/checkins', { habit_id: mine.id, status: 'done', today });
  await tick();
  // Not "Hank did Work out": that was his last goal today, so King hears he's done for the day.
  assert.deepEqual(pushes.map((p) => [p.endpoint.split('/').pop(), p.title, p.body]), [['king', 'Hank hit every goal today', 'Your move. Hank & King']]);

  // Once a day: undoing and redoing it doesn't buzz King again.
  pushes.length = 0;
  await hank('POST', '/api/checkins/undo', { habit_id: mine.id, today });
  await hank('POST', '/api/checkins', { habit_id: mine.id, status: 'done', today });
  await tick();
  assert.equal(pushes.length, 0);

  // A wake-up says the time it was for.
  const late = { mon: '23:59', tue: '23:59', wed: '23:59', thu: '23:59', fri: '23:59', sat: '23:59', sun: '23:59' }; // always still open
  const wake = (await hank('POST', '/api/habits', { partnership_id: pact.id, title: 'Wake up', icon: 'wake', target_per_week: 7, schedule: late, today })).data.habit;
  const side = (await hank('POST', '/api/habits', { partnership_id: pact.id, title: 'Read', target_per_week: 7, today })).data.habit;
  await tick();
  pushes.length = 0;
  await hank('POST', '/api/checkins', { habit_id: wake.id, status: 'done', today });
  await tick();
  assert.deepEqual(pushes.map((p) => [p.title, p.body]), [['Hank is up', 'Wake-up by 11:59 PM, logged. Hank & King']]);
  // Other goals and misses don't buzz.
  pushes.length = 0;
  await hank('POST', '/api/checkins', { habit_id: side.id, status: 'missed', note: 'Too tired', today });
  await tick();
  assert.equal(pushes.length, 0);

  // King turns partner activity off: no more wake-ups, but nudges still land.
  await king('PATCH', '/api/me', { notify_partner: false });
  pushes.length = 0;
  await hank('POST', '/api/checkins/undo', { habit_id: wake.id, today });
  await hank('POST', '/api/checkins', { habit_id: wake.id, status: 'done', today });
  await hank('POST', `/api/partnerships/${pact.id}/nudges`, { kind: 'nudge', to_user_id: kingId, habit_id: dash.habits.find((h) => h.goal_id === g.id && h.user_id === kingId).id });
  await tick();
  assert.deepEqual(pushes.map((p) => [p.endpoint.split('/').pop(), p.title, p.body]), [['king', 'Hank nudged you', 'About Work out']]);

  // The test button reaches your own phone; a dead subscription is dropped.
  pushes.length = 0;
  assert.equal((await hank('POST', '/api/push/test', {})).data.sent, 1);
  status = 410;
  assert.equal((await hank('POST', '/api/push/test', {})).status, 502);
  assert.equal((await hank('GET', '/api/me')).data.user.push_count, 0);
  status = 201;

  // Evening reminder: King (8pm his time) with his workout still open.
  const at = (hhmm) => new Date(`${today}T${hhmm}:00-06:00`);
  pushes.length = 0;
  await server.runReminders(at('19:59'));
  assert.equal(pushes.length, 0); // not yet
  await server.runReminders(at('20:01'));
  assert.deepEqual(pushes.map((p) => [p.title, p.body]), [['1 goal left today', 'Work out. Hank is counting on you.']]);
  await server.runReminders(at('20:30'));
  assert.equal(pushes.length, 1); // once a day

  // Reminder off, or everything done: nothing.
  await king('PATCH', '/api/me', { remind_at: null });
  assert.equal((await king('GET', '/api/me')).data.user.remind_at, null);
  assert.equal((await king('PATCH', '/api/me', { remind_at: '25:00' })).status, 400);
});

test('invite links: who invited you, and dead links', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const hank = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', email: 'hank@example.com', password: 'password123' });
  const pact = (await hank('POST', '/api/partnerships', { name: 'Hank & Cash', today })).data.partnership;
  const stranger = client(base); // not logged in
  assert.deepEqual((await stranger('GET', `/api/invite?code=${pact.invite_code.toLowerCase()}`)).data, { name: 'Hank & Cash', from: 'Hank', full: false });
  assert.equal((await stranger('GET', '/api/invite?code=NOPE99')).status, 404);
  const cash = client(base);
  await cash('POST', '/api/signup', { name: 'Cash', email: 'cash@example.com', password: 'password123' });
  await cash('POST', '/api/partnerships/join', { code: pact.invite_code });
  assert.equal((await stranger('GET', `/api/invite?code=${pact.invite_code}`)).data.full, true);
});

test('rename a pact: only for you', async (t) => {
  const pushes = [];
  const server = createApp({ sendPush: async (sub, msg) => (pushes.push({ to: sub.endpoint, ...msg }), 201) });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const hank = client(base);
  const king = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', email: 'hank@example.com', password: 'password123' });
  await king('POST', '/api/signup', { name: 'King', email: 'king@example.com', password: 'password123' });
  const pact = (await hank('POST', '/api/partnerships', { name: 'Hank & King', today })).data.partnership;
  await king('POST', '/api/partnerships/join', { code: pact.invite_code });
  await hank('PATCH', `/api/partnerships/${pact.id}`, { name: 'King' });
  await king('PATCH', `/api/partnerships/${pact.id}`, { name: 'Hank' });
  const nameFor = async (who) => [(await who('GET', '/api/me')).data.partnerships[0].name, (await who('GET', `/api/partnerships/${pact.id}/dashboard?today=${today}`)).data.partnership.name];
  assert.deepEqual(await nameFor(hank), ['King', 'King']);
  assert.deepEqual(await nameFor(king), ['Hank', 'Hank']);

  // King's phone says "Hank", his name for it.
  await king('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/send/king', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } } });
  const h = (await hank('POST', '/api/habits', { partnership_id: pact.id, title: 'Read', target_per_week: 3, today })).data.habit;
  await hank('POST', '/api/checkins', { habit_id: h.id, status: 'done', today });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(pushes.map((p) => [p.title, p.body]), [['Hank hit every goal today', 'Your move. Hank']]);

  // Blank goes back to the name it started with; too long is refused.
  await hank('PATCH', `/api/partnerships/${pact.id}`, { name: '  ' });
  assert.deepEqual(await nameFor(hank), ['Hank & King', 'Hank & King']);
  assert.equal((await hank('PATCH', `/api/partnerships/${pact.id}`, { name: 'x'.repeat(61) })).status, 400);
});

test('plan your days: private to you, carried to linked goals', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const hank = client(base);
  const king = client(base);
  const kona = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', email: 'hank@example.com', password: 'password123' });
  await king('POST', '/api/signup', { name: 'King', email: 'king@example.com', password: 'password123' });
  await kona('POST', '/api/signup', { name: 'Kona', email: 'kona@example.com', password: 'password123' });
  const a = (await hank('POST', '/api/partnerships', { today })).data.partnership;
  await king('POST', '/api/partnerships/join', { code: a.invite_code });
  const b = (await hank('POST', '/api/partnerships', { today })).data.partnership;
  await kona('POST', '/api/partnerships/join', { code: b.invite_code });
  const g = (await hank('POST', '/api/goals', { partnership_id: a.id, title: 'Work out', icon: 'workout', target_per_week: 4, today })).data.goal;
  await king('POST', `/api/goals/${g.id}/respond`, { answer: 'accept', today });
  const other = (await hank('POST', '/api/habits', { partnership_id: b.id, title: 'Work out', icon: 'workout', target_per_week: 4, today })).data.habit;
  const mine = (await hank('GET', `/api/partnerships/${a.id}/dashboard?today=${today}`)).data.habits.find((h) => h.goal_id === g.id && h.user_id === other.user_id);

  assert.equal((await hank('PATCH', `/api/habits/${mine.id}`, { plan: { mon: ' Push ', tue: 'Legs', wed: '', sun: 'x'.repeat(41) } })).status, 400);
  assert.equal((await hank('PATCH', `/api/habits/${mine.id}`, { plan: { fri: 'Arms', mon: ' Push ', tue: 'Legs', wed: '' } })).status, 200);
  const plan = (who, pid, id) => who('GET', `/api/partnerships/${pid}/dashboard?today=${today}`).then((r) => r.data.habits.find((h) => h.id === id).plan);
  assert.equal(await plan(hank, a.id, mine.id), '{"mon":"Push","tue":"Legs","fri":"Arms"}');
  assert.equal(await plan(hank, b.id, other.id), '{"mon":"Push","tue":"Legs","fri":"Arms"}'); // same workout in the other pact
  assert.equal(await plan(king, a.id, mine.id), ''); // King doesn't see it
  assert.equal((await hank('PATCH', `/api/habits/${mine.id}`, { plan: { mon: 'Nope', bogus: 'x' } })).status, 400);
  // Not for amount goals.
  const water = (await hank('POST', '/api/habits', { partnership_id: a.id, title: 'Water', icon: 'water', target_per_week: 7, daily_amount: 128, unit: 'oz', step: 8, today })).data.habit;
  assert.equal((await hank('PATCH', `/api/habits/${water.id}`, { plan: { mon: 'x' } })).status, 400);
});

test('wake-up: counts only if logged by 10 minutes past your time, that morning', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const hank = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', email: 'hank@example.com', password: 'password123' });
  const pact = (await hank('POST', '/api/partnerships', { today })).data.partnership;
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const at = (time) => Object.fromEntries(days.map((d) => [d, time]));
  const wake = async (schedule) => (await hank('POST', '/api/habits', { partnership_id: pact.id, title: 'Wake up', icon: 'wake', target_per_week: 7, schedule, today })).data.habit;
  const log = (h, extra = {}) => hank('POST', '/api/checkins', { habit_id: h.id, status: 'done', today, tz: 'UTC', ...extra });

  // Before your time (here 11:59 PM, so always): counts.
  assert.equal((await log(await wake(at('23:59')))).status, 200);

  // Past the window: refused, but a miss can still be logged.
  const nowMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  if (nowMin > 11) {
    const early = await wake(at('00:00'));
    const res = await log(early);
    assert.equal(res.status, 400);
    assert.match(res.data.error, /window closed at 12:10 AM/);
    assert.equal((await hank('POST', '/api/checkins', { habit_id: early.id, status: 'missed', note: 'Slept in', today })).status, 200);
  }

  // A day with no time is a day off: logging it is fine.
  const dayKey = days[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7];
  const off = await wake(Object.fromEntries(days.filter((d) => d !== dayKey).map((d) => [d, '00:00'])));
  assert.equal((await log(off)).status, 200);
});

test('protein: type your total so far, and it updates to that', async (t) => {
  const server = createApp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const today = L.utcToday();
  const hank = client(base);
  await hank('POST', '/api/signup', { name: 'Hank', email: 'hank@example.com', password: 'password123' });
  const a = (await hank('POST', '/api/partnerships', { name: 'A', today })).data.partnership;
  const b = (await hank('POST', '/api/partnerships', { name: 'B', today })).data.partnership;
  const goal = { title: 'Eat 185g of protein', icon: 'protein', target_per_week: 7, daily_amount: 185, unit: 'g', today };
  const pa = (await hank('POST', '/api/habits', { partnership_id: a.id, ...goal })).data.habit;
  const pb = (await hank('POST', '/api/habits', { partnership_id: b.id, ...goal })).data.habit;
  const set = (n) => hank('POST', '/api/amounts', { habit_id: pa.id, set: n, today }).then((r) => r.data);

  assert.deepEqual(await set(30), { amount: 30, total: 30, done: false, also: ['B'] });
  assert.deepEqual(await set(170), { amount: 170, total: 170, done: false, also: ['B'] }); // not 200
  assert.equal((await set(190)).done, true);
  assert.equal((await set(150)).done, false); // typo fixed: back under, not done
  const dash = (await hank('GET', `/api/partnerships/${b.id}/dashboard?today=${today}`)).data;
  assert.equal(dash.amounts.find((x) => x.habit_id === pb.id).amount, 150); // the linked pact matches exactly
  assert.equal((await hank('POST', '/api/amounts', { habit_id: pa.id, set: -5, today })).status, 400);
});
