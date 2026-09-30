'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/logic');

const habit = (over = {}) => ({ id: 1, user_id: 1, target_per_week: 3, created_day: '2026-01-01', archived_day: null, ...over });
const done = (habit_id, day) => ({ habit_id, day, status: 'done' });

test('weekStart is Monday', () => {
  assert.equal(L.weekStart('2026-09-26'), '2026-09-21'); // Saturday
  assert.equal(L.weekStart('2026-09-21'), '2026-09-21'); // Monday
  assert.equal(L.weekStart('2026-09-27'), '2026-09-21'); // Sunday
});

test('isValidDay rejects junk', () => {
  assert.ok(L.isValidDay('2026-02-28'));
  assert.ok(!L.isValidDay('2026-02-30'));
  assert.ok(!L.isValidDay('26-2-3'));
  assert.ok(!L.isValidDay(null));
});

test('habit created mid-week gets a capped target', () => {
  const h = habit({ target_per_week: 7, created_day: '2026-09-25' }); // Friday
  assert.equal(L.effectiveTarget(h, '2026-09-21'), 3);
  assert.equal(L.effectiveTarget(h, '2026-09-28'), 7);
  assert.equal(L.effectiveTarget(h, '2026-09-14'), 0);
});

test('archiving mid-week still counts that week', () => {
  const h = habit({ archived_day: '2026-09-24' });
  assert.equal(L.effectiveTarget(h, '2026-09-21'), 3);
  assert.equal(L.effectiveTarget(h, '2026-09-28'), 0);
});

test('scoreWeek: a member with no habits has not met anything', () => {
  const s = L.scoreWeek([1, 2], [habit()], [done(1, '2026-09-21'), done(1, '2026-09-22'), done(1, '2026-09-23')], '2026-09-21');
  assert.equal(s.members[1].met, true);
  assert.equal(s.members[2].met, false);
  assert.equal(s.allMet, false);
});

test('pairStreak counts weeks where both of you hit 70% or more', () => {
  const habits = [habit({ id: 1, user_id: 1, target_per_week: 1 }), habit({ id: 2, user_id: 2, target_per_week: 1 })];
  const checkins = [
    done(1, '2026-09-08'), done(2, '2026-09-09'), // week of 9/7: both
    done(1, '2026-09-15'), done(2, '2026-09-16'), // week of 9/14: both
    done(1, '2026-09-22'), // week of 9/21 (current): only user 1 so far
  ];
  const s = L.pairStreak([1, 2], habits, checkins, '2026-09-26', '2026-09-01');
  assert.equal(s.weeks, 2);
  assert.equal(s.tier, 'green');
  assert.equal(s.currentWeekMet, false);

  // Third perfect week in a row turns it gold.
  const s2 = L.pairStreak([1, 2], habits, [...checkins, done(2, '2026-09-26')], '2026-09-26', '2026-09-01');
  assert.deepEqual([s2.weeks, s2.tier, s2.currentWeekMet], [3, 'gold', true]);

  // One partner under 70% in the middle breaks it.
  const s3 = L.pairStreak([1, 2], habits, checkins.filter((c) => !(c.habit_id === 2 && c.day === '2026-09-16')), '2026-09-26', '2026-09-01');
  assert.equal(s3.weeks, 0);
  assert.equal(s3.tier, null);
});

test('streak colors: gold after 3 perfect weeks, drop a level at 70-99%, break under 70%', () => {
  const step = (tier, run, pct) => L.nextTier(tier, run, pct);
  let t = { tier: null, fullRun: 0 };
  const walk = (pcts) => pcts.map((p) => (t = step(t.tier, t.fullRun, p)).tier);
  assert.deepEqual(walk([0.8, 1, 1, 1, 1]), ['blue', 'green', 'green', 'gold', 'gold']);
  assert.deepEqual(walk([0.9]), ['green']); // gold drops one level
  assert.deepEqual(walk([0.75]), ['blue']); // green drops to blue
  assert.deepEqual(walk([0.7]), ['blue']); // blue stays blue
  assert.deepEqual(walk([0.5]), [null]); // under 70% breaks it
  assert.deepEqual(walk([1]), ['green']); // a perfect week restarts at green
  t = { tier: null, fullRun: 0 };
  assert.deepEqual(walk([0.69, 0.7]), [null, 'blue']); // 70% restarts at blue
});

test('one combined bar, with credit for every day logged', () => {
  // You: 5 of 6 days on one goal, 4 of 4 on the other. Partner: 7 of 7.
  // Your share: (5/6 + 1) / 2. The bar averages the two of you.
  const habits = [
    habit({ id: 1, user_id: 1, target_per_week: 6 }),
    habit({ id: 2, user_id: 1, target_per_week: 4 }),
    habit({ id: 3, user_id: 2, target_per_week: 7 }),
  ];
  const week = '2026-09-14';
  const days = (n) => Array.from({ length: n }, (_, i) => L.addDays(week, i));
  const checkins = [
    ...days(5).map((d) => done(1, d)),
    ...days(4).map((d) => done(2, d)),
    ...days(7).map((d) => done(3, d)),
  ];
  const w = L.weekPercent([1, 2], habits, checkins, week);
  assert.deepEqual([w.members[1].done, w.members[1].target, w.members[1].pct], [1, 2, (5 / 6 + 1) / 2]); // 1 of 2 fully hit, but 5/6 still counts
  assert.equal(w.members[2].pct, 1);
  assert.equal(w.pct, ((5 / 6 + 1) / 2 + 1) / 2);

  // The bar moves with each day: after 2 workouts of 4, that goal is half done.
  const midweek = L.weekPercent([1, 2], [habit({ id: 2, user_id: 1, target_per_week: 4 }), habit({ id: 3, user_id: 2, target_per_week: 4 })], days(2).map((d) => done(2, d)), week);
  assert.equal(midweek.pct, 0.25);

  // A weekly run counts miles as they're logged.
  const run = habit({ id: 4, user_id: 1, target_per_week: 1, daily_amount: 20, amount_period: 'week' });
  const rest = habit({ id: 5, user_id: 2, target_per_week: 1 });
  const miles = L.weekPercent([1, 2], [run, rest], [done(5, week)], week, [{ habit_id: 4, day: week, amount: 5 }, { habit_id: 4, day: L.addDays(week, 2), amount: 10 }]);
  assert.equal(miles.members[1].pct, 0.75);
  assert.equal(miles.pct, 0.875);

  // One of you doing everything and the other nothing is half the bar, not a streak.
  const solo = L.weekPercent([1, 2], habits, days(7).map((d) => done(3, d)), week);
  assert.equal(solo.pct, 0.5);
});

test('scheduled habits only count days that have a time', () => {
  // Weekdays only, created on a Saturday: nothing left this week, 5 next week.
  const h = habit({ target_per_week: 5, created_day: '2026-09-26', schedule: JSON.stringify({ mon: '06:45', tue: '06:45', wed: '06:45', thu: '06:45', fri: '06:45' }) });
  assert.equal(L.effectiveTarget(h, '2026-09-21'), 0);
  assert.equal(L.effectiveTarget(h, '2026-09-28'), 5);
  // Created on a Sunday with Sat-Sun scheduled: just Sunday left.
  const weekend = habit({ target_per_week: 2, created_day: '2026-09-27', schedule: { sat: '09:00', sun: '09:00' } });
  assert.equal(L.effectiveTarget(weekend, '2026-09-21'), 1);
  assert.equal(L.availableDays(weekend, '2026-09-21', '2026-09-27'), 2);
});

test('weekRecap: each goal combined, misses with reasons', () => {
  const week = '2026-09-14';
  const day = (i) => L.addDays(week, i);
  const habits = [
    habit({ id: 1, user_id: 1, goal_id: 10, icon: 'workout', title: 'Work out', target_per_week: 4 }),
    habit({ id: 2, user_id: 2, goal_id: 10, icon: 'workout', title: 'Work out', target_per_week: 4 }),
    habit({ id: 3, user_id: 1, goal_id: 11, icon: 'run', title: 'Run', target_per_week: 1, daily_amount: 10, amount_period: 'week' }),
    habit({ id: 4, user_id: 2, goal_id: 11, icon: 'run', title: 'Run', target_per_week: 1, daily_amount: 10, amount_period: 'week' }),
  ];
  const checkins = [
    ...[0, 1, 2, 3].map((i) => done(1, day(i))),
    ...[0, 2, 4].map((i) => done(2, day(i))),
    { habit_id: 2, day: day(5), status: 'missed', note: 'Double shift' },
    { habit_id: 2, day: L.addDays(week, 8), status: 'missed', note: 'next week, not counted' },
  ];
  const amounts = [{ habit_id: 3, day: day(1), amount: 10 }, { habit_id: 4, day: day(2), amount: 3 }];
  const r = L.weekRecap([1, 2], habits, checkins, amounts, week);
  assert.deepEqual(r.goals.map((g) => [g.goal_id, g.pct]), [[10, 0.875], [11, 0.65]]);
  assert.deepEqual(r.misses, [{ habit_id: 2, user_id: 2, day: day(5), note: 'Double shift' }]);
  assert.equal(r.pct, (1 + (0.75 + 0.3) / 2) / 2);
});
