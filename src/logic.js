'use strict';

// Pure date + scoring logic. Days are 'YYYY-MM-DD' strings in the user's local
// calendar; all arithmetic is done in UTC so there are no DST surprises.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86400000;

function isValidDay(s) {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Number of days from a to b (b - a).
function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / MS_PER_DAY);
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// Weeks run Monday to Sunday.
function weekStart(day) {
  const dow = new Date(day + 'T00:00:00Z').getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

// What a habit is on the hook for in the week starting `start`.
// - Created mid-week: target is capped by the days left, so a new habit is never
//   an automatic fail.
// - Archived mid-week: that week still counts. Quitting doesn't erase a bad week.
function effectiveTarget(habit, start) {
  const end = addDays(start, 6);
  if (habit.created_day > end) return 0;
  if (habit.archived_day && habit.archived_day <= start) return 0;
  const firstDay = habit.created_day > start ? habit.created_day : start;
  return Math.min(habit.target_per_week, availableDays(habit, firstDay, end));
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseSchedule(schedule) {
  if (!schedule) return null;
  if (typeof schedule === 'object') return schedule;
  try {
    return JSON.parse(schedule);
  } catch {
    return null;
  }
}

// Days from `from` to `to` (inclusive) the habit can be done on. With a
// schedule, only days that have a time count; days off don't.
function availableDays(habit, from, to) {
  const sched = parseSchedule(habit.schedule);
  if (!sched) return daysBetween(from, to) + 1;
  let n = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (sched[WEEKDAY_KEYS[new Date(day + 'T00:00:00Z').getUTCDay()]]) n++;
  }
  return n;
}

function scoreWeek(memberIds, habits, checkins, start) {
  const end = addDays(start, 6);
  const done = new Map();
  for (const c of checkins) {
    if (c.status === 'done' && c.day >= start && c.day <= end) {
      done.set(c.habit_id, (done.get(c.habit_id) || 0) + 1);
    }
  }
  const members = {};
  for (const id of memberIds) members[id] = { habits: [], met: false };
  for (const h of habits) {
    const m = members[h.user_id];
    if (!m) continue;
    const target = effectiveTarget(h, start);
    if (target === 0) continue;
    const count = done.get(h.id) || 0;
    m.habits.push({ habit_id: h.id, done: count, target, met: count >= target });
  }
  // A member with nothing on the line hasn't met anything.
  for (const id of memberIds) {
    const m = members[id];
    m.met = m.habits.length > 0 && m.habits.every((h) => h.met);
  }
  const allMet = memberIds.length > 0 && memberIds.every((id) => members[id].met);
  return { start, end, members, allMet };
}

// Consecutive weeks where EVERY member hit EVERY target. The current week only
// adds to the streak once it's already won; it never breaks it while in progress.
function pairStreak(memberIds, habits, checkins, today, sinceDay) {
  const current = weekStart(today);
  const floor = weekStart(sinceDay);
  const currentWeekMet = scoreWeek(memberIds, habits, checkins, current).allMet;
  let weeks = 0;
  for (let w = addDays(current, -7), i = 0; w >= floor && i < 520; w = addDays(w, -7), i++) {
    if (!scoreWeek(memberIds, habits, checkins, w).allMet) break;
    weeks++;
  }
  return { weeks: weeks + (currentWeekMet ? 1 : 0), currentWeekMet };
}

const api = {
  isValidDay,
  addDays,
  daysBetween,
  utcToday,
  weekStart,
  effectiveTarget,
  availableDays,
  scoreWeek,
  pairStreak,
};

// Shared with the browser preview build (public/demo.js).
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.AALogic = api;
