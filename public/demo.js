'use strict';

// Preview mode: a fake backend that runs entirely in the browser so the app can
// be tried on a phone with no server. It mirrors the rules in src/server.js and
// reuses src/logic.js (loaded before this file as window.AALogic) for scoring.
// It opens already signed in, in a pact King has just joined, with no goals yet. King is a simulated partner who
// joins when asked, proposes a shared goal, agrees to yours, and reacts to
// what you do.

(() => {
  const L = window.AALogic;
  const KEY = 'aa.demo.v10';
  const ME = 1;
  const KING = 2;
  const KING_USER = { id: KING, name: 'King', username: 'king' };
  const KING_SIDE = { title: 'Work out', icon: 'workout', why: 'Stay strong for the season', target_per_week: 4 };
  const KING_PROPOSAL = { title: 'Eat 130g of protein', icon: 'protein', why: 'Actually put on some size this summer', target_per_week: 7, daily_amount: 130, unit: 'g', step: 0, personal: 1 };

  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const fresh = () => ({ me: null, loggedIn: false, partnership: null, members: [], goals: [], habits: [], checkins: [], amounts: [], events: [], lastSeen: 0, nextId: 1 });

  let db;
  try {
    db = JSON.parse(localStorage.getItem(KEY));
  } catch {
    db = null;
  }

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* preview still works, it just won't survive a reload */
    }
  };

  const id = () => db.nextId++;
  const user = (uid) => (uid === ME ? db.me : KING_USER);

  function fail(status, message) {
    const err = new Error(message);
    err.status = status;
    throw err;
  }

  function text(value, field, { min = 0, max = 200, required = true } = {}) {
    const v = String(value ?? '').trim();
    if (required && !v) fail(400, `${field} is required`);
    if (v.length < min) fail(400, `${field} must be at least ${min} characters`);
    return v.slice(0, max);
  }

  function requirePact(pid) {
    if (!db.partnership || db.partnership.id !== Number(pid)) fail(404, 'Partnership not found');
    return db.partnership;
  }

  function addEvent(e) {
    db.events.push({ id: id(), partnership_id: db.partnership.id, target_id: null, habit_id: null, checkin_id: null, message: '', day: null, created_at: now(), ...e });
  }

  function addHabit(userId, h, today, goalId = null) {
    const habit = {
      id: id(),
      partnership_id: db.partnership.id,
      user_id: userId,
      title: h.title,
      why: h.why || '',
      target_per_week: h.target_per_week,
      icon: h.icon || 'check',
      schedule: h.schedule || '',
      daily_amount: h.daily_amount || 0,
      unit: h.unit || '',
      step: h.step || 0,
      amount_period: h.amount_period || 'day',
      goal_id: goalId,
      position: 0,
      created_day: today,
      archived_day: null,
    };
    db.habits.push(habit);
    if (!goalId) addEvent({ actor_id: userId, habit_id: habit.id, kind: 'habit_added', message: `${habit.target_per_week}x / week` });
    return habit;
  }

  // Same rules as the server: days in week order, target = number of days.
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  function fields(b) {
    const out = { title: text(b.title, 'Goal', { max: 80 }), icon: b.icon, why: text(b.why, 'Why', { required: false }), target_per_week: Number(b.target_per_week), schedule: '' };
    if (b.schedule) {
      const sched = {};
      for (const d of DAYS) if (b.schedule[d]) sched[d] = b.schedule[d];
      if (!Object.keys(sched).length) fail(400, 'Pick at least one day');
      out.schedule = JSON.stringify(sched);
      out.target_per_week = Object.keys(sched).length;
    }
    out.personal = b.personal ? 1 : 0;
    if (b.daily_amount) {
      const amount = Number(b.daily_amount);
      const step = Number(b.step);
      if (!(amount > 0)) fail(400, 'Daily amount must be a positive number');
      if (!(step >= 0) || step > amount) fail(400, 'Each tap must add something between 0 and the daily amount'); // 0 = ask each time
      const period = b.amount_period || 'day';
      Object.assign(out, { daily_amount: amount, unit: text(b.unit, 'Unit', { max: 12 }), step, amount_period: period });
      if (period === 'week') out.target_per_week = 1;
    }
    return out;
  }

  // King's own mornings, used when he agrees to a wake-up goal.
  const KING_WAKE = JSON.stringify({ mon: '06:45', tue: '06:45', wed: '06:45', thu: '06:45', fri: '06:45', sat: '08:30' });

  const goalLabel = (g) => `${g.title} (${g.target_per_week}x / week)`;

  function propose(userId, g) {
    const goal = { id: id(), partnership_id: db.partnership.id, proposed_by: userId, title: g.title, why: g.why || '', icon: g.icon || 'check', target_per_week: g.target_per_week, schedule: g.schedule || '', daily_amount: g.daily_amount || 0, unit: g.unit || '', step: g.step || 0, amount_period: g.amount_period || 'day', personal: g.personal ? 1 : 0, status: 'proposed' };
    db.goals.push(goal);
    addEvent({ actor_id: userId, kind: 'goal_proposed', message: goalLabel(goal) });
    return goal;
  }

  // Your own number on a personal goal (protein, calories), like the server.
  function personalFields(b, base) {
    const title = b.title === undefined ? base.title : text(b.title, 'Goal', { max: 80 });
    if (!(base.daily_amount > 0) || b.daily_amount === undefined) return { title, daily_amount: base.daily_amount };
    const amount = Number(b.daily_amount);
    if (!(amount > 0) || amount > 100000) fail(400, 'Enter your number');
    return { title, daily_amount: Math.round(amount * 100) / 100 };
  }

  // A scheduled goal: whoever agrees brings their own times; the proposer keeps
  // theirs. A personal goal works the same way with the number.
  function accept(goal, byUser, today, ownSchedule, own) {
    goal.status = 'active';
    db.members.forEach((uid) => {
      const schedule = uid === byUser && goal.schedule ? ownSchedule || goal.schedule : goal.schedule;
      const target = schedule ? Object.keys(JSON.parse(schedule)).length : goal.target_per_week;
      const mine = uid === byUser && goal.personal && own ? own : { title: goal.title, daily_amount: goal.daily_amount };
      const step = Math.min(goal.step, mine.daily_amount || goal.step);
      addHabit(uid, { ...goal, ...mine, step, schedule, target_per_week: target }, today, goal.id);
    });
    addEvent({ actor_id: byUser, target_id: goal.proposed_by, kind: 'goal_accepted', message: goalLabel(goal) });
  }

  // King's own numbers, used when he agrees to a protein or calorie goal.
  const KING_NUMBERS = {
    protein: { title: 'Eat 130g of protein', daily_amount: 130 },
    calories: { title: 'Eat at least 2,200 calories', daily_amount: 2200 },
    'calorie-cap': { title: 'Stay under 1,800 calories' },
  };

  // King says yes to anything you've proposed.
  function kingAgrees(today) {
    db.goals
      .filter((g) => g.status === 'proposed' && g.proposed_by === ME)
      .forEach((g) => accept(g, KING, today, KING_WAKE, g.personal ? personalFields(KING_NUMBERS[g.icon] || {}, g) : null));
  }

  function kingJoins(today) {
    if (db.members.includes(KING)) return;
    db.members.push(KING);
    addEvent({ actor_id: KING, kind: 'joined' });
    kingAgrees(today);
    addHabit(KING, KING_SIDE, today);
    propose(KING, KING_PROPOSAL);
  }

  // Same rules as the server: crossing the daily amount writes Done, dropping
  // back under it removes that Done.
  function addAmount(h, day, delta, late = 0) {
    let row = db.amounts.find((a) => a.habit_id === h.id && a.day === day);
    if (!row) db.amounts.push((row = { habit_id: h.id, day, amount: 0 }));
    row.amount = Math.max(0, Math.round((row.amount + delta) * 100) / 100);
    // Daily goals count today's amount; weekly ones count the week's total.
    let total = row.amount;
    let target = h.daily_amount;
    let c = db.checkins.find((x) => x.habit_id === h.id && x.day === day);
    if (h.amount_period === 'week') {
      const ws = L.weekStart(day);
      const we = L.addDays(ws, 6);
      total = Math.round(db.amounts.filter((a) => a.habit_id === h.id && a.day >= ws && a.day <= we).reduce((t, a) => t + a.amount, 0) * 100) / 100;
      target = L.weeklyAmountTarget(h, ws);
      c = db.checkins.find((x) => x.habit_id === h.id && x.status === 'done' && x.day >= ws && x.day <= we) || c;
    }
    if (total >= target && c?.status !== 'done') {
      upsertCheckin(h, day, 'done', `${total} ${h.unit}${h.amount_period === 'week' ? ' this week' : ''}`, late);
      db.checkins.find((x) => x.habit_id === h.id && x.day === day).note = '';
    } else if (total < target && c?.status === 'done') {
      db.checkins = db.checkins.filter((x) => x !== c);
      db.events = db.events.filter((e) => e.checkin_id !== c.id);
    }
    return { amount: row.amount, total, done: total >= target };
  }

  function upsertCheckin(habit, day, status, note, late) {
    let c = db.checkins.find((x) => x.habit_id === habit.id && x.day === day);
    if (c) Object.assign(c, { status, note, late });
    else {
      c = { id: id(), habit_id: habit.id, user_id: habit.user_id, day, status, note, late };
      db.checkins.push(c);
    }
    db.events = db.events.filter((e) => e.checkin_id !== c.id);
    addEvent({ actor_id: habit.user_id, habit_id: habit.id, checkin_id: c.id, kind: late ? `${status}_late` : status, message: note, day });
    return c;
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const inviteCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

  const routes = [
    ['GET', /^\/api\/me$/, () => {
      if (!db.loggedIn) fail(401, 'Log in first');
      const p = db.partnership;
      return { user: db.me, partnerships: p ? [{ id: p.id, name: p.name, member_count: db.members.length, max_members: 2, members: db.members.map((uid) => ({ id: uid, name: uid === ME ? db.me.name : 'King' })) }] : [] };
    }],
    ['POST', /^\/api\/signup$/, (b) => {
      const name = text(b.name, 'Name', { max: 40 });
      const username = text(b.email ?? b.username, 'Email', { min: 3, max: 200 }).toLowerCase();
      text(b.password, 'Password', { min: 8 });
      Object.assign(db, fresh(), { me: { id: ME, name, username }, loggedIn: true });
      return { user: db.me };
    }],
    ['POST', /^\/api\/login$/, (b) => {
      const username = text(b.login ?? b.username, 'Email').toLowerCase();
      if (!db.me || db.me.username !== username) fail(401, 'Wrong email or password. In the preview, sign up first.');
      db.loggedIn = true;
      return { user: db.me };
    }],
    ['POST', /^\/api\/logout$/, () => {
      db.loggedIn = false;
      return { ok: true };
    }],
    ['POST', /^\/api\/partnerships$/, (b) => {
      if (db.partnership) fail(400, 'The preview holds one pact. Tap Reset to start over.');
      const name = text(b.name, 'Name', { max: 60, required: false }) || `${db.me.name}'s pact`;
      const stakes = text(b.stakes, 'Stakes', { max: 200, required: false });
      db.partnership = { id: 1, name, stakes, invite_code: inviteCode(), max_members: 2, created_day: b.today };
      db.members = [ME];
      addEvent({ actor_id: ME, kind: 'created', message: name });
      return { partnership: { id: 1, name, invite_code: db.partnership.invite_code, stakes } };
    }],
    ['POST', /^\/api\/partnerships\/join$/, (b) => {
      const code = text(b.code, 'Invite code', { max: 12 }).toUpperCase();
      if (db.partnership) fail(400, 'The preview holds one pact. Tap Reset to start over.');
      // Joining in the preview means joining a pact King already started.
      const today = localToday();
      db.partnership = { id: 1, name: 'King & ' + db.me.name, stakes: '', invite_code: code, max_members: 2, created_day: today };
      db.members = [KING];
      addEvent({ actor_id: KING, kind: 'created', message: db.partnership.name });
      addHabit(KING, KING_SIDE, today);
      propose(KING, KING_PROPOSAL);
      db.members.push(ME);
      addEvent({ actor_id: ME, kind: 'joined' });
      return { partnership: { id: 1, name: db.partnership.name } };
    }],
    ['POST', /^\/api\/demo\/partner-join$/, () => {
      if (!db.partnership) fail(400, 'Start a pact first');
      kingJoins(localToday());
      return { ok: true };
    }],
    ['PATCH', /^\/api\/partnerships\/(\d+)$/, (b, q, m) => {
      const p = requirePact(m[1]);
      if (b.name !== undefined) p.name = text(b.name, 'Name', { max: 60, required: false }) || 'Hank & King';
      if (b.stakes !== undefined) {
        const stakes = text(b.stakes, 'Stakes', { max: 200, required: false });
        if (stakes !== p.stakes) {
          p.stakes = stakes;
          addEvent({ actor_id: ME, kind: 'stakes', message: stakes });
        }
      }
      return { ok: true };
    }],
    ['GET', /^\/api\/partnerships\/(\d+)\/recap$/, (b, query, m) => {
      const p = requirePact(m[1]);
      const today = query.get('today') || localToday();
      const isSunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
      const start = isSunday ? L.weekStart(today) : L.addDays(L.weekStart(today), -7);
      const end = L.addDays(start, 6);
      const ids = db.members;
      const shared = db.habits.filter((h) => h.goal_id);
      const recap = L.weekRecap(ids, shared, db.checkins, db.amounts, start);
      const streak = ids.length >= 2 ? L.pairStreak(ids, shared, db.checkins, isSunday ? today : L.addDays(end, 1), p.created_day, db.amounts) : null;
      const inWeek = (e) => e.created_at.slice(0, 10) >= start && e.created_at.slice(0, 10) <= end;
      return {
        ...recap,
        current: isSunday,
        tier: streak?.tier || null,
        weeks: streak?.weeks || 0,
        nudges: db.events.filter((e) => e.kind === 'nudge' && inWeek(e)).length,
        cheers: db.events.filter((e) => e.kind === 'cheer' && inWeek(e)).length,
      };
    }],
    ['GET', /^\/api\/partnerships\/(\d+)\/dashboard$/, (b, query, m) => {
      const p = requirePact(m[1]);
      const today = query.get('today') || localToday();
      const ids = db.members;
      const thisWeek = L.weekStart(today);
      const recentFrom = L.addDays(thisWeek, -7);
      const shared = db.habits.filter((h) => h.goal_id);
      const lastSeen = db.lastSeen;
      const events = db.events.slice(-50).reverse().map((e) => ({
        ...e,
        actor_name: user(e.actor_id).name,
        target_name: e.target_id ? user(e.target_id).name : null,
        habit_title: e.habit_id ? db.habits.find((h) => h.id === e.habit_id)?.title : null,
      }));
      if (events.length) db.lastSeen = events[0].id;
      return {
        partnership: p,
        me: ME,
        today,
        members: ids.map(user),
        habits: db.habits.filter((h) => !h.archived_day || h.archived_day > thisWeek),
        checkins: db.checkins.filter((c) => c.day >= recentFrom),
        amounts: db.amounts.filter((a) => a.day >= recentFrom),
        goals: db.goals.filter((g) => g.status === 'proposed' || g.status === 'active'),
        week: L.scoreWeek(ids, db.habits, db.checkins, thisWeek),
        sharedWeek: L.scoreWeek(ids, shared, db.checkins, thisWeek),
        sharedLastWeek: L.scoreWeek(ids, shared, db.checkins, recentFrom),
        streak: ids.length >= 2 ? L.pairStreak(ids, shared, db.checkins, today, p.created_day, db.amounts) : { weeks: 0, tier: null, fullRun: 0, goldRun: 3, currentWeekMet: false, thisWeek: null, history: [] },
        events,
        last_seen_event_id: lastSeen,
      };
    }],
    ['POST', /^\/api\/habits$/, (b) => {
      requirePact(b.partnership_id);
      if (db.habits.filter((h) => h.user_id === ME && !h.archived_day).length >= 10) fail(400, 'Ten habits is plenty. Archive one first.');
      const habit = addHabit(ME, fields(b), b.today);
      return { habit };
    }],
    ['POST', /^\/api\/goals$/, (b) => {
      requirePact(b.partnership_id);
      const goal = propose(ME, fields(b));
      if (db.members.includes(KING)) kingAgrees(b.today);
      return { goal };
    }],
    ['POST', /^\/api\/goals\/(\d+)\/respond$/, (b, q, m) => {
      const goal = db.goals.find((g) => g.id === Number(m[1]));
      if (!goal) fail(404, 'Goal not found');
      if (goal.status !== 'proposed') fail(409, 'That goal was already decided');
      if (b.answer === 'withdraw') {
        if (goal.proposed_by !== ME) fail(403, 'Only the person who proposed it can withdraw it');
        goal.status = 'withdrawn';
        addEvent({ actor_id: ME, kind: 'goal_withdrawn', message: goalLabel(goal) });
      } else if (b.answer === 'decline') {
        goal.status = 'declined';
        addEvent({ actor_id: ME, target_id: goal.proposed_by, kind: 'goal_declined', message: goalLabel(goal) });
        addEvent({ actor_id: KING, target_id: ME, kind: 'nudge', message: 'Fair. Pick one you will actually do then.' });
      } else {
        accept(goal, ME, b.today, goal.schedule ? fields({ title: goal.title, schedule: b.schedule }).schedule : '', goal.personal ? personalFields(b, goal) : null);
      }
      return { ok: true };
    }],
    ['POST', /^\/api\/partnerships\/(\d+)\/order$/, (b) => {
      if (!Array.isArray(b.habit_ids)) fail(400, 'habit_ids must be a list');
      b.habit_ids.forEach((hid, i) => {
        const h = db.habits.find((x) => x.id === hid && x.user_id === ME);
        if (h) h.position = i + 1;
      });
      return { ok: true };
    }],
    ['PATCH', /^\/api\/habits\/(\d+)$/, (b, q, m) => {
      const h = db.habits.find((x) => x.id === Number(m[1]) && x.user_id === ME);
      if (!h) fail(404, 'Habit not found');
      if (b.plan !== undefined) {
        const plan = {};
        for (const d of DAYS) if (String(b.plan[d] || '').trim()) plan[d] = String(b.plan[d]).trim().slice(0, 40);
        h.plan = Object.keys(plan).length ? JSON.stringify(plan) : '';
      }
      if (b.step !== undefined) {
        const step = Number(b.step);
        if (!(h.daily_amount > 0)) fail(400, 'That goal is not logged by amount');
        if (!(step >= 0) || step > h.daily_amount) fail(400, 'Each tap must add something between 0 and the daily amount');
        h.step = Math.round(step * 100) / 100;
      }
      if (b.personal !== undefined) {
        if (h.archived_day) fail(400, 'That goal has ended');
        const goal = h.goal_id ? db.goals.find((g) => g.id === h.goal_id) : null;
        if (goal && !goal.personal) fail(400, 'You both agreed on that number; propose a new goal to change it');
        const own = personalFields(b.personal || {}, h);
        if (own.title !== h.title || own.daily_amount !== h.daily_amount) {
          Object.assign(h, own, { step: Math.min(h.step, own.daily_amount || h.step) });
          addEvent({ actor_id: ME, habit_id: h.id, kind: 'amount_changed', message: own.title });
        }
      }
      if (b.schedule !== undefined) {
        if (!h.schedule) fail(400, 'That goal has no schedule');
        const schedule = fields({ title: h.title, schedule: b.schedule }).schedule;
        if (!schedule) fail(400, 'Pick at least one day');
        if (schedule !== h.schedule) {
          h.schedule = schedule;
          h.target_per_week = Object.keys(JSON.parse(schedule)).length;
          addEvent({ actor_id: ME, habit_id: h.id, kind: 'schedule_changed' });
        }
      }
      if (b.archived && !h.archived_day && h.goal_id) {
        db.habits.filter((x) => x.goal_id === h.goal_id && !x.archived_day).forEach((x) => (x.archived_day = b.today));
        db.goals.find((g) => g.id === h.goal_id).status = 'ended';
        addEvent({ actor_id: ME, habit_id: h.id, kind: 'goal_ended' });
        addEvent({ actor_id: KING, target_id: ME, kind: 'nudge', message: 'You ended it for both of us. Noted.' });
      } else if (b.archived && !h.archived_day) {
        h.archived_day = b.today;
        addEvent({ actor_id: ME, habit_id: h.id, kind: 'habit_archived' });
        if (db.members.includes(KING)) addEvent({ actor_id: KING, target_id: ME, habit_id: h.id, kind: 'nudge', message: 'Dropping it already? Noted.' });
      }
      return { ok: true };
    }],
    ['POST', /^\/api\/checkins$/, (b) => {
      const h = db.habits.find((x) => x.id === Number(b.habit_id) && x.user_id === ME);
      if (!h) fail(404, 'Habit not found');
      if (h.archived_day) fail(400, 'That habit is archived');
      const today = b.today;
      const day = b.day || today;
      if (!L.canLog(day, today)) fail(400, 'You can only log today or yesterday');
      if (day < h.created_day) fail(400, 'That habit did not exist yet');
      const note = text(b.note, 'Note', { max: 280, required: false });
      if (b.status === 'missed' && !note) fail(400, 'Own the miss: say what got in the way');
      // Same as the server: a wake-up counts only that morning, by 10 past.
      if (b.status === 'done' && h.icon === 'wake' && h.schedule) {
        const t = JSON.parse(h.schedule)[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${day}T00:00:00Z`).getUTCDay()]];
        const n = new Date();
        if (t && day !== today) fail(400, 'A wake-up can only be logged that morning.');
        if (t && n.getHours() * 60 + n.getMinutes() > Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + 10) fail(400, 'Too late to count: the window has closed. You can log it as missed.');
      }
      const c = upsertCheckin(h, day, b.status, note, day !== today ? 1 : 0);
      if (db.members.includes(KING)) {
        const reacted = db.events.some((e) => e.actor_id === KING && e.habit_id === h.id && e.kind === 'cheer' && e.created_at.slice(0, 10) === now().slice(0, 10));
        if (b.status === 'done' && !reacted) {
          addEvent({ actor_id: KING, target_id: ME, habit_id: h.id, kind: 'cheer', message: pick(['Let’s go', 'That’s what I’m talking about', 'Keep stacking']) });
        } else if (b.status === 'missed') {
          addEvent({ actor_id: KING, target_id: ME, habit_id: h.id, kind: 'nudge', message: 'Respect for owning it. Tomorrow though.' });
        }
      }
      return { checkin: c };
    }],
    ['POST', /^\/api\/amounts$/, (b) => {
      const h = db.habits.find((x) => x.id === Number(b.habit_id) && x.user_id === ME);
      if (!h) fail(404, 'Habit not found');
      if (!(h.daily_amount > 0)) fail(400, 'That goal is not logged by amount');
      const day = b.day || b.today;
      const delta = b.reset ? -(db.amounts.find((a) => a.habit_id === h.id && a.day === day)?.amount || 0) : Number(b.delta);
      if (!b.reset && (!Number.isFinite(delta) || delta === 0)) fail(400, 'Enter an amount');
      return addAmount(h, day, delta, day !== b.today ? 1 : 0);
    }],
    ['POST', /^\/api\/checkins\/undo$/, (b) => {
      const h = db.habits.find((x) => x.id === Number(b.habit_id) && x.user_id === ME);
      if (!h) fail(404, 'Habit not found');
      const day = b.day || b.today;
      const c = db.checkins.find((x) => x.habit_id === h.id && x.day === day);
      if (!c) fail(404, 'Nothing to undo');
      if (c.status !== 'done') fail(400, 'A logged miss stays. Log Done instead if you made it up.');
      db.checkins = db.checkins.filter((x) => x !== c);
      db.events = db.events.filter((e) => e.checkin_id !== c.id);
      return { ok: true };
    }],
    ['POST', /^\/api\/partnerships\/(\d+)\/nudges$/, (b, q, m) => {
      requirePact(m[1]);
      if (Number(b.to_user_id) !== KING) fail(400, "You can't nudge yourself. That's what the app is for.");
      const habitId = b.habit_id ? Number(b.habit_id) : null;
      addEvent({ actor_id: ME, target_id: KING, habit_id: habitId, kind: b.kind, message: text(b.message, 'Message', { max: 280, required: false }) });
      // King responds: a nudge gets him to actually do it.
      const today = localToday();
      const h = db.habits.find((x) => x.id === habitId);
      const doneToday = h && db.checkins.some((c) => c.habit_id === h.id && c.day === today && c.status === 'done');
      if (b.kind === 'nudge' && h && !doneToday && h.daily_amount > 0) {
        addAmount(h, today, h.daily_amount - (db.amounts.find((a) => a.habit_id === h.id && a.day === today)?.amount || 0));
      } else if (b.kind === 'nudge' && h && !doneToday) {
        upsertCheckin(h, today, 'done', pick(['Fine. Did it. Happy?', 'Doing it now. Relax.', 'Done. You owe me a coffee for the stress.']), 0);
      } else {
        addEvent({ actor_id: KING, target_id: ME, kind: 'cheer', message: pick(['Appreciate it', 'Now do yours', 'Right back at you']) });
      }
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

  // Skip sign-up and pact setup: start signed in as Hank, in a pact King has
  // just joined. King brings a side goal and proposes a shared one.
  function ready() {
    db = fresh();
    const today = localToday();
    db.me = { id: ME, name: 'Hank', username: 'hank' };
    db.loggedIn = true;
    db.partnership = { id: 1, name: 'Hank & King', stakes: '', invite_code: inviteCode(), max_members: 2, created_day: today };
    db.members = [ME];
    addEvent({ actor_id: ME, kind: 'created', message: db.partnership.name });
    kingJoins(today);
    db.lastSeen = 0;
    save();
  }

  if (!db || !db.loggedIn) ready();

  window.AA_DEMO_RESET = ready;
})();
