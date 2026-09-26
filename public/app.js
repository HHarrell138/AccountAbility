'use strict';

(() => {
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Habit icons: 24x24 line drawings in currentColor. Keys must match
  // HABIT_ICONS in src/server.js.
  const ICONS = {
    check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
    water: '<path d="M9 3h6v2.5l2 3V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8.5l2-3z"/><path d="M17 10.5h1.2a1.8 1.8 0 0 1 1.8 1.8v3.4a1.8 1.8 0 0 1-1.8 1.8H17"/><path d="M7 13c1.7-1 3.3 1 5 0s3.3 1 5 0"/>',
    protein: '<circle cx="14.5" cy="9.5" r="5.5"/><path d="M10.6 13.4 6.2 17.8"/><circle cx="4.6" cy="17.6" r="1.6"/><circle cx="6.4" cy="19.4" r="1.6"/>',
    calories: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.7 2.2-4.8.3 1.6 1 2.6 2.3 3.1-.7-3.3.2-6 .5-8.3z"/>',
    'calorie-cap': '<path d="M5 4h14"/><path d="M12 8c.8 2.8 4 4.4 4 8a4 4 0 0 1-8 0c0-1.8.8-3 1.8-3.8.2 1.3.8 2.1 1.8 2.5-.5-2.6.2-4.8.4-6.7z"/>',
    workout: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    steps: '<path d="M3 16V7.5h3.5L8 10l3-1.2 2 3 5.4 1.4A3.4 3.4 0 0 1 21 16.5V17H3z"/><path d="M3 20h18"/><path d="M9.3 11.6l1.2 1.2M11.8 10.8l1.2 1.2"/>',
    read: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    sleep: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  };
  // Interface icons, same line style.
  const UI_ICONS = {
    done: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
    bell: '<path d="M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    calories: ICONS.calories,
  };
  const uiIcon = (key, cls = '') =>
    `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UI_ICONS[key]}</svg>`;
  const iconSvg = (key) =>
    `<svg class="hicon i-${esc(key)}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[key] || ICONS.check}</svg>`;

  // Presets fill in the add-habit form. {n} is the amount the person picks.
  const PRESETS = [
    { key: 'water', icon: 'water', label: 'Water', title: (n) => `Drink ${n} gallon${n === 1 ? '' : 's'} of water`, amount: 1, min: 0.25, unit: 'gallons', days: 7 },
    { key: 'protein', icon: 'protein', label: 'Protein', title: (n) => `Eat ${n}g of protein`, amount: 150, min: 5, unit: 'grams', days: 7 },
    { key: 'calories', icon: 'calories', label: 'Hit calories', title: (n) => `Eat at least ${n.toLocaleString()} calories`, amount: 2500, min: 500, unit: 'calories', days: 7 },
    { key: 'calorie-cap', icon: 'calorie-cap', label: 'Calorie cap', title: (n) => `Stay under ${n.toLocaleString()} calories`, amount: 2000, min: 500, unit: 'calories', days: 6 },
    { key: 'workout', icon: 'workout', label: 'Workout', title: () => 'Work out', days: 4 },
    { key: 'steps', icon: 'steps', label: 'Steps', title: (n) => `Walk ${n.toLocaleString()} steps`, amount: 10000, min: 500, unit: 'steps', days: 5 },
    { key: 'read', icon: 'read', label: 'Read', title: (n) => `Read ${n} pages`, amount: 20, min: 1, unit: 'pages', days: 5 },
    { key: 'sleep', icon: 'sleep', label: 'Sleep', title: (n) => `Sleep ${n} hours`, amount: 8, min: 4, unit: 'hours', days: 5 },
    { key: 'custom', icon: 'check', label: 'Custom', days: 5 },
  ];

  const state = {
    user: null,
    partnerships: [],
    pid: null,
    dash: null,
    authMode: 'signup',
    panel: null, // { type: 'checkin', habitId, status, day } | { type: 'nudge', habitId, userId }
    addOpen: null, // which goal picker is open: 'shared' | 'side' | null
    preset: null, // selected preset key in the open picker
  };

  // ---------- utils ----------

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addDays(day, n) {
    const d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function weekStart(day) {
    const dow = new Date(day + 'T00:00:00Z').getUTCDay();
    return addDays(day, -((dow + 6) % 7));
  }

  function ago(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch {
      return null;
    }
  }

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
  }

  async function api(method, path, body) {
    // Preview build: an in-browser stand-in for the server (see public/demo.js).
    if (window.AA_DEMO) return window.AA_DEMO(method, path, body);
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- data flow ----------

  async function boot() {
    try {
      const me = await api('GET', '/api/me');
      state.user = me.user;
      state.partnerships = me.partnerships;
      const saved = Number(store('aa.pid'));
      state.pid = (me.partnerships.find((p) => p.id === saved) || me.partnerships[0] || {}).id ?? null;
      if (state.pid) await loadDash();
    } catch (err) {
      if (err.status !== 401) toast(err.message);
      state.user = null;
    }
    render();
  }

  async function loadDash() {
    state.dash = await api('GET', `/api/partnerships/${state.pid}/dashboard?today=${localToday()}`);
  }

  async function refresh() {
    await loadDash();
    render();
  }

  // ---------- views ----------

  function render() {
    if (!state.user) return (app.innerHTML = authView());
    if (!state.pid || !state.dash) return (app.innerHTML = onboardView());
    app.innerHTML = dashView();
    const focus = app.querySelector('[data-autofocus]');
    if (focus) focus.focus();
  }

  function authView() {
    const signup = state.authMode === 'signup';
    return `
      <section class="hero">
        <img src="/icon.svg" alt="" class="logo">
        <h1>AccountAbility</h1>
        <p class="tagline">Habits you keep because someone's counting on you.</p>
      </section>
      <form class="card" data-form="${signup ? 'signup' : 'login'}">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" aria-selected="${signup}" data-action="auth-mode" data-mode="signup">Sign up</button>
          <button type="button" role="tab" aria-selected="${!signup}" data-action="auth-mode" data-mode="login">Log in</button>
        </div>
        ${signup ? `<label>Your first name<input name="name" autocomplete="given-name" maxlength="40" required></label>` : ''}
        <label>Username<input name="username" autocomplete="username" autocapitalize="none" minlength="3" maxlength="30" required></label>
        <label>Password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required></label>
        <button class="btn primary" type="submit">${signup ? 'Create account' : 'Log in'}</button>
      </form>
      <ul class="pitch">
        <li><strong>Just you and one person.</strong> No followers, no feed of strangers.</li>
        <li><strong>Misses need a reason.</strong> Your partner sees it. No quiet skipping.</li>
        <li><strong>One shared streak.</strong> It only grows if you <em>both</em> show up.</li>
      </ul>`;
  }

  function onboardView() {
    return `
      <header class="bar">
        <span class="hello">Hey ${esc(state.user.name)}</span>
        ${state.partnerships.length ? `<button class="link" data-action="back-to-pact">Back</button>` : ''}
        <button class="link" data-action="logout">Log out</button>
      </header>
      <h2>Who's keeping you honest?</h2>
      <p class="muted">Start a pact and send your partner the code, or join the one they started.</p>
      <form class="card" data-form="create-pact">
        <h3>Start a pact</h3>
        <label>Name it <span class="muted">(optional)</span><input name="name" maxlength="60" placeholder="Hank &amp; Jake"></label>
        <label>What's on the line? <span class="muted">(optional)</span>
          <input name="stakes" maxlength="200" placeholder="Whoever misses their week buys coffee"></label>
        <button class="btn primary" type="submit">Create pact</button>
      </form>
      <form class="card" data-form="join-pact">
        <h3>Join with a code</h3>
        <label>Invite code<input name="code" maxlength="12" autocapitalize="characters" autocomplete="off" required placeholder="ABC234"></label>
        <button class="btn" type="submit">Join</button>
      </form>`;
  }

  function dashView() {
    const d = state.dash;
    const me = d.members.find((m) => m.id === d.me);
    const partners = d.members.filter((m) => m.id !== d.me);
    const partnerName = partners[0] ? esc(partners[0].name) : 'your partner';
    const waiting = d.members.length < d.partnership.max_members;
    const active = d.goals.filter((g) => g.status === 'active');
    const proposals = d.goals.filter((g) => g.status === 'proposed');
    const sideMine = d.habits.filter((h) => h.user_id === d.me && !h.goal_id);
    const unread = d.events.filter((e) => e.id > d.last_seen_event_id && e.actor_id !== d.me).length;

    return `
      <header class="bar">
        ${pactSwitcher()}
        <button class="link" data-action="logout">Log out</button>
      </header>

      ${waiting ? inviteCard() : ''}
      ${scoreCard(me, partners)}
      ${proposals.length ? proposalsCard(proposals) : ''}

      <section>
        <h2>Shared goals <span class="muted small">today, ${esc(prettyDay(d.today))}</span></h2>
        ${active.length
          ? active.map(goalCard).join('')
          : `<p class="empty">${proposals.length ? 'Nothing is agreed yet.' : 'Agree on your first goal.'} You're both held to shared goals, and they're what your streak counts.</p>`}
        ${addForm('shared', active.length === 0 && proposals.length === 0, partnerName)}
      </section>

      <section class="side">
        <h2>Your side goals</h2>
        <p class="small muted">Just yours. ${partnerName} can see them, but they don't count toward the streak.</p>
        ${sideMine.map((h) => habitCard(h, true)).join('')}
        ${addForm('side', false, partnerName)}
      </section>

      ${partners
        .map((p) => {
          const theirs = d.habits.filter((h) => h.user_id === p.id && !h.goal_id);
          return theirs.length
            ? `<section class="side"><h2>${esc(p.name)}'s side goals</h2>${theirs.map((h) => habitCard(h, false)).join('')}</section>`
            : '';
        })
        .join('')}

      <section>
        <h2>Activity ${unread ? `<span class="badge">${unread} new</span>` : ''}</h2>
        <ol class="feed">${d.events.map(feedItem).join('') || '<li class="muted">Nothing yet.</li>'}</ol>
      </section>

      <footer class="foot muted small">
        <button class="link" data-action="new-pact">Start or join another pact</button>
      </footer>`;
  }

  function pactSwitcher() {
    if (state.partnerships.length <= 1) return `<h1 class="pact-name">${esc(state.dash.partnership.name)}</h1>`;
    return `<select class="pact-select" data-action="switch-pact" aria-label="Switch pact">
      ${state.partnerships.map((p) => `<option value="${p.id}" ${p.id === state.pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>`;
  }

  function inviteCard() {
    const code = state.dash.partnership.invite_code;
    return `
      <section class="card invite">
        <h3>Waiting on your partner</h3>
        <p>Send them this code. They sign up, tap <em>Join with a code</em>, and you're locked in. You can propose shared goals now; they start once your partner agrees.</p>
        <div class="code">${esc(code)}</div>
        <button class="btn" data-action="share-code" data-code="${esc(code)}">Share invite</button>
        ${window.AA_DEMO ? `<button class="btn primary" data-action="demo-join">Preview: have your partner join</button>` : ''}
      </section>`;
  }

  function scoreCard(me, partners) {
    const d = state.dash;
    const s = d.streak;
    const people = [me, ...partners];
    const status = (m) => {
      const ms = d.sharedWeek.members[m.id];
      if (!ms || ms.habits.length === 0) return `<span class="pill">no shared goals yet</span>`;
      const hit = ms.habits.filter((h) => h.met).length;
      return ms.met ? `<span class="pill good">week won</span>` : `<span class="pill">${hit}/${ms.habits.length} shared goals hit</span>`;
    };
    const lw = d.sharedLastWeek;
    const hadGoals = people.length > 1 && people.every((m) => lw.members[m.id]?.habits.length);
    const lastWeekLine = hadGoals
      ? lw.allMet
        ? 'Last week: you both delivered.'
        : `Last week: ${people.filter((m) => !lw.members[m.id]?.met).map((m) => (m.id === d.me ? 'you' : esc(m.name))).join(' and ')} came up short.`
      : '';
    return `
      <section class="card score">
        <div class="streak">
          <span class="icon-tile streak-tile ${s.weeks > 0 ? 'lit' : ''}">${uiIcon('calories', 'streak-icon')}</span>
          <div>
            <div class="streak-num">${s.weeks} week${s.weeks === 1 ? '' : 's'}</div>
            <div class="muted small">pair streak: you both hit every shared goal</div>
          </div>
        </div>
        <ul class="who">
          ${people.map((m) => `<li><span>${m.id === d.me ? 'You' : esc(m.name)}</span>${status(m)}</li>`).join('')}
        </ul>
        ${lastWeekLine ? `<p class="small">${lastWeekLine}</p>` : ''}
        <form class="stakes" data-form="stakes">
          <label for="stakes-input">On the line
            <input id="stakes-input" name="stakes" maxlength="200" value="${esc(d.partnership.stakes)}" placeholder="Loser buys coffee">
          </label>
          <button class="btn small" type="submit">Save</button>
        </form>
      </section>`;
  }

  function proposalsCard(proposals) {
    const d = state.dash;
    const nameOf = (id) => esc(d.members.find((m) => m.id === id)?.name || 'Your partner');
    const partner = d.members.find((m) => m.id !== d.me);
    return `
      <section class="card proposals">
        <h3>Waiting for a yes</h3>
        ${proposals
          .map((g) => {
            const mine = g.proposed_by === d.me;
            return `
            <div class="proposal">
              <span class="icon-tile">${iconSvg(g.icon)}</span>
              <div class="proposal-body">
                <p class="small muted">${mine ? `You proposed. ${partner ? `Waiting on ${esc(partner.name)}.` : 'Waiting for your partner to join.'}` : `${nameOf(g.proposed_by)} wants you both to:`}</p>
                <p class="proposal-title">${esc(g.title)} <span class="muted">${g.target_per_week}x / week</span></p>
                ${g.why ? `<p class="why">${esc(g.why)}</p>` : ''}
                <div class="row">
                  ${mine
                    ? `<button class="btn small" data-action="respond" data-goal="${g.id}" data-answer="withdraw">Withdraw</button>`
                    : `<button class="btn small primary" data-action="respond" data-goal="${g.id}" data-answer="accept">${uiIcon('done')}Agree</button>
                       <button class="btn small" data-action="respond" data-goal="${g.id}" data-answer="decline">Pass</button>`}
                </div>
              </div>
            </div>`;
          })
          .join('')}
      </section>`;
  }

  // Everything a card needs to show one person's week on one habit.
  function habitWeek(h) {
    const d = state.dash;
    const start = weekStart(d.today);
    const byDay = new Map(d.checkins.filter((c) => c.habit_id === h.id).map((c) => [c.day, c]));
    const score = d.week.members[h.user_id]?.habits.find((x) => x.habit_id === h.id);
    const done = score ? score.done : 0;
    const target = score ? score.target : h.target_per_week;
    const todayC = byDay.get(d.today);
    const daysLeft = 7 - Math.round((Date.parse(d.today) - Date.parse(start)) / 86400000) - (todayC ? 1 : 0);
    const need = Math.max(0, target - done);

    let outlook;
    if (need === 0) outlook = `<span class="pill good">target hit</span>`;
    else if (need > daysLeft) outlook = `<span class="pill bad">week lost</span>`;
    else if (need === daysLeft) outlook = `<span class="pill warn">no slack left</span>`;
    else outlook = `<span class="pill">${need} more in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</span>`;

    const dots = DAY_LABELS.map((label, i) => {
      const day = addDays(start, i);
      const c = byDay.get(day);
      const cls = ['dot', c ? c.status : '', day === d.today ? 'today' : '', day > d.today || day < h.created_day ? 'off' : ''].join(' ');
      const title = c ? `${c.status}${c.late ? ' (late)' : ''}${c.note ? ': ' + c.note : ''}` : day;
      return `<span class="${cls}" title="${esc(title)}"><span class="lbl">${label}</span></span>`;
    }).join('');

    const prorated = target < h.target_per_week ? `<span class="muted small">First week, so the goal is ${target} instead of ${h.target_per_week}</span>` : '';
    return { byDay, done, target, todayC, yesterdayC: byDay.get(addDays(d.today, -1)), outlook, dots, prorated };
  }

  const statusLine = (c) =>
    c.status === 'done'
      ? `<span class="logged done">${uiIcon('done')}Done today</span>`
      : `<span class="logged missed">${uiIcon('x')}Missed today</span>`;

  // Check-in controls on your own habit (side goal or your half of a shared one).
  function myActions(h, w, shared) {
    const d = state.dash;
    const panel = state.panel;
    if (panel && panel.type === 'checkin' && panel.habitId === h.id) return checkinPanel(h, panel);
    if (panel && panel.type === 'archive' && panel.habitId === h.id) {
      const partner = d.members.find((m) => m.id !== d.me);
      return `
        <div class="panel">
          <p class="small">${shared
            ? `<strong>End this shared goal?</strong> It ends for both of you, ${partner ? esc(partner.name) : 'your partner'} sees that you ended it, and this week still counts.`
            : `<strong>Drop this goal?</strong> Your partner will see that you dropped it, and this week still counts.`}</p>
          <div class="row">
            <button class="btn danger" data-action="archive" data-habit="${h.id}">${shared ? 'End it' : 'Drop it'}</button>
            <button class="btn" data-action="close-panel">Keep it</button>
          </div>
        </div>`;
    }
    const yesterday = addDays(d.today, -1);
    const yesterdayOpen = !w.yesterdayC && yesterday >= h.created_day;
    return `
      <div class="row">
        ${w.todayC
          ? `${statusLine(w.todayC)}
             <button class="link" data-action="open-checkin" data-habit="${h.id}" data-status="${w.todayC.status === 'done' ? 'missed' : 'done'}" data-day="${d.today}">change</button>`
          : `<button class="btn primary" data-action="open-checkin" data-habit="${h.id}" data-status="done" data-day="${d.today}">${uiIcon('done')}Done</button>
             <button class="btn" data-action="open-checkin" data-habit="${h.id}" data-status="missed" data-day="${d.today}">${uiIcon('x')}Missed</button>`}
      </div>
      ${yesterdayOpen ? `<button class="link small" data-action="open-checkin" data-habit="${h.id}" data-status="done" data-day="${yesterday}">Forgot yesterday? Log it (shows as late)</button>` : ''}
      <button class="link small quiet" data-action="confirm-archive" data-habit="${h.id}">${shared ? 'End this shared goal' : 'Drop this goal'}</button>`;
  }

  function partnerActions(h, w) {
    const status = w.todayC
      ? `<p class="small ${w.todayC.status}">${statusLine(w.todayC)}${w.todayC.note ? `: “${esc(w.todayC.note)}”` : ''}</p>`
      : `<p class="small muted">Not checked in today</p>`;
    return status + nudgeRow(h.user_id, h.id, !w.todayC || w.todayC.status !== 'done');
  }

  // A shared goal: one card, both of you side by side.
  function goalCard(g) {
    const d = state.dash;
    const people = [...d.members].sort((a, b) => (a.id === d.me ? -1 : b.id === d.me ? 1 : 0));
    const rows = people
      .map((m) => {
        const h = d.habits.find((x) => x.goal_id === g.id && x.user_id === m.id);
        if (!h) return '';
        const w = habitWeek(h);
        const mine = m.id === d.me;
        return `
          <div class="duo ${mine ? 'me' : ''}">
            <div class="duo-head">
              <span class="duo-name">${mine ? 'You' : esc(m.name)}</span>
              <span class="duo-count"><strong>${w.done}</strong>/${w.target}</span>
              ${w.outlook}
            </div>
            <div class="dots">${w.dots}</div>
            ${mine ? myActions(h, w, true) : partnerActions(h, w)}
          </div>`;
      })
      .join('');
    const anyHabit = d.habits.find((x) => x.goal_id === g.id);
    const prorated = anyHabit ? habitWeek(anyHabit).prorated : '';
    return `
      <article class="card habit goal">
        <div class="habit-head">
          <span class="icon-tile">${iconSvg(g.icon)}</span>
          <div class="habit-title">
            <h3>${esc(g.title)}</h3>
            <p class="small muted">Both of you, ${g.target_per_week}x / week</p>
            ${g.why ? `<p class="why">${esc(g.why)}</p>` : ''}
          </div>
        </div>
        ${prorated ? `<div class="outlook">${prorated}</div>` : ''}
        ${rows}
      </article>`;
  }

  // A side goal: personal, visible to your partner.
  function habitCard(h, mine) {
    const w = habitWeek(h);
    return `
      <article class="card habit">
        <div class="habit-head">
          <span class="icon-tile">${iconSvg(h.icon)}</span>
          <div class="habit-title">
            <h3>${esc(h.title)}</h3>
            ${h.why ? `<p class="why">${esc(h.why)}</p>` : ''}
          </div>
          <div class="count"><strong>${w.done}</strong>/${w.target}<div class="muted small">this week</div></div>
        </div>
        <div class="dots">${w.dots}</div>
        <div class="outlook">${w.outlook}${w.prorated}</div>
        ${mine ? myActions(h, w, false) : partnerActions(h, w)}
      </article>`;
  }

  function checkinPanel(h, panel) {
    const missed = panel.status === 'missed';
    const late = panel.day !== state.dash.today;
    return `
      <form class="panel" data-form="checkin" data-habit="${h.id}" data-day="${panel.day}">
        <div class="seg" role="radiogroup" aria-label="Status">
          <label><input type="radio" name="status" value="done" ${missed ? '' : 'checked'} data-action="panel-status">${uiIcon('done')}Done</label>
          <label><input type="radio" name="status" value="missed" ${missed ? 'checked' : ''} data-action="panel-status">${uiIcon('x')}Missed</label>
        </div>
        ${late ? `<p class="small warn-text">Logging for yesterday. Your partner will see it was late.</p>` : ''}
        <label for="checkin-note">${missed ? 'What got in the way? (your partner will see this)' : 'Anything to add? (optional)'}
          <textarea id="checkin-note" name="note" rows="2" maxlength="280" ${missed ? 'required' : ''} data-autofocus></textarea>
        </label>
        <div class="row">
          <button class="btn primary" type="submit">Log it</button>
          <button class="btn" type="button" data-action="close-panel">Cancel</button>
        </div>
      </form>`;
  }

  function nudgeRow(userId, habitId, showNudge = true) {
    const panel = state.panel;
    if (panel && panel.type === 'nudge' && panel.userId === userId && panel.habitId === habitId) {
      return `
        <form class="panel" data-form="nudge" data-user="${userId}" data-habit="${habitId ?? ''}" data-kind="${panel.kind}">
          <label for="nudge-message">${panel.kind === 'cheer' ? 'Say something (optional)' : 'Add a message (optional)'}
            <input id="nudge-message" name="message" maxlength="280" data-autofocus placeholder="${panel.kind === 'cheer' ? 'Let’s go' : 'You said you would.'}">
          </label>
          <div class="row">
            <button class="btn primary" type="submit">${panel.kind === 'cheer' ? `${uiIcon('star')}Send cheer` : `${uiIcon('bell')}Send nudge`}</button>
            <button class="btn" type="button" data-action="close-panel">Cancel</button>
          </div>
        </form>`;
    }
    const attrs = `data-user="${userId}" data-habit="${habitId ?? ''}"`;
    return `
      <div class="row">
        <button class="btn small" data-action="open-nudge" data-kind="cheer" ${attrs}>${uiIcon('star')}Cheer</button>
        ${showNudge ? `<button class="btn small" data-action="open-nudge" data-kind="nudge" ${attrs}>${uiIcon('bell')}Nudge</button>` : ''}
      </div>`;
  }

  // The goal picker, for proposing a shared goal or adding a side goal.
  function addForm(kind, startOpen, partnerName) {
    const shared = kind === 'shared';
    const isOpen = state.addOpen === kind || (startOpen && state.addOpen === null);
    const current = state.addOpen === kind ? state.preset : null;
    const preset = PRESETS.find((p) => p.key === current);
    const tiles = PRESETS.map(
      (p) => `
        <button type="button" class="preset ${p.key === current ? 'on' : ''}" data-action="pick-preset" data-kind="${kind}" data-preset="${p.key}" aria-pressed="${p.key === current}">
          <span class="icon-tile">${iconSvg(p.icon)}</span>
          <span>${esc(p.label)}</span>
        </button>`
    ).join('');

    let form = '';
    if (preset) {
      const fields =
        preset.key === 'custom'
          ? `<label for="${kind}-title">Goal<input id="${kind}-title" name="title" maxlength="80" required placeholder="${shared ? 'No phone after 10pm' : 'Edit one video'}" data-autofocus></label>`
          : preset.amount
            ? `<label for="${kind}-amount">How much? <span class="muted">(${esc(preset.unit)})</span>
                 <input id="${kind}-amount" name="amount" type="number" inputmode="decimal" min="${preset.min}" step="any" value="${preset.amount}" required data-action="preset-amount">
               </label>
               <p class="preview-title">${iconSvg(preset.icon)}<span data-role="preview">${esc(preset.title(preset.amount))}</span></p>`
            : `<p class="preview-title">${iconSvg(preset.icon)}<span>${esc(preset.title())}</span></p>`;
      form = `
        <form data-form="habit" data-kind="${kind}" data-preset="${preset.key}">
          ${fields}
          <label for="${kind}-why">${shared ? 'Why you’re doing it together' : 'Why it matters'} <span class="muted">(optional)</span>
            <input id="${kind}-why" name="why" maxlength="200" placeholder="${shared ? 'Feel good for the wedding' : 'Content pays for the trip'}"></label>
          <label for="${kind}-days">Days per week${shared ? ' (for both of you)' : ''}
            <select id="${kind}-days" name="target_per_week">
              ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === preset.days ? 'selected' : ''}>${n}${n === 7 ? ' (every day)' : ''}</option>`).join('')}
            </select>
          </label>
          <button class="btn primary" type="submit">${shared ? `Propose to ${partnerName}` : 'Commit to it'}</button>
        </form>`;
    }

    return `
      <details class="card add ${shared ? 'add-shared' : ''}" data-kind="${kind}" ${isOpen ? 'open' : ''}>
        <summary>${uiIcon('plus')}${shared ? 'Propose a shared goal' : 'Add a side goal'}</summary>
        <p class="small muted">${shared ? `${partnerName} has to agree before it starts. Then you're both on the hook.` : 'Pick one to start from, or make your own.'}</p>
        <div class="presets">${tiles}</div>
        ${form}
      </details>`;
  }

  // Title for a preset + amount, with the number tidied (1.50 -> 1.5).
  function presetTitle(preset, raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return preset.title(Math.round(n * 100) / 100);
  }

  function feedItem(e) {
    const d = state.dash;
    const who = e.actor_id === d.me ? 'You' : esc(e.actor_name);
    const whom = e.target_id === d.me ? 'you' : esc(e.target_name);
    const habit = e.habit_title ? `<strong>${esc(e.habit_title)}</strong>` : '';
    const note = e.message ? ` <span class="note">“${esc(e.message)}”</span>` : '';
    const goal = `<strong>${esc(e.message)}</strong>`;
    const late = e.kind.endsWith('_late') ? ' <span class="pill warn">late, for yesterday</span>' : '';
    let text;
    switch (e.kind) {
      case 'created': text = `${who} started the pact.`; break;
      case 'joined': text = `${who} joined. It's on.`; break;
      case 'done': case 'done_late': text = `${who} did ${habit}.${note}${late}`; break;
      case 'missed': case 'missed_late': text = `${who} missed ${habit}.${note}${late}`; break;
      case 'habit_added': text = `${who} added a side goal: ${habit} (${esc(e.message)}).`; break;
      case 'habit_archived': text = `${who} dropped ${habit}.`; break;
      case 'goal_proposed': text = `${who} proposed a shared goal: ${goal}.`; break;
      case 'goal_accepted': text = `${who} agreed to ${goal}. You're both on it.`; break;
      case 'goal_declined': text = `${who} passed on ${goal}.`; break;
      case 'goal_withdrawn': text = `${who} withdrew ${goal}.`; break;
      case 'goal_ended': text = `${who} ended the shared goal ${habit}.`; break;
      case 'stakes': text = e.message ? `${who} set the stakes: <span class="note">“${esc(e.message)}”</span>` : `${who} cleared the stakes.`; break;
      case 'nudge': text = `${who} nudged ${whom}${habit ? ` about ${habit}` : ''}.${note}`; break;
      case 'cheer': text = `${who} cheered ${whom}${habit ? ` on ${habit}` : ''}.${note}`; break;
      default: text = `${who}: ${esc(e.kind)}`;
    }
    const fresh = e.id > d.last_seen_event_id && e.actor_id !== d.me;
    return `<li class="${fresh ? 'fresh' : ''} k-${esc(e.kind.replace('_late', ''))}"><span>${text}</span><time class="muted small">${ago(e.created_at)}</time></li>`;
  }

  function prettyDay(day) {
    return new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  // ---------- actions ----------

  async function guarded(fn) {
    try {
      await fn();
    } catch (err) {
      if (err.status === 401) {
        state.user = null;
        render();
      }
      toast(err.message);
    }
  }

  async function afterJoinOrCreate(pid) {
    const me = await api('GET', '/api/me');
    state.partnerships = me.partnerships;
    state.pid = pid;
    store('aa.pid', String(pid));
    await refresh();
  }

  const forms = {
    async signup(f) {
      const { user } = await api('POST', '/api/signup', { name: f.name.value, username: f.username.value, password: f.password.value });
      state.user = user;
      state.partnerships = [];
      render();
    },
    async login(f) {
      await api('POST', '/api/login', { username: f.username.value, password: f.password.value });
      await boot();
    },
    async 'create-pact'(f) {
      const { partnership } = await api('POST', '/api/partnerships', { name: f.name.value, stakes: f.stakes.value, today: localToday() });
      await afterJoinOrCreate(partnership.id);
    },
    async 'join-pact'(f) {
      const { partnership } = await api('POST', '/api/partnerships/join', { code: f.code.value });
      await afterJoinOrCreate(partnership.id);
      toast("You're in. Agree on your first shared goal.");
    },
    async stakes(f) {
      await api('PATCH', `/api/partnerships/${state.pid}`, { stakes: f.stakes.value });
      toast('Stakes saved. Your partner will see it.');
      await refresh();
    },
    async habit(f) {
      const preset = PRESETS.find((p) => p.key === f.dataset.preset);
      let title;
      if (preset.key === 'custom') title = f.title.value;
      else if (preset.amount) title = presetTitle(preset, f.amount.value);
      else title = preset.title();
      if (!title) throw new Error(`Enter how many ${preset.unit}`);
      const shared = f.dataset.kind === 'shared';
      await api('POST', shared ? '/api/goals' : '/api/habits', {
        partnership_id: state.pid,
        title,
        icon: preset.icon,
        why: f.why.value,
        target_per_week: Number(f.target_per_week.value),
        today: localToday(),
      });
      state.preset = null;
      state.addOpen = null;
      toast(shared ? 'Proposed. It starts when your partner agrees.' : 'Side goal added. Your partner can see it.');
      await refresh();
    },
    async checkin(f) {
      const status = f.querySelector('input[name=status]:checked').value;
      await api('POST', '/api/checkins', {
        habit_id: Number(f.dataset.habit),
        day: f.dataset.day,
        status,
        note: f.note.value,
        today: localToday(),
      });
      state.panel = null;
      toast(status === 'done' ? 'Logged. Nice.' : 'Logged. Owning it counts.');
      await refresh();
    },
    async nudge(f) {
      await api('POST', `/api/partnerships/${state.pid}/nudges`, {
        kind: f.dataset.kind,
        to_user_id: Number(f.dataset.user),
        habit_id: f.dataset.habit ? Number(f.dataset.habit) : null,
        message: f.message.value,
      });
      state.panel = null;
      toast(f.dataset.kind === 'cheer' ? 'Cheer sent' : 'Nudge sent');
      await refresh();
    },
  };

  const actions = {
    'auth-mode'(el) {
      state.authMode = el.dataset.mode;
      render();
    },
    async logout() {
      await api('POST', '/api/logout', {});
      Object.assign(state, { user: null, partnerships: [], pid: null, dash: null, panel: null });
      render();
    },
    'open-checkin'(el) {
      state.panel = { type: 'checkin', habitId: Number(el.dataset.habit), status: el.dataset.status, day: el.dataset.day };
      render();
    },
    'panel-status'(el) {
      state.panel.status = el.value;
      const note = app.querySelector('form[data-form=checkin] textarea')?.value || '';
      render();
      const ta = app.querySelector('form[data-form=checkin] textarea');
      if (ta) ta.value = note;
    },
    'open-nudge'(el) {
      state.panel = { type: 'nudge', kind: el.dataset.kind, userId: Number(el.dataset.user), habitId: el.dataset.habit ? Number(el.dataset.habit) : null };
      render();
    },
    'close-panel'() {
      state.panel = null;
      render();
    },
    'pick-preset'(el) {
      const same = state.addOpen === el.dataset.kind && state.preset === el.dataset.preset;
      state.addOpen = el.dataset.kind;
      state.preset = same ? null : el.dataset.preset;
      render();
    },
    async respond(el) {
      const answer = el.dataset.answer;
      await api('POST', `/api/goals/${el.dataset.goal}/respond`, { answer, today: localToday() });
      toast(answer === 'accept' ? 'Agreed. You’re both on it.' : answer === 'decline' ? 'Passed.' : 'Withdrawn.');
      await refresh();
    },
    async 'demo-join'() {
      await api('POST', '/api/demo/partner-join', {});
      toast('Your partner joined. It’s on.');
      await refresh();
    },
    'confirm-archive'(el) {
      state.panel = { type: 'archive', habitId: Number(el.dataset.habit) };
      render();
    },
    async archive(el) {
      state.panel = null;
      await api('PATCH', `/api/habits/${el.dataset.habit}`, { archived: true, today: localToday() });
      await refresh();
    },
    async 'share-code'(el) {
      const code = el.dataset.code;
      const text = `Be my accountability partner on AccountAbility. Sign up at ${location.origin} and join with code ${code}`;
      if (navigator.share) {
        try {
          await navigator.share({ text });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return; // they closed the share sheet
        }
      }
      try {
        await navigator.clipboard.writeText(text);
        toast('Invite copied');
      } catch {
        toast(`Code: ${code}`);
      }
    },
    async 'back-to-pact'() {
      state.pid = Number(store('aa.pid')) || state.partnerships[0].id;
      if (!state.partnerships.some((p) => p.id === state.pid)) state.pid = state.partnerships[0].id;
      await refresh();
    },
    'new-pact'() {
      state.pid = null;
      state.dash = null;
      render();
    },
  };

  app.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    guarded(() => forms[f.dataset.form](f)).finally(() => {
      if (btn && btn.isConnected) btn.disabled = false;
    });
  });

  app.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    guarded(() => actions[el.dataset.action](el));
  });

  // Live title preview while typing an amount.
  app.addEventListener('input', (ev) => {
    if (ev.target.dataset.action !== 'preset-amount') return;
    const form = ev.target.closest('form');
    const preset = PRESETS.find((p) => p.key === form?.dataset.preset);
    const out = form?.querySelector('[data-role=preview]');
    if (preset && out) out.textContent = presetTitle(preset, ev.target.value) || '…';
  });

  // Remember whether the add-habit section is open across re-renders.
  app.addEventListener(
    'toggle',
    (ev) => {
      if (!(ev.target.matches && ev.target.matches('details.add'))) return;
      const kind = ev.target.dataset.kind;
      if (ev.target.open && state.addOpen !== kind) {
        state.addOpen = kind;
        state.preset = null;
      } else if (!ev.target.open && state.addOpen === kind) {
        state.addOpen = 'closed'; // closed on purpose: don't auto-open it again
        state.preset = null;
      }
    },
    true
  );

  app.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.action === 'switch-pact') {
      state.pid = Number(el.value);
      state.panel = null;
      store('aa.pid', el.value);
      guarded(refresh);
    } else if (el.dataset.action === 'panel-status') {
      guarded(() => actions['panel-status'](el));
    }
  });

  // Keep the partner's side fresh without clobbering anything you're typing.
  setInterval(() => {
    if (document.hidden || !state.pid || state.panel || state.preset) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    if (app.querySelector('details.add[open] input:not(:placeholder-shown)')) return;
    guarded(refresh);
  }, 30000);

  boot();
})();
