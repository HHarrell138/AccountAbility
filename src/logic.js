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

// A weekly amount goal (run 15 mi a week) in the week starting `start`. The
// week it was created in is scaled to the days left, like effectiveTarget.
function weeklyAmountTarget(habit, start) {
  const end = addDays(start, 6);
  const first = habit.created_day > start ? habit.created_day : start;
  const days = daysBetween(first, end) + 1;
  return days >= 7 ? habit.daily_amount : Math.round(((habit.daily_amount * days) / 7) * 10) / 10;
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

// ---------- the pair streak ----------
//
// Each week is scored as one combined bar. Every shared goal earns credit as
// you go: Work out 3 of 4 days is 75% of that goal, and a weekly run counts
// the miles logged so far (never more than 100% per goal). Your share is the
// average across your goals, and the pair's bar averages the two of you, so
// each fills half: you at 100% and your partner at 0% is 50%, and 100% takes
// both of you hitting everything.
//
//   100%    -> green; three 100% weeks in a row -> gold (and it stays gold)
//   70-99%  -> streak lives but drops a level: gold -> green, green -> blue
//   under 70% -> the streak breaks; the next 70%+ week restarts it at blue,
//                or at green if it's a 100% week
//
// The current week can only help: it adds a week once it reaches 70%, and
// upgrades the color at 100%, but drops and breaks wait until it's over.

const STREAK_MIN = 0.7;
const GOLD_RUN = 3;

function weekPercent(memberIds, habits, checkins, start, amounts = []) {
  const s = scoreWeek(memberIds, habits, checkins, start);
  const end = addDays(start, 6);
  const byId = new Map(habits.map((h) => [h.id, h]));
  // How far along one goal is this week, from 0 to 1.
  const progress = (x) => {
    if (x.met) return 1;
    const h = byId.get(x.habit_id);
    if (h.amount_period === 'week' && h.daily_amount > 0) {
      const total = amounts.filter((a) => a.habit_id === h.id && a.day >= start && a.day <= end).reduce((t, a) => t + a.amount, 0);
      return Math.min(1, total / weeklyAmountTarget(h, start));
    }
    return Math.min(1, x.done / x.target);
  };
  const members = {};
  for (const id of memberIds) {
    const hs = s.members[id].habits;
    const target = hs.length;
    const done = hs.filter((h) => h.met).length;
    members[id] = { done, target, pct: target ? hs.reduce((t, x) => t + progress(x), 0) / target : null };
  }
  const pcts = memberIds.map((id) => members[id].pct);
  const pct = pcts.length && pcts.every((p) => p !== null) ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  return { start, members, pct };
}

function nextTier(tier, fullRun, pct) {
  if (pct === null || pct < STREAK_MIN) return { tier: null, fullRun: 0 };
  if (pct >= 1) {
    const run = fullRun + 1;
    return { tier: run >= GOLD_RUN ? 'gold' : 'green', fullRun: run };
  }
  return { tier: tier === 'gold' ? 'green' : 'blue', fullRun: 0 };
}

function pairStreak(memberIds, habits, checkins, today, sinceDay, amounts = []) {
  const current = weekStart(today);
  let w = weekStart(sinceDay);
  if (daysBetween(w, current) > 7 * 520) w = addDays(current, -7 * 520);
  let tier = null;
  let fullRun = 0;
  let weeks = 0;
  const history = [];
  for (; w < current; w = addDays(w, 7)) {
    const { pct } = weekPercent(memberIds, habits, checkins, w, amounts);
    ({ tier, fullRun } = nextTier(tier, fullRun, pct));
    weeks = tier ? weeks + 1 : 0;
    history.push({ start: w, pct, tier });
  }
  const thisWeek = weekPercent(memberIds, habits, checkins, current, amounts);
  let shownTier = tier;
  let shownWeeks = weeks;
  let shownRun = fullRun;
  if (thisWeek.pct !== null && thisWeek.pct >= STREAK_MIN) {
    shownWeeks += 1;
    if (thisWeek.pct >= 1) ({ tier: shownTier, fullRun: shownRun } = nextTier(tier, fullRun, 1));
    else if (!tier) shownTier = 'blue';
  }
  return {
    weeks: shownWeeks,
    tier: shownTier,
    fullRun: shownRun, // perfect weeks in a row, for "N more for gold"
    goldRun: GOLD_RUN,
    currentWeekMet: thisWeek.pct !== null && thisWeek.pct >= 1,
    thisWeek,
    history: history.slice(-8),
  };
}

// Which days you can still log: today, any earlier day this week, and
// yesterday (so Monday can fix Sunday). Anything but today is marked late.
// Earlier weeks are closed; their streak is already scored.
function canLog(day, today) {
  if (!isValidDay(day) || day > today) return false;
  return day >= weekStart(today) || day === addDays(today, -1);
}

// ---------- the weekly recap ----------
//
// How one week went for the pair, goal by goal: each shared goal's combined
// progress (the partners averaged, like the streak bar), plus every miss
// with its reason. `habits` are the pact's shared-goal rows.
function weekRecap(memberIds, habits, checkins, amounts, start) {
  const end = addDays(start, 6);
  const byGoal = new Map();
  for (const h of habits) {
    if (!memberIds.includes(h.user_id)) continue;
    const p = weekPercent([h.user_id], [h], checkins, start, amounts).pct;
    if (p === null) continue; // not on the hook that week
    if (!byGoal.has(h.goal_id)) byGoal.set(h.goal_id, { goal_id: h.goal_id, icon: h.icon, rows: [] });
    byGoal.get(h.goal_id).rows.push({ user_id: h.user_id, habit_id: h.id, title: h.title, pct: p });
  }
  const goals = [...byGoal.values()].map((g) => ({ ...g, pct: g.rows.reduce((t, r) => t + r.pct, 0) / g.rows.length }));
  const ids = new Set(habits.map((h) => h.id));
  const misses = checkins
    .filter((c) => c.status === 'missed' && ids.has(c.habit_id) && c.day >= start && c.day <= end)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((c) => ({ habit_id: c.habit_id, user_id: habits.find((h) => h.id === c.habit_id).user_id, day: c.day, note: c.note || '' }));
  return { start, end, pct: weekPercent(memberIds, habits, checkins, start, amounts).pct, goals, misses };
}

const api = {
  isValidDay,
  addDays,
  daysBetween,
  utcToday,
  weekStart,
  effectiveTarget,
  availableDays,
  weeklyAmountTarget,
  scoreWeek,
  weekPercent,
  nextTier,
  pairStreak,
  weekRecap,
  canLog,
};

// Shared with the browser preview build (public/demo.js).
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.AALogic = api;
