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

test('pairStreak needs both people every week', () => {
  const habits = [habit({ id: 1, user_id: 1, target_per_week: 1 }), habit({ id: 2, user_id: 2, target_per_week: 1 })];
  const checkins = [
    done(1, '2026-09-08'), done(2, '2026-09-09'), // week of 9/7: both
    done(1, '2026-09-15'), done(2, '2026-09-16'), // week of 9/14: both
    done(1, '2026-09-22'), // week of 9/21 (current): only user 1 so far
  ];
  const s = L.pairStreak([1, 2], habits, checkins, '2026-09-26', '2026-09-01');
  assert.deepEqual(s, { weeks: 2, currentWeekMet: false });

  const s2 = L.pairStreak([1, 2], habits, [...checkins, done(2, '2026-09-26')], '2026-09-26', '2026-09-01');
  assert.deepEqual(s2, { weeks: 3, currentWeekMet: true });

  // One partner slacking in the middle resets it.
  const s3 = L.pairStreak([1, 2], habits, checkins.filter((c) => !(c.habit_id === 2 && c.day === '2026-09-16')), '2026-09-26', '2026-09-01');
  assert.equal(s3.weeks, 0);
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
