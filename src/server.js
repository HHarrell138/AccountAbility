'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('./db');
const L = require('./logic');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_COOKIE = 'aa_session';
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_BODY = 16 * 1024;
const NUDGES_PER_DAY = 10;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// Must match the icon keys in public/app.js.
const HABIT_ICONS = ['check', 'water', 'protein', 'calories', 'calorie-cap', 'workout', 'steps', 'read', 'sleep', 'wake', 'run', 'prayer'];
const round2 = (n) => Math.round(n * 100) / 100;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => {
  throw new HttpError(status, message);
};

// ---------- input helpers ----------

function str(value, field, { min = 0, max = 200, required = true } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail(400, `${field} must be text`);
  const v = value.trim();
  if (required && v.length === 0) fail(400, `${field} is required`);
  if (v.length < min) fail(400, `${field} must be at least ${min} characters`);
  if (v.length > max) fail(400, `${field} must be at most ${max} characters`);
  return v;
}

function int(value, field, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${field} must be a whole number from ${min} to ${max}`);
  return n;
}

// The client sends its local calendar day. Accept it only if it's plausibly
// "today" somewhere on Earth relative to the server clock.
function clientToday(value) {
  if (!L.isValidDay(value)) fail(400, 'today must be YYYY-MM-DD');
  if (Math.abs(L.daysBetween(L.utcToday(), value)) > 1) fail(400, 'today is out of range; check your device clock');
  return value;
}

// ---------- auth ----------

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(req, token, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

function inviteCode() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

// ---------- app ----------

function createApp({ dbFile = ':memory:' } = {}) {
  const db = openDb(dbFile);
  const q = (sql) => db.prepare(sql);

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // Failed logins per client IP + username, so nobody can guess passwords all day.
  const loginFailures = new Map();
  const loginKey = (req, username) =>
    `${(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()}|${username}`;
  function loginBlocked(key) {
    const f = loginFailures.get(key);
    if (!f) return false;
    if (Date.now() - f.first > LOGIN_WINDOW_MS) {
      loginFailures.delete(key);
      return false;
    }
    return f.count >= LOGIN_MAX_FAILURES;
  }
  function recordLoginFailure(key) {
    const f = loginFailures.get(key);
    if (!f || Date.now() - f.first > LOGIN_WINDOW_MS) loginFailures.set(key, { first: Date.now(), count: 1 });
    else f.count++;
  }

  q('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());

  function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    q('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_TTL_MS);
    res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_TTL_MS / 1000));
  }

  function currentUser(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const row = q(
      `SELECT u.id, u.name, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    ).get(token, Date.now());
    return row || null;
  }

  function requireMember(partnershipId, userId) {
    const p = q(
      `SELECT p.* FROM partnerships p JOIN memberships m ON m.partnership_id = p.id
       WHERE p.id = ? AND m.user_id = ?`
    ).get(partnershipId, userId);
    if (!p) fail(404, 'Partnership not found');
    return p;
  }

  function ownHabit(habitId, userId) {
    const h = q('SELECT * FROM habits WHERE id = ?').get(habitId);
    if (!h || h.user_id !== userId) fail(404, 'Habit not found');
    return h;
  }

  function memberIds(partnershipId) {
    return q('SELECT user_id FROM memberships WHERE partnership_id = ? ORDER BY joined_at, user_id')
      .all(partnershipId)
      .map((r) => r.user_id);
  }

  function addEvent(e) {
    q(
      `INSERT INTO events (partnership_id, actor_id, target_id, habit_id, checkin_id, kind, message, day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(e.partnership_id, e.actor_id, e.target_id ?? null, e.habit_id ?? null, e.checkin_id ?? null, e.kind, e.message ?? '', e.day ?? null);
  }

  // ---------- handlers ----------

  const routes = [];
  const route = (method, pattern, handler, { auth = true } = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d+)')) + '$');
    routes.push({ method, re, keys, handler, auth });
  };

  route('POST', '/api/signup', ({ body, req, res }) => {
    const name = str(body.name, 'Name', { max: 40 });
    const username = str(body.username, 'Username', { min: 3, max: 30 }).toLowerCase();
    if (!/^[a-z0-9_.]+$/.test(username)) fail(400, 'Username can only use letters, numbers, _ and .');
    const password = str(body.password, 'Password', { min: 8, max: 200 });
    if (q('SELECT 1 FROM users WHERE username = ?').get(username)) fail(409, 'That username is taken');
    const { salt, hash } = hashPassword(password);
    const { id } = q('INSERT INTO users (name, username, pass_salt, pass_hash) VALUES (?, ?, ?, ?) RETURNING id').get(name, username, salt, hash);
    startSession(req, res, id);
    return { user: { id, name, username } };
  }, { auth: false });

  route('POST', '/api/login', ({ body, req, res }) => {
    const username = str(body.username, 'Username').toLowerCase();
    const password = str(body.password, 'Password');
    const key = loginKey(req, username);
    if (loginBlocked(key)) fail(429, 'Too many tries. Wait 15 minutes and try again.');
    const u = q('SELECT * FROM users WHERE username = ?').get(username);
    if (!u || !verifyPassword(password, u.pass_salt, u.pass_hash)) {
      recordLoginFailure(key);
      fail(401, 'Wrong username or password');
    }
    loginFailures.delete(key);
    startSession(req, res, u.id);
    return { user: { id: u.id, name: u.name, username: u.username } };
  }, { auth: false });

  route('POST', '/api/logout', ({ req, res }) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) q('DELETE FROM sessions WHERE token = ?').run(token);
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    return { ok: true };
  }, { auth: false });

  route('GET', '/api/health', () => {
    q('SELECT 1').get();
    return { ok: true };
  }, { auth: false });

  route('GET', '/api/me', ({ user }) => {
    const partnerships = q(
      `SELECT p.id, p.name, (SELECT COUNT(*) FROM memberships x WHERE x.partnership_id = p.id) AS member_count, p.max_members
       FROM partnerships p JOIN memberships m ON m.partnership_id = p.id
       WHERE m.user_id = ? ORDER BY m.joined_at`
    ).all(user.id);
    // Who's in each pact, for the pact switcher.
    const members = q(
      `SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.partnership_id = ? ORDER BY m.joined_at`
    );
    for (const p of partnerships) p.members = members.all(p.id);
    return { user, partnerships };
  });

  route('POST', '/api/partnerships', ({ user, body }) => {
    const name = str(body.name, 'Name', { max: 60, required: false }) || `${user.name}'s pact`;
    const stakes = str(body.stakes, 'Stakes', { max: 200, required: false });
    const today = clientToday(body.today);
    return tx(() => {
      let code;
      do code = inviteCode();
      while (q('SELECT 1 FROM partnerships WHERE invite_code = ?').get(code));
      const { id } = q(
        'INSERT INTO partnerships (name, invite_code, stakes, created_by, created_day) VALUES (?, ?, ?, ?, ?) RETURNING id'
      ).get(name, code, stakes, user.id, today);
      q('INSERT INTO memberships (partnership_id, user_id) VALUES (?, ?)').run(id, user.id);
      addEvent({ partnership_id: id, actor_id: user.id, kind: 'created', message: name });
      return { partnership: { id, name, invite_code: code, stakes } };
    });
  });

  route('POST', '/api/partnerships/join', ({ user, body }) => {
    const code = str(body.code, 'Invite code', { max: 12 }).toUpperCase();
    return tx(() => {
      const p = q('SELECT * FROM partnerships WHERE invite_code = ?').get(code);
      if (!p) fail(404, 'No pact with that code');
      if (q('SELECT 1 FROM memberships WHERE partnership_id = ? AND user_id = ?').get(p.id, user.id)) {
        return { partnership: { id: p.id, name: p.name } };
      }
      const { n } = q('SELECT COUNT(*) AS n FROM memberships WHERE partnership_id = ?').get(p.id);
      if (n >= p.max_members) fail(409, 'That pact is already full');
      q('INSERT INTO memberships (partnership_id, user_id) VALUES (?, ?)').run(p.id, user.id);
      addEvent({ partnership_id: p.id, actor_id: user.id, kind: 'joined' });
      return { partnership: { id: p.id, name: p.name } };
    });
  });

  route('PATCH', '/api/partnerships/:id', ({ user, params, body }) => {
    const p = requireMember(params.id, user.id);
    if (body.name !== undefined) {
      q('UPDATE partnerships SET name = ? WHERE id = ?').run(str(body.name, 'Name', { max: 60 }), p.id);
    }
    if (body.stakes !== undefined) {
      const stakes = str(body.stakes, 'Stakes', { max: 200, required: false });
      if (stakes !== p.stakes) {
        q('UPDATE partnerships SET stakes = ? WHERE id = ?').run(stakes, p.id);
        addEvent({ partnership_id: p.id, actor_id: user.id, kind: 'stakes', message: stakes });
      }
    }
    return { ok: true };
  });

  route('GET', '/api/partnerships/:id/dashboard', ({ user, params, query }) => {
    const p = requireMember(params.id, user.id);
    const today = clientToday(query.get('today'));
    const ids = memberIds(p.id);
    const members = q(
      `SELECT u.id, u.name, u.username FROM users u JOIN memberships m ON m.user_id = u.id
       WHERE m.partnership_id = ? ORDER BY m.joined_at, u.id`
    ).all(p.id);
    const habits = q('SELECT * FROM habits WHERE partnership_id = ? ORDER BY id').all(p.id);
    const shared = habits.filter((h) => h.goal_id);
    const goals = q(`SELECT * FROM goals WHERE partnership_id = ? AND status IN ('proposed', 'active') ORDER BY id`).all(p.id);
    const checkins = q(
      `SELECT c.id, c.habit_id, c.user_id, c.day, c.status, c.note, c.late
       FROM checkins c JOIN habits h ON h.id = c.habit_id WHERE h.partnership_id = ?`
    ).all(p.id);

    const thisWeek = L.weekStart(today);
    const recentFrom = L.addDays(thisWeek, -7);
    const events = q(
      `SELECT e.*, a.name AS actor_name, t.name AS target_name, h.title AS habit_title
       FROM events e
       JOIN users a ON a.id = e.actor_id
       LEFT JOIN users t ON t.id = e.target_id
       LEFT JOIN habits h ON h.id = e.habit_id
       WHERE e.partnership_id = ? ORDER BY e.id DESC LIMIT 50`
    ).all(p.id);

    const { last_seen_event_id } = q('SELECT last_seen_event_id FROM memberships WHERE partnership_id = ? AND user_id = ?').get(p.id, user.id);
    if (events.length && events[0].id > last_seen_event_id) {
      q('UPDATE memberships SET last_seen_event_id = ? WHERE partnership_id = ? AND user_id = ?').run(events[0].id, p.id, user.id);
    }

    return {
      partnership: {
        id: p.id,
        name: p.name,
        stakes: p.stakes,
        invite_code: p.invite_code,
        max_members: p.max_members,
        created_day: p.created_day,
      },
      me: user.id,
      today,
      members,
      habits: habits.filter((h) => !h.archived_day || h.archived_day > thisWeek),
      checkins: checkins.filter((c) => c.day >= recentFrom),
      amounts: q(
        `SELECT a.habit_id, a.day, a.amount FROM amounts a JOIN habits h ON h.id = a.habit_id
         WHERE h.partnership_id = ? AND a.day >= ?`
      ).all(p.id, recentFrom),
      goals,
      week: L.scoreWeek(ids, habits, checkins, thisWeek),
      // Shared goals are what you're compared on, and all the pair streak counts.
      sharedWeek: L.scoreWeek(ids, shared, checkins, thisWeek),
      sharedLastWeek: L.scoreWeek(ids, shared, checkins, recentFrom),
      streak: ids.length >= 2 ? L.pairStreak(ids, shared, checkins, today, p.created_day) : { weeks: 0, tier: null, fullRun: 0, goldRun: 3, currentWeekMet: false, thisWeek: null, history: [] },
      events,
      last_seen_event_id,
    };
  });

  // Optional per-day times, e.g. {"mon":"05:30","sat":"09:00"}. Days left out
  // are off. When set, the weekly target is the number of scheduled days.
  function parseSchedule(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'object' || Array.isArray(value)) fail(400, 'schedule must be an object of day: time');
    const out = {};
    for (const [day, time] of Object.entries(value)) {
      if (!WEEKDAYS.includes(day)) fail(400, `Unknown day in schedule: ${day}`);
      if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail(400, `Pick a time for ${day}`);
    }
    for (const day of WEEKDAYS) if (value[day]) out[day] = value[day];
    if (!Object.keys(out).length) fail(400, 'Pick at least one day');
    return JSON.stringify(out);
  }

  function habitFields(body) {
    const icon = body.icon === undefined ? 'check' : body.icon;
    if (!HABIT_ICONS.includes(icon)) fail(400, 'Unknown habit icon');
    const schedule = parseSchedule(body.schedule);
    const amounts = amountFields(body);
    return {
      title: str(body.title, 'Goal', { max: 80 }),
      why: str(body.why, 'Why', { max: 200, required: false }),
      // A weekly amount goal is "done" once a week: when the total is reached.
      target:
        amounts.amount_period === 'week' ? 1
        : schedule ? Object.keys(JSON.parse(schedule)).length
        : int(body.target_per_week, 'Days per week', 1, 7),
      icon,
      schedule,
      ...amounts,
    };
  }

  // Optional log-as-you-go settings: daily amount, unit, and + button step.
  // A step of 0 means "ask how much each time" (e.g. grams of protein).
  function amountFields(body) {
    if (body.daily_amount === undefined || body.daily_amount === null) return { daily_amount: 0, unit: '', step: 0, amount_period: 'day' };
    const amount = Number(body.daily_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) fail(400, 'Daily amount must be a positive number');
    const period = body.amount_period === undefined ? 'day' : body.amount_period;
    if (period !== 'day' && period !== 'week') fail(400, 'amount_period must be day or week');
    return { daily_amount: round2(amount), unit: str(body.unit, 'Unit', { max: 12 }), step: parseStep(body.step ?? 0, amount), amount_period: period };
  }

  function parseStep(value, amount) {
    const step = Number(value);
    if (!Number.isFinite(step) || step < 0 || step > amount) fail(400, 'Each tap must add something between 0 and the daily amount');
    return round2(step);
  }

  route('POST', '/api/habits', ({ user, body }) => {
    const p = requireMember(int(body.partnership_id, 'partnership_id', 1, Number.MAX_SAFE_INTEGER), user.id);
    const { title, why, target, icon, schedule, daily_amount, unit, step, amount_period } = habitFields(body);
    const today = clientToday(body.today);
    const { active } = q('SELECT COUNT(*) AS active FROM habits WHERE partnership_id = ? AND user_id = ? AND archived_day IS NULL').get(p.id, user.id);
    if (active >= 10) fail(400, 'Ten habits is plenty. Archive one first.');
    const habit = q(
      `INSERT INTO habits (partnership_id, user_id, title, why, target_per_week, icon, schedule, daily_amount, unit, step, amount_period, created_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).get(p.id, user.id, title, why, target, icon, schedule, daily_amount, unit, step, amount_period, today);
    addEvent({ partnership_id: p.id, actor_id: user.id, habit_id: habit.id, kind: 'habit_added', message: `${target}x / week` });
    return { habit };
  });

  route('PATCH', '/api/habits/:id', ({ user, params, body }) => {
    const h = ownHabit(params.id, user.id);
    if (body.archived === true && !h.archived_day) {
      const today = clientToday(body.today);
      tx(() => {
        if (h.goal_id) {
          // A shared goal ends for both of you, and everyone sees who ended it.
          q('UPDATE habits SET archived_day = ? WHERE goal_id = ? AND archived_day IS NULL').run(today, h.goal_id);
          q(`UPDATE goals SET status = 'ended', decided_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(h.goal_id);
          addEvent({ partnership_id: h.partnership_id, actor_id: user.id, habit_id: h.id, kind: 'goal_ended' });
        } else {
          q('UPDATE habits SET archived_day = ? WHERE id = ?').run(today, h.id);
          addEvent({ partnership_id: h.partnership_id, actor_id: user.id, habit_id: h.id, kind: 'habit_archived' });
        }
      });
    }
    // Change your own number (protein, calories). Allowed on side goals and on
    // shared goals agreed as personal; your partner sees that you changed it.
    if (body.personal !== undefined) {
      if (h.archived_day) fail(400, 'That goal has ended');
      const goal = h.goal_id ? q('SELECT * FROM goals WHERE id = ?').get(h.goal_id) : null;
      if (goal && !goal.personal) fail(400, 'You both agreed on that number; propose a new goal to change it');
      const own = personalFields(body.personal || {}, h);
      if (own.title !== h.title || own.daily_amount !== h.daily_amount) {
        q('UPDATE habits SET title = ?, daily_amount = ?, step = MIN(step, ?) WHERE id = ?').run(own.title, own.daily_amount, own.daily_amount || 1e9, h.id);
        addEvent({ partnership_id: h.partnership_id, actor_id: user.id, habit_id: h.id, kind: 'amount_changed', message: own.title });
      }
    }
    // Change what one tap of + adds (0 = ask each time). Just a convenience,
    // so no feed entry.
    if (body.step !== undefined) {
      if (!(h.daily_amount > 0)) fail(400, 'That goal is not logged by amount');
      q('UPDATE habits SET step = ? WHERE id = ?').run(parseStep(body.step, h.daily_amount), h.id);
    }
    // Change your own times on a scheduled goal. Your partner sees that you did.
    if (body.schedule !== undefined) {
      if (!h.schedule) fail(400, 'That goal has no schedule');
      if (h.archived_day) fail(400, 'That goal has ended');
      const schedule = parseSchedule(body.schedule);
      if (!schedule) fail(400, 'Pick at least one day');
      if (schedule !== h.schedule) {
        q('UPDATE habits SET schedule = ?, target_per_week = ? WHERE id = ?').run(schedule, Object.keys(JSON.parse(schedule)).length, h.id);
        addEvent({ partnership_id: h.partnership_id, actor_id: user.id, habit_id: h.id, kind: 'schedule_changed' });
      }
    }
    if (body.why !== undefined) {
      q('UPDATE habits SET why = ? WHERE id = ?').run(str(body.why, 'Why', { max: 200, required: false }), h.id);
    }
    return { ok: true };
  });

  // Your own number on a personal goal: the title that states it ("Eat 130g of
  // protein") and, for logged goals, the daily amount. Missing values fall back
  // to the proposer's.
  function personalFields(body, base) {
    const title = body.title === undefined ? base.title : str(body.title, 'Goal', { max: 80 });
    if (!(base.daily_amount > 0) || body.daily_amount === undefined) return { title, daily_amount: base.daily_amount };
    const amount = Number(body.daily_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) fail(400, 'Enter your number');
    return { title, daily_amount: round2(amount) };
  }

  route('POST', '/api/goals', ({ user, body }) => {
    const p = requireMember(int(body.partnership_id, 'partnership_id', 1, Number.MAX_SAFE_INTEGER), user.id);
    const { title, why, target, icon, schedule, daily_amount, unit, step, amount_period } = habitFields(body);
    const { open } = q(`SELECT COUNT(*) AS open FROM goals WHERE partnership_id = ? AND status IN ('proposed', 'active')`).get(p.id);
    if (open >= 10) fail(400, 'Ten shared goals is plenty. End one first.');
    const goal = q(
      `INSERT INTO goals (partnership_id, proposed_by, title, why, icon, target_per_week, schedule, daily_amount, unit, step, amount_period, personal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).get(p.id, user.id, title, why, icon, target, schedule, daily_amount, unit, step, amount_period, body.personal ? 1 : 0);
    addEvent({ partnership_id: p.id, actor_id: user.id, kind: 'goal_proposed', message: `${title} (${target}x / week)` });
    return { goal };
  });

  // Accept, decline, or (for the person who proposed it) withdraw.
  route('POST', '/api/goals/:id/respond', ({ user, params, body }) => {
    const goal = q('SELECT * FROM goals WHERE id = ?').get(params.id);
    if (!goal) fail(404, 'Goal not found');
    requireMember(goal.partnership_id, user.id);
    if (goal.status !== 'proposed') fail(409, 'That goal was already decided');
    const answer = body.answer;
    const label = `${goal.title} (${goal.target_per_week}x / week)`;
    return tx(() => {
      if (answer === 'withdraw') {
        if (goal.proposed_by !== user.id) fail(403, 'Only the person who proposed it can withdraw it');
        q(`UPDATE goals SET status = 'withdrawn', decided_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(goal.id);
        addEvent({ partnership_id: goal.partnership_id, actor_id: user.id, kind: 'goal_withdrawn', message: label });
        return { ok: true };
      }
      if (goal.proposed_by === user.id) fail(403, 'Your partner has to answer this one');
      if (answer === 'decline') {
        q(`UPDATE goals SET status = 'declined', decided_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(goal.id);
        addEvent({ partnership_id: goal.partnership_id, actor_id: user.id, target_id: goal.proposed_by, kind: 'goal_declined', message: label });
        return { ok: true };
      }
      if (answer !== 'accept') fail(400, 'answer must be accept, decline or withdraw');
      const today = clientToday(body.today);
      // A scheduled goal (wake-up times) is agreed as a habit, not as times:
      // whoever agrees brings their own schedule. The proposer keeps theirs.
      const ownSchedule = goal.schedule ? parseSchedule(body.schedule) || goal.schedule : '';
      // A personal-number goal (protein, calories) works the same way: whoever
      // agrees brings their own number and the title that goes with it.
      const own = goal.personal ? personalFields(body, goal) : { title: goal.title, daily_amount: goal.daily_amount };
      q(`UPDATE goals SET status = 'active', decided_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(goal.id);
      for (const uid of memberIds(goal.partnership_id)) {
        const mine = uid === user.id;
        const schedule = mine ? ownSchedule : goal.schedule;
        const target = schedule ? Object.keys(JSON.parse(schedule)).length : goal.target_per_week;
        const title = mine ? own.title : goal.title;
        const amount = mine ? own.daily_amount : goal.daily_amount;
        q(
          `INSERT INTO habits (partnership_id, user_id, title, why, target_per_week, icon, schedule, daily_amount, unit, step, amount_period, goal_id, created_day)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(goal.partnership_id, uid, title, goal.why, target, goal.icon, schedule, amount, goal.unit, Math.min(goal.step, amount || goal.step), goal.amount_period, goal.id, today);
      }
      addEvent({ partnership_id: goal.partnership_id, actor_id: user.id, target_id: goal.proposed_by, kind: 'goal_accepted', message: label });
      return { ok: true };
    });
  });

  route('POST', '/api/checkins', ({ user, body }) => {
    const h = ownHabit(int(body.habit_id, 'habit_id', 1, Number.MAX_SAFE_INTEGER), user.id);
    if (h.archived_day) fail(400, 'That habit is archived');
    const today = clientToday(body.today);
    const day = body.day === undefined ? today : body.day;
    if (!L.isValidDay(day)) fail(400, 'day must be YYYY-MM-DD');
    // No quiet rewriting of history: today, or yesterday (flagged late). That's it.
    if (day !== today && day !== L.addDays(today, -1)) fail(400, 'You can only check in for today or yesterday');
    if (day < h.created_day) fail(400, 'That habit did not exist yet');
    const status = body.status;
    if (status !== 'done' && status !== 'missed') fail(400, 'status must be done or missed');
    const note = str(body.note, 'Note', { max: 280, required: false });
    if (status === 'missed' && note.length === 0) fail(400, 'Own the miss: say what got in the way');
    const late = day !== today ? 1 : 0;

    return tx(() => {
      const checkin = q(
        `INSERT INTO checkins (habit_id, user_id, day, status, note, late) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (habit_id, day) DO UPDATE SET status = excluded.status, note = excluded.note, late = excluded.late
         RETURNING id, habit_id, user_id, day, status, note, late`
      ).get(h.id, user.id, day, status, note, late);
      // Replace, don't stack, the feed entry when someone flips a check-in.
      q('DELETE FROM events WHERE checkin_id = ?').run(checkin.id);
      addEvent({
        partnership_id: h.partnership_id,
        actor_id: user.id,
        habit_id: h.id,
        checkin_id: checkin.id,
        kind: late ? `${status}_late` : status,
        message: note,
        day,
      });
      return { checkin };
    });
  });

  // Undo an accidental Done. Only Done: a logged miss (and its reason) stays.
  // Log as you go: add (or, with a negative delta, take back) an amount for
  // today or yesterday. Crossing the daily amount writes Done; dropping back
  // under it removes that Done.
  route('POST', '/api/amounts', ({ user, body }) => {
    const h = ownHabit(int(body.habit_id, 'habit_id', 1, Number.MAX_SAFE_INTEGER), user.id);
    if (!(h.daily_amount > 0)) fail(400, 'That goal is not logged by amount');
    if (h.archived_day) fail(400, 'That habit is archived');
    const today = clientToday(body.today);
    const day = body.day === undefined ? today : body.day;
    if (day !== today && day !== L.addDays(today, -1)) fail(400, 'You can only log today or yesterday');
    if (day < h.created_day) fail(400, 'That habit did not exist yet');
    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) fail(400, 'Enter an amount');

    return tx(() => {
      const prev = q('SELECT amount FROM amounts WHERE habit_id = ? AND day = ?').get(h.id, day)?.amount || 0;
      const amount = Math.max(0, round2(prev + delta));
      q(
        `INSERT INTO amounts (habit_id, day, amount) VALUES (?, ?, ?)
         ON CONFLICT (habit_id, day) DO UPDATE SET amount = excluded.amount`
      ).run(h.id, day, amount);
      // What counts toward the goal: today's amount, or the week's total.
      let total = amount;
      let target = h.daily_amount;
      let c = q('SELECT * FROM checkins WHERE habit_id = ? AND day = ?').get(h.id, day);
      if (h.amount_period === 'week') {
        const ws = L.weekStart(day);
        const we = L.addDays(ws, 6);
        total = round2(q('SELECT COALESCE(SUM(amount), 0) AS t FROM amounts WHERE habit_id = ? AND day BETWEEN ? AND ?').get(h.id, ws, we).t);
        target = L.weeklyAmountTarget(h, ws);
        c = q(`SELECT * FROM checkins WHERE habit_id = ? AND day BETWEEN ? AND ? AND status = 'done'`).get(h.id, ws, we) || c;
      }
      const late = day !== today ? 1 : 0;
      if (total >= target && c?.status !== 'done') {
        const checkin = q(
          `INSERT INTO checkins (habit_id, user_id, day, status, note, late) VALUES (?, ?, ?, 'done', '', ?)
           ON CONFLICT (habit_id, day) DO UPDATE SET status = 'done', note = '', late = excluded.late
           RETURNING id`
        ).get(h.id, user.id, day, late);
        q('DELETE FROM events WHERE checkin_id = ?').run(checkin.id);
        addEvent({
          partnership_id: h.partnership_id,
          actor_id: user.id,
          habit_id: h.id,
          checkin_id: checkin.id,
          kind: late ? 'done_late' : 'done',
          message: `${total} ${h.unit}${h.amount_period === 'week' ? ' this week' : ''}`,
          day,
        });
      } else if (total < target && c?.status === 'done') {
        q('DELETE FROM checkins WHERE id = ?').run(c.id);
      }
      return { amount, total, done: total >= target };
    });
  });

  route('POST', '/api/checkins/undo', ({ user, body }) => {
    const h = ownHabit(int(body.habit_id, 'habit_id', 1, Number.MAX_SAFE_INTEGER), user.id);
    const today = clientToday(body.today);
    const day = body.day === undefined ? today : body.day;
    if (day !== today && day !== L.addDays(today, -1)) fail(400, 'You can only undo today or yesterday');
    const c = q('SELECT * FROM checkins WHERE habit_id = ? AND day = ?').get(h.id, day);
    if (!c) fail(404, 'Nothing to undo');
    if (c.status !== 'done') fail(400, 'A logged miss stays. Log Done instead if you made it up.');
    q('DELETE FROM checkins WHERE id = ?').run(c.id); // its feed entry goes with it
    return { ok: true };
  });

  route('POST', '/api/partnerships/:id/nudges', ({ user, params, body }) => {
    const p = requireMember(params.id, user.id);
    const kind = body.kind;
    if (kind !== 'nudge' && kind !== 'cheer') fail(400, 'kind must be nudge or cheer');
    const targetId = int(body.to_user_id, 'to_user_id', 1, Number.MAX_SAFE_INTEGER);
    if (targetId === user.id) fail(400, "You can't nudge yourself. That's what the app is for.");
    if (!memberIds(p.id).includes(targetId)) fail(404, 'That person is not in this pact');
    let habitId = null;
    if (body.habit_id !== undefined && body.habit_id !== null) {
      const h = q('SELECT * FROM habits WHERE id = ? AND partnership_id = ? AND user_id = ?').get(body.habit_id, p.id, targetId);
      if (!h) fail(404, 'Habit not found');
      habitId = h.id;
    }
    const message = str(body.message, 'Message', { max: 280, required: false });
    const { n } = q(
      `SELECT COUNT(*) AS n FROM events WHERE partnership_id = ? AND actor_id = ? AND kind IN ('nudge', 'cheer')
       AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')`
    ).get(p.id, user.id);
    if (n >= NUDGES_PER_DAY) fail(429, 'Easy there. That is enough nudging for today.');
    addEvent({ partnership_id: p.id, actor_id: user.id, target_id: targetId, habit_id: habitId, kind, message });
    return { ok: true };
  });

  // ---------- plumbing ----------

  function send(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new HttpError(413, 'Request too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
        } catch {
          reject(new HttpError(400, 'Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, { error: 'Not found' });
    fs.readFile(file, (err, data) => {
      if (err) {
        // SPA fallback
        if (!path.extname(rel)) return serveStatic(req, res, '/');
        return send(res, 404, { error: 'Not found' });
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    }
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
        return serveStatic(req, res, url.pathname);
      }
      // Cheap CSRF guard: state-changing API calls must be JSON, which a plain
      // cross-site form can't send.
      if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) {
        fail(415, 'Send JSON');
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => (params[k] = Number(m[i + 1])));
        const user = currentUser(req);
        if (r.auth && !user) fail(401, 'Log in first');
        const body = req.method === 'GET' ? {} : await readBody(req);
        const result = await r.handler({ req, res, user, params, body, query: url.searchParams });
        return send(res, 200, result);
      }
      fail(404, 'Not found');
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      return send(res, 500, { error: 'Something broke on our end' });
    }
  });

  server.on('close', () => db.close());
  return server;
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const dbFile = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'accountability.db');
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const server = createApp({ dbFile });
  server.listen(port, () => {
    console.log(`AccountAbility running at http://localhost:${port} (db: ${dbFile})`);
  });
  // Hosts send SIGTERM on every deploy; close the database cleanly.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      server.close(() => process.exit(0));
      server.closeAllConnections();
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
