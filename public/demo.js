'use strict';

// Preview mode: a fake backend that runs entirely in the browser so the app can
// be tried on a phone with no server. It mirrors the rules in src/server.js and
// reuses src/logic.js (loaded before this file as window.AALogic) for scoring.
// Jake is a simulated partner who reacts to what you do.

(() => {
  const L = window.AALogic;
  const KEY = 'aa.demo.v1';
  const ME = 1;
  const JAKE = 2;

  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const at = (day, hh) => `${day}T${String(hh).padStart(2, '0')}:${String((hh * 7) % 60).padStart(2, '0')}:00Z`;
  const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  function seed() {
    const today = localToday();
    const week = L.weekStart(today);
    const start = L.addDays(week, -14);
    const users = {
      [ME]: { id: ME, name: 'Hank', username: 'hank' },
      [JAKE]: { id: JAKE, name: 'Jake', username: 'jake' },
    };
    const habits = [
      { id: 1, user_id: ME, title: 'Edit one video', why: 'Content is how I keep traveling', target_per_week: 5 },
      { id: 2, user_id: ME, title: 'Pitch one client', why: 'Freelance pays the hostel bill', target_per_week: 3 },
      { id: 3, user_id: JAKE, title: 'Gym', why: 'Stay strong for the season', target_per_week: 4 },
      { id: 4, user_id: JAKE, title: 'Read 20 pages', why: 'Less phone, more books', target_per_week: 5 },
    ].map((h) => ({ ...h, partnership_id: 1, created_day: start, archived_day: null }));

    const checkins = [];
    const add = (habit_id, day, status, note = '') => {
      if (day > today) return;
      const h = habits.find((x) => x.id === habit_id);
      checkins.push({ id: checkins.length + 1, habit_id, user_id: h.user_id, day, status, note, late: 0 });
    };
    // Two finished weeks where both of you delivered: a 2-week pair streak.
    for (const w of [start, L.addDays(start, 7)]) {
      [0, 1, 2, 3, 4].forEach((i) => add(1, L.addDays(w, i), 'done'));
      add(1, L.addDays(w, 5), 'missed', 'Volcano hike, zero signal');
      [0, 2, 4].forEach((i) => add(2, L.addDays(w, i), 'done'));
      [0, 2, 3, 5].forEach((i) => add(3, L.addDays(w, i), 'done'));
      [0, 1, 2, 3, 6].forEach((i) => add(4, L.addDays(w, i), 'done'));
      add(4, L.addDays(w, 4), 'missed', 'Double shift');
    }
    // This week, up to yesterday. Today is left open for you to log.
    const notes = { 1: 'Cut the Atitlan sunrise reel', 3: 'Leg day', 4: '' };
    for (let day = week; day < today; day = L.addDays(day, 1)) {
      const i = L.daysBetween(week, day);
      if (i === 2) add(1, day, 'missed', 'Bus to San Pedro took all day');
      else add(1, day, 'done', i === 0 ? notes[1] : '');
      if (i === 1) add(2, day, 'done', 'Sent a pitch to a surf school in El Tunco');
      if (i % 2 === 0) add(3, day, 'done', i === 0 ? notes[3] : '');
      add(4, day, 'done');
    }
    add(3, today, 'done', '6am. Empty gym.');

    // Feed: pact history, then recent check-ins, then a nudge from Jake.
    const events = [];
    const ev = (e) => events.push({ partnership_id: 1, target_id: null, habit_id: null, checkin_id: null, message: '', day: null, ...e });
    ev({ actor_id: ME, kind: 'created', message: 'Hank & Jake', created_at: at(start, 14) });
    ev({ actor_id: JAKE, kind: 'joined', created_at: at(start, 15) });
    habits.forEach((h, i) => ev({ actor_id: h.user_id, habit_id: h.id, kind: 'habit_added', message: `${h.target_per_week}x / week`, created_at: at(start, 16 + i) }));
    ev({ actor_id: JAKE, kind: 'stakes', message: 'Whoever misses their week buys the next round', created_at: at(start, 21) });
    const recentFrom = L.addDays(today, -3);
    checkins
      .filter((c) => c.day >= recentFrom)
      .forEach((c) => ev({ actor_id: c.user_id, habit_id: c.habit_id, checkin_id: c.id, kind: c.status, message: c.note, day: c.day, created_at: at(c.day, c.user_id === ME ? 22 : 12) }));
    ev({ actor_id: JAKE, target_id: ME, habit_id: 2, kind: 'nudge', message: 'One pitch a day keeps the hostel job away', created_at: at(today, 13) });
    events.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    events.forEach((e, i) => (e.id = i + 1));

    return {
      loggedIn: true,
      users,
      partnership: {
        id: 1,
        name: 'Hank & Jake',
        stakes: 'Whoever misses their week buys the next round',
        invite_code: 'K7PQ2M',
        max_members: 2,
        created_day: start,
      },
      habits,
      checkins,
      events,
      lastSeen: { [ME]: events.length - 2, [JAKE]: events.length },
      seededFor: today,
    };
  }

  let db;
  try {
    db = JSON.parse(localStorage.getItem(KEY));
  } catch {
    db = null;
  }
  // Reseed if nothing is saved or the saved preview is from a different week.
  if (!db || !db.seededFor || L.weekStart(db.seededFor) !== L.weekStart(localToday())) db = seed();

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* preview still works, it just won't survive a reload */
    }
  };

  function fail(status, message) {
    const err = new Error(message);
    err.status = status;
    throw err;
  }

  function addEvent(e) {
    const id = (db.events.length ? db.events[db.events.length - 1].id : 0) + 1;
    db.events.push({ partnership_id: 1, target_id: null, habit_id: null, checkin_id: null, message: '', day: null, created_at: now(), ...e, id });
  }

  function upsertCheckin(habit, day, status, note, late) {
    let c = db.checkins.find((x) => x.habit_id === habit.id && x.day === day);
    if (c) Object.assign(c, { status, note, late });
    else {
      c = { id: db.checkins.length + 1000, habit_id: habit.id, user_id: habit.user_id, day, status, note, late };
      db.checkins.push(c);
    }
    db.events = db.events.filter((e) => e.checkin_id !== c.id);
    addEvent({ actor_id: habit.user_id, habit_id: habit.id, checkin_id: c.id, kind: late ? `${status}_late` : status, message: note, day });
    return c;
  }

  // Jake's side of the conversation.
  const jakeReplies = {
    cheer: ['🙏', 'Appreciate it', 'Now do yours'],
    nudge: ['Fine. Went. Happy?', 'Doing it now. Relax.', 'Done. You owe me a coffee for the stress.'],
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const routes = [
    ['GET', /^\/api\/me$/, () => {
      if (!db.loggedIn) fail(401, 'Log in first');
      return { user: db.users[ME], partnerships: [{ id: 1, name: db.partnership.name, member_count: 2, max_members: 2 }] };
    }],
    ['POST', /^\/api\/(signup|login)$/, () => {
      db.loggedIn = true;
      return { user: db.users[ME] };
    }],
    ['POST', /^\/api\/logout$/, () => {
      db.loggedIn = false;
      return { ok: true };
    }],
    ['POST', /^\/api\/partnerships(\/join)?$/, () => ({ partnership: { id: 1, name: db.partnership.name, invite_code: db.partnership.invite_code } })],
    ['PATCH', /^\/api\/partnerships\/1$/, (b) => {
      const stakes = String(b.stakes ?? '').trim().slice(0, 200);
      if (stakes !== db.partnership.stakes) {
        db.partnership.stakes = stakes;
        addEvent({ actor_id: ME, kind: 'stakes', message: stakes });
      }
      return { ok: true };
    }],
    ['GET', /^\/api\/partnerships\/1\/dashboard$/, (b, query) => {
      const today = query.get('today') || localToday();
      const ids = [ME, JAKE];
      const thisWeek = L.weekStart(today);
      const recentFrom = L.addDays(thisWeek, -7);
      const lastSeen = db.lastSeen[ME];
      const events = db.events.slice(-50).reverse().map((e) => ({
        ...e,
        actor_name: db.users[e.actor_id].name,
        target_name: e.target_id ? db.users[e.target_id].name : null,
        habit_title: e.habit_id ? db.habits.find((h) => h.id === e.habit_id)?.title : null,
      }));
      if (events.length) db.lastSeen[ME] = events[0].id;
      return {
        partnership: db.partnership,
        me: ME,
        today,
        members: [db.users[ME], db.users[JAKE]],
        habits: db.habits.filter((h) => !h.archived_day || h.archived_day > thisWeek),
        checkins: db.checkins.filter((c) => c.day >= recentFrom),
        week: L.scoreWeek(ids, db.habits, db.checkins, thisWeek),
        lastWeek: L.scoreWeek(ids, db.habits, db.checkins, recentFrom),
        streak: L.pairStreak(ids, db.habits, db.checkins, today, db.partnership.created_day),
        events,
        last_seen_event_id: lastSeen,
      };
    }],
    ['POST', /^\/api\/habits$/, (b) => {
      const title = String(b.title ?? '').trim();
      if (!title) fail(400, 'Habit is required');
      const target = Number(b.target_per_week);
      if (db.habits.filter((h) => h.user_id === ME && !h.archived_day).length >= 10) fail(400, 'Ten habits is plenty. Archive one first.');
      const habit = {
        id: Math.max(...db.habits.map((h) => h.id)) + 1,
        partnership_id: 1,
        user_id: ME,
        title: title.slice(0, 80),
        why: String(b.why ?? '').trim().slice(0, 200),
        target_per_week: target,
        created_day: b.today,
        archived_day: null,
      };
      db.habits.push(habit);
      addEvent({ actor_id: ME, habit_id: habit.id, kind: 'habit_added', message: `${target}x / week` });
      return { habit };
    }],
    ['PATCH', /^\/api\/habits\/(\d+)$/, (b, query, m) => {
      const h = db.habits.find((x) => x.id === Number(m[1]) && x.user_id === ME);
      if (!h) fail(404, 'Habit not found');
      if (b.archived && !h.archived_day) {
        h.archived_day = b.today;
        addEvent({ actor_id: ME, habit_id: h.id, kind: 'habit_archived' });
        addEvent({ actor_id: JAKE, target_id: ME, habit_id: h.id, kind: 'nudge', message: 'Dropping it already? Noted.' });
      }
      return { ok: true };
    }],
    ['POST', /^\/api\/checkins$/, (b) => {
      const h = db.habits.find((x) => x.id === Number(b.habit_id) && x.user_id === ME);
      if (!h) fail(404, 'Habit not found');
      if (h.archived_day) fail(400, 'That habit is archived');
      const today = b.today;
      const day = b.day || today;
      if (day !== today && day !== L.addDays(today, -1)) fail(400, 'You can only check in for today or yesterday');
      if (day < h.created_day) fail(400, 'That habit did not exist yet');
      const note = String(b.note ?? '').trim().slice(0, 280);
      if (b.status === 'missed' && !note) fail(400, 'Own the miss: say what got in the way');
      const c = upsertCheckin(h, day, b.status, note, day !== today ? 1 : 0);
      const reacted = db.events.some((e) => e.actor_id === JAKE && e.habit_id === h.id && e.created_at.slice(0, 10) === now().slice(0, 10) && e.kind !== 'nudge');
      if (b.status === 'done' && !reacted) {
        addEvent({ actor_id: JAKE, target_id: ME, habit_id: h.id, kind: 'cheer', message: pick(['Let’s go', 'That’s what I’m talking about', 'Keep stacking']) });
      } else if (b.status === 'missed') {
        addEvent({ actor_id: JAKE, target_id: ME, habit_id: h.id, kind: 'nudge', message: 'Respect for owning it. Tomorrow though.' });
      }
      return { checkin: c };
    }],
    ['POST', /^\/api\/partnerships\/1\/nudges$/, (b) => {
      if (Number(b.to_user_id) !== JAKE) fail(400, "You can't nudge yourself. That's what the app is for.");
      const habitId = b.habit_id ? Number(b.habit_id) : null;
      addEvent({ actor_id: ME, target_id: JAKE, habit_id: habitId, kind: b.kind, message: String(b.message ?? '').trim().slice(0, 280) });
      // Jake responds: a nudge gets him to actually do it.
      const today = localToday();
      const h = db.habits.find((x) => x.id === habitId);
      const doneToday = h && db.checkins.some((c) => c.habit_id === h.id && c.day === today && c.status === 'done');
      if (b.kind === 'nudge' && h && !doneToday) upsertCheckin(h, today, 'done', pick(jakeReplies.nudge), 0);
      else addEvent({ actor_id: JAKE, target_id: ME, kind: 'cheer', message: pick(jakeReplies.cheer) });
      return { ok: true };
    }],
  ];

  window.AA_DEMO = async (method, path, body = {}) => {
    const url = new URL(path, 'https://preview.local');
    for (const [m, re, handler] of routes) {
      const match = m === method && re.exec(url.pathname);
      if (match) {
        const result = handler(body || {}, url.searchParams, match);
        save();
        return JSON.parse(JSON.stringify(result));
      }
    }
    fail(404, 'Not in the preview');
  };

  window.AA_DEMO_RESET = () => {
    db = seed();
    save();
  };
})();
