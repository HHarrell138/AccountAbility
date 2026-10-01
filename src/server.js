'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('./db');
const L = require('./logic');
const mail = require('./mail');
const push = require('./push');

// Only real push services get our POSTs (a subscription is just a URL the
// browser hands us, so don't let it point anywhere else).
const PUSH_HOSTS = ['push.apple.com', 'fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com'];
const isPushService = (url) => url.protocol === 'https:' && PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_COOKIE = 'aa_session';
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_BODY = 16 * 1024;
const NUDGES_PER_DAY = 10;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// Must match the icon keys in public/app.js.
const HABIT_ICONS = ['check', 'water', 'protein', 'calories', 'calorie-cap', 'workout', 'steps', 'read', 'sleep', 'wake', 'run', 'prayer'];
// Logged by typing the amount each time, never a fixed + tap.
const TYPED_ICONS = ['protein', 'calories'];
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

// The day and the minutes past midnight right now in a time zone.
function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// How long after a wake-up time you can still log it.
const WAKE_GRACE_MIN = 10;
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const fromMinutes = (m) => `${String(Math.min(23, Math.floor(m / 60))).padStart(2, '0')}:${String(m >= 24 * 60 ? 59 : m % 60).padStart(2, '0')}`;

// "05:30" -> "5:30 AM"
function clock(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function parseEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email');
  return email;
}

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

// sendMail is swappable for tests; by default it's SMTP from the environment.
function createApp({
  dbFile = ':memory:',
  sendMail = mail.config() ? (m) => mail.sendMail(m) : null,
  sendPush = push.sendPush, // swappable for tests, like pushAllowed
  pushAllowed = isPushService,
} = {}) {
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

  // What the app knows about you: who you are, and your notification settings.
  const USER_FIELDS = `u.id, u.name, u.username, u.email, u.tz, u.remind_at, u.notify_partner,
    (SELECT COUNT(*) FROM push_subs ps WHERE ps.user_id = u.id) AS push_count`;
  const currentUserById = (id) => q(`SELECT ${USER_FIELDS} FROM users u WHERE u.id = ?`).get(id);

  function currentUser(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const row = q(
      `SELECT ${USER_FIELDS} FROM sessions s JOIN users u ON u.id = s.user_id
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

  // The same goal in your other pacts: log it once and it counts everywhere.
  // Amount goals match on what's counted (water in oz, run in miles a week),
  // whatever each pact's target. Wake-up matches on its own: you wake once a
  // day. Anything else has to have the same name, so "Read 10 pages" never
  // ticks off "Read 20 pages".
  function linkKey(h) {
    if (h.daily_amount > 0) return `amount|${h.icon}|${h.unit}|${h.amount_period}`;
    if (h.icon === 'wake') return 'wake';
    return `title|${h.icon}|${h.title.trim().toLowerCase()}`;
  }

  // One linked goal per other pact you're in (never two in the same pact).
  function linkedHabits(h) {
    const key = linkKey(h);
    const seen = new Set([h.partnership_id]);
    return q(
      `SELECT h.* FROM habits h JOIN memberships m ON m.partnership_id = h.partnership_id AND m.user_id = h.user_id
       WHERE h.user_id = ? AND h.archived_day IS NULL AND h.partnership_id != ? ORDER BY h.partnership_id, h.id`
    )
      .all(h.user_id, h.partnership_id)
      .filter((x) => {
        if (seen.has(x.partnership_id) || linkKey(x) !== key) return false;
        seen.add(x.partnership_id);
        return true;
      });
  }

  // A goal just added in one pact starts with what you already logged today
  // on the same goal in your other pacts, so you never log it twice.
  function catchUp(h) {
    const day = h.created_day;
    const links = linkedHabits(h);
    if (!links.length) return;
    if (h.daily_amount > 0) {
      const got = Math.max(...links.map((x) => q('SELECT amount FROM amounts WHERE habit_id = ? AND day = ?').get(x.id, day)?.amount || 0));
      if (got > 0) applyAmount(h, day, got, 0);
    } else if (links.some((x) => q(`SELECT 1 FROM checkins WHERE habit_id = ? AND day = ? AND status = 'done'`).get(x.id, day))) {
      writeCheckin(h, day, 'done', '', 0);
    }
  }

  // A pact's name as one person sees it: their own name for it, if they set
  // one, or the name it was started with.
  const pactName = (id, userId) =>
    q('SELECT COALESCE(m.nickname, p.name) AS name FROM partnerships p LEFT JOIN memberships m ON m.partnership_id = p.id AND m.user_id = ? WHERE p.id = ?').get(userId, id).name;

  function memberIds(partnershipId) {
    return q('SELECT user_id FROM memberships WHERE partnership_id = ? ORDER BY joined_at, user_id')
      .all(partnershipId)
      .map((r) => r.user_id);
  }

  function addEvent(e) {
    const { id } = q(
      `INSERT INTO events (partnership_id, actor_id, target_id, habit_id, checkin_id, kind, message, day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).get(e.partnership_id, e.actor_id, e.target_id ?? null, e.habit_id ?? null, e.checkin_id ?? null, e.kind, e.message ?? '', e.day ?? null);
    // After the request's transaction settles: only events that stuck buzz anyone.
    setImmediate(() => {
      notifyEvent(id);
      notifyAllDone(id);
    });
  }

  // ---------- notifications ----------

  // The key pair notifications are signed with, made once and kept.
  const vapid = (() => {
    const row = q("SELECT value FROM settings WHERE key = 'vapid'").get();
    if (row) return JSON.parse(row.value);
    const { jwk } = push.newVapidKeys();
    q("INSERT INTO settings (key, value) VALUES ('vapid', ?)").run(JSON.stringify(jwk));
    return jwk;
  })();
  const vapidSubject = process.env.VAPID_SUBJECT || (process.env.SMTP_USER ? `mailto:${process.env.SMTP_USER}` : 'mailto:noreply@accountability.app');

  // Buzz every phone these people turned notifications on for. Never throws;
  // a subscription the push service says is gone gets deleted.
  async function notify(userIds, message) {
    const subs = userIds.flatMap((uid) => q('SELECT * FROM push_subs WHERE user_id = ?').all(uid));
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          const status = await sendPush(s, message, { jwk: vapid, subject: vapidSubject });
          if (status === 404 || status === 410) q('DELETE FROM push_subs WHERE id = ?').run(s.id);
          else if (status < 300) sent++;
          else console.error(`push ${status} for sub ${s.id}`);
        } catch (err) {
          console.error('push failed:', err.message);
        }
      })
    );
    return sent;
  }

  // Who hears about an event, and what it says. Not every check-in: your
  // partner hears when you're up (wake-up logged) and when you've hit every
  // goal for the day, if they have "partner activity" on. Joins, nudges,
  // cheers and goal requests always go through.
  function notifyEvent(eventId) {
    const e = q(
      `SELECT e.*, a.name AS actor, t.name AS target, h.title AS habit FROM events e
       JOIN users a ON a.id = e.actor_id LEFT JOIN users t ON t.id = e.target_id
       LEFT JOIN habits h ON h.id = e.habit_id WHERE e.id = ?`
    ).get(eventId);
    if (!e) return; // rolled back, or replaced already
    const others = memberIds(e.partnership_id).filter((id) => id !== e.actor_id);
    const optedIn = (ids) => ids.filter((id) => q('SELECT notify_partner FROM users WHERE id = ?').get(id)?.notify_partner);
    // A wake-up logged today: the time it was for, when there's a schedule.
    let wake = null;
    if (e.kind === 'done' && e.habit_id) {
      const h = q('SELECT icon, schedule FROM habits WHERE id = ?').get(e.habit_id);
      if (h?.icon === 'wake') {
        const t = h.schedule && JSON.parse(h.schedule)[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${e.day}T00:00:00Z`).getUTCDay()]];
        wake = t ? clock(t) : true;
      }
    }
    // The pact's name is each person's own name for it.
    const say = (pact) => ({
      nudge: [[e.target_id], `${e.actor} nudged you`, e.message || (e.habit ? `About ${e.habit}` : pact)],
      cheer: [[e.target_id], `${e.actor} cheered you on`, e.message || (e.habit ? `For ${e.habit}` : pact)],
      done: e.kind === 'done' && wake ? [optedIn(others), `${e.actor} is up`, `Wake-up${wake === true ? '' : ` by ${wake}`}, logged. ${pact}`] : [[]],
      goal_proposed: [others, `${e.actor} proposed a shared goal`, `${e.message}. Open the app to agree.`],
      goal_accepted: [others, `${e.actor} agreed to ${e.message}`, 'You’re both on it.'],
      goal_ended: [others, `${e.actor} ended ${e.habit}`, pact],
      joined: [others, `${e.actor} joined ${pact}`, 'Agree on your first shared goal.'],
      left: [others, `${e.actor} left ${pact}`, 'Your shared goals there ended.'],
    })[e.kind.replace('_late', '')];
    const who = say('')?.[0];
    if (!who || !who.length) return;
    for (const uid of who) {
      const [, title, body] = say(pactName(e.partnership_id, uid));
      notify([uid], { title, body, tag: `${e.partnership_id}-${e.kind}-${e.habit_id || ''}`, url: '/' });
    }
  }

  // After a check-in for today: if that was the last goal you had due in
  // this pact, your partner hears it, once a day.
  function notifyAllDone(eventId) {
    const e = q('SELECT e.*, a.name AS actor FROM events e JOIN users a ON a.id = e.actor_id WHERE e.id = ?').get(eventId);
    if (!e || e.kind !== 'done' || !e.day) return;
    const m = q('SELECT all_done_day FROM memberships WHERE partnership_id = ? AND user_id = ?').get(e.partnership_id, e.actor_id);
    if (!m || m.all_done_day === e.day) return;
    if (goalsLeft(e.actor_id, e.day, e.partnership_id).length) return;
    q('UPDATE memberships SET all_done_day = ? WHERE partnership_id = ? AND user_id = ?').run(e.day, e.partnership_id, e.actor_id);
    const others = memberIds(e.partnership_id)
      .filter((id) => id !== e.actor_id)
      .filter((id) => q('SELECT notify_partner FROM users WHERE id = ?').get(id)?.notify_partner);
    for (const uid of others) {
      notify([uid], { title: `${e.actor} hit every goal today`, body: `Your move. ${pactName(e.partnership_id, uid)}`, tag: `${e.partnership_id}-alldone-${e.actor_id}`, url: '/' });
    }
  }

  // Your goals still open today (in your time zone), one per goal even when
  // it's linked across pacts. Weekly-miles goals and goals whose week is
  // already hit don't nag.
  function goalsLeft(userId, day, pactId = null) {
    const habits = q(
      `SELECT h.* FROM habits h JOIN memberships m ON m.partnership_id = h.partnership_id AND m.user_id = h.user_id
       WHERE h.user_id = ? AND h.archived_day IS NULL AND h.created_day <= ? ORDER BY h.partnership_id, h.position, h.id`
    ).all(userId, day).filter((h) => pactId === null || h.partnership_id === pactId);
    const week = L.weekStart(day);
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${day}T00:00:00Z`).getUTCDay()];
    const seen = new Set();
    return habits.filter((h) => {
      if (h.amount_period === 'week') return false;
      if (h.schedule && !JSON.parse(h.schedule)[dayKey]) return false;
      if (q('SELECT 1 FROM checkins WHERE habit_id = ? AND day = ?').get(h.id, day)) return false;
      const { n } = q(`SELECT COUNT(*) AS n FROM checkins WHERE habit_id = ? AND status = 'done' AND day BETWEEN ? AND ?`).get(h.id, week, day);
      if (n >= L.effectiveTarget(h, week)) return false;
      const key = linkKey(h);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // The evening reminder, checked every minute: at your time, in your time
  // zone, once a day, only if something's still open. Past two hours late
  // (say the server was down), it skips the day rather than buzz at 2am.
  async function runReminders(now = new Date()) {
    const users = q(
      `SELECT * FROM users WHERE remind_at IS NOT NULL AND tz IS NOT NULL AND id IN (SELECT user_id FROM push_subs)`
    ).all();
    for (const u of users) {
      let local;
      try {
        local = localNow(u.tz, now);
      } catch {
        continue;
      }
      const day = local.day;
      if (u.last_reminded === day) continue;
      const [rh, rm] = u.remind_at.split(':').map(Number);
      const late = local.minutes - (rh * 60 + rm);
      if (late < 0) continue;
      q('UPDATE users SET last_reminded = ? WHERE id = ?').run(day, u.id);
      if (late > 120) continue;
      const left = goalsLeft(u.id, day);
      if (!left.length) continue;
      const partners = [...new Set(left.flatMap((h) => q(
        'SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.partnership_id = ? AND m.user_id != ?'
      ).all(h.partnership_id, u.id).map((r) => r.name)))];
      const titles = left.slice(0, 3).map((h) => h.title).join(', ') + (left.length > 3 ? '…' : '');
      const who = partners.length ? ` ${partners.slice(0, 2).join(' and ')} ${partners.length === 1 ? 'is' : 'are'} counting on you.` : '';
      await notify([u.id], { title: `${left.length} goal${left.length === 1 ? '' : 's'} left today`, body: `${titles}.${who}`, tag: 'reminder', url: '/' });
    }
  }
  setInterval(() => runReminders().catch((err) => console.error('reminders:', err.message)), 60 * 1000).unref();

  // ---------- handlers ----------

  const routes = [];
  const route = (method, pattern, handler, { auth = true } = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d+)')) + '$');
    routes.push({ method, re, keys, handler, auth });
  };

  // Sign up with your first name, email and a password. The name doesn't have
  // to be unique; the email is what you log in with. (Signing up with a
  // username still works, for older clients.)
  route('POST', '/api/signup', ({ body, req, res }) => {
    const name = str(body.name, 'Name', { max: 40 });
    const email = body.email === undefined ? null : parseEmail(body.email);
    let username;
    if (email) {
      if (q('SELECT 1 FROM users WHERE email = ? OR username = ?').get(email, email)) fail(409, 'There’s already an account with that email. Log in instead.');
      username = email; // internal only; never shown
    } else {
      username = str(body.username, 'Username', { min: 3, max: 30 }).toLowerCase();
      if (!/^[a-z0-9_.]+$/.test(username)) fail(400, 'Username can only use letters, numbers, _ and .');
      if (q('SELECT 1 FROM users WHERE username = ?').get(username)) fail(409, 'That username is taken');
    }
    const password = str(body.password, 'Password', { min: 8, max: 200 });
    const { salt, hash } = hashPassword(password);
    const { id } = q('INSERT INTO users (name, username, email, pass_salt, pass_hash) VALUES (?, ?, ?, ?, ?) RETURNING id').get(name, username, email, salt, hash);
    startSession(req, res, id);
    return { user: { id, name, username, email } };
  }, { auth: false });

  // Log in (or reset) with your email or, for older accounts, your username.
  const findLogin = (value) => {
    const v = String(value || '').trim().toLowerCase();
    return q('SELECT * FROM users WHERE email = ? OR username = ?').get(v, v);
  };

  // Add or change your email, so you can log in with it.
  // Your email and notification settings. Only what's sent changes.
  route('PATCH', '/api/me', ({ user, body }) => {
    if (body.email !== undefined) {
      const email = parseEmail(body.email);
      const taken = q('SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?').get(email, email, user.id);
      if (taken) fail(409, 'That email is already on another account');
      q('UPDATE users SET email = ? WHERE id = ?').run(email, user.id);
    }
    if (body.remind_at !== undefined) {
      if (body.remind_at !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.remind_at)) fail(400, 'Pick a reminder time');
      q('UPDATE users SET remind_at = ? WHERE id = ?').run(body.remind_at, user.id);
    }
    if (body.notify_partner !== undefined) q('UPDATE users SET notify_partner = ? WHERE id = ?').run(body.notify_partner ? 1 : 0, user.id);
    if (body.tz !== undefined) q('UPDATE users SET tz = ? WHERE id = ?').run(parseTz(body.tz), user.id);
    return { user: currentUserById(user.id) };
  });

  // ---------- notifications ----------

  route('GET', '/api/push/key', () => ({ publicKey: push.publicKeyOf(vapid) }));

  // This phone turned notifications on. It also tells us your time zone, so
  // the evening reminder comes at your evening.
  route('POST', '/api/push/subscribe', ({ user, body }) => {
    const sub = body.subscription || {};
    let url;
    try {
      url = new URL(sub.endpoint);
    } catch {
      fail(400, 'Bad subscription');
    }
    if (!pushAllowed(url)) fail(400, 'Unknown push service');
    const keys = sub.keys || {};
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(keys.p256dh || '') || !/^[A-Za-z0-9_-]{16,32}$/.test(keys.auth || '')) fail(400, 'Bad subscription keys');
    const tz = body.tz ? parseTz(body.tz) : null; // check everything before saving anything
    q(
      `INSERT INTO push_subs (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
    ).run(user.id, url.href, keys.p256dh, keys.auth);
    if (tz) q('UPDATE users SET tz = ? WHERE id = ?').run(tz, user.id);
    return { user: currentUserById(user.id) };
  });

  route('POST', '/api/push/unsubscribe', ({ user, body }) => {
    q('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').run(user.id, String(body.endpoint || ''));
    return { user: currentUserById(user.id) };
  });

  route('POST', '/api/push/test', async ({ user }) => {
    const sent = await notify([user.id], { title: 'Notifications are on', body: 'This is what a nudge from your partner looks like.', tag: 'test', url: '/' });
    if (!sent) fail(502, "Couldn't reach your phone. Turn notifications off and on again.");
    return { sent };
  });

  function parseTz(tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: String(tz) });
      return String(tz);
    } catch {
      fail(400, 'Unknown time zone');
    }
  }

  route('POST', '/api/login', ({ body, req, res }) => {
    const login = str(body.login ?? body.email ?? body.username, 'Email').toLowerCase();
    const password = str(body.password, 'Password');
    const key = loginKey(req, login);
    if (loginBlocked(key)) fail(429, 'Too many tries. Wait 15 minutes and try again.');
    const u = findLogin(login);
    if (!u || !verifyPassword(password, u.pass_salt, u.pass_hash)) {
      recordLoginFailure(key);
      fail(401, 'Wrong email or password');
    }
    loginFailures.delete(key);
    startSession(req, res, u.id);
    return { user: { id: u.id, name: u.name, username: u.username, email: u.email } };
  }, { auth: false });

  // Forgot your password: trade the emailed code (see /api/forgot) for a new
  // password. It logs you out everywhere else.
  route('POST', '/api/reset-password', ({ body, req, res }) => {
    const username = str(body.login ?? body.email ?? body.username, 'Email').toLowerCase();
    const code = str(body.code, 'Reset code', { max: 20 }).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const password = str(body.password, 'New password', { min: 8, max: 200 });
    const key = loginKey(req, `reset:${username}`);
    if (loginBlocked(key)) fail(429, 'Too many tries. Wait 15 minutes and try again.');
    const u = findLogin(username);
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const r = u && q('SELECT * FROM reset_codes WHERE user_id = ? AND used = 0 AND expires_at > ? ORDER BY id DESC').get(u.id, Date.now());
    if (!r || !crypto.timingSafeEqual(Buffer.from(r.code_hash, 'hex'), Buffer.from(hash, 'hex'))) {
      recordLoginFailure(key);
      fail(400, "That code doesn't match. Send yourself a new one.");
    }
    loginFailures.delete(key);
    const { salt, hash: passHash } = hashPassword(password);
    tx(() => {
      q('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?').run(salt, passHash, u.id);
      q('UPDATE reset_codes SET used = 1 WHERE user_id = ?').run(u.id);
      q('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    });
    startSession(req, res, u.id);
    return { user: { id: u.id, name: u.name, username: u.username } };
  }, { auth: false });

  // Forgot your password: email yourself a code (lasts an hour). The answer is
  // the same whether or not there's an account, so this can't be used to
  // find out who's signed up.
  route('POST', '/api/forgot', async ({ body, req }) => {
    const email = parseEmail(body.email);
    if (!sendMail) fail(503, "Password reset by email isn't set up yet.");
    const key = loginKey(req, `forgot:${email}`);
    if (loginBlocked(key)) fail(429, 'Too many tries. Wait 15 minutes and try again.');
    recordLoginFailure(key); // every request counts toward the limit
    const u = q('SELECT * FROM users WHERE email = ?').get(email);
    if (u) {
      const code = inviteCode() + inviteCode().slice(0, 2);
      tx(() => {
        q('UPDATE reset_codes SET used = 1 WHERE user_id = ? AND used = 0').run(u.id);
        q('INSERT INTO reset_codes (user_id, created_by, code_hash, expires_at) VALUES (?, ?, ?, ?)').run(
          u.id, u.id, crypto.createHash('sha256').update(code).digest('hex'), Date.now() + 3600 * 1000
        );
      });
      const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
      const link = `${origin}/?reset=${code}&email=${encodeURIComponent(email)}`;
      try {
        await sendMail({
          to: email,
          subject: 'Your AccountAbility reset code',
          text: `Hey ${u.name},\n\nYour reset code is ${code}\n\nOpen this link to set a new password:\n${link}\n\nIt works once, for an hour. If you didn't ask for this, ignore it; your password hasn't changed.\n\nAccountAbility`,
        });
      } catch (err) {
        console.error('reset email failed:', err.message);
        fail(502, "Couldn't send the email. Try again in a minute.");
      }
    }
    return { sent: true };
  }, { auth: false });

  // Change your own password while logged in. Other devices get logged out.
  route('POST', '/api/password', ({ user, body, req, res }) => {
    const current = str(body.current, 'Current password', { max: 200 });
    const password = str(body.password, 'New password', { min: 8, max: 200 });
    const u = q('SELECT * FROM users WHERE id = ?').get(user.id);
    const key = loginKey(req, `change:${u.username}`);
    if (loginBlocked(key)) fail(429, 'Too many tries. Wait 15 minutes and try again.');
    if (!verifyPassword(current, u.pass_salt, u.pass_hash)) {
      recordLoginFailure(key);
      fail(400, 'Your current password is wrong');
    }
    const { salt, hash } = hashPassword(password);
    q('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?').run(salt, hash, u.id);
    q('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    startSession(req, res, u.id);
    return { ok: true };
  });

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
      `SELECT p.id, COALESCE(m.nickname, p.name) AS name, (SELECT COUNT(*) FROM memberships x WHERE x.partnership_id = p.id) AS member_count, p.max_members
       FROM partnerships p JOIN memberships m ON m.partnership_id = p.id
       WHERE m.user_id = ? ORDER BY m.joined_at`
    ).all(user.id);
    // Who's in each pact, for the pact switcher.
    const members = q(
      `SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.partnership_id = ? ORDER BY m.joined_at`
    );
    for (const p of partnerships) p.members = members.all(p.id);
    // Pacts you left or deleted in the last day, which you can still undo.
    const left = q(
      `SELECT l.id, l.partnership_id, p.name, l.data, l.created_at FROM leaves l JOIN partnerships p ON p.id = l.partnership_id
       WHERE l.user_id = ? AND l.created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day') ORDER BY l.id DESC`
    )
      .all(user.id)
      .filter((l) => !partnerships.some((p) => p.id === l.partnership_id))
      .map(({ data, ...l }) => ({ ...l, deleted: JSON.parse(data).deleted }));
    return { user, partnerships, left };
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

  // What an invite link points at, so the sign-up screen can say who invited
  // you. Only what the link's holder should see: the pact and who started it.
  route('GET', '/api/invite', ({ query }) => {
    const code = String(query.get('code') || '').toUpperCase();
    const p = q('SELECT * FROM partnerships WHERE invite_code = ?').get(code);
    const members = p ? q('SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.partnership_id = ? ORDER BY m.joined_at').all(p.id) : [];
    if (!members.length) fail(404, "That invite link doesn't work anymore. Ask for a new one.");
    return { name: p.name, from: members[0].name, full: members.length >= p.max_members };
  }, { auth: false });

  route('POST', '/api/partnerships/join', ({ user, body }) => {
    const code = str(body.code, 'Invite code', { max: 12 }).toUpperCase();
    return tx(() => {
      const p = q('SELECT * FROM partnerships WHERE invite_code = ?').get(code);
      // A pact everyone left is on its way out (undoable for a day): not joinable.
      if (!p || !q('SELECT 1 FROM memberships WHERE partnership_id = ?').get(p.id)) fail(404, 'No pact with that code');
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

  // Leave a pact. If you're the only one in it, it's deleted. Otherwise your
  // partner keeps it, with their history and side goals: your goals there
  // end, shared goals end for both of you (they need two), open proposals are
  // withdrawn, and the feed says you left. They can invite someone new.
  //
  // Either way it can be undone for 24 hours (see leaves in db.js): nothing is
  // deleted up front, only recorded, so Undo puts back exactly what changed.
  route('POST', '/api/partnerships/:id/leave', ({ user, params, body }) => {
    const p = requireMember(params.id, user.id);
    const today = clientToday(body.today);
    return tx(() => {
      purgeLeaves();
      const membership = q('SELECT * FROM memberships WHERE partnership_id = ? AND user_id = ?').get(p.id, user.id);
      const deleted = q('SELECT COUNT(*) AS n FROM memberships WHERE partnership_id = ?').get(p.id).n <= 1;
      const ids = (sql, ...args) => q(sql).all(...args).map((r) => r.id);
      const habits = ids(
        `SELECT id FROM habits WHERE partnership_id = ? AND archived_day IS NULL
         AND (user_id = ? OR goal_id IN (SELECT id FROM goals WHERE partnership_id = ? AND status = 'active'))`,
        p.id, user.id, p.id
      );
      const ended = ids(`SELECT id FROM goals WHERE partnership_id = ? AND status = 'active'`, p.id);
      const withdrawn = ids(`SELECT id FROM goals WHERE partnership_id = ? AND status = 'proposed'`, p.id);
      for (const id of habits) q('UPDATE habits SET archived_day = ? WHERE id = ?').run(today, id);
      for (const id of ended) q(`UPDATE goals SET status = 'ended', decided_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(id);
      for (const id of withdrawn) q(`UPDATE goals SET status = 'withdrawn', decided_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(id);
      q('DELETE FROM memberships WHERE partnership_id = ? AND user_id = ?').run(p.id, user.id);
      if (!deleted) addEvent({ partnership_id: p.id, actor_id: user.id, kind: 'left' });
      const event = deleted ? null : q('SELECT MAX(id) AS id FROM events WHERE partnership_id = ?').get(p.id).id;
      const data = JSON.stringify({ deleted, habits, ended, withdrawn, event, joined_at: membership.joined_at, last_seen_event_id: membership.last_seen_event_id });
      const { id } = q('INSERT INTO leaves (partnership_id, user_id, data) VALUES (?, ?, ?) RETURNING id').get(p.id, user.id, data);
      return { deleted, undo_id: id };
    });
  });

  // Put a leave back: your membership, your goals, the shared goals and open
  // proposals, and the "left" line disappears from the feed.
  route('POST', '/api/leaves/:id/undo', ({ user, params }) => {
    purgeLeaves(); // on its own, so a refused undo doesn't roll the cleanup back
    return tx(() => {
      const leave = q('SELECT * FROM leaves WHERE id = ? AND user_id = ?').get(params.id, user.id);
      if (!leave) fail(404, 'Too late to undo that one');
      const d = JSON.parse(leave.data);
      const p = q('SELECT * FROM partnerships WHERE id = ?').get(leave.partnership_id);
      if (q('SELECT 1 FROM memberships WHERE partnership_id = ? AND user_id = ?').get(p.id, user.id)) fail(409, "You're already back in that pact");
      const { n } = q('SELECT COUNT(*) AS n FROM memberships WHERE partnership_id = ?').get(p.id);
      if (n >= p.max_members) fail(409, 'Someone else joined that pact since you left');
      q('INSERT INTO memberships (partnership_id, user_id, last_seen_event_id, joined_at) VALUES (?, ?, ?, ?)').run(p.id, user.id, d.last_seen_event_id, d.joined_at);
      for (const id of d.habits) q('UPDATE habits SET archived_day = NULL WHERE id = ?').run(id);
      for (const id of d.ended) q(`UPDATE goals SET status = 'active' WHERE id = ? AND status = 'ended'`).run(id);
      for (const id of d.withdrawn) q(`UPDATE goals SET status = 'proposed' WHERE id = ? AND status = 'withdrawn'`).run(id);
      if (d.event) q(`DELETE FROM events WHERE id = ? AND kind = 'left'`).run(d.event);
      q('DELETE FROM leaves WHERE id = ?').run(leave.id);
      return { partnership: { id: p.id, name: p.name } };
    });
  });

  // Leaves older than 24 hours can't be undone any more. A pact that's been
  // empty since then is deleted for real, with everything in it.
  function purgeLeaves() {
    q(`DELETE FROM leaves WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')`).run();
    q(`DELETE FROM partnerships WHERE id NOT IN (SELECT partnership_id FROM memberships)
       AND id NOT IN (SELECT partnership_id FROM leaves)`).run();
  }

  route('PATCH', '/api/partnerships/:id', ({ user, params, body }) => {
    const p = requireMember(params.id, user.id);
    // Renaming is just for you: your partner keeps whatever they call it.
    // Blank goes back to the name it was started with.
    if (body.name !== undefined) {
      const nickname = str(body.name, 'Name', { max: 60, required: false }) || null;
      q('UPDATE memberships SET nickname = ? WHERE partnership_id = ? AND user_id = ?').run(nickname, p.id, user.id);
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

  // Your own order for your goals. Only your rows move; your partner keeps theirs.
  route('POST', '/api/partnerships/:id/order', ({ user, params, body }) => {
    const p = requireMember(params.id, user.id);
    if (!Array.isArray(body.habit_ids) || body.habit_ids.length > 100) fail(400, 'habit_ids must be a list');
    if (!body.habit_ids.every(Number.isInteger)) fail(400, 'habit_ids must be ids');
    const set = q('UPDATE habits SET position = ? WHERE id = ? AND partnership_id = ? AND user_id = ?');
    tx(() => body.habit_ids.forEach((id, i) => set.run(i + 1, Number(id), p.id, user.id)));
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
        name: pactName(p.id, user.id),
        stakes: p.stakes,
        invite_code: p.invite_code,
        max_members: p.max_members,
        created_day: p.created_day,
      },
      me: user.id,
      today,
      members,
      habits: habits
        .filter((h) => !h.archived_day || h.archived_day > thisWeek)
        .map((h) => (h.user_id === user.id
          ? h.archived_day ? h : { ...h, links: linkedHabits(h).map((x) => pactName(x.partnership_id, user.id)) }
          : { ...h, plan: '' })), // your partner's plan is theirs alone
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
      // Weekly amount goals (miles run) earn streak credit as the miles go in.
      streak: ids.length >= 2 ? L.pairStreak(ids, shared, checkins, today, p.created_day, q(
        `SELECT a.habit_id, a.day, a.amount FROM amounts a JOIN habits h ON h.id = a.habit_id
         WHERE h.partnership_id = ? AND h.goal_id IS NOT NULL AND h.amount_period = 'week'`
      ).all(p.id)) : { weeks: 0, tier: null, fullRun: 0, goldRun: 3, currentWeekMet: false, thisWeek: null, history: [] },
      events,
      last_seen_event_id,
    };
  });

  // The weekly recap. On Sunday it's this week so far; otherwise last week.
  route('GET', '/api/partnerships/:id/recap', ({ user, params, query }) => {
    const p = requireMember(params.id, user.id);
    const today = clientToday(query.get('today'));
    const isSunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
    const start = isSunday ? L.weekStart(today) : L.addDays(L.weekStart(today), -7);
    const end = L.addDays(start, 6);
    const ids = memberIds(p.id);
    const shared = q('SELECT * FROM habits WHERE partnership_id = ? AND goal_id IS NOT NULL').all(p.id);
    const checkins = q(
      `SELECT c.habit_id, c.user_id, c.day, c.status, c.note FROM checkins c JOIN habits h ON h.id = c.habit_id
       WHERE h.partnership_id = ? AND h.goal_id IS NOT NULL`
    ).all(p.id);
    const amounts = q(
      `SELECT a.habit_id, a.day, a.amount FROM amounts a JOIN habits h ON h.id = a.habit_id
       WHERE h.partnership_id = ? AND h.goal_id IS NOT NULL`
    ).all(p.id);
    const recap = L.weekRecap(ids, shared, checkins, amounts, start);
    // Where the streak stood at the end of that week.
    const streak = ids.length >= 2 ? L.pairStreak(ids, shared, checkins, isSunday ? today : L.addDays(end, 1), p.created_day, amounts) : null;
    const counts = q(
      `SELECT kind, COUNT(*) AS n FROM events WHERE partnership_id = ? AND kind IN ('nudge', 'cheer')
       AND substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY kind`
    ).all(p.id, start, end);
    const count = (k) => counts.find((c) => c.kind === k)?.n || 0;
    return { ...recap, current: isSunday, tier: streak?.tier || null, weeks: streak?.weeks || 0, nudges: count('nudge'), cheers: count('cheer') };
  });

  // A plan: day -> a short label, days left out have none.
  function parsePlan(value) {
    if (value === null || value === '') return '';
    if (typeof value !== 'object' || Array.isArray(value)) fail(400, 'plan must be an object of day: label');
    const out = {};
    for (const [day, label] of Object.entries(value)) {
      if (!WEEKDAYS.includes(day)) fail(400, `Unknown day in plan: ${day}`);
      const text = String(label ?? '').trim();
      if (text.length > 40) fail(400, 'Keep each day under 40 characters');
      if (text) out[day] = text;
    }
    const sorted = {};
    for (const day of WEEKDAYS) if (out[day]) sorted[day] = out[day];
    return Object.keys(sorted).length ? JSON.stringify(sorted) : '';
  }

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
    if (TYPED_ICONS.includes(icon)) amounts.step = 0; // protein and calories: type the amount each time
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
    return tx(() => {
      const habit = q(
        `INSERT INTO habits (partnership_id, user_id, title, why, target_per_week, icon, schedule, daily_amount, unit, step, amount_period, created_day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      ).get(p.id, user.id, title, why, target, icon, schedule, daily_amount, unit, step, amount_period, today);
      addEvent({ partnership_id: p.id, actor_id: user.id, habit_id: habit.id, kind: 'habit_added', message: `${target}x / week` });
      catchUp(habit); // starts with what you already logged today on the same goal elsewhere
      return { habit };
    });
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
    // Change your own number (180 g of protein) or a side goal's name. Only
    // what's yours: side goals, and shared goals agreed as "each sets their
    // own number". A number you both agreed on (a gallon, 10,000 steps) is
    // the pact itself, so changing it means proposing a new goal. Your
    // partner sees any change in the feed. Days a week never change here.
    if (body.personal !== undefined) {
      if (h.archived_day) fail(400, 'That goal has ended');
      const goal = h.goal_id ? q('SELECT * FROM goals WHERE id = ?').get(h.goal_id) : null;
      if (goal && !goal.personal) fail(400, 'You both agreed on that; propose a new goal to change it');
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
      if (TYPED_ICONS.includes(h.icon)) fail(400, 'Protein and calories are typed in each time');
      q('UPDATE habits SET step = ? WHERE id = ?').run(parseStep(body.step, h.daily_amount), h.id);
    }
    // Change your own times on a scheduled goal. Your partner sees that you did.
    if (body.schedule !== undefined) {
      if (!h.schedule) fail(400, 'That goal has no schedule');
      if (h.archived_day) fail(400, 'That goal has ended');
      const schedule = parseSchedule(body.schedule);
      if (!schedule) fail(400, 'Pick at least one day');
      // Times can move; which days you agreed to can't.
      if (Object.keys(JSON.parse(schedule)).join() !== Object.keys(JSON.parse(h.schedule)).join()) fail(400, 'You can change your times, not which days');
      if (schedule !== h.schedule) {
        q('UPDATE habits SET schedule = ?, target_per_week = ? WHERE id = ?').run(schedule, Object.keys(JSON.parse(schedule)).length, h.id);
        addEvent({ partnership_id: h.partnership_id, actor_id: user.id, habit_id: h.id, kind: 'schedule_changed' });
      }
    }
    if (body.why !== undefined) {
      q('UPDATE habits SET why = ? WHERE id = ?').run(str(body.why, 'Why', { max: 200, required: false }), h.id);
    }
    // Your plan for the days ("Mon: Push"). Private, so no feed entry, and it
    // carries over to the same goal in your other pacts.
    if (body.plan !== undefined) {
      if (h.daily_amount > 0 || h.schedule) fail(400, 'That goal is planned by amount or by times');
      const plan = parsePlan(body.plan);
      for (const x of [h, ...linkedHabits(h)]) q('UPDATE habits SET plan = ? WHERE id = ?').run(plan, x.id);
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
      const created = [];
      for (const uid of memberIds(goal.partnership_id)) {
        const mine = uid === user.id;
        const schedule = mine ? ownSchedule : goal.schedule;
        const target = schedule ? Object.keys(JSON.parse(schedule)).length : goal.target_per_week;
        const title = mine ? own.title : goal.title;
        const amount = mine ? own.daily_amount : goal.daily_amount;
        created.push(q(
          `INSERT INTO habits (partnership_id, user_id, title, why, target_per_week, icon, schedule, daily_amount, unit, step, amount_period, goal_id, created_day)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        ).get(goal.partnership_id, uid, title, goal.why, target, goal.icon, schedule, amount, goal.unit, Math.min(goal.step, amount || goal.step), goal.amount_period, goal.id, today));
      }
      addEvent({ partnership_id: goal.partnership_id, actor_id: user.id, target_id: goal.proposed_by, kind: 'goal_accepted', message: label });
      created.forEach(catchUp); // each of you picks up what you already logged today in your other pacts
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
    if (!L.canLog(day, today)) fail(400, 'You can only log today or yesterday');
    if (day < h.created_day) fail(400, 'That habit did not exist yet');
    const status = body.status;
    if (status !== 'done' && status !== 'missed') fail(400, 'status must be done or missed');
    const note = str(body.note, 'Note', { max: 280, required: false });
    if (status === 'missed' && note.length === 0) fail(400, 'Own the miss: say what got in the way');
    // A wake-up counts only if you log it that morning, by 10 minutes past
    // your time; after that it can only be a miss. (Days without a time are
    // off, so anything goes.) The time is checked in your own time zone.
    if (status === 'done' && h.icon === 'wake' && h.schedule) {
      const t = JSON.parse(h.schedule)[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${day}T00:00:00Z`).getUTCDay()]];
      if (t) {
        if (day !== today) fail(400, 'A wake-up can only be logged that morning.');
        const tz = body.tz ? parseTz(body.tz) : q('SELECT tz FROM users WHERE id = ?').get(user.id)?.tz || 'UTC';
        const now = localNow(tz);
        const closes = toMinutes(t) + WAKE_GRACE_MIN;
        if (now.day > day || (now.day === day && now.minutes > closes)) {
          fail(400, `Too late to count: the window closed at ${clock(fromMinutes(closes))}. You can log it as missed.`);
        }
      }
    }
    const late = day !== today ? 1 : 0;

    return tx(() => {
      const checkin = writeCheckin(h, day, status, note, late);
      // Same goal in your other pacts. Done counts there too unless it's
      // already done; a miss only fills a day that has nothing logged.
      const also = [];
      for (const x of linkedHabits(h)) {
        if (day < x.created_day) continue;
        const c = q('SELECT status FROM checkins WHERE habit_id = ? AND day = ?').get(x.id, day);
        if (status === 'done' ? c?.status === 'done' : c) continue;
        writeCheckin(x, day, status, note, late);
        also.push(pactName(x.partnership_id, x.user_id));
      }
      return { checkin, also };
    });
  });

  function writeCheckin(h, day, status, note, late) {
    const checkin = q(
      `INSERT INTO checkins (habit_id, user_id, day, status, note, late) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (habit_id, day) DO UPDATE SET status = excluded.status, note = excluded.note, late = excluded.late
       RETURNING id, habit_id, user_id, day, status, note, late`
    ).get(h.id, h.user_id, day, status, note, late);
    // Replace, don't stack, the feed entry when someone flips a check-in.
    q('DELETE FROM events WHERE checkin_id = ?').run(checkin.id);
    addEvent({
      partnership_id: h.partnership_id,
      actor_id: h.user_id,
      habit_id: h.id,
      checkin_id: checkin.id,
      kind: late ? `${status}_late` : status,
      message: note,
      day,
    });
    return checkin;
  }

  // Undo an accidental Done. Only Done: a logged miss (and its reason) stays.
  // Log as you go: add (or, with a negative delta, take back) an amount for
  // today or yesterday (see L.canLog). Crossing the daily amount writes Done; dropping back
  // under it removes that Done.
  route('POST', '/api/amounts', ({ user, body }) => {
    const h = ownHabit(int(body.habit_id, 'habit_id', 1, Number.MAX_SAFE_INTEGER), user.id);
    if (!(h.daily_amount > 0)) fail(400, 'That goal is not logged by amount');
    if (h.archived_day) fail(400, 'That habit is archived');
    const today = clientToday(body.today);
    const day = body.day === undefined ? today : body.day;
    if (!L.canLog(day, today)) fail(400, 'You can only log today or yesterday');
    if (day < h.created_day) fail(400, 'That habit did not exist yet');
    // reset: back to 0 for that day, here and in your linked pacts.
    const reset = body.reset === true;
    // set: "I'm at 170 g now", the day's new total, instead of adding to it.
    const set = body.set === undefined ? null : Number(body.set);
    if (set !== null && (!Number.isFinite(set) || set < 0 || set > 100000)) fail(400, 'Enter your total so far');
    const delta = Number(body.delta);
    if (!reset && set === null && (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000)) fail(400, 'Enter an amount');
    const current = (x) => q('SELECT amount FROM amounts WHERE habit_id = ? AND day = ?').get(x.id, day)?.amount || 0;
    const change = (x) => (reset ? -current(x) : set !== null ? round2(set - current(x)) : delta);

    const late = day !== today ? 1 : 0;
    return tx(() => {
      const result = applyAmount(h, day, change(h), late);
      // The same amount goes into the same goal in your other pacts, each
      // counted against its own target.
      const also = [];
      for (const x of linkedHabits(h)) {
        if (day < x.created_day) continue;
        applyAmount(x, day, change(x), late);
        also.push(pactName(x.partnership_id, x.user_id));
      }
      return { ...result, also };
    });
  });

  function applyAmount(h, day, delta, late) {
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
    if (total >= target && c?.status !== 'done') {
      const checkin = q(
        `INSERT INTO checkins (habit_id, user_id, day, status, note, late) VALUES (?, ?, ?, 'done', '', ?)
         ON CONFLICT (habit_id, day) DO UPDATE SET status = 'done', note = '', late = excluded.late
         RETURNING id`
      ).get(h.id, h.user_id, day, late);
      q('DELETE FROM events WHERE checkin_id = ?').run(checkin.id);
      addEvent({
        partnership_id: h.partnership_id,
        actor_id: h.user_id,
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
  }

  route('POST', '/api/checkins/undo', ({ user, body }) => {
    const h = ownHabit(int(body.habit_id, 'habit_id', 1, Number.MAX_SAFE_INTEGER), user.id);
    const today = clientToday(body.today);
    const day = body.day === undefined ? today : body.day;
    if (!L.canLog(day, today)) fail(400, 'You can only change today or yesterday');
    const c = q('SELECT * FROM checkins WHERE habit_id = ? AND day = ?').get(h.id, day);
    if (!c) fail(404, 'Nothing to undo');
    if (c.status !== 'done') fail(400, 'A logged miss stays. Log Done instead if you made it up.');
    return tx(() => {
      q('DELETE FROM checkins WHERE id = ?').run(c.id); // its feed entry goes with it
      // Undo it in your other pacts too, where it was done.
      for (const x of linkedHabits(h)) q(`DELETE FROM checkins WHERE habit_id = ? AND day = ? AND status = 'done'`).run(x.id, day);
      return { ok: true };
    });
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
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        // The notification worker must always be fresh, or phones keep an old one.
        ...(rel === 'sw.js' ? { 'Cache-Control': 'no-cache' } : {}),
      });
      res.end(data);
    });
  }

  purgeLeaves(); // pacts left empty for over a day go at startup too

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
  server.runReminders = runReminders; // for tests
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
