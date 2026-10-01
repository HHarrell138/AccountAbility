'use strict';

(() => {
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const WEEK = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

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
    run: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16"/>',
    prayer: '<path d="M12 3.5c-1.6 1.6-2.6 4-2.6 6.8v3.6l-3.2 3.5 2.2 3.1 3.6-3.4z"/><path d="M12 3.5c1.6 1.6 2.6 4 2.6 6.8v3.6l3.2 3.5-2.2 3.1-3.6-3.4z"/>',
    weight: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.5 10a5 5 0 0 1 7 0"/><path d="M12 10.2l1.3-1.8"/>',
    sober: '<path d="M7.5 3.5h9l-.6 5.2a3.9 3.9 0 0 1-7.8 0z"/><path d="M12 12.6v6.9M8.5 19.5h7"/><path d="M4 4l16 16"/>',
    wake: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2.5 1.5"/><path d="M4 6.5L7 4M20 6.5L17 4"/>',
  };
  const iconSvg = (key) =>
    `<svg class="hicon i-${esc(key)}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[key] || ICONS.check}</svg>`;

  // Interface icons, same line style.
  const UI_ICONS = {
    done: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
    bell: '<path d="M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    minus: '<path d="M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    flame: ICONS.calories,
    pact: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
  };
  const uiIcon = (key, cls = '') =>
    `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UI_ICONS[key]}</svg>`;

  // Presets fill in the goal form. {n} is the amount the person picks.
  const PRESETS = [
    // `track` = log as you go: the + button adds `step` of `unit` to today's total.
    { key: 'run', icon: 'run', label: 'Run', title: (n) => `Run ${n} mile${n === 1 ? '' : 's'} a week`, amount: 15, min: 1, unit: 'miles a week', track: { unit: 'mi', step: 1, period: 'week' } },
    { key: 'water', icon: 'water', label: 'Water', title: (n) => `Drink ${n} gallon${n === 1 ? '' : 's'} of water`, amount: 1, min: 0.25, unit: 'gallons', days: 7, track: { unit: 'oz', step: 8, per: 128 } }, // goal set in gallons, logged in ounces
    { key: 'protein', icon: 'protein', label: 'Protein', personal: 'Protein', title: (n) => `Eat ${n}g of protein`, amount: 150, min: 5, unit: 'grams', days: 7, track: { unit: 'g', step: 0 } }, // 0: type the grams each time
    { key: 'calories', icon: 'calories', label: 'Hit calories', personal: 'Calories', title: (n) => `Eat at least ${n.toLocaleString()} calories`, amount: 2500, min: 500, unit: 'calories', days: 7, track: { unit: 'cal', step: 0 } }, // type the calories each time, like protein
    { key: 'calorie-cap', icon: 'calorie-cap', label: 'Calorie cap', personal: 'Calorie cap', title: (n) => `Stay under ${n.toLocaleString()} calories`, amount: 2000, min: 500, unit: 'calories', days: 6 },
    { key: 'workout', icon: 'workout', label: 'Workout', title: () => 'Work out', days: 4 },
    { key: 'steps', icon: 'steps', label: 'Steps', title: (n) => `Walk ${n.toLocaleString()} steps`, amount: 10000, min: 500, unit: 'steps', days: 5 },
    { key: 'read', icon: 'read', label: 'Read', title: (n) => `Read ${n} pages`, amount: 20, min: 1, unit: 'pages', days: 5 },
    { key: 'sleep', icon: 'sleep', label: 'Sleep', title: (n) => `Sleep ${n} hours`, amount: 8, min: 4, unit: 'hours', days: 5 },
    { key: 'wake', icon: 'wake', label: 'Wake up', schedule: { mon: '06:00', tue: '06:00', wed: '06:00', thu: '06:00', fri: '06:00', sat: '08:00', sun: '08:00' } },
    { key: 'prayer', icon: 'prayer', label: 'Prayer', title: () => 'Dedicated prayer', days: 7 },
    { key: 'sober', icon: 'sober', label: 'No alcohol', title: () => 'No alcohol', days: 7, challenge: 30 },
    { key: 'custom', icon: 'check', label: 'Custom goal', days: 5 },
  ];

  // Challenge lengths: a finish line ("30 days, no alcohol"), or ongoing.
  const CHALLENGE_DAYS = [7, 14, 21, 30, 60, 90];

  // Where a challenge stands: "Day 12 of 30", or done. '' if it's ongoing.
  function challengeLine(h) {
    if (!h?.ends_day) return '';
    const total = daysBetween(h.created_day, h.ends_day) + 1;
    const today = state.dash.today;
    if (today > h.ends_day) return `${total}-day challenge · finished`;
    if (today < h.created_day) return `${total}-day challenge`;
    const n = daysBetween(h.created_day, today) + 1;
    return n === total ? `Last day of ${total}` : `Day ${n} of ${total}`;
  }
  const challengeOver = (h) => Boolean(h.ends_day && state.dash.today > h.ends_day);

  // `personal` presets: agreed as a habit, but each person sets their own number
  // (a 130 lb and a 200 lb person shouldn't share a protein target).
  const personalPreset = (icon) => PRESETS.find((p) => p.personal && p.icon === icon);
  // Someone's number on a personal goal, in the units the form asks for.
  const ownNumber = (x) => {
    const p = personalPreset(x.icon);
    if (x.daily_amount > 0) return x.daily_amount / (p?.track?.per || 1);
    return Number(String(x.title).replace(/[^0-9.]/g, '')) || p?.amount || 0;
  };

  const state = {
    user: null,
    partnerships: [],
    pid: null,
    dash: null,
    authMode: 'signup',
    panel: null, // { type: 'miss' | 'archive', habitId }
    addOpen: null, // which goal picker is open: 'shared' | 'side' | 'closed' | null
    preset: null, // selected preset key in the open picker
    expanded: new Set(), // shared goals opened to compare with your partner
    activityOpen: false, // the Activity feed dropdown
  };

  // ---------- utils ----------

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addDays(day, n) {
    const d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

  function weekStart(day) {
    const dow = new Date(day + 'T00:00:00Z').getUTCDay();
    return addDays(day, -((dow + 6) % 7));
  }

  function ago(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  function prettyDay(day) {
    return new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch {
      return null;
    }
  }

  // Toast with an optional action button (used for Undo).
  let toastTimer;
  let toastAction = null;
  function toast(msg, action) {
    toastAction = action || null;
    toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
      toastAction = null;
    }, action ? 5000 : 3000);
  }
  toastEl.addEventListener('click', (ev) => {
    if (!ev.target.closest('button') || !toastAction) return;
    const run = toastAction.run;
    toastAction = null;
    toastEl.hidden = true;
    guarded(run);
  });

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
      state.left = me.left || [];
      const saved = Number(store('aa.pid'));
      state.pid = (me.partnerships.find((p) => p.id === saved) || me.partnerships[0] || {}).id ?? null;
      if (pendingJoin()) return joinFromLink();
      if (state.pid) await loadDash();
      checkPush(); // in the background
    } catch (err) {
      if (err.status !== 401) toast(err.message);
      state.user = null;
      // Not logged in with an invite link: say who invited them, start on sign up.
      if (pendingJoin() && !state.invite) {
        try {
          state.invite = await api('GET', `/api/invite?code=${encodeURIComponent(pendingJoin())}`);
          state.authMode = 'signup';
        } catch (e) {
          store('aa.join', '');
          toast(e.message);
        }
      }
    }
    render();
  }

  async function loadDash() {
    state.dash = await api('GET', `/api/partnerships/${state.pid}/dashboard?today=${localToday()}`);
    // The recap shows itself Sunday to Tuesday until you dismiss it, and
    // any day from Week recap on the streak card.
    const dow = new Date(`${state.dash.today}T00:00:00Z`).getUTCDay();
    const inWindow = dow === 0 || dow === 1 || dow === 2;
    if (state.recapOpen || (inWindow && state.dash.members.length > 1 && state.dash.goals.some((g) => g.status === 'active'))) {
      state.recap = await api('GET', `/api/partnerships/${state.pid}/recap?today=${localToday()}`);
    } else state.recap = null;
  }

  const recapKey = (r) => `aa.recap.${state.pid}.${r.start}${r.current ? '.sun' : ''}`;

  async function refresh() {
    await loadDash();
    render();
  }

  // ---------- views ----------

  function render() {
    if (!state.user) app.innerHTML = authView();
    else if (state.view === 'guide') app.innerHTML = guideView();
    else if (state.view === 'settings') app.innerHTML = settingsView();
    else if (state.view === 'day' && state.dash) app.innerHTML = dayView();
    else if (state.view === 'weight' && state.dash) app.innerHTML = weightView();
    else if (!state.pid || !state.dash) app.innerHTML = onboardView();
    else app.innerHTML = dashView();
    const focus = app.querySelector('[data-autofocus]');
    if (focus) focus.focus();
  }

  const logoMark = () => `<span class="mark">${uiIcon('pact')}</span>`;

  function authView() {
    if (state.authMode === 'reset') return resetView();
    const signup = state.authMode === 'signup';
    return `
      <section class="hero">
        ${logoMark()}
        <h1 class="wordmark">AccountAbility</h1>
        <p class="tagline">Goals you keep because someone's counting on you.</p>
      </section>
      ${state.invite
        ? `<p class="invite-banner">${state.invite.full
            ? `<strong>${esc(state.invite.name)}</strong> already has two people in it. You can still ${signup ? 'sign up' : 'log in'} and start your own pact.`
            : `${esc(state.invite.from)} invited you to <strong>${esc(state.invite.name)}</strong>. ${signup ? 'Sign up' : 'Log in'} and you're in.`}</p>`
        : ''}
      <form class="card" data-form="${signup ? 'signup' : 'login'}">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" aria-selected="${signup}" data-action="auth-mode" data-mode="signup">Sign up</button>
          <button type="button" role="tab" aria-selected="${!signup}" data-action="auth-mode" data-mode="login">Log in</button>
        </div>
        ${signup ? `<label for="f-name">Your first name<input id="f-name" name="name" autocomplete="given-name" maxlength="40" required></label>` : ''}
        ${signup
          ? `<label for="f-email">Email<input id="f-email" name="email" type="email" autocomplete="email" autocapitalize="none" maxlength="200" required></label>`
          : `<label for="f-login">Email<input id="f-login" name="login" autocomplete="username" autocapitalize="none" maxlength="200" required placeholder="Or your username, if you have one"></label>`}
        <label for="f-pass">Password<input id="f-pass" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required></label>
        <button class="btn primary wide" type="submit">${signup ? 'Create account' : 'Log in'}</button>
        ${signup ? '' : `<button type="button" class="link forgot" data-action="auth-mode" data-mode="reset">Forgot your password?</button>`}
      </form>
      <ul class="pitch">
        <li>${uiIcon('pact')}<span><strong>Just you and one person.</strong> No followers, no feed of strangers.</span></li>
        <li>${uiIcon('done')}<span><strong>Goals you agree on.</strong> You both say yes, then you're compared side by side.</span></li>
        <li>${uiIcon('flame')}<span><strong>One shared streak.</strong> Blue at 70%, green at 100%, gold after three perfect weeks. You each fill half the bar.</span></li>
      </ul>`;
  }

  // Forgot your password: email yourself a code, or get one from a partner.
  // The link in the email opens this with the code filled in.
  function resetView() {
    const r = state.reset || {};
    const haveCode = r.sent || r.code || r.manual;
    return `
      <section class="hero">
        ${logoMark()}
        <h1 class="wordmark">AccountAbility</h1>
      </section>
      <form class="card" data-form="${haveCode ? 'reset' : 'forgot'}">
        <h2 class="card-title">Reset your password</h2>
        <label for="r-login">Email<input id="r-login" name="login" autocomplete="username" autocapitalize="none" maxlength="200" required value="${esc(r.email || '')}" ${haveCode ? '' : 'data-autofocus'}></label>
        ${haveCode
          ? `${r.sent ? `<p class="small">If there's an account with that email, a code is on its way. Check your inbox (and spam). It works for an hour.</p>` : ''}
             <label for="r-code">Reset code<input id="r-code" name="code" autocomplete="one-time-code" autocapitalize="characters" maxlength="12" required value="${esc(r.code || '')}" ${r.code ? '' : 'data-autofocus'}></label>
             <label for="r-pass">New password<input id="r-pass" name="password" type="password" autocomplete="new-password" minlength="8" required ${r.code ? 'data-autofocus' : ''}></label>
             <button class="btn primary wide" type="submit">Set new password</button>`
          : `<button class="btn primary wide" type="submit">Email me a code</button>`}
        ${haveCode
          ? `<p class="small muted">No email? Check your spam folder, or go back and send it again.</p>`
          : `<p class="small muted"><button type="button" class="link" data-action="have-code">I already have a code</button></p>`}
        <button type="button" class="link forgot" data-action="auth-mode" data-mode="login">Back to log in</button>
      </form>`;
  }

  function onboardView() {
    return `
      <header class="top">
        <div>
          <p class="eyebrow">Hey ${esc(state.user.name)}</p>
          <h1 class="title">Who's keeping you honest?</h1>
        </div>
      </header>
      <p class="lede">Start a pact and send your partner the code, or join the one they started.</p>
      <form class="card" data-form="create-pact">
        <h2 class="card-title">Start a pact</h2>
        <label for="p-name">Name it <span class="muted">(optional)</span><input id="p-name" name="name" maxlength="60" placeholder="Hank &amp; King"></label>
        <button class="btn primary wide" type="submit">Create pact</button>
      </form>
      <form class="card" data-form="join-pact">
        <h2 class="card-title">Join with a code</h2>
        <label for="p-code">Invite code<input id="p-code" name="code" maxlength="12" autocapitalize="characters" autocomplete="off" required placeholder="ABC234"></label>
        <button class="btn wide" type="submit">Join</button>
      </form>
      ${state.left?.length ? `<section class="card">${recentlyLeft()}</section>` : ''}
      <footer class="foot">
        ${state.partnerships.length ? `<button class="link" data-action="back-to-pact">Back to my pact</button>` : ''}
        <button class="link" data-action="open-guide">How it works</button>
        <button class="link" data-action="logout">Log out</button>
      </footer>`;
  }

  const isMe = (id) => id === state.dash.me;
  // Each person's own order: reordered goals first, then the rest oldest first.
  const byOrder = (a, b) => (a.position || 1e9) - (b.position || 1e9) || a.id - b.id;
  const myHabitFor = (g) => state.dash.habits.find((h) => h.goal_id === g.id && isMe(h.user_id));
  const whoClass = (id) => (isMe(id) ? 'you' : 'them');
  const avatar = (m) => `<span class="av ${whoClass(m.id)}" aria-hidden="true">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span>`;

  function dashView() {
    const d = state.dash;
    const partners = d.members.filter((m) => !isMe(m.id));
    const partnerName = partners[0] ? esc(partners[0].name) : 'your partner';
    const waiting = d.members.length < d.partnership.max_members;
    const active = d.goals
      .filter((g) => g.status === 'active')
      .sort((a, b) => byOrder(myHabitFor(a) || { id: 1e9 + a.id }, myHabitFor(b) || { id: 1e9 + b.id }));
    const proposals = d.goals.filter((g) => g.status === 'proposed');
    const sideMine = d.habits.filter((h) => isMe(h.user_id) && !h.goal_id).sort(byOrder);
    const unread = d.events.filter((e) => e.id > d.last_seen_event_id && !isMe(e.actor_id)).length;

    return `
      <header class="top">
        <div>
          <p class="eyebrow">${esc(prettyDay(d.today))}</p>
          ${pactTitle()}
        </div>
        <button type="button" class="pair ${state.pactsOpen ? 'open' : ''}" data-action="toggle-pacts" aria-expanded="${!!state.pactsOpen}" aria-label="Your pacts">
          ${d.members.map(avatar).join('')}${uiIcon('chevron', 'chev')}
          ${waitingTotal() ? `<span class="pair-badge" aria-label="${waitingTotal()} waiting for your yes">${waitingTotal()}</span>` : ''}
        </button>
      </header>
      ${state.pactsOpen ? pactsMenu() : ''}
      ${state.addOpen === 'shared' || state.reorder ? '' : `<button type="button" class="fab ${state.fabHidden ? 'away' : ''}" data-action="open-propose" aria-label="Propose a shared goal">${uiIcon('plus')}</button>`}

      ${wakeCard()}
      ${store('aa.guideSeen') ? '' : guidePromptCard()}
      ${progressCard()}
      ${pushPromptCard()}
      ${waiting ? inviteCard() : ''}
      ${state.recap && (state.recapOpen || !store(recapKey(state.recap))) ? recapCard(state.recap) : ''}
      ${streakCard()}
      ${proposals.length ? proposalsCard(proposals) : ''}

      <section class="block">
        ${sectionHead('shared', 'Shared goals', active.length)}
        ${state.reorder === 'shared' ? reorderList() : addForm('shared', active.length === 0 && proposals.length === 0, partnerName)}
        ${state.reorder === 'shared'
          ? ''
          : active.length
          ? active.map(goalCard).join('')
          : `<p class="empty">${proposals.length ? 'Nothing is agreed yet.' : 'Agree on your first goal: tap + to propose one.'} You're both held to shared goals, and they're what your streak counts.</p>`}
      </section>

      <section class="block">
        ${sectionHead('side', 'Your side goals', sideMine.filter((h) => !h.archived_day).length)}
        <p class="section-note">Just yours. ${partnerName} can see them, but they don't count toward the streak.</p>
        ${state.reorder === 'side' ? reorderList() : `${addForm('side', false, partnerName)}${sideMine.map((h) => sideCard(h)).join('')}`}
      </section>

      ${weightCard()}

      ${partners
        .map((p) => {
          const theirs = d.habits.filter((h) => h.user_id === p.id && !h.goal_id).sort(byOrder);
          return theirs.length
            ? `<section class="block"><h2 class="section-title">${esc(p.name)}'s side goals</h2>${theirs.map((h) => sideCard(h)).join('')}</section>`
            : '';
        })
        .join('')}

      <details class="block activity-drop"${state.activityOpen ? ' open' : ''}>
        <summary class="section-title">Activity ${unread ? `<span class="badge">${unread} new</span>` : ''}${uiIcon('chevron', 'chev')}</summary>
        <ol class="feed">${d.events.filter((e) => e.kind !== 'stakes').map(feedItem).join('') || '<li class="muted">Nothing yet.</li>'}</ol>
      </details>

      <footer class="foot">
        ${window.AA_DEMO
          ? '' // the preview is one pact with no accounts
          : `<button class="link" data-action="new-pact">Start or join another pact</button>
             <button class="link" data-action="logout">Log out</button>`}
      </footer>`;
  }

  // A section heading, with Reorder once there are two or more goals to order.
  function sectionHead(kind, title, count) {
    const on = state.reorder === kind;
    return `
      <div class="section-head">
        <h2 class="section-title">${title}</h2>
        ${on || count > 1 ? `<button class="link" data-action="${on ? 'save-order' : 'start-reorder'}" data-kind="${kind}">${on ? 'Done' : 'Reorder'}</button>` : ''}
      </div>`;
  }

  // Your goals in one section as a short list with up and down arrows. The
  // order you set here is the order everywhere, Today list included.
  function reorderList() {
    const d = state.dash;
    const rows = state.reorderIds
      .map((id, i, all) => {
        const h = d.habits.find((x) => x.id === id);
        const goal = h.goal_id && d.goals.find((g) => g.id === h.goal_id);
        const title = goal && goal.personal ? personalPreset(goal.icon)?.personal || h.title : h.title;
        return `
          <li class="reorder-row">
            <span class="icon-tile sm">${iconSvg(h.icon)}</span>
            <span class="reorder-title">${esc(title)}</span>
            <button class="icon-btn" data-action="move-goal" data-index="${i}" data-dir="-1" aria-label="Move ${esc(title)} up" ${i === 0 ? 'disabled' : ''}>${uiIcon('chevron', 'up')}</button>
            <button class="icon-btn" data-action="move-goal" data-index="${i}" data-dir="1" aria-label="Move ${esc(title)} down" ${i === all.length - 1 ? 'disabled' : ''}>${uiIcon('chevron')}</button>
          </li>`;
      })
      .join('');
    return `
      <div class="card reorder">
        <ol class="reorder-list">${rows}</ol>
        <div class="row">
          <button class="btn primary" data-action="save-order">Save order</button>
          <button class="btn" data-action="cancel-reorder">Cancel</button>
        </div>
      </div>`;
  }

  function pactTitle() {
    return `<h1 class="title">${esc(state.dash.partnership.name)}</h1>`;
  }

  // Tapping your avatars at the top: every pact you're in, and a way to start
  // or join another.
  // Goals waiting for your yes, in every pact (the badge on your circle).
  const waitingIn = (pid) => state.dash?.waiting?.[pid] || 0;
  const waitingTotal = () => Object.values(state.dash?.waiting || {}).reduce((a, b) => a + b, 0);

  function pactsMenu() {
    // Pacts with a partner first, then ones still waiting for someone to
    // join; alphabetical within each.
    const waitingOn = (p) => ((p.members || []).length < 2 ? 1 : 0);
    const rows = [...state.partnerships]
      .sort((a, b) => waitingOn(a) - waitingOn(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((p) => {
        const others = (p.members || []).filter((m) => !isMe(m.id));
        const current = p.id === state.pid;
        const who = others.length ? `You & ${others.map((m) => esc(m.name)).join(', ')}` : 'Waiting for your partner to join';
        const avs = `<span class="pact-avs">${(p.members || []).map(avatar).join('')}</span>`;
        const text = `<span class="pact-text"><strong>${esc(p.name)}</strong><span class="small muted">${who}</span></span>`;
        if (!state.pactsEdit) {
          return `
          <button type="button" class="pact-row ${current ? 'current' : ''}" data-action="go-pact" data-pid="${p.id}" aria-current="${current}">
            ${avs}${text}${waitingIn(p.id) ? `<span class="badge" aria-label="${waitingIn(p.id)} waiting for your yes">${waitingIn(p.id)}</span>` : ''}${current ? uiIcon('done', 'pact-check') : ''}
          </button>`;
        }
        // Edit: leave a pact someone else is in, delete one that's just you.
        const alone = !others.length;
        const confirming = state.pactConfirm === p.id;
        // Your own name for it; your partner keeps theirs.
        if (state.pactRename === p.id) {
          return `
          <form class="pact-row editing renaming" data-form="rename-pact" data-pid="${p.id}">
            ${avs}
            <label class="pact-rename">Your name for this pact <span class="muted">(only you see it)</span>
              <input name="name" maxlength="60" value="${esc(p.name)}" placeholder="${esc(others.map((m) => m.name).join(' & ') || 'Name it')}" data-autofocus>
            </label>
            <div class="pact-confirm row">
              <button class="btn small primary" type="submit">Save</button>
              <button class="btn small" type="button" data-action="cancel-rename">Cancel</button>
            </div>
          </form>`;
        }
        return `
          <div class="pact-row editing ${confirming ? 'confirming' : ''}">
            ${avs}<span class="pact-text"><strong>${esc(p.name)}</strong><span class="small muted">${who}</span>
              ${confirming ? '' : `<button class="link rename-link" data-action="rename-pact" data-pid="${p.id}">Rename</button>`}</span>
            ${confirming ? '' : `<button class="btn small danger" data-action="confirm-leave" data-pid="${p.id}">${alone ? 'Delete' : 'Leave'}</button>`}
            ${confirming
              ? `<div class="pact-confirm">
                   <p class="small">${alone
                     ? `<strong>Delete ${esc(p.name)}?</strong> Nobody else is in it, so it goes, with its goals. You can undo this for 24 hours.`
                     : `<strong>Leave ${esc(p.name)}?</strong> Your goals there end, and shared goals end for ${esc(others.map((m) => m.name).join(' and '))} too. They keep the pact and its history, and see that you left. You can undo this for 24 hours.`}</p>
                   <div class="row">
                     <button class="btn small danger" data-action="leave-pact" data-pid="${p.id}">${alone ? 'Delete it' : 'Leave'}</button>
                     <button class="btn small" data-action="cancel-leave">Keep it</button>
                   </div>
                 </div>`
              : ''}
          </div>`;
      })
      .join('');
    return `
      <section class="card pacts-menu">
        <h2 class="card-title">Your pacts</h2>
        <div class="pact-list">${rows}</div>
        ${recentlyLeft()}
        ${state.pactsEdit
          ? `<button class="btn wide" data-action="edit-pacts">Done</button>`
          : `<button class="btn wide" data-action="new-pact">${uiIcon('plus')}Start or join a pact</button>
             <div class="pacts-foot">
               <button class="link" data-action="edit-pacts">Edit pacts</button>
               <button class="link" data-action="open-guide">How it works</button>
               ${window.AA_DEMO ? '' : `<button class="link" data-action="open-settings">Account settings</button>`}
             </div>`}
      </section>`;
  }

  // Turn notifications on for this phone, and pick what buzzes you.
  function notificationsBody() {
    const partner = state.dash.members.find((m) => !isMe(m.id));
    const pname = partner ? esc(partner.name) : 'your partner';
    let body;
    if (!pushSupported()) {
      body = onIphoneNotInstalled()
        ? `<p class="small muted">On iPhone, notifications work once AccountAbility is on your Home Screen. Tap Share, then Add to Home Screen, and open it from there.</p>`
        : `<p class="small muted">${window.AA_DEMO ? 'Notifications work in the live app, not the preview.' : "This browser can't do notifications."}</p>`;
    } else if (Notification.permission === 'denied') {
      body = `<p class="small muted">Notifications are blocked for AccountAbility. Turn them on in your phone's Settings, then come back here.</p>`;
    } else if (!state.pushOn) {
      body = `<p class="small muted">Get buzzed when ${pname} is up, hits every goal for the day, or nudges you, plus an evening reminder if you still have goals open.</p>
        <button class="btn small primary" data-action="push-on">${uiIcon('bell')}Turn on notifications</button>`;
    } else {
      const times = ['18:00', '19:00', '20:00', '21:00', '22:00'];
      const label = (t) => `${Number(t.slice(0, 2)) - 12}:00 PM`;
      const r = state.user.remind_at;
      body = `
        <label for="remind-at">Evening reminder, if goals are left
          <select id="remind-at" data-action="set-remind">
            <option value="" ${r ? '' : 'selected'}>Off</option>
            ${times.map((t) => `<option value="${t}" ${r === t ? 'selected' : ''}>${label(t)}</option>`).join('')}
            ${r && !times.includes(r) ? `<option value="${esc(r)}" selected>${esc(r)}</option>` : ''}
          </select>
        </label>
        <label class="check"><input type="checkbox" data-action="set-notify-partner" ${state.user.notify_partner ? 'checked' : ''}> When ${pname} is up, or hits every goal for the day</label>
        <p class="small muted">Nudges, cheers and goal requests always come through.</p>
        <div class="row">
          <button class="btn small" data-action="push-test">Send a test</button>
          <button class="link quiet" data-action="push-off">Turn off on this phone</button>
        </div>`;
    }
    return body;
  }

  // The morning card: from an hour before your wake-up time until you log
  // it (or three hours after), a big "I'm up" button. Log it whenever:
  // there's no window.
  function wakeCard() {
    const d = state.dash;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    for (const h of d.habits) {
      if (!isMe(h.user_id) || h.archived_day || challengeOver(h) || h.icon !== 'wake' || h.created_day > d.today) continue;
      const t = parseSched(h.schedule)?.[dayKey(d.today)];
      if (!t) continue;
      if (d.checkins.some((c) => c.habit_id === h.id && c.day === d.today)) continue;
      const at = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      if (mins < at - 60 || mins >= at + 180) continue;
      const started = mins >= at;
      return `
        <section class="card wake-card ${started ? 'live' : ''}">
          <div class="wake-head">
            <span class="icon-tile">${iconSvg('wake')}</span>
            <div>
              <p class="wake-title">${started ? 'Log your wake‑up' : `Wake up by ${esc(clockTime(t))}`}</p>
              <p class="small muted">${started ? `You were set for ${esc(clockTime(t))}.` : 'Up already? Log it now.'}</p>
            </div>
          </div>
          <button class="btn primary wide" data-action="log-done" data-habit="${h.id}" data-day="${d.today}">${uiIcon('done')}I'm up</button>
        </section>`;
    }
    return '';
  }

  // New here? A one-time card pointing at How it works.
  function guidePromptCard() {
    return `
      <section class="card push-prompt guide-prompt">
        <span class="icon-tile">${uiIcon('pact')}</span>
        <div>
          <p><strong>New here?</strong></p>
          <p class="small muted">A one-minute walkthrough of logging, the streak and your pacts. You can find it later by tapping your circles at the top.</p>
          <div class="row">
            <button class="btn small primary" data-action="open-guide">Show me</button>
            <button class="btn small" data-action="guide-later">Not now</button>
          </div>
        </div>
      </section>`;
  }

  // A one-time nudge on the dashboard to turn notifications on.
  function pushPromptCard() {
    if (!pushSupported() || state.pushOn || Notification.permission === 'denied' || store('aa.pushPrompt')) return '';
    const partner = state.dash.members.find((m) => !isMe(m.id));
    return `
      <section class="card push-prompt">
        <span class="icon-tile">${uiIcon('bell')}</span>
        <div>
          <p><strong>Turn on notifications</strong></p>
          <p class="small muted">Know when ${partner ? esc(partner.name) : 'your partner'} is up, finishes the day, or nudges you, and get an evening reminder if goals are still open.</p>
          <div class="row">
            <button class="btn small primary" data-action="push-prompt-on">Turn on</button>
            <button class="btn small" data-action="push-later">Not now</button>
          </div>
        </div>
      </section>`;
  }

  // How it works: a short version up top, then one tap-to-open section per
  // topic, so a new person can skim it in a minute and come back for detail.
  function guideView() {
    const section = (icon, title, points) => `
      <details class="card guide-section">
        <summary><span class="icon-tile sm">${icon}</span><span class="guide-h">${title}</span>${uiIcon('chevron', 'chev')}</summary>
        <ul class="guide-list">${points.map((p) => `<li>${p}</li>`).join('')}</ul>
      </details>`;
    return `
      <header class="settings-top">
        <button class="back" data-action="close-settings">${uiIcon('chevron', 'back-chev')}Back</button>
      </header>
      <h1 class="title">How it works</h1>
      <p class="lede">Goals you keep because someone's counting on you.</p>

      <section class="card guide-short">
        <p class="eyebrow">The short version</p>
        <ol class="guide-steps">
          <li><strong>Make a pact with one person.</strong> Agree on shared goals; you're both held to them.</li>
          <li><strong>Log as you go.</strong> Tap ${uiIcon('done', 'inline')} when it's done. For protein and calories, type your total so far.</li>
          <li><strong>The streak bar is both of you, together.</strong> Get it to 70% each week to keep the streak alive.</li>
          <li><strong>Miss something? Say why.</strong> Your partner sees it.</li>
        </ol>
      </section>

      ${section(uiIcon('pact'), 'Pacts and goals', [
        'A pact is you and one other person. Start one, tap <strong>Share invite link</strong>, and they land in it as soon as they sign up.',
        '<strong>Shared goals:</strong> tap the blue <strong>+</strong> in the bottom corner to propose one; the other agrees. Requests wait under <strong>Needs your yes</strong>.',
        'Some shared goals let each of you set your own number (protein, calories) or your own times (wake-up).',
        '<strong>Side goals</strong> are just yours. Your partner can see them, but they don\'t count toward the streak.',
        "On your partner's row, the bell nudges them. Once they're done it turns into a star, so you can cheer them on.",
      ])}
      ${section(iconSvg('water'), 'Logging', [
        '<strong>Check-off goals</strong> (workout, prayer, steps): tap the check. Tap it again, or Undo, to take it back.',
        '<strong>Water:</strong> each tap of + adds 8 oz. <strong>Add…</strong> types a bigger amount, and <strong>Reset</strong> sets today back to 0.',
        "<strong>Protein and calories: you update, you don't add.</strong> Tap + and type where you're at now. At 30 g earlier and 170 g now? Type 170.",
        '<strong>Run:</strong> miles add up across the week. Each tap of + is a mile.',
        "<strong>Missed it?</strong> You have to say what got in the way, and your partner sees it.",
        'You can log today and yesterday. Yesterday shows up as late.',
      ])}
      ${section(iconSvg('wake'), 'Wake-up', [
        'Set a time for each day. When you\'re up, tap the check (or <strong>I\'m up</strong> on the card at the top). It counts whenever you log it.',
        'With notifications on, your phone reminds you right at your time, and your partner hears when you\'re up.',
        'Each of you has your own time for each day. Change yours from the goal\'s ⋯ menu; the days themselves stay put.',
      ])}
      ${section(iconSvg('sober'), 'Challenges', [
        'Any goal can have a finish line: pick <strong>How long</strong> (7 to 90 days) when you add it. <strong>No alcohol</strong> starts as a 30-day challenge.',
        'The card counts it: <strong>Day 12 of 30</strong>. On a shared goal, Day 1 is the day you both agree.',
        'When it\'s over, it wraps itself up and you both see the result, like <strong>28 of 30 days</strong>. Miss the last day\'s log? You still get the next day to log it as yesterday.',
      ])}
      ${section(iconSvg('weight'), 'Weight', [
        'Log it under <strong>Weight</strong> on your dashboard: one a day, and a second one that day replaces it. Tap the card for your line over 30 days, 90 days or all time.',
        "<strong>It's just yours</strong> unless you turn on <strong>Let my partners see my weight</strong>. It's not a goal and doesn't touch the streak.",
      ])}
      ${section(uiIcon('clock'), 'Days and the week', [
        '<strong>Tap any circle</strong> to see that whole day: every goal, how close you got, and how your partner did.',
        'Today and yesterday can be logged there. Earlier days are just to look at, and later days show what\'s coming up.',
      ])}
      ${section(uiIcon('flame'), 'The streak', [
        "<strong>One bar for both of you.</strong> Each of you fills half, so one person doing everything only gets it to 50%.",
        'Every log moves it: 3 of 4 workouts is 75% of that goal.',
        '<strong>70% or more</strong> for the week keeps the streak (blue). <strong>100%</strong> turns it green. <strong>Three 100% weeks</strong> in a row: gold.',
        'A 70 to 99% week drops it a level. Under 70% breaks it.',
        'From Sunday to Tuesday, the <strong>weekly recap</strong> shows how the week went, including every miss and the reason for it.',
      ])}
      ${section(uiIcon('dots'), 'Changing your goals', [
        "Tap <strong>⋯</strong> on a goal to change what's yours: your number on protein or calories, your wake-up times, your workout day plan (Mon Push, Tue Legs…), the tap size, or to end it.",
        '<strong>Numbers you both agreed on</strong> (a gallon, 10,000 steps) and days per week can\'t be changed. Propose a new goal instead.',
        '<strong>Reorder</strong>, next to each section heading, puts your goals in the order you want.',
      ])}
      ${section(uiIcon('pact'), 'More than one pact', [
        'Tap your two circles at the top to switch pacts, <strong>rename</strong> them (only you see the name), or leave one. Leaving can be undone for 24 hours.',
        'Have the same goal in two pacts? <strong>Log it once</strong> and it counts in both.',
      ])}
      ${section(uiIcon('bell'), 'Notifications and your account', [
        '<strong>Add AccountAbility to your Home Screen</strong> (on iPhone: Share, then Add to Home Screen) and open it from there.',
        "Turn on notifications to hear when your partner joins, wakes up, hits every goal for the day, or nudges you. There's also an evening reminder if you still have goals open.",
        '<strong>Account settings</strong> (tap your circles at the top) has your email, password and notifications.',
        'Forgot your password? On the log in screen, tap <strong>Forgot your password?</strong> and you\'ll get a code by email.',
      ])}
      <button class="btn primary wide guide-done" data-action="close-settings">Got it</button>`;
  }

  // One day, every goal: tap any circle to get here. Today and yesterday can
  // be logged; earlier days are to look at; later days show what's planned.
  function dayView() {
    const d = state.dash;
    const day = state.day;
    const start = weekStart(d.today);
    const editable = canLogDay(day);
    const future = day > d.today;
    const badge = day === d.today ? 'Today' : day === addDays(d.today, -1) ? 'Yesterday' : future ? 'Coming up' : 'View only';
    const partner = d.members.find((m) => !isMe(m.id));
    const goals = d.habits
      .filter((h) => isMe(h.user_id) && h.created_day <= day && (!h.archived_day || h.archived_day > day) && (!h.ends_day || h.ends_day >= day))
      .sort((a, b) => (a.goal_id ? 0 : 1) - (b.goal_id ? 0 : 1) || byOrder(a, b));

    const rows = goals.map((h) => dayRow(h, day, editable, future, partner)).join('');
    const nav = (delta) => {
      const to = addDays(day, delta);
      const inWeek = to >= start && to <= addDays(start, 6);
      return `<button class="icon-btn" data-action="open-day" data-day="${to}" ${inWeek ? '' : 'disabled'} aria-label="${delta < 0 ? 'Previous' : 'Next'} day">${uiIcon('chevron', delta < 0 ? 'prev' : 'next')}</button>`;
    };
    return `
      <header class="settings-top">
        <button class="back" data-action="close-settings">${uiIcon('chevron', 'back-chev')}Back</button>
      </header>
      <div class="day-head">
        ${nav(-1)}
        <div class="day-title">
          <h1 class="title">${esc(dayName(day))}</h1>
          <p class="small muted">${esc(new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' }))} · <span class="day-badge ${editable ? 'live' : ''}">${badge}</span></p>
        </div>
        ${nav(1)}
      </div>
      <section class="card day-card">
        ${rows ? `<div class="today-list">${rows}</div>` : '<p class="empty">No goals on this day.</p>'}
      </section>`;
  }

  // One goal on one day: what happened (or is planned), and on today and
  // yesterday the same controls as the Today list.
  function dayRow(h, day, editable, future, partner) {
    const d = state.dash;
    const sched = parseSched(h.schedule);
    const time = sched && sched[dayKey(day)];
    const off = sched && !time;
    const title = titleOn(h, day);
    const c = d.checkins.find((x) => x.habit_id === h.id && x.day === day);
    const amt = tracked(h) ? amountOn(h, day) : 0;

    let detail = '';
    let control = '';
    if (off) {
      detail = '<span class="today-note">day off</span>';
    } else if (tracked(h)) {
      const target = weekly(h) ? null : h.daily_amount;
      detail = `<span class="today-amount">${weekly(h)
        ? `${esc(fmtAmount(amt, h.unit))} this day · ${esc(fmtAmount(weekTotal(h), ''))} / ${esc(fmtAmount(weekTarget(h), h.unit))} this week`
        : `${esc(fmtAmount(amt, ''))} / ${esc(fmtAmount(target, h.unit))}`}</span>
        ${weekly(h) ? '' : `<span class="bar combined ${amt >= target ? 'green' : ''} day-bar"><span style="width:${Math.min(100, Math.round((amt / target) * 100))}%"></span></span>`}`;
      if (editable) {
        control = plusButton(h, c?.status === 'done', 'day', true, day);
      } else if (c?.status === 'done') control = `<span class="tick-mark done">${uiIcon('done')}</span>`;
    } else if (editable) {
      control = c?.status === 'done'
        ? `<button class="tick you on sm" data-action="undo-done" data-habit="${h.id}" data-day="${day}" aria-label="${esc(title)}: done. Tap to undo.">${uiIcon('done')}</button>`
        : `<button class="tick you sm" data-action="log-done" data-habit="${h.id}" data-day="${day}" aria-label="Mark ${esc(title)} done">${uiIcon('done')}</button>`;
    } else if (c?.status === 'done') control = `<span class="tick-mark done">${uiIcon('done')}</span>`;
    else if (c?.status === 'missed') control = `<span class="tick-mark missed">${uiIcon('x')}</span>`;

    if (!off && !tracked(h)) {
      if (c?.status === 'missed') detail = `<span class="today-note bad">missed${c.note ? `: “${esc(c.note)}”` : ''}</span>`;
      else if (c?.status === 'done') detail = `<span class="today-note">${c.late ? 'done, logged late' : 'done'}</span>`;
      else if (future) detail = '<span class="today-note">coming up</span>';
      else if (!editable) detail = '<span class="today-note">not logged</span>';
    }

    // On a shared goal, how your partner did that day.
    let them = '';
    const theirs = h.goal_id && partner && d.habits.find((x) => x.goal_id === h.goal_id && x.user_id === partner.id);
    if (theirs && !future) {
      const tc = d.checkins.find((x) => x.habit_id === theirs.id && x.day === day);
      const ta = tracked(theirs) ? amountOn(theirs, day) : 0;
      const tsched = parseSched(theirs.schedule);
      const tOff = tsched && !tsched[dayKey(day)];
      const status = tOff ? 'day off' : tc?.status === 'done' ? 'done' : tc?.status === 'missed' ? 'missed' : tracked(theirs) && ta ? fmtAmount(ta, theirs.unit) : day < d.today ? 'not logged' : 'not yet';
      them = `<span class="day-them">${avatar(partner)}${esc(partner.name)}: ${esc(status)}</span>`;
    }

    const missOpen = state.panel?.type === 'miss' && state.panel.habitId === h.id && state.panel.day === day;
    const amountOpen = tracked(h) && panelFor(h, 'day') && state.panel.day === day;
    const canMiss = editable && !off && !tracked(h) && !c;
    const canReset = editable && tracked(h) && amt > 0;
    return `
      <div class="today-row day-row ${c ? `day-${c.status}` : ''} ${off ? 'off' : ''}">
        <div class="today-name">
          <span class="icon-tile sm">${iconSvg(h.icon)}</span>
          <span class="today-title">${esc(title)}${detail ? `<span class="day-detail">${detail}</span>` : ''}${them}</span>
        </div>
        ${control}
        ${canMiss || canReset
          ? `<div class="day-links">${canMiss ? `<button class="link" data-action="open-miss" data-habit="${h.id}" data-day="${day}">Missed it?</button>` : ''}
             ${canReset ? `<button class="link quiet" data-action="reset-amount" data-habit="${h.id}" data-day="${day}">Reset</button>` : ''}</div>`
          : ''}
        ${missOpen ? missPanel(h, day) : ''}
        ${amountOpen ? amountPanel(h) : ''}
      </div>`;
  }

  // Account settings: its own page, from the pacts menu. Notifications,
  // email and password.
  function settingsView() {
    return `
      <header class="settings-top">
        <button class="back" data-action="close-settings">${uiIcon('chevron', 'back-chev')}Back</button>
      </header>
      <h1 class="title">Account settings</h1>
      <p class="lede">${esc(state.user.name)} · ${esc(state.user.email || state.user.username)}</p>

      <section class="card settings-card">
        <h2 class="card-title">Notifications</h2>
        ${notificationsBody()}
      </section>

      <form class="card settings-card" data-form="email">
        <h2 class="card-title">Email</h2>
        <p class="small muted">${state.user.email ? 'You log in with this, and a forgotten-password code comes here.' : 'Add your email to log in with it, and to reset your password by email if you forget it.'}</p>
        <label for="acct-email" class="sr-only">Email</label>
        <input id="acct-email" name="email" type="email" autocomplete="email" autocapitalize="none" maxlength="200" required value="${esc(state.user.email || '')}" placeholder="you@example.com">
        <button class="btn" type="submit">${state.user.email ? 'Update email' : 'Add email'}</button>
      </form>

      <form class="card settings-card" data-form="password">
        <h2 class="card-title">Password</h2>
        <label for="pw-cur">Current password<input id="pw-cur" name="current" type="password" autocomplete="current-password" required></label>
        <label for="pw-new">New password<input id="pw-new" name="password" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn" type="submit">Change password</button>
      </form>

      <button class="btn wide" data-action="logout">Log out</button>`;
  }

  // Pacts you left or deleted in the last 24 hours, each with Undo.
  function recentlyLeft() {
    if (!state.left?.length) return '';
    return `
      <div class="left-list">
        <p class="eyebrow">Recently ${state.left.every((l) => l.deleted) ? 'deleted' : 'left'}</p>
        ${state.left
          .map((l) => `
            <div class="left-row">
              <span class="small"><strong>${esc(l.name)}</strong> <span class="muted">${l.deleted ? 'deleted' : 'left'} ${ago(l.created_at)}</span></span>
              <button class="btn small" data-action="undo-leave" data-leave="${l.id}">Undo</button>
            </div>`)
          .join('')}
        <p class="small muted">Undo works for 24 hours.</p>
      </div>`;
  }

  function inviteCard() {
    const code = state.dash.partnership.invite_code;
    return `
      <section class="card invite">
        <h2 class="card-title">Bring in your partner</h2>
        <p class="small">Send them the link. They sign up (or log in) and land right in your pact. You can propose shared goals now; they start once your partner agrees.</p>
        <button class="btn primary wide" data-action="share-code" data-code="${esc(code)}">Share invite link</button>
        <p class="small muted invite-code">Or they can join with the code <strong>${esc(code)}</strong></p>
        ${window.AA_DEMO ? `<button class="btn primary wide" data-action="demo-join">Preview: have your partner join</button>` : ''}
      </section>`;
  }

  // Today across every goal you have, shared and side. Doubles as a
  // checklist: each row has the same one-tap check as the goal cards.
  // A goal whose weekly target is already hit doesn't count against today
  // unless you do it anyway.
  // One person's goals today in this pact, and where each stands.
  function dayStatus(userId) {
    const d = state.dash;
    const scored = new Map((d.week.members[userId]?.habits || []).map((x) => [x.habit_id, x]));
    const goals = d.habits
      .filter((h) => h.user_id === userId && !h.archived_day && !challengeOver(h) && h.created_day <= d.today)
      // Shared first, in *your* order (your partner's rows follow it too, so
      // the bars line up), then side goals in their owner's order.
      .sort((a, b) => (a.goal_id ? 0 : 1) - (b.goal_id ? 0 : 1) || byOrder(inMyOrder(a), inMyOrder(b)));
    const items = goals.map((h) => {
      const c = d.checkins.find((x) => x.habit_id === h.id && x.day === d.today);
      const sched = parseSched(h.schedule);
      const offToday = sched && !sched[dayKey(d.today)];
      const status = weekly(h)
        ? weekDone(h) ? 'rest' : 'week'
        : c ? c.status : offToday ? 'off' : scored.get(h.id)?.met ? 'rest' : 'todo';
      return { h, status };
    });
    const due = items.filter((i) => i.status !== 'rest' && i.status !== 'off' && i.status !== 'week');
    const done = due.filter((i) => i.status === 'done').length;
    const missed = due.filter((i) => i.status === 'missed').length;
    return { goals, items, due, done, missed, left: due.length - done - missed };
  }

  // A shared goal sorts by where *you* put it; a side goal by its owner.
  const inMyOrder = (h) => (h.goal_id && !isMe(h.user_id) ? state.dash.habits.find((x) => x.goal_id === h.goal_id && isMe(x.user_id)) || h : h);

  // One segment for a goal due today; amount goals fill partway.
  function segment(i) {
    const part = i.status === 'todo' && tracked(i.h) ? Math.min(100, Math.round((amountOn(i.h, state.dash.today) / i.h.daily_amount) * 100)) : 0;
    return `<span class="seg ${i.status === 'done' ? 'done' : i.status === 'missed' ? 'missed' : ''}" data-goal="${i.h.goal_id || ''}"${part ? ` style="--pct:${part}%"` : ''}></span>`;
  }

  // Everyone's bars, lined up: one column per shared goal, in your order, so
  // the same goal sits in the same spot on every row. A shared goal that's
  // due for one of you but not the other (a day off, the week's target hit)
  // leaves an empty outline on the other's row. Side goals come after.
  function boardBars(statuses) {
    const sharedIds = [];
    for (const st of statuses) for (const i of st.due) if (i.h.goal_id && !sharedIds.includes(i.h.goal_id)) sharedIds.push(i.h.goal_id);
    const mine = statuses[0].goals.filter((h) => h.goal_id).map((h) => h.goal_id);
    sharedIds.sort((a, b) => (mine.includes(a) ? mine.indexOf(a) : 1e9) - (mine.includes(b) ? mine.indexOf(b) : 1e9));
    const rows = statuses.map((st) => [
      ...sharedIds.map((gid) => {
        const i = st.due.find((x) => x.h.goal_id === gid);
        return i ? segment(i) : `<span class="seg gap" data-goal="${gid}" title="Not due today"></span>`;
      }),
      ...st.due.filter((i) => !i.h.goal_id).map(segment),
    ]);
    // Same number of slots on every row, so every column is the same width.
    const width = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => [...r, ...Array(width - r.length).fill('<span class="seg pad" aria-hidden="true"></span>')].join(''));
  }

  function progressCard() {
    const d = state.dash;
    const { goals, items, due, done, missed, left } = dayStatus(d.me);

    let meta;
    if (!goals.length) meta = 'No goals yet';
    else if (!due.length) meta = 'Nothing due today.';
    else if (left === 0 && missed === 0) meta = '<strong>All done</strong> for today';
    else meta = [left ? `<strong>${left} left</strong>` : '', missed ? `${missed} missed` : ''].filter(Boolean).join(' · ');

    // Everyone's day at a glance: you first, then your partner.
    const people = [...d.members].sort((a, b) => (isMe(a.id) ? -1 : isMe(b.id) ? 1 : 0));
    const statuses = people.map((m) => (isMe(m.id) ? { goals, due, done, missed, left } : dayStatus(m.id)));
    const bars = boardBars(statuses);
    const board = people
      .map((m, n) => {
        const st = statuses[n];
        const all = st.due.length && st.done === st.due.length;
        return `
          <div class="board-row ${whoClass(m.id)}">
            ${avatar(m)}
            <span class="board-name">${isMe(m.id) ? 'You' : esc(m.name)}</span>
            ${st.due.length
              ? `<div class="segments" role="img" aria-label="${isMe(m.id) ? 'You' : esc(m.name)}: ${st.done} of ${st.due.length} done today">${bars[n]}</div>
                 <span class="board-num ${all ? 'all' : ''}">${st.done}<span>/${st.due.length}</span></span>`
              : `<span class="board-none">Nothing due today</span>`}
          </div>`;
      })
      .join('');
    const rows = items
      .map(({ h, status }) => {
        let control;
        if (tracked(h) && status !== 'missed') {
          control = plusButton(h, status === 'done' || (weekly(h) && status === 'rest'), 'today', true);
        } else if (status === 'done') {
          control = `<button class="tick you on sm" data-action="undo-done" data-habit="${h.id}" data-day="${d.today}" aria-label="${esc(h.title)}: done today. Tap to undo.">${uiIcon('done')}</button>`;
        } else if (status === 'missed') {
          control = `<span class="tick-mark missed" aria-label="Missed today">${uiIcon('x')}</span>`;
        } else {
          control = `<button class="tick you sm" data-action="log-done" data-habit="${h.id}" data-day="${d.today}" aria-label="Mark ${esc(h.title)} done today">${uiIcon('done')}</button>`;
        }
        const note = status === 'rest' ? '<span class="today-note">week done</span>'
          : status === 'off' ? '<span class="today-note">off today</span>'
          : status === 'missed' ? '<span class="today-note bad">missed</span>'
          : '';
        return `
          <div class="today-row ${status}">
            <button type="button" class="today-name" data-action="jump" data-target="${h.goal_id ? `g-${h.goal_id}` : `h-${h.id}`}">
              <span class="icon-tile sm">${iconSvg(h.icon)}</span>
              <span class="today-title">${esc(todayTitle(h))}${tracked(h) && status !== 'missed'
                ? `<span class="today-amount">${weekly(h)
                    ? `${esc(fmtAmount(weekTotal(h), ''))} / ${esc(fmtAmount(weekTarget(h), h.unit))} this week`
                    : `${esc(fmtAmount(amountOn(h, d.today), ''))} / ${esc(fmtAmount(h.daily_amount, h.unit))}`}</span>`
                : ''}</span>
              ${h.goal_id ? '<span class="tag">shared</span>' : ''}
              ${note}
            </button>
            ${control}
            ${tracked(h) && panelFor(h, 'today') ? amountPanel(h) : ''}
          </div>`;
      })
      .join('');

    return `
      <section class="card progress-card" aria-label="Your progress today">
        <div class="progress-head">
          <p class="eyebrow">Today</p>
          <p class="progress-meta">${meta}</p>
        </div>
        <div class="board">${board}</div>
        ${rows ? `<div class="today-list">${rows}</div>` : '<p class="small muted">Agree on a shared goal or add a side goal below, and your day shows up here.</p>'}
      </section>`;
  }

  const TIER_NAMES = { gold: 'Gold', green: 'Green', blue: 'Blue' };

  // How the week went, together: the combined score, where the streak
  // landed, each shared goal, and every miss with its reason.
  function recapCard(r) {
    const d = state.dash;
    const nameOf = (id) => (isMe(id) ? 'You' : esc(d.members.find((m) => m.id === id)?.name || 'Your partner'));
    const short = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const weekday = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
    const pct = r.pct == null ? null : Math.round(r.pct * 100);
    const goalName = (g) => personalPreset(g.icon)?.personal || (g.rows.find((x) => isMe(x.user_id)) || g.rows[0]).title;
    const sorted = [...r.goals].sort((a, b) => b.pct - a.pct);
    const verdict = pct == null
      ? 'No shared goals that week.'
      : r.tier
        ? `${TIER_NAMES[r.tier]} ${r.current ? 'so far' : 'week'}. Streak: ${r.weeks} week${r.weeks === 1 ? '' : 's'}.`
        : r.current ? 'Under 70% so far. Today can still change that.' : 'Under 70%, so the streak broke. New week, clean slate.';
    const goals = sorted
      .map((g) => {
        const p = Math.round(g.pct * 100);
        return `
          <li class="recap-goal">
            <span class="icon-tile sm">${iconSvg(g.icon)}</span>
            <span class="recap-goal-text"><span>${esc(goalName(g))}</span><span class="bar combined ${p >= 100 ? 'green' : p >= 70 ? 'blue' : ''}"><span style="width:${p}%"></span></span></span>
            <span class="bar-num">${p}%</span>
          </li>`;
      })
      .join('');
    const misses = r.misses
      .map((m) => {
        const h = d.habits.find((x) => x.id === m.habit_id);
        return `<li><strong>${nameOf(m.user_id)}</strong> <span class="muted">${weekday(m.day)} · ${esc(h?.title || 'a goal')}</span>${m.note ? `<br><span class="recap-note">“${esc(m.note)}”</span>` : ''}</li>`;
      })
      .join('');
    return `
      <section class="card recap tier-${r.tier || 'none'}" id="recap">
        <p class="eyebrow">${r.current ? 'Your week so far' : 'Last week'} · ${short(r.start)} to ${short(r.end)}</p>
        <div class="recap-head">
          <span class="recap-pct">${pct == null ? '–' : `${pct}%`}</span>
          <span class="small">together<br><span class="muted">${verdict}</span></span>
        </div>
        ${goals ? `<ul class="recap-goals">${goals}</ul>` : ''}
        ${sorted.length > 1 && sorted[0].pct > sorted[sorted.length - 1].pct
          ? `<p class="small"><strong>Best:</strong> ${esc(goalName(sorted[0]))}. <strong>Toughest:</strong> ${esc(goalName(sorted[sorted.length - 1]))}.</p>`
          : ''}
        ${misses ? `<p class="eyebrow">Missed, and why</p><ul class="recap-misses">${misses}</ul>` : pct == null ? '' : '<p class="small muted">No misses logged. Nice.</p>'}
        ${r.nudges || r.cheers ? `<p class="small muted">${r.nudges} nudge${r.nudges === 1 ? '' : 's'} · ${r.cheers} cheer${r.cheers === 1 ? '' : 's'}</p>` : ''}
        <div class="row"><button class="btn small" data-action="close-recap">${state.recapOpen ? 'Close' : 'Got it'}</button></div>
      </section>`;
  }

  // The pair streak: its color (blue / green / gold), how far each of you is
  // this week against the 70% and 100% lines, and the last 8 weeks.
  function streakCard() {
    const d = state.dash;
    const s = d.streak;
    const tier = s.tier;
    const thisWeek = s.thisWeek;

    let next;
    if (!thisWeek) next = 'Starts once your partner joins and you agree on a goal.';
    else if (!tier) next = 'Get your combined bar to 70% this week to start a streak.';
    else if (tier === 'gold') next = 'Perfect weeks keep it gold. Under 100% drops it to green.';
    else if (tier === 'green') {
      const left = Math.max(1, s.goldRun - s.fullRun);
      next = `${left} more perfect week${left === 1 ? '' : 's'} in a row for gold.`;
    } else next = 'Hit 100% for a full week to go green.';

    // One bar for the pair: each of you fills half, so it only gets past
    // halfway when you're both putting in.
    const pct = thisWeek?.pct == null ? null : Math.round(thisWeek.pct * 100);
    const barTier = pct == null ? 'none' : pct >= 100 ? 'green' : pct >= 70 ? 'blue' : 'none';
    const bars = thisWeek
      ? `
        <div class="bar-row together">
          <span class="pair-avs">${d.members.map(avatar).join('')}</span>
          <div class="bar marked combined ${barTier}"><span style="width:${pct ?? 0}%"></span><i class="mark-70"></i></div>
          <span class="bar-num">${pct == null ? '–' : `${pct}%`}</span>
        </div>`
      : '';

    const weeksShown = (s.history || []).slice(-7);
    const history = weeksShown.length
      ? `<div class="history" aria-label="Recent weeks">
          ${weeksShown
            .map((w) => `<span class="wk ${w.tier || 'none'}" title="Week of ${esc(w.start)}: ${w.pct == null ? 'no shared goals' : `${Math.round(w.pct * 100)}%`}"></span>`)
            .join('')}
          <span class="wk now ${tier || 'none'}" title="This week"></span>
        </div>`
      : '';

    return `
      <section class="card streak-card tier-${tier || 'none'}">
        <div class="streak">
          <span class="streak-flame">${uiIcon('flame')}</span>
          <div>
            <div class="streak-num">${s.weeks}<span> week${s.weeks === 1 ? '' : 's'}</span></div>
            <div class="streak-tier">${tier ? `${TIER_NAMES[tier]} streak` : 'No streak yet'}</div>
          </div>
          ${history}
        </div>
        <p class="small muted streak-next">${next}</p>
        ${bars ? `<div class="bars"><p class="eyebrow">This week, together</p>${bars}</div>` : ''}
        <button class="link recap-link" data-action="open-recap">${new Date(`${d.today}T00:00:00Z`).getUTCDay() === 0 ? 'This week’s recap' : 'Last week’s recap'}</button>
        <p class="legend"><span class="key blue"></span>70%+ <span class="key green"></span>100% <span class="key gold"></span>3 perfect weeks</p>
      </section>`;
  }


  // Goal requests, kept small: ones waiting on your answer get a one-line
  // row with Agree and Pass; ones you sent fold into a single line you can
  // open to withdraw.
  function proposalsCard(proposals) {
    const d = state.dash;
    const nameOf = (id) => esc(d.members.find((m) => m.id === id)?.name || 'Your partner');
    const partner = d.members.find((m) => !isMe(m.id));
    const incoming = proposals.filter((g) => !isMe(g.proposed_by));
    const outgoing = proposals.filter((g) => isMe(g.proposed_by));
    const sub = (g) => [esc(cadence(g)), g.ends_after ? `${g.ends_after}-day challenge` : '', g.personal ? 'your own number' : g.schedule ? 'your own times' : ''].filter(Boolean).join(' · ');

    const ask = incoming
      .map((g) => {
        const accepting = state.panel?.type === 'accept' && state.panel.goalId === g.id;
        return `
          <div class="req ask">
            <span class="icon-tile sm">${iconSvg(g.icon)}</span>
            <div class="req-text">
              <span class="req-title">${esc(g.title)}</span>
              <span class="small muted">${nameOf(g.proposed_by)} · ${sub(g)}</span>
            </div>
            ${accepting
              ? ''
              : `<div class="req-actions">
                   <button class="btn small primary" data-action="${g.schedule || g.personal ? 'open-accept' : 'respond'}" data-goal="${g.id}" data-answer="accept">Agree</button>
                   <button class="btn small" data-action="respond" data-goal="${g.id}" data-answer="decline">Pass</button>
                 </div>`}
            ${accepting ? (g.personal ? acceptNumberPanel(g, nameOf(g.proposed_by)) : g.schedule ? acceptPanel(g, nameOf(g.proposed_by)) : '') : ''}
          </div>`;
      })
      .join('');

    const sent = outgoing.length
      ? `<details class="req-mine"${state.reqOpen ? ' open' : ''}>
          <summary><span>${partner ? `Waiting on ${esc(partner.name)}` : 'Waiting for your partner to join'} · ${outgoing.length} sent</span>${uiIcon('chevron', 'chev')}</summary>
          ${outgoing
            .map((g) => `
              <div class="req">
                <span class="icon-tile sm">${iconSvg(g.icon)}</span>
                <div class="req-text"><span class="req-title">${esc(g.title)}</span><span class="small muted">${sub(g)}</span></div>
                <button class="link quiet" data-action="respond" data-goal="${g.id}" data-answer="withdraw">Withdraw</button>
              </div>`)
            .join('')}
        </details>`
      : '';

    return `
      <section class="card proposals ${incoming.length ? '' : 'quiet'}">
        ${incoming.length ? `<h2 class="card-title">Needs your yes <span class="badge">${incoming.length}</span></h2>${ask}` : ''}
        ${sent}
      </section>`;
  }

  // Agreeing to a wake-up goal: set your own times first.
  function acceptPanel(g, proposer) {
    return `
      <form class="panel accept-panel" data-form="accept" data-goal="${g.id}">
        <p class="small">You're agreeing to the habit, not ${proposer}'s times. Set yours. ${proposer} keeps theirs.</p>
        ${schedEditor(`accept-${g.id}`, parseSched(g.schedule) || {}, 'Your wake-up times')}
        <p class="small muted" data-role="preview-sub">${esc(schedLine(parseSched(g.schedule) || {}))}</p>
        <div class="row">
          <button class="btn primary" type="submit">${uiIcon('done')}Agree with my times</button>
          <button class="btn" type="button" data-action="close-panel">Cancel</button>
        </div>
      </form>`;
  }

  // Agreeing to a protein/calorie goal: pick your own number first.
  function acceptNumberPanel(g, proposer) {
    return numberForm('accept-number', `data-goal="${g.id}"`, g,
      `You're agreeing to the habit, not ${proposer}'s number. Set yours. ${proposer} keeps theirs.`,
      `${uiIcon('done')}Agree with my number`);
  }

  // The number field for a personal goal, with a live title preview.
  function numberForm(name, attrs, x, note, submit) {
    const p = personalPreset(x.icon);
    const n = ownNumber(x);
    return `
      <form class="panel accept-panel" data-form="${name}" ${attrs} data-preset="${p.key}">
        ${note ? `<p class="small">${note}</p>` : ''}
        <label for="${name}-${x.id}">Your number <span class="muted">(${esc(p.unit)})</span>
          <input id="${name}-${x.id}" name="amount" type="number" inputmode="decimal" min="${p.min}" step="any" value="${n}" required data-action="preset-amount" data-autofocus>
        </label>
        <p class="preview-title">${iconSvg(p.icon)}<span data-role="preview">${esc(p.title(n))}</span></p>
        <div class="row">
          <button class="btn primary" type="submit">${submit}</button>
          <button class="btn" type="button" data-action="close-panel">Cancel</button>
        </div>
      </form>`;
  }

  // Your number under a personal goal's row (the calorie cap, which has no
  // running total to show it).
  function numberRow(h, shared) {
    if (!personalPreset(h.icon)) return '';
    if (state.panel?.type === 'edit-number' && state.panel.habitId === h.id) {
      return numberForm('edit-number', `data-habit="${h.id}"`, h, shared ? 'Your partner will see your new number.' : '', 'Save number');
    }
    const mine = isMe(h.user_id) && !h.archived_day;
    if (!shared && !mine) return '';
    // Logged goals already show the number ("0 / 180g today").
    if (tracked(h)) return '';
    return `
      <div class="row-sched">
        ${uiIcon('flame')}<span>${esc(h.title)}</span>
      </div>`;
  }

  // One person's week on one habit.
  function habitWeek(h) {
    const d = state.dash;
    const start = weekStart(d.today);
    const byDay = new Map(d.checkins.filter((c) => c.habit_id === h.id).map((c) => [c.day, c]));
    const score = d.week.members[h.user_id]?.habits.find((x) => x.habit_id === h.id);
    const done = score ? score.done : 0;
    const target = score ? score.target : h.target_per_week;
    const todayC = byDay.get(d.today);

    // Only good news gets a pill. How far behind you are is left to the count.
    let outlook = '';
    if (!score && !h.archived_day) outlook = `<span class="pill">starts Monday</span>`; // no scheduled days left this week
    else if (done >= target) outlook = `<span class="pill good">target hit</span>`;

    const sched = parseSched(h.schedule);
    const dots = DAY_LABELS.map((label, i) => {
      const day = addDays(start, i);
      const c = byDay.get(day);
      const offDay = sched && !sched[WEEK[i][0]];
      const got = !c && tracked(h) ? amountOn(h, day) : 0; // partway there: a partly filled dot
      const ran = weekly(h) && amountOn(h, day) > 0; // weekly totals: every day you logged fills in
      const cls = ['dot', c ? c.status : ran ? 'done' : '', got && !ran ? 'partial' : '', day === d.today ? 'today' : '', day > d.today || day < h.created_day || (h.ends_day && day > h.ends_day) || offDay ? 'off' : ''].join(' ');
      const title = c ? `${c.status}${c.late ? ' (late)' : ''}${c.note ? ': ' + c.note : ''}` : got ? fmtAmount(got, h.unit) : day;
      const fill = got ? ` style="--pct:${Math.min(100, Math.round((got / h.daily_amount) * 100))}%"` : '';
      // Every circle opens that day: all your goals on it, editable for
      // today and yesterday.
      return `<button type="button" class="${cls}" data-action="open-day" data-day="${day}" aria-label="${esc(`${dayName(day)}: ${title}`)}"${fill}></button>`;
    }).join('');

    return { done, target, todayC, yesterdayC: byDay.get(addDays(d.today, -1)), outlook, dots };
  }

  function dayHeader() {
    const d = state.dash;
    const start = weekStart(d.today);
    return `<div class="tracker-days" aria-hidden="true"><span></span>${DAY_LABELS.map((l, i) => `<span class="${addDays(start, i) === d.today ? 'is-today' : ''}">${l}</span>`).join('')}<span></span></div>`;
  }

  // The round button at the end of a row: yours logs Done in one tap, your
  // partner's sends a nudge (or a cheer once they've done it).
  function rowAction(h, w) {
    const d = state.dash;
    if (challengeOver(h)) return `<span class="tick-mark closed" aria-label="Challenge finished">${uiIcon('star')}</span>`;
    if (isMe(h.user_id) && tracked(h)) {
      return plusButton(h, weekly(h) ? weekDone(h) : w.todayC?.status === 'done', 'card');
    }
    if (isMe(h.user_id)) {
      if (w.todayC?.status === 'done') {
        return `<button class="tick you on" data-action="undo-done" data-habit="${h.id}" data-day="${d.today}" aria-label="Done today. Tap to undo.">${uiIcon('done')}</button>`;
      }
      return `<button class="tick you" data-action="log-done" data-habit="${h.id}" data-day="${d.today}" aria-label="Mark ${esc(h.title)} done today">${uiIcon('done')}</button>`;
    }
    const done = w.todayC?.status === 'done';
    return `<button class="tick them ${done ? 'soft' : ''}" data-action="send" data-kind="${done ? 'cheer' : 'nudge'}" data-user="${h.user_id}" data-habit="${h.id}" aria-label="${done ? 'Cheer' : 'Nudge'}: ${esc(h.title)}">${uiIcon(done ? 'star' : 'bell')}</button>`;
  }

  function subline(h, w, person) {
    const d = state.dash;
    const mine = isMe(h.user_id);
    const bits = [`<strong>${mine ? 'You' : esc(person.name)}</strong>`];
    if (weekly(h)) {
      if (weekDone(h)) bits.push('<span class="pill good">target hit</span>');
      return `<div class="subline">${bits.join('')}</div>`;
    }
    bits.push(`<span class="num">${w.done}/${w.target}</span>`, w.outlook);
    if (w.todayC) {
      const note = w.todayC.note ? `: “${esc(w.todayC.note)}”` : '';
      bits.push(`<span class="${w.todayC.status}-text">${w.todayC.status === 'done' ? 'did it today' : 'missed today'}${note}</span>`);
    }
    if (mine && !w.todayC) bits.push(`<button class="link" data-action="open-miss" data-habit="${h.id}">Missed it?</button>`);
    return `<div class="subline">${bits.join('')}</div>`;
  }

  function trackerRow(h, person, personal) {
    const w = habitWeek(h);
    const missOpen = state.panel && state.panel.type === 'miss' && state.panel.habitId === h.id;
    return `
      <div class="tracker-row ${whoClass(h.user_id)}">
        ${avatar(person)}
        ${w.dots}
        ${rowAction(h, w)}
        ${subline(h, w, person)}
        ${tracked(h) ? amountRow(h) : ''}
        ${schedRow(h)}
        ${planRow(h)}
        ${personal !== undefined ? numberRow(h, personal) : ''}
        ${missOpen ? missPanel(h) : ''}
      </div>`;
  }

  // "Mon–Thu 5:30 AM · ..." under a scheduled row, with Edit times on your own.
  // "Mon–Thu 5:30 AM · ..." under a scheduled row. Edit from the ⋯ menu.
  function schedRow(h) {
    const sched = parseSched(h.schedule);
    if (!sched) return '';
    return `
      <div class="row-sched">
        ${uiIcon('clock')}<span>${esc(schedSummary(sched))}</span>
      </div>`;
  }

  function missPanel(h, day) {
    return `
      <form class="panel" data-form="miss" data-habit="${h.id}" ${day ? `data-day="${day}"` : ''}>
        <label for="miss-note">What got in the way? <span class="muted">Your partner sees this.</span>
          <textarea id="miss-note" name="note" rows="2" maxlength="280" required data-autofocus></textarea>
        </label>
        <div class="row">
          <button class="btn primary" type="submit">Log the miss</button>
          <button class="btn" type="button" data-action="close-panel">Cancel</button>
        </div>
      </form>`;
  }

  function endControl(h, shared) {
    const d = state.dash;
    if (state.panel && state.panel.type === 'archive' && state.panel.habitId === h.id) {
      const partner = d.members.find((m) => !isMe(m.id));
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
    return ''; // ending a goal starts from its ⋯ menu
  }

  function cardHead(icon, title, sub, why, editHabit = null) {
    return `
      <div class="card-head">
        <span class="icon-tile">${iconSvg(icon)}</span>
        <div class="card-head-text">
          <h3>${esc(title)}</h3>
          <p class="small muted">${sub}</p>
          ${why ? `<p class="why">${esc(why)}</p>` : ''}
        </div>
        ${editHabit ? `<button class="card-menu" data-action="edit-goal" data-habit="${editHabit.id}" aria-label="Edit your goal" aria-expanded="${state.panel?.type === 'edit-goal' && state.panel.habitId === editHabit.id}">${uiIcon('dots')}</button>` : ''}
      </div>`;
  }

  // The ⋯ menu on a goal: change what's yours. Your own number where each
  // of you sets one (protein, calories) and anything on a side goal; your
  // wake-up times (not which days); your workout day plan; what one tap of +
  // adds; and ending it. A number you both agreed on, and days a week, are
  // the pact itself: changing those means proposing a new goal.
  function editPanel(h, shared) {
    if (!(state.panel?.type === 'edit-goal' && state.panel.habitId === h.id)) return '';
    const d = state.dash;
    const preset = h.icon === 'check' ? null : PRESETS.find((p) => p.icon === h.icon && p.key !== 'custom');
    const partner = d.members.find((m) => !isMe(m.id));
    const goal = h.goal_id ? d.goals.find((g) => g.id === h.goal_id) : null;
    const ownNumber = !shared || Boolean(goal?.personal); // side goals, or "each sets their own"
    const fields = [];
    if (preset?.amount && ownNumber) {
      const n = tracked(h) ? h.daily_amount / (preset.track?.per || 1) : Number(String(h.title).replace(/[^0-9.]/g, '')) || preset.amount;
      fields.push(`
        <label for="eg-amount-${h.id}">Your goal <span class="muted">(${esc(preset.unit)})</span>
          <input id="eg-amount-${h.id}" name="amount" type="number" inputmode="decimal" min="${preset.min}" step="any" value="${Math.round(n * 100) / 100}" required data-action="preset-amount">
        </label>
        <p class="preview-title">${iconSvg(h.icon)}<span data-role="preview">${esc(h.title)}</span></p>`);
    }
    if (h.icon === 'check' && !shared) {
      fields.push(`<label for="eg-title-${h.id}">Name<input id="eg-title-${h.id}" name="title" maxlength="80" required value="${esc(h.title)}"></label>`);
    }
    if (tracked(h) && !typed(h)) {
      fields.push(`
        <label for="eg-step-${h.id}">Each tap of + adds <span class="muted">(${esc(UNIT_NAMES[h.unit] || h.unit)})</span>
          <input id="eg-step-${h.id}" name="step" type="number" inputmode="decimal" step="any" min="0" value="${h.step || ''}" placeholder="0">
        </label>`);
    }
    const sched = parseSched(h.schedule);
    if (sched) {
      fields.push(`
        <fieldset class="sched"><legend>Your wake-up times</legend>
          ${WEEK.filter(([k]) => sched[k]).map(([k, label]) => `
            <div class="sched-row times-only">
              <span class="sched-day">${label}</span>
              <input name="t-${k}" type="time" value="${sched[k]}" required aria-label="${label} wake-up time">
              <button type="button" class="link sched-copy" data-action="sched-copy" data-day="${k}">Copy</button>
            </div>`).join('')}
        </fieldset>
        <p class="small muted">You can change your times, not which days.</p>`);
    }
    if (h.icon === 'workout') {
      const plan = parsePlan(h);
      fields.push(`
        <p class="small"><strong>Plan your days</strong> <span class="muted">(optional, only you see it)</span></p>
        <div class="plan-grid">
          ${WEEK.map(([k, label]) => `
            <label class="plan-day" for="plan-${h.id}-${k}"><span>${label}</span>
              <input id="plan-${h.id}-${k}" name="p-${k}" maxlength="40" value="${esc(plan[k] || '')}" placeholder="Rest">
            </label>`).join('')}
        </div>`);
    }
    return `
      <form class="panel edit-goal" data-form="edit-goal" data-habit="${h.id}" ${preset ? `data-preset="${preset.key}"` : ''}>
        <p class="eyebrow">Edit your goal</p>
        ${shared && !ownNumber && (preset?.amount || h.icon === 'check')
          ? `<p class="small muted">You both agreed on <strong>${esc(goal?.title || h.title)}</strong>. To change it, propose a new goal.</p>`
          : ''}
        ${fields.join('') || (shared && !ownNumber && (preset?.amount || h.icon === 'check') ? '' : '<p class="small muted">Nothing to change on this one.</p>')}
        ${shared && ownNumber && preset?.amount ? `<p class="small muted">Only your number changes. ${partner ? esc(partner.name) : 'Your partner'} sees it in Activity.</p>` : ''}
        <div class="row">
          ${fields.length ? '<button class="btn primary" type="submit">Save</button>' : ''}
          <button class="btn" type="button" data-action="close-panel">${fields.length ? 'Cancel' : 'Close'}</button>
        </div>
        <button type="button" class="link quiet end-link" data-action="confirm-archive" data-habit="${h.id}">${shared ? 'End shared goal' : 'Drop goal'}</button>
      </form>`;
  }

  function proratedNote(h) {
    if (weekly(h)) {
      const t = weekTarget(h);
      return t < h.daily_amount ? `<p class="note-line">First week, so it's ${esc(fmtAmount(t, h.unit))} this week instead of ${esc(fmtAmount(h.daily_amount, h.unit))}.</p>` : '';
    }
    const w = habitWeek(h);
    return w.target < h.target_per_week ? `<p class="note-line">First week, so it's ${w.target} this week instead of ${h.target_per_week}.</p>` : '';
  }

  // A shared goal. Collapsed, it shows just your row plus a bar with your
  // partner's score; tap the card to compare both weeks side by side.
  function goalCard(g) {
    const d = state.dash;
    const mine = d.habits.find((x) => x.goal_id === g.id && isMe(x.user_id));
    const others = d.members
      .filter((m) => !isMe(m.id))
      .map((m) => ({ m, h: d.habits.find((x) => x.goal_id === g.id && x.user_id === m.id) }))
      .filter((x) => x.h);
    const archiving = mine && state.panel && state.panel.type === 'archive' && state.panel.habitId === mine.id;
    const open = state.expanded.has(g.id) || archiving;

    const compare = others
      .map(({ m, h }) => {
        const w = habitWeek(h);
        return `
          <button type="button" class="compare ${open ? 'open' : ''}" data-action="toggle-goal" data-goal="${g.id}" aria-expanded="${open}">
            ${open
              ? `<span>Hide ${esc(m.name)}</span>`
              : `${avatar(m)}<span><strong>${esc(m.name)}</strong> <span class="num">${w.done}/${w.target}</span></span>${w.outlook}<span class="compare-label">Compare</span>`}
            ${uiIcon('chevron', 'chev')}
          </button>`;
      })
      .join('');

    return `
      <article class="card goal ${open ? 'is-open' : ''}" id="g-${g.id}">
        <div class="goal-hit" data-action="toggle-goal" data-goal="${g.id}">
          ${g.personal
            ? cardHead(g.icon, personalPreset(g.icon)?.personal || g.title, `Both of you · your own numbers · ${g.target_per_week}x a week`, g.why, mine)
            : cardHead(g.icon, mine && !g.schedule ? mine.title : g.title, `${g.schedule ? 'Both of you · each on your own times' : `Both of you · ${esc(cadence(mine && !g.schedule ? mine : g))}`}${mine?.ends_day ? ` · <span class="nowrap">${challengeLine(mine)}</span>` : g.ends_after ? ` · ${g.ends_after}-day challenge` : ''}`, g.why, mine)}
          ${mine ? proratedNote(mine) : ''}
        </div>
        ${mine ? editPanel(mine, true) : ''}
        <div class="tracker">
          ${dayHeader()}
          ${mine ? trackerRow(mine, d.members.find((m) => isMe(m.id)), g.personal ? true : undefined) : ''}
          ${open ? others.map(({ m, h }) => trackerRow(h, m, g.personal ? true : undefined)).join('') : ''}
        </div>
        ${compare}
        ${mine ? endControl(mine, true) : ''}
      </article>`;
  }

  // A side goal: one person's row.
  function sideCard(h) {
    const d = state.dash;
    const person = d.members.find((m) => m.id === h.user_id);
    const mine = isMe(h.user_id);
    return `
      <article class="card side" id="h-${h.id}">
        ${cardHead(h.icon, h.title, `${mine ? 'Side goal' : `${esc(person.name)}'s side goal`}${h.schedule ? '' : ` · ${esc(cadence(h))}`}${h.ends_day ? ` · <span class="nowrap">${challengeLine(h)}</span>` : ''}`, h.why, mine && !h.archived_day ? h : null)}
        ${mine ? editPanel(h, false) : ''}
        ${proratedNote(h)}
        <div class="tracker">
          ${dayHeader()}
          ${trackerRow(h, person, false)}
        </div>
        ${mine ? endControl(h, false) : ''}
      </article>`;
  }

  // The goal picker, for proposing a shared goal or adding a side goal.
  function addForm(kind, startOpen, partnerName) {
    const shared = kind === 'shared';
    const isOpen = state.addOpen === kind || (startOpen && state.addOpen === null);
    // Proposing starts from the + button in the corner; the form only shows
    // here once it's open (or on a brand-new pact, where it opens itself).
    if (shared && !isOpen) return '';
    const current = state.addOpen === kind ? state.preset : null;
    const preset = PRESETS.find((p) => p.key === current);
    const tiles = PRESETS.map(
      (p) => `
        <button type="button" class="preset  ${p.key === current ? 'on' : ''}" data-action="pick-preset" data-kind="${kind}" data-preset="${p.key}" aria-pressed="${p.key === current}">
          <span class="icon-tile">${iconSvg(p.icon)}</span>
          <span>${esc(p.label)}</span>
        </button>`
    ).join('');

    let form = '';
    if (preset) {
      const fields =
        preset.key === 'custom'
          ? `<label for="${kind}-title">Goal<input id="${kind}-title" name="title" maxlength="80" required placeholder="${shared ? 'No phone after 10pm' : 'Edit one video'}" data-autofocus></label>`
          : preset.schedule
            ? `${schedEditor(kind, preset.schedule, shared ? 'Your wake-up times' : 'Wake-up time for each day')}
               ${shared ? `<p class="small muted">${partnerName} sets their own times when they agree.</p>` : ''}
               <p class="preview-title">${iconSvg(preset.icon)}<span data-role="preview">${esc(schedTitle(preset.schedule, shared))}</span></p>
               <p class="small muted" data-role="preview-sub">${esc(schedLine(preset.schedule))}</p>`
          : preset.amount
            ? `<label for="${kind}-amount">How much? <span class="muted">(${esc(preset.unit)})</span>
                 <input id="${kind}-amount" name="amount" type="number" inputmode="decimal" min="${preset.min}" step="any" value="${preset.amount}" required data-action="preset-amount">
               </label>
               <p class="preview-title">${iconSvg(preset.icon)}<span data-role="preview">${esc(preset.title(preset.amount))}</span></p>
               ${shared && preset.personal ? `<p class="small muted">That's your number. ${partnerName} sets their own when they agree.</p>` : ''}
               ${preset.track
                 ? preset.track.step
                   ? `<p class="small muted">Log it as you go: each tap of + adds ${esc(fmtAmount(preset.track.step, preset.track.unit))}, and Add… lets you type more. Hitting the amount counts as done. You can change the tap size after.</p>`
                   : `<p class="small muted">Log it as you go: tap + and type how many ${esc(UNIT_NAMES[preset.track.unit])} each time. Hitting the amount counts as done.</p>`
                 : ''}`
            : `<p class="preview-title">${iconSvg(preset.icon)}<span>${esc(preset.title())}</span></p>`;
      form = `
        <form data-form="goal" data-kind="${kind}" data-preset="${preset.key}">
          ${fields}
          <label for="${kind}-why">${shared ? 'Why you’re doing it together' : 'Why it matters'} <span class="muted">(optional)</span>
            <input id="${kind}-why" name="why" maxlength="200" placeholder="${shared ? 'Feel good for the wedding' : 'Content pays for the trip'}"></label>
          ${preset.schedule || preset.track?.period === 'week'
            ? ''
            : `<label for="${kind}-days">Days per week${shared ? ' (for both of you)' : ''}
            <select id="${kind}-days" name="target_per_week">
              ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === preset.days ? 'selected' : ''}>${n}${n === 7 ? ' (every day)' : ''}</option>`).join('')}
            </select>
          </label>`}
          ${preset.track?.period === 'week'
            ? ''
            : `<label for="${kind}-length">How long
            <select id="${kind}-length" name="challenge_days">
              <option value="0" ${preset.challenge ? '' : 'selected'}>Ongoing</option>
              ${CHALLENGE_DAYS.map((n) => `<option value="${n}" ${n === preset.challenge ? 'selected' : ''}>${n} days</option>`).join('')}
            </select>
          </label>
          <p class="small muted">Pick a length to make it a challenge with a finish line${shared ? '. Day 1 is the day you both agree' : ''}.</p>`}
          <button class="btn primary wide" type="submit">${shared ? 'Propose goal' : 'Add side goal'}</button>
        </form>`;
    }

    return `
      <details class="add ${shared ? 'add-shared' : ''}" data-kind="${kind}" ${isOpen ? 'open' : ''}>
        <summary>${uiIcon('plus')}${shared ? `Propose a shared goal${uiIcon('x', 'add-close')}` : 'Add a side goal'}</summary>
        <div class="add-body">
          <p class="small muted">${shared ? `${partnerName} has to agree before it starts. Then you're both on the hook.` : 'Pick one to start from, or make your own.'}</p>
          <div class="presets">${tiles}</div>
          ${form}
        </div>
      </details>`;
  }

  // "06:30" -> "6:30 AM"
  function clockTime(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return '…';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // ---------- wake-up schedules ----------
  // A schedule is {mon: "05:30", ..., sun: "09:00"}; days left out are off.

  function parseSched(json) {
    try {
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  }

  // "Mon–Thu 5:30 AM · Fri 7:00 AM · Sat–Sun 9:00 AM"
  function schedSummary(sched) {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const t = sched[WEEK[i][0]];
      if (!t) continue;
      let j = i;
      while (j + 1 < 7 && sched[WEEK[j + 1][0]] === t) j++;
      parts.push(`${j > i ? `${WEEK[i][1]}–${WEEK[j][1]}` : WEEK[i][1]} ${clockTime(t)}`);
      i = j;
    }
    return parts.join(' · ');
  }

  // A shared wake-up goal is always "on schedule": each of you has your own times.
  function schedTitle(sched, shared = false) {
    const times = Object.values(sched);
    if (!times.length) return '…';
    return !shared && new Set(times).size === 1 ? `Wake up by ${clockTime(times[0])}` : 'Wake up on schedule';
  }

  // Seven rows of day / time / Off. Used to add a goal, agree to one, and edit times.
  function schedEditor(prefix, sched, legend) {
    return `
      <fieldset class="sched">
        <legend>${esc(legend)}</legend>
        ${WEEK.map(([k, label]) => {
          const t = sched[k];
          return `
          <div class="sched-row">
            <span class="sched-day">${label}</span>
            <input id="${prefix}-t-${k}" name="t-${k}" type="time" value="${t || '07:00'}" ${t ? '' : 'disabled'} aria-label="${label} wake-up time" data-action="sched-input">
            <label class="sched-off"><input type="checkbox" name="off-${k}" ${t ? '' : 'checked'} data-action="sched-input">Off</label>
            <button type="button" class="link sched-copy" data-action="sched-copy" data-day="${k}">Copy</button>
          </div>`;
        }).join('')}
      </fieldset>`;
  }

  // Copy one day's time, then Paste it onto as many other days as you like.
  // Works on the form in place, so nothing typed gets lost to a re-render.
  function schedCopy(el) {
    const box = el.closest('fieldset.sched');
    const from = box.dataset.copy;
    const form = el.closest('form');
    if (!from || from === el.dataset.day) {
      // Start copying this day, or tap Done on the source to stop.
      const start = !from;
      box.dataset.copy = start ? el.dataset.day : '';
      if (start && form.querySelector(`[name="off-${el.dataset.day}"]`)?.checked) {
        box.dataset.copy = '';
        throw new Error('That day is off. Copy a day with a time.');
      }
      for (const b of box.querySelectorAll('.sched-copy')) {
        const src = start && b.dataset.day === el.dataset.day;
        b.textContent = !start ? 'Copy' : src ? 'Done' : 'Paste';
        b.closest('.sched-row').classList.toggle('is-source', src);
      }
      box.classList.toggle('copying', start);
      return;
    }
    const time = form.querySelector(`[name="t-${from}"]`).value;
    const to = el.dataset.day;
    const off = form.querySelector(`[name="off-${to}"]`);
    if (off) off.checked = false;
    const input = form.querySelector(`[name="t-${to}"]`);
    input.disabled = false;
    input.value = time;
    el.textContent = 'Pasted';
    schedChanged(form);
  }

  // Keep the Off boxes and the title preview in step with the times.
  function schedChanged(form) {
    if (!form.querySelector('[name^="off-"]')) return; // times-only editor (the ⋯ menu): days are fixed
    for (const [k] of WEEK) form.querySelector(`[name="t-${k}"]`).disabled = form.querySelector(`[name="off-${k}"]`).checked;
    const sched = readSched(form);
    const title = form.querySelector('[data-role=preview]');
    const sub = form.querySelector('[data-role=preview-sub]');
    if (title) title.textContent = schedTitle(sched, form.dataset.kind === 'shared');
    if (sub) sub.textContent = schedLine(sched);
  }

  function schedLine(sched) {
    const n = Object.keys(sched).length;
    return n ? `${schedSummary(sched)} · ${n === 7 ? 'every day' : `${n} day${n === 1 ? '' : 's'} a week`}` : 'Pick at least one day';
  }

  function readSched(form) {
    const sched = {};
    for (const [k] of WEEK) {
      const off = form.querySelector(`[name="off-${k}"]`).checked;
      const t = form.querySelector(`[name="t-${k}"]`).value;
      if (!off && /^\d{2}:\d{2}$/.test(t)) sched[k] = t;
    }
    return sched;
  }

  const dayKey = (day) => WEEK[(new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7][0];

  // What to call a goal today: a scheduled wake-up shows today's time.
  function todayTitle(h) {
    return titleOn(h, state.dash.today);
  }

  // A goal's name on a given day: the wake-up time, or your plan for the day
  // ("Work out · Legs").
  function titleOn(h, day) {
    const sched = parseSched(h.schedule);
    const t = sched && sched[dayKey(day)];
    if (t) return `Wake up by ${clockTime(t)}`;
    const planned = parsePlan(h)[dayKey(day)];
    return planned ? `${h.title} · ${planned}` : h.title;
  }

  function parsePlan(h) {
    try {
      return h.plan ? JSON.parse(h.plan) : {};
    } catch {
      return {};
    }
  }

  // Your plan under your own workout row ("Mon Push · Tue Legs"), if you
  // made one (from the ⋯ menu). Your partner never sees it.
  function planRow(h) {
    if (!isMe(h.user_id) || h.archived_day) return '';
    const plan = parsePlan(h);
    const days = WEEK.filter(([k]) => plan[k]);
    if (!days.length) return '';
    return `
      <div class="row-sched plan-summary">
        ${uiIcon('clock')}<span>${days.map(([k, label]) => `${label} ${esc(plan[k])}`).join(' · ')}</span>
      </div>`;
  }

  // "7x a week", or the schedule when there is one.
  const cadence = (x) => {
    if (x.amount_period === 'week' && x.daily_amount > 0) return `${fmtAmount(x.daily_amount, x.unit)} a week`;
    const sched = parseSched(x.schedule);
    return sched ? schedSummary(sched) : x.target_per_week === 7 ? 'Every day' : `${x.target_per_week}x a week`;
  };

  // ---------- weight ----------
  // One entry a day, in pounds. Yours, across every pact; partners see it
  // only if you share it.

  const fmtLb = (n) => `${Number(n).toFixed(1).replace(/\.0$/, '')}`;
  const shortDate = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const weightsOf = (id) => state.dash.weights?.[id] || [];

  // "−3.2 lb since Sep 4", from the first entry in view to the last.
  function weightChange(entries) {
    if (entries.length < 2) return '';
    const diff = Math.round((entries[entries.length - 1].lb - entries[0].lb) * 10) / 10;
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
    return `${sign}${fmtLb(Math.abs(diff))} lb since ${shortDate(entries[0].day)}`;
  }

  // A line over time (days, not entries, along the bottom). `big` adds the
  // axes and the tap-for-a-value layer; small is the card's sparkline.
  function weightChart(entries, who, big) {
    if (!entries.length) return '';
    const W = 320;
    const H = big ? 170 : 56;
    const pad = big ? { l: 34, r: 10, t: 12, b: 22 } : { l: 4, r: 4, t: 6, b: 6 };
    const first = entries[0].day;
    const span = Math.max(1, daysBetween(first, entries[entries.length - 1].day));
    const lbs = entries.map((e) => e.lb);
    let lo = Math.min(...lbs);
    let hi = Math.max(...lbs);
    const gap = Math.max(2, (hi - lo) * 0.15);
    lo = Math.floor(lo - gap);
    hi = Math.ceil(hi + gap);
    const x = (day) => pad.l + (entries.length === 1 ? 0.5 : daysBetween(first, day) / span) * (W - pad.l - pad.r);
    const y = (lb) => pad.t + (1 - (lb - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const pts = entries.map((e) => [x(e.day), y(e.lb)]);
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    let axes = '';
    if (big) {
      const ticks = [lo, Math.round((lo + hi) / 2), hi];
      axes = ticks.map((t) => `<line class="wgrid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="wtick" x="${pad.l - 6}" y="${y(t) + 3.5}" text-anchor="end">${t}</text>`).join('')
        + `<text class="wtick" x="${pad.l}" y="${H - 6}">${shortDate(first)}</text>`
        + (entries.length > 1 ? `<text class="wtick" x="${W - pad.r}" y="${H - 6}" text-anchor="end">${shortDate(entries[entries.length - 1].day)}</text>` : '');
    }
    const last = pts[pts.length - 1];
    const dots = big && entries.length <= 20 ? pts.map(([px, py]) => `<circle class="wdot" cx="${px}" cy="${py}" r="3"/>`).join('') : '';
    const data = big ? ` data-points='${esc(JSON.stringify(entries.map((e, i) => [pts[i][0], pts[i][1], e.day, e.lb])))}'` : '';
    return `
      <div class="wchart ${who} ${big ? 'big' : ''}"${data}>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time, ${fmtLb(entries[0].lb)} to ${fmtLb(entries[entries.length - 1].lb)} lb">
          ${axes}
          <path class="wline" d="${line}"/>
          ${dots}
          <circle class="wlast" cx="${last[0]}" cy="${last[1]}" r="${big ? 4.5 : 3.5}"/>
          ${big ? '<line class="wcross" y1="0" y2="0" hidden/><circle class="wfocus" r="5" hidden/>' : ''}
        </svg>
        ${big ? '<div class="wtip" hidden></div>' : ''}
      </div>`;
  }

  // Tap or drag on the big chart: the nearest day's weight.
  function weightHover(ev) {
    const box = ev.target.closest?.('.wchart.big');
    if (!box) return;
    const svg = box.querySelector('svg');
    const pts = JSON.parse(box.dataset.points);
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * 320;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p[0] - vx) < Math.abs(best[0] - vx)) best = p;
    const vb = svg.viewBox.baseVal;
    const cross = svg.querySelector('.wcross');
    const focus = svg.querySelector('.wfocus');
    cross.setAttribute('x1', best[0]); cross.setAttribute('x2', best[0]);
    cross.setAttribute('y1', 8); cross.setAttribute('y2', vb.height - 22);
    focus.setAttribute('cx', best[0]); focus.setAttribute('cy', best[1]);
    cross.removeAttribute('hidden');
    focus.removeAttribute('hidden');
    const tip = box.querySelector('.wtip');
    tip.innerHTML = `<strong>${fmtLb(best[3])} lb</strong><span>${esc(shortDate(best[2]))}</span>`;
    tip.hidden = false;
    const px = (best[0] / 320) * r.width;
    tip.style.left = `${Math.min(Math.max(px, 44), r.width - 44)}px`;
  }

  // The weigh-in box: today's entry, or a box to type it.
  function weightForm() {
    const d = state.dash;
    const mine = weightsOf(d.me);
    const todays = mine.find((e) => e.day === d.today);
    if (todays && state.panel?.type !== 'weight') {
      return `<div class="weight-today"><span>Today: <strong>${fmtLb(todays.lb)} lb</strong></span><button class="link" data-action="weight-edit">Change</button></div>`;
    }
    const last = mine[mine.length - 1];
    return `
      <form class="weight-form" data-form="weight">
        <input name="lb" type="number" inputmode="decimal" step="0.1" min="50" max="800" placeholder="${last ? fmtLb(last.lb) : 'Weight'}" value="${todays ? fmtLb(todays.lb) : ''}" aria-label="Your weight today, in pounds" required>
        <span class="weight-unit">lb</span>
        <button class="btn primary" type="submit">${todays ? 'Save' : 'Log'}</button>
      </form>`;
  }

  function weightCard() {
    const d = state.dash;
    const mine = weightsOf(d.me);
    const last = mine[mine.length - 1];
    const month = mine.filter((e) => e.day >= addDays(d.today, -30));
    const partners = d.members.filter((m) => !isMe(m.id) && weightsOf(m.id).length);
    return `
      <section class="block">
        <h2 class="section-title">Weight</h2>
        <p class="section-note">${state.user.share_weight ? 'Your partners can see it.' : 'Only you see it.'}</p>
        <article class="card weight-card">
          <button type="button" class="weight-hit" data-action="open-weight" aria-label="Open your weight history">
            <span class="icon-tile">${iconSvg('weight')}</span>
            <span class="weight-head">
              ${last ? `<span class="weight-num">${fmtLb(last.lb)}<span> lb</span></span>
                        <span class="small muted">${weightChange(month.length > 1 ? month : mine) || `Logged ${shortDate(last.day)}`}</span>`
                     : `<span class="weight-num empty">No weigh-ins yet</span><span class="small muted">Log it in the morning, same time each day.</span>`}
            </span>
            ${mine.length > 1 ? weightChart(month.length > 1 ? month : mine, 'you', false) : ''}
          </button>
          ${weightForm()}
          ${partners.map((m) => {
            const w = weightsOf(m.id);
            return `<button type="button" class="weight-partner" data-action="open-weight">${avatar(m)}<span><strong>${esc(m.name)}</strong> ${fmtLb(w[w.length - 1].lb)} lb</span><span class="small muted">${weightChange(w.filter((e) => e.day >= addDays(d.today, -30)))}</span></button>`;
          }).join('')}
        </article>
      </section>`;
  }

  const WEIGHT_RANGES = [['30', '30 days'], ['90', '90 days'], ['all', 'All']];

  function weightView() {
    const d = state.dash;
    const range = state.weightRange || '90';
    const inRange = (w) => (range === 'all' ? w : w.filter((e) => e.day >= addDays(d.today, -Number(range))));
    const mine = weightsOf(d.me);
    const shown = inRange(mine);
    const last = mine[mine.length - 1];
    const partners = d.members.filter((m) => !isMe(m.id) && weightsOf(m.id).length);
    return `
      <header class="settings-top">
        <button class="back" data-action="close-settings">${uiIcon('chevron', 'back-chev')}Back</button>
      </header>
      <h1 class="title">Weight</h1>
      <section class="card weight-big">
        ${last ? `<div class="weight-num">${fmtLb(last.lb)}<span> lb</span></div><p class="small muted">${weightChange(shown) || `Logged ${shortDate(last.day)}`}</p>` : '<p class="muted">No weigh-ins yet. Log one below.</p>'}
        <div class="chips" role="tablist">${WEIGHT_RANGES.map(([k, label]) => `<button class="chip ${k === range ? 'on' : ''}" role="tab" aria-selected="${k === range}" data-action="weight-range" data-range="${k}">${label}</button>`).join('')}</div>
        ${shown.length > 1 ? weightChart(shown, 'you', true) : mine.length ? `<p class="small muted wchart-empty">${shown.length ? 'Log a few more days and your line shows up here.' : 'Nothing logged in this range.'}</p>` : ''}
        ${weightForm()}
      </section>
      ${partners.map((m) => {
        const w = inRange(weightsOf(m.id));
        return `
          <section class="card weight-big">
            <div class="weight-who">${avatar(m)}<strong>${esc(m.name)}</strong></div>
            <div class="weight-num">${fmtLb(weightsOf(m.id).slice(-1)[0].lb)}<span> lb</span></div>
            <p class="small muted">${weightChange(w)}</p>
            ${w.length > 1 ? weightChart(w, 'them', true) : '<p class="small muted wchart-empty">Not enough logged in this range.</p>'}
          </section>`;
      }).join('')}
      <section class="card settings-card">
        <label class="check"><input type="checkbox" data-action="set-share-weight" ${state.user.share_weight ? 'checked' : ''}> Let my partners see my weight</label>
        <p class="small muted">Off by default. When it's on, everyone you have a pact with sees it.</p>
      </section>
      ${mine.length ? `
        <section class="card">
          <h2 class="card-title">Every weigh-in</h2>
          <ul class="weight-list">
            ${[...mine].reverse().map((e, i, arr) => {
              const prev = arr[i + 1];
              const diff = prev ? Math.round((e.lb - prev.lb) * 10) / 10 : null;
              return `<li><span>${esc(shortDate(e.day))}</span><strong>${fmtLb(e.lb)} lb</strong><span class="small muted">${diff === null || diff === 0 ? '' : `${diff > 0 ? '+' : '−'}${fmtLb(Math.abs(diff))}`}</span><button class="icon-btn sm" data-action="weight-delete" data-day="${e.day}" aria-label="Delete ${esc(shortDate(e.day))}">${uiIcon('x')}</button></li>`;
            }).join('')}
          </ul>
        </section>` : ''}`;
  }

  // ---------- log-as-you-go amounts ----------

  const tracked = (h) => h.daily_amount > 0;
  // Protein and calories: + always opens a box to type the amount.
  const typed = (h) => h.icon === 'protein' || h.icon === 'calories';
  const weekly = (h) => tracked(h) && h.amount_period === 'week';

  // Days you can log: today, and yesterday (marked late). Mirrors canLog in
  // src/logic.js.
  function canLogDay(day) {
    return day === state.dash.today || day === addDays(state.dash.today, -1);
  }
  const dayName = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });

  // Weekly amount goals: this week's total and target (scaled the week the
  // goal started). Mirrors weeklyAmountTarget in src/logic.js.
  function weekTotal(h) {
    const start = weekStart(state.dash.today);
    const end = addDays(start, 6);
    return (state.dash.amounts || []).filter((a) => a.habit_id === h.id && a.day >= start && a.day <= end).reduce((t, a) => t + a.amount, 0);
  }
  function weekTarget(h) {
    const start = weekStart(state.dash.today);
    const first = h.created_day > start ? h.created_day : start;
    const days = Math.round((Date.parse(addDays(start, 6)) - Date.parse(first)) / 86400000) + 1;
    return days >= 7 ? h.daily_amount : Math.round(((h.daily_amount * days) / 7) * 10) / 10;
  }
  function weekDone(h) {
    const start = weekStart(state.dash.today);
    return state.dash.checkins.some((c) => c.habit_id === h.id && c.status === 'done' && c.day >= start && c.day <= addDays(start, 6));
  }
  const UNIT_NAMES = { mi: 'miles', oz: 'ounces', g: 'grams', cal: 'calories', gal: 'gallons' };

  // The + button: adds one tap's worth, or opens the how-much box when the
  // goal asks each time (step 0). `where` says which box to open.
  function plusButton(h, on, where, small = false, day = null) {
    const cls = `tick you plus ${small ? 'sm' : ''} ${on ? 'on' : ''}`;
    const onDay = day ? ` data-day="${day}"` : '';
    if (!(h.step > 0)) {
      return `<button class="${cls}" data-action="open-amount" data-where="${where}" data-habit="${h.id}"${onDay} aria-label="Log ${esc(UNIT_NAMES[h.unit] || h.unit)} for ${esc(h.title)}">${uiIcon('plus')}</button>`;
    }
    const label = `+${stepLabel(h.step)}`;
    return `<button class="${cls} ${label.length > 3 ? 'long' : ''}" data-action="add-amount" data-habit="${h.id}" data-delta="${h.step}"${onDay} aria-label="Add ${esc(fmtAmount(h.step, h.unit))} to ${esc(h.title)}"><span>${esc(label)}</span></button>`;
  }

  // Type-an-amount box (and the tap-size box), opened from a card or the Today list.
  function amountPanel(h) {
    const p = state.panel;
    const day = p?.day && p.day !== state.dash.today ? p.day : null; // tapped an earlier day's circle
    // Protein and calories: type where you're at now, like reading it off
    // MyFitnessPal. 30 g earlier and 170 g now? Type 170.
    if (typed(h)) {
      const have = amountOn(h, day || state.dash.today);
      return `
      <form class="panel" data-form="amount-total" data-habit="${h.id}" ${day ? `data-day="${day}"` : ''}>
        <label for="amount-${h.id}">Where are you at${day ? ` for ${esc(dayName(day))}` : ' today'}? <span class="muted">(${esc(UNIT_NAMES[h.unit] || h.unit)} total, of ${esc(fmtAmount(h.daily_amount, h.unit))})</span>
          <input id="amount-${h.id}" name="amount" type="number" inputmode="decimal" step="any" min="0" required placeholder="${have ? `${fmtAmount(have, '')} so far` : h.unit === 'g' ? 'e.g. 120' : 'e.g. 1800'}" data-autofocus>
        </label>
        <div class="row">
          <button class="btn primary" type="submit">Update</button>
          <button class="btn" type="button" data-action="close-panel">Cancel</button>
        </div>
      </form>`;
    }
    return `
      <form class="panel" data-form="amount" data-habit="${h.id}" ${day ? `data-day="${day}"` : ''}>
        <label for="amount-${h.id}">How many ${esc(UNIT_NAMES[h.unit] || h.unit)}${day ? ` on ${esc(dayName(day))}` : ''}?${day ? ` <span class="muted">(${esc(fmtAmount(amountOn(h, day), h.unit))} so far, marked late)</span>` : ''}
          <input id="amount-${h.id}" name="amount" type="number" inputmode="decimal" step="any" min="0" required placeholder="${h.unit === 'g' ? 'e.g. 35' : ''}" data-autofocus>
        </label>
        <div class="row">
          <button class="btn primary" type="submit">Add</button>
          <button class="btn" type="button" data-action="close-panel">Cancel</button>
        </div>
      </form>`;
  }

  const panelFor = (h, where) =>
    state.panel?.type === 'amount' && state.panel.habitId === h.id && state.panel.where === where;

  function amountOn(h, day) {
    return state.dash.amounts?.find((a) => a.habit_id === h.id && a.day === day)?.amount || 0;
  }

  // 2.5 -> "2.5 mi", 2500 -> "2,500 cal"
  function fmtAmount(n, unit) {
    const num = Math.round(n * 100) / 100;
    if (!unit) return num.toLocaleString();
    return `${num.toLocaleString()}${unit === 'g' ? '' : ' '}${unit}`;
  }

  // What fits in the round + button: 0.25 -> "¼", 1000 -> "1k".
  function stepLabel(n) {
    const frac = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[n];
    if (frac) return frac;
    if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
    return String(Math.round(n * 100) / 100);
  }

  // "1.5 / 3 mi" plus a bar in the person's color; + / − / Add… on your own.
  function amountRow(h) {
    const d = state.dash;
    const got = amountOn(h, d.today);
    const total = weekly(h) ? weekTotal(h) : got;
    const target = weekly(h) ? weekTarget(h) : h.daily_amount;
    const pct = Math.min(100, Math.round((total / target) * 100));
    const mine = isMe(h.user_id) && !h.archived_day;
    if (mine && panelFor(h, 'card')) return amountPanel(h);
    return `
      <div class="amount-row ${whoClass(h.user_id)}">
        <span class="amount-text"><strong>${esc(fmtAmount(total, ''))}</strong> / ${esc(fmtAmount(target, h.unit))} ${weekly(h) ? `this week${got ? ` · ${esc(fmtAmount(got, h.unit))} today` : ''}` : 'today'}</span>
        <span class="bar ${whoClass(h.user_id)}"><span style="width:${pct}%"></span></span>
        ${mine
          ? `<span class="amount-tools">
               ${got > 0 && h.step > 0 ? `<button class="link quiet" data-action="add-amount" data-habit="${h.id}" data-delta="${-h.step}" aria-label="Take back ${esc(fmtAmount(h.step, h.unit))}">${uiIcon('minus')}${esc(fmtAmount(h.step, h.unit))}</button>` : ''}
               ${h.step > 0 ? `<button class="link" data-action="open-amount" data-where="card" data-habit="${h.id}">Add…</button>` : ''}
               ${got > 0 ? `<button class="link quiet" data-action="reset-amount" data-habit="${h.id}">${weekly(h) ? 'Reset today' : 'Reset'}</button>` : ''}
             </span>`
          : ''}
      </div>`;
  }

  // Title for a preset + amount, with numbers tidied (1.50 -> 1.5).
  function presetTitle(preset, raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return preset.title(Math.round(n * 100) / 100);
  }

  function feedItem(e) {
    const d = state.dash;
    const who = isMe(e.actor_id) ? 'You' : esc(e.actor_name);
    const whom = isMe(e.target_id) ? 'you' : esc(e.target_name);
    const habit = e.habit_title ? `<strong>${esc(e.habit_title)}</strong>` : '';
    const note = e.message ? ` <span class="quote">“${esc(e.message)}”</span>` : '';
    const goal = `<strong>${esc(e.message)}</strong>`;
    const late = e.kind.endsWith('_late') ? ` <span class="pill warn">late, for ${e.day ? esc(dayName(e.day)) : 'an earlier day'}</span>` : '';
    let text;
    switch (e.kind) {
      case 'created': text = `${who} started the pact.`; break;
      case 'joined': text = `${who} joined. It's on.`; break;
      case 'reset_code': text = `${who} made a password reset code for ${whom}.`; break;
      case 'left': text = `${who} left the pact. Shared goals ended with it.`; break;
      case 'done': case 'done_late': text = `${who} did ${habit}.${note}${late}`; break;
      case 'missed': case 'missed_late': text = `${who} missed ${habit}.${note}${late}`; break;
      case 'habit_added': text = `${who} added a side goal: ${habit} (${esc(e.message)}).`; break;
      case 'habit_archived': text = `${who} dropped ${habit}.`; break;
      case 'goal_proposed': text = `${who} proposed a shared goal: ${goal}.`; break;
      case 'goal_accepted': text = `${who} agreed to ${goal}. You're both on it.`; break;
      case 'goal_declined': text = `${who} passed on ${goal}.`; break;
      case 'goal_withdrawn': text = `${who} withdrew ${goal}.`; break;
      case 'goal_ended': text = `${who} ended the shared goal ${habit}.`; break;
      case 'challenge_done': text = `${who} finished ${habit}: <strong>${esc(e.message)}</strong> days.`; break;
      case 'amount_changed': text = d.habits.find((h) => h.id === e.habit_id)?.icon === 'check' ? `${who} renamed a goal: ${goal}.` : `${who} set a new number: ${goal}.`; break;
      case 'schedule_changed': text = `${who} changed the wake-up times on ${habit}.`; break;
      case 'nudge': text = `${who} nudged ${whom}${habit ? ` about ${habit}` : ''}.${note}`; break;
      case 'cheer': text = `${who} cheered ${whom}${habit ? ` on ${habit}` : ''}.${note}`; break;
      default: text = `${who}: ${esc(e.kind)}`;
    }
    const actor = d.members.find((m) => m.id === e.actor_id) || { id: e.actor_id, name: e.actor_name };
    const fresh = e.id > d.last_seen_event_id && !isMe(e.actor_id);
    const kind = e.kind.replace('_late', '');
    return `<li class="${fresh ? 'fresh' : ''} k-${esc(kind)}">${avatar(actor)}<span class="feed-text">${text}</span><time>${ago(e.created_at)}</time></li>`;
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

  // An invite link (/join/CODE) waits here through sign up or log in.
  const pendingJoin = () => store('aa.join') || '';

  async function joinFromLink() {
    const code = pendingJoin();
    store('aa.join', '');
    state.invite = null;
    try {
      const { partnership } = await api('POST', '/api/partnerships/join', { code });
      await afterJoinOrCreate(partnership.id);
      checkPush();
      toast(`You're in ${partnership.name}. Agree on your first shared goal.`);
    } catch (err) {
      const me = await api('GET', '/api/me');
      state.partnerships = me.partnerships;
      state.pid = me.partnerships[0]?.id ?? null;
      if (state.pid) await loadDash();
      render();
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


  async function addAmount(habitId, delta, reset, day) {
    if (day === state.dash.today) day = undefined; // "on Wednesday" only for other days
    const h = state.dash.habits.find((x) => x.id === habitId);
    const on = day ? { day } : {};
    const res = await api('POST', '/api/amounts', reset ? { habit_id: habitId, reset: true, today: localToday(), ...on } : { habit_id: habitId, delta, today: localToday(), ...on });
    const wasDone = weekly(h) ? weekDone(h) : state.dash.checkins.some((c) => c.habit_id === habitId && c.day === (day || state.dash.today) && c.status === 'done');
    await refresh();
    const total = weekly(h)
      ? `${fmtAmount(res.total, '')} / ${fmtAmount(weekTarget(h), h.unit)} this week`
      : `${fmtAmount(res.amount, '')} / ${fmtAmount(h.daily_amount, h.unit)}${day ? ` on ${dayName(day)}` : ''}`;
    // Linked pacts update quietly: it's the same number everywhere.
    toast(reset ? `Reset to 0. ${total}.` : res.done && !wasDone ? `${total}. Goal hit.` : delta > 0 ? `+${fmtAmount(delta, h.unit)} · ${total}` : `Took back ${fmtAmount(-delta, h.unit)} · ${total}`);
  }

  // Set the day's total ("I'm at 170 g"); Undo puts the old total back.
  async function setAmount(habitId, total, day) {
    if (day === state.dash.today) day = undefined;
    const h = state.dash.habits.find((x) => x.id === habitId);
    const before = amountOn(h, day || state.dash.today);
    if (total === before) return render();
    const on = day ? { day } : {};
    const res = await api('POST', '/api/amounts', { habit_id: habitId, set: total, today: localToday(), ...on });
    await refresh();
    const where = `${fmtAmount(res.amount, '')} / ${fmtAmount(h.daily_amount, h.unit)}${day ? ` on ${dayName(day)}` : ''}`;
    toast(res.done && before < h.daily_amount ? `${where}. Goal hit.` : `Now at ${where}.`);
  }

  async function logDone(habitId, day) {
    const res = await api('POST', '/api/checkins', { habit_id: habitId, day, status: 'done', today: localToday(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    state.panel = null;
    await refresh();
    // The check turning blue says it. Tap it again to take it back.
    if (day !== state.dash.today) toast(`Logged for ${dayName(day)}, marked late.`);
  }

  const forms = {
    async weight(f) {
      const lb = Number(f.lb.value);
      if (!Number.isFinite(lb) || lb < 50 || lb > 800) throw new Error('Enter your weight in pounds');
      await api('POST', '/api/weights', { lb, today: localToday() });
      state.panel = null;
      toast(`${fmtLb(lb)} lb logged.`);
      await refresh();
    },
    async signup(f) {
      const { user } = await api('POST', '/api/signup', { name: f.name.value, email: f.email.value, password: f.password.value });
      state.user = user;
      state.partnerships = [];
      if (pendingJoin()) return joinFromLink();
      render();
    },
    async login(f) {
      await api('POST', '/api/login', { login: f.login.value, password: f.password.value });
      await boot();
    },
    async forgot(f) {
      const email = f.login.value.trim();
      await api('POST', '/api/forgot', { email });
      state.reset = { email, sent: true };
      render();
    },
    async reset(f) {
      await api('POST', '/api/reset-password', { login: f.login.value, code: f.code.value, password: f.password.value });
      state.authMode = 'login';
      state.reset = null;
      await boot();
      toast('New password set. You’re in.');
    },
    async email(f) {
      const { user } = await api('PATCH', '/api/me', { email: f.email.value });
      state.user = user;
      render();
      toast('Email saved. You can log in with it now.');
    },
    async password(f) {
      await api('POST', '/api/password', { current: f.current.value, password: f.password.value });
      f.reset();
      toast('Password changed. Other devices are logged out.');
    },
    async 'rename-pact'(f) {
      const pid = Number(f.dataset.pid);
      await api('PATCH', `/api/partnerships/${pid}`, { name: f.name.value });
      state.pactRename = null;
      const me = await api('GET', '/api/me');
      state.partnerships = me.partnerships;
      if (pid === state.pid) await loadDash();
      render();
      toast('Renamed. Only you see this name.');
    },
    async 'create-pact'(f) {
      const { partnership } = await api('POST', '/api/partnerships', { name: f.name.value, today: localToday() });
      await afterJoinOrCreate(partnership.id);
    },
    async 'join-pact'(f) {
      const { partnership } = await api('POST', '/api/partnerships/join', { code: f.code.value });
      await afterJoinOrCreate(partnership.id);
      toast("You're in. Agree on your first shared goal.");
    },
    async goal(f) {
      const preset = PRESETS.find((p) => p.key === f.dataset.preset);
      let title;
      let schedule;
      if (preset.key === 'custom') title = f.title.value;
      else if (preset.schedule) {
        schedule = readSched(f);
        if (!Object.keys(schedule).length) throw new Error('Pick at least one day');
        title = schedTitle(schedule, f.dataset.kind === 'shared');
      } else if (preset.amount) title = presetTitle(preset, f.amount.value);
      else title = preset.title();
      if (!title) throw new Error(`Enter how many ${preset.unit}`);
      const shared = f.dataset.kind === 'shared';
      await api('POST', shared ? '/api/goals' : '/api/habits', {
        partnership_id: state.pid,
        title,
        icon: preset.icon,
        why: f.why.value,
        target_per_week: schedule ? Object.keys(schedule).length : f.target_per_week ? Number(f.target_per_week.value) : 1,
        schedule,
        personal: shared && !!preset.personal,
        challenge_days: f.challenge_days ? Number(f.challenge_days.value) : 0,
        ...(preset.track
          ? {
              daily_amount: Number(f.amount.value) * (preset.track.per || 1),
              unit: preset.track.unit,
              step: preset.track.step, // change it later from the goal's ⋯ menu
              amount_period: preset.track.period || 'day',
            }
          : {}),
        today: localToday(),
      });
      state.preset = null;
      state.addOpen = null;
      toast(shared ? 'Proposed. It starts when your partner agrees.' : 'Side goal added. Your partner can see it.');
      await refresh();
    },
    async accept(f) {
      const schedule = readSched(f);
      if (!Object.keys(schedule).length) throw new Error('Pick at least one day');
      await api('POST', `/api/goals/${f.dataset.goal}/respond`, { answer: 'accept', schedule, today: localToday() });
      state.panel = null;
      state.addOpen = null;
      state.preset = null;
      toast('Agreed. You’re both on it, each on your own times.');
      await refresh();
    },
    async 'accept-number'(f) {
      await api('POST', `/api/goals/${f.dataset.goal}/respond`, { answer: 'accept', ...numberBody(f), today: localToday() });
      state.panel = null;
      state.addOpen = null;
      state.preset = null;
      toast('Agreed. You’re both on it, each with your own number.');
      await refresh();
    },
    async 'edit-number'(f) {
      await api('PATCH', `/api/habits/${f.dataset.habit}`, { personal: numberBody(f), today: localToday() });
      state.panel = null;
      toast('Number saved.');
      await refresh();
    },
    // Save the ⋯ menu: only what changed is sent.
    async 'edit-goal'(f) {
      const h = state.dash.habits.find((x) => x.id === Number(f.dataset.habit));
      const preset = PRESETS.find((p) => p.key === f.dataset.preset);
      const body = {};
      if (f.amount) {
        const title = presetTitle(preset, f.amount.value);
        if (!title) throw new Error(`Enter your goal in ${preset.unit}`);
        const amount = tracked(h) ? Number(f.amount.value) * (preset.track?.per || 1) : undefined;
        if (title !== h.title || (amount !== undefined && amount !== h.daily_amount)) body.personal = { title, ...(amount !== undefined ? { daily_amount: amount } : {}) };
      }
      if (f.title && f.title.value.trim() !== h.title) body.personal = { title: f.title.value.trim() };
      if (f.step) {
        const step = f.step.value === '' ? 0 : Number(f.step.value);
        if (!Number.isFinite(step) || step < 0) throw new Error('Enter a tap size, or 0 to type it each time');
        if (step !== h.step) body.step = step;
      }
      const sched = parseSched(h.schedule);
      if (sched) {
        const next = {};
        for (const k of Object.keys(sched)) next[k] = f[`t-${k}`].value;
        if (JSON.stringify(next) !== JSON.stringify(sched)) body.schedule = next;
      }
      if (f['p-mon']) {
        const plan = {};
        for (const [k] of WEEK) if (f[`p-${k}`].value.trim()) plan[k] = f[`p-${k}`].value.trim();
        if (JSON.stringify(plan) !== JSON.stringify(parsePlan(h))) body.plan = plan;
      }
      state.panel = null;
      if (!Object.keys(body).length) return render();
      await api('PATCH', `/api/habits/${h.id}`, { ...body, today: localToday() });
      toast('Saved.');
      await refresh();
    },
    async 'amount-total'(f) {
      const n = Number(f.amount.value);
      if (!Number.isFinite(n) || n < 0) throw new Error('Enter your total so far');
      state.panel = null;
      await setAmount(Number(f.dataset.habit), n, f.dataset.day);
    },
    async amount(f) {
      const n = Number(f.amount.value);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Enter an amount');
      state.panel = null;
      await addAmount(Number(f.dataset.habit), n, false, f.dataset.day);
    },
    async miss(f) {
      const res = await api('POST', '/api/checkins', { habit_id: Number(f.dataset.habit), status: 'missed', note: f.note.value, today: localToday(), ...(f.dataset.day ? { day: f.dataset.day } : {}) });
      state.panel = null;
      toast('Logged. Owning it counts.');
      await refresh();
    },
  };

  // { title, daily_amount } from a personal-number form.
  function numberBody(f) {
    const p = PRESETS.find((x) => x.key === f.dataset.preset);
    const title = presetTitle(p, f.amount.value);
    if (!title) throw new Error(`Enter how many ${p.unit}`);
    return { title, ...(p.track ? { daily_amount: Number(f.amount.value) * (p.track.per || 1) } : {}) };
  }

  // ---------- notifications ----------

  const pushSupported = () => !window.AA_DEMO && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const onIphoneNotInstalled = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches);

  // Is this phone subscribed? If it is but the server lost track (say the
  // subscription was renewed), tell the server again.
  async function checkPush() {
    if (!pushSupported()) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      state.pushOn = Boolean(sub) && Notification.permission === 'granted';
      if (state.pushOn && !state.user.push_count) {
        ({ user: state.user } = await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
      }
      render();
    } catch {
      // No notifications on this browser; the app works the same without them.
    }
  }

  async function enablePush() {
    // iPhone only allows this as the direct result of a tap, so ask first.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error("Notifications are blocked. Turn them on for AccountAbility in your phone's Settings.");
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const { publicKey } = await api('GET', '/api/push/key');
    const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    ({ user: state.user } = await api('POST', '/api/push/subscribe', { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    state.pushOn = true;
    store('aa.pushPrompt', 'done');
    render();
    toast('Notifications on. Try Send a test.');
  }

  function closeSettings() {
    state.view = null;
    state.panel = null;
    render();
    window.scrollTo(0, 0);
  }
  // The phone's back gesture leaves settings too.
  window.addEventListener('popstate', () => {
    if (state.view) closeSettings();
  });

  // Undo a leave or delete, and take you back into that pact.
  async function undoLeave(id) {
    const { partnership } = await api('POST', `/api/leaves/${id}/undo`, {});
    store('aa.pid', String(partnership.id));
    state.pactsEdit = false;
    state.pactsOpen = false;
    await boot();
    toast(`${partnership.name} is back.`);
  }

  const actions = {
    'have-code'() {
      const email = app.querySelector('#r-login')?.value || '';
      state.reset = { email, code: '', manual: true };
      render();
      app.querySelector('#r-code')?.focus();
    },
    'auth-mode'(el) {
      state.authMode = el.dataset.mode;
      state.reset = null;
      render();
    },
    async logout() {
      await api('POST', '/api/logout', {});
      Object.assign(state, { user: null, partnerships: [], pid: null, dash: null, panel: null, view: null });
      render();
    },
    async 'log-done'(el) {
      await logDone(Number(el.dataset.habit), el.dataset.day);
    },
    async 'undo-done'(el) {
      await api('POST', '/api/checkins/undo', { habit_id: Number(el.dataset.habit), day: el.dataset.day, today: localToday() });
      toast('Undone.');
      await refresh();
    },
    'open-accept'(el) {
      state.panel = { type: 'accept', goalId: Number(el.dataset.goal) };
      render();
    },
    'edit-number'(el) {
      state.panel = { type: 'edit-number', habitId: Number(el.dataset.habit) };
      render();
    },
    'sched-copy'(el) {
      schedCopy(el);
    },
    // Back to zero for today (a weekly goal keeps its other days). Undo puts it back.
    async 'reset-amount'(el) {
      const h = state.dash.habits.find((x) => x.id === Number(el.dataset.habit));
      const got = amountOn(h, el.dataset.day || state.dash.today);
      if (got > 0) await addAmount(h.id, -got, true, el.dataset.day);
    },
    async 'add-amount'(el) {
      await addAmount(Number(el.dataset.habit), Number(el.dataset.delta), false, el.dataset.day);
    },
    'open-day'(el) {
      const first = state.view !== 'day';
      state.view = 'day';
      state.day = el.dataset.day;
      state.panel = null;
      if (first) history.pushState({ view: 'day' }, '');
      render();
      window.scrollTo(0, 0);
    },
    'edit-goal'(el) {
      const id = Number(el.dataset.habit);
      state.panel = state.panel?.type === 'edit-goal' && state.panel.habitId === id ? null : { type: 'edit-goal', habitId: id };
      render();
    },
    'open-amount'(el) {
      state.panel = { type: 'amount', habitId: Number(el.dataset.habit), where: el.dataset.where || 'card', day: el.dataset.day };
      render();
    },
    'open-miss'(el) {
      state.panel = { type: 'miss', habitId: Number(el.dataset.habit), day: el.dataset.day };
      render();
    },
    async send(el) {
      await api('POST', `/api/partnerships/${state.pid}/nudges`, {
        kind: el.dataset.kind,
        to_user_id: Number(el.dataset.user),
        habit_id: el.dataset.habit ? Number(el.dataset.habit) : null,
      });
      toast(el.dataset.kind === 'cheer' ? 'Cheer sent.' : 'Nudge sent.');
      await refresh();
    },
    jump(el) {
      const target = document.getElementById(el.dataset.target);
      if (!target) return;
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    },
    'toggle-goal'(el) {
      const id = Number(el.dataset.goal);
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
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
      state.addOpen = null; // tuck the picker away once there's something agreed
      state.preset = null;
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
      const text = `Be my accountability partner on AccountAbility: ${location.origin}/join/${code}`;
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
    'start-reorder'(el) {
      const d = state.dash;
      const shared = el.dataset.kind === 'shared';
      state.reorder = el.dataset.kind;
      state.reorderIds = d.habits
        .filter((h) => isMe(h.user_id) && !h.archived_day && (shared ? h.goal_id : !h.goal_id))
        .sort(byOrder)
        .map((h) => h.id);
      state.panel = null;
      render();
    },
    'move-goal'(el) {
      const i = Number(el.dataset.index);
      const j = i + Number(el.dataset.dir);
      const ids = state.reorderIds;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      render();
      app.querySelector(`[data-action=move-goal][data-index="${j}"][data-dir="${el.dataset.dir}"]:not([disabled])`)?.focus();
    },
    async 'save-order'() {
      const d = state.dash;
      // Keep the other section's goals after these, in their current order.
      const rest = d.habits.filter((h) => isMe(h.user_id) && !state.reorderIds.includes(h.id)).sort(byOrder).map((h) => h.id);
      const ids = state.reorder === 'shared' ? [...state.reorderIds, ...rest] : [...rest, ...state.reorderIds];
      await api('POST', `/api/partnerships/${state.pid}/order`, { habit_ids: ids });
      state.reorder = null;
      toast('Order saved.');
      await refresh();
    },
    'cancel-reorder'() {
      state.reorder = null;
      render();
    },
    async 'open-recap'() {
      state.recapOpen = true;
      await refresh();
      document.getElementById('recap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'close-recap'() {
      if (state.recap) store(recapKey(state.recap), '1');
      state.recapOpen = false;
      state.recap = null;
      render();
    },
    async 'push-on'() {
      await enablePush();
    },
    async 'push-off'() {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        ({ user: state.user } = await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }));
        await sub.unsubscribe();
      }
      state.pushOn = false;
      render();
      toast('Notifications off on this phone.');
    },
    async 'push-test'() {
      await api('POST', '/api/push/test', {});
      toast('Sent. It should show up in a few seconds.');
    },
    'push-later'() {
      store('aa.pushPrompt', 'later');
      render();
    },
    async 'push-prompt-on'() {
      await enablePush();
    },
    // The + in the corner: open the propose form and bring it into view.
    'open-propose'() {
      state.addOpen = 'shared';
      state.preset = null;
      state.pactsOpen = false;
      render();
      const form = app.querySelector('details.add-shared');
      if (form) window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' });
    },
    'open-weight'() {
      state.view = 'weight';
      state.panel = null;
      history.pushState({ view: 'weight' }, '');
      render();
      window.scrollTo(0, 0);
    },
    'weight-range'(el) {
      state.weightRange = el.dataset.range;
      render();
    },
    'weight-edit'() {
      state.panel = { type: 'weight' };
      render();
      app.querySelector('form[data-form=weight] input')?.focus();
    },
    async 'weight-delete'(el) {
      const e = weightsOf(state.dash.me).find((x) => x.day === el.dataset.day);
      await api('POST', '/api/weights/delete', { day: el.dataset.day });
      await refresh();
      toast(`Deleted ${shortDate(el.dataset.day)}.`, {
        label: 'Undo',
        run: async () => {
          await api('POST', '/api/weights', { lb: e.lb, day: e.day, today: localToday() });
          await refresh();
        },
      });
    },
    'open-guide'() {
      state.view = 'guide';
      state.pactsOpen = false;
      store('aa.guideSeen', '1');
      history.pushState({ view: 'guide' }, '');
      render();
      window.scrollTo(0, 0);
    },
    'guide-later'() {
      store('aa.guideSeen', '1');
      render();
    },
    'open-settings'() {
      state.view = 'settings';
      state.pactsOpen = false;
      history.pushState({ view: 'settings' }, '');
      render();
      window.scrollTo(0, 0);
    },
    'close-settings'() {
      if (history.state?.view) history.back(); // popstate renders
      else closeSettings();
    },
    'edit-pacts'() {
      state.pactsEdit = !state.pactsEdit;
      state.pactRename = null;
      state.pactConfirm = null;
      render();
    },
    'rename-pact'(el) {
      state.pactRename = Number(el.dataset.pid);
      state.pactConfirm = null;
      render();
    },
    'cancel-rename'() {
      state.pactRename = null;
      render();
    },
    'confirm-leave'(el) {
      state.pactConfirm = Number(el.dataset.pid);
      render();
    },
    'cancel-leave'() {
      state.pactConfirm = null;
      render();
    },
    async 'leave-pact'(el) {
      if (window.AA_DEMO) throw new Error('The preview is just you and King. Leave or delete pacts in the live app.');
      const p = state.partnerships.find((x) => x.id === Number(el.dataset.pid));
      const { deleted, undo_id } = await api('POST', `/api/partnerships/${p.id}/leave`, { today: localToday() });
      state.pactConfirm = null;
      await boot(); // back to your saved pact, or the next one, or the start screen
      if (!state.partnerships.length) state.pactsEdit = false;
      toast(deleted ? `Deleted ${p.name}.` : `You left ${p.name}.`, { label: 'Undo', run: () => undoLeave(undo_id) });
    },
    async 'undo-leave'(el) {
      await undoLeave(Number(el.dataset.leave));
    },
    'toggle-pacts'() {
      state.pactsEdit = false;
      state.pactConfirm = null;
      state.pactsOpen = !state.pactsOpen;
      render();
    },
    async 'go-pact'(el) {
      state.pactsOpen = false;
      const pid = Number(el.dataset.pid);
      if (pid === state.pid) return render();
      state.pid = pid;
      state.panel = null;
      state.reorder = null;
      state.expanded = new Set();
      store('aa.pid', String(pid));
      await refresh();
      window.scrollTo(0, 0);
    },
    'new-pact'() {
      if (window.AA_DEMO) throw new Error('The preview is just you and King. Start or join another pact in the live app.');
      state.pactsOpen = false;
      state.pid = null;
      state.dash = null;
      render();
    },
  };

  // ---------- haptics ----------
  //
  // One pulse when you finish something: checking off a goal, logging the
  // amount that hits today's target, and every tap on a weekly-miles goal. Android
  // vibrates. iPhone has no vibrate for web apps, but toggling a switch-style
  // checkbox gives a haptic tick (iOS 18+), so we flip a hidden one. Either
  // way it has to happen during the tap itself, so we work out whether the
  // tap finishes the goal before the server answers.
  function haptic() {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(60);
        return;
      }
      // iPhone's switch tick is light and can't be made stronger, so fire it
      // twice, close enough together to feel like one firmer tap.
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-100px;top:0;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.append(input);
      document.body.append(label);
      label.click();
      setTimeout(() => {
        label.click();
        label.remove();
      }, 30);
    } catch {
      // No haptics here; nothing else changes.
    }
  }

  // Would adding `delta` to this goal finish it? Weekly miles tick on every tap.
  function amountHaptic(habitId, delta, day) {
    const h = state.dash?.habits.find((x) => x.id === habitId);
    if (!h || !(delta > 0)) return;
    const have = weekly(h) ? weekTotal(h) : amountOn(h, day || state.dash.today);
    const target = weekly(h) ? weekTarget(h) : h.daily_amount;
    if (weekly(h) || (have < target && have + delta >= target)) haptic();
  }

  app.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    if (f.dataset.form === 'amount') amountHaptic(Number(f.dataset.habit), Number(f.amount.value), f.dataset.day);
    if (f.dataset.form === 'amount-total') {
      const h = state.dash?.habits.find((x) => x.id === Number(f.dataset.habit));
      if (h) amountHaptic(h.id, Number(f.amount.value) - amountOn(h, f.dataset.day || state.dash.today), f.dataset.day);
    }
    const btn = f.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    guarded(() => forms[f.dataset.form](f)).finally(() => {
      if (btn && btn.isConnected) btn.disabled = false;
    });
  });

  app.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.disabled) return;
    if (el.dataset.action === 'log-done') haptic();

    else if (el.dataset.action === 'add-amount') amountHaptic(Number(el.dataset.habit), Number(el.dataset.delta), el.dataset.day);
    el.disabled = true; // no double taps
    guarded(() => actions[el.dataset.action](el)).finally(() => {
      if (el.isConnected) el.disabled = false;
    });
  });

  // Live title preview while typing an amount.
  app.addEventListener('input', (ev) => {
    if (ev.target.dataset.action === 'sched-input') {
      schedChanged(ev.target.closest('form'));
      return;
    }
    if (ev.target.dataset.action !== 'preset-amount') return;
    const form = ev.target.closest('form');
    const preset = PRESETS.find((p) => p.key === form?.dataset.preset);
    const out = form?.querySelector('[data-role=preview]');
    if (preset && out) out.textContent = presetTitle(preset, ev.target.value) || '…';
  });

  // Remember whether a goal picker is open across re-renders.
  app.addEventListener(
    'toggle',
    (ev) => {
      if (ev.target.matches && ev.target.matches('details.activity-drop')) {
        state.activityOpen = ev.target.open;
        return;
      }
      if (ev.target.matches && ev.target.matches('details.req-mine')) {
        state.reqOpen = ev.target.open;
        return;
      }
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
    if (el.dataset.action === 'set-remind') {
      guarded(async () => {
        ({ user: state.user } = await api('PATCH', '/api/me', { remind_at: el.value || null }));
        toast(el.value ? `Reminder set for ${el.selectedOptions[0].textContent}.` : 'Evening reminder off.');
      });
    } else if (el.dataset.action === 'set-share-weight') {
      guarded(async () => {
        ({ user: state.user } = await api('PATCH', '/api/me', { share_weight: el.checked }));
        toast(el.checked ? 'Your partners can see your weight.' : 'Your weight is just yours now.');
        render();
      });
    } else if (el.dataset.action === 'set-notify-partner') {
      guarded(async () => {
        ({ user: state.user } = await api('PATCH', '/api/me', { notify_partner: el.checked }));
      });
    }
  });

  // Portrait only. Android's installed app takes the lock; iPhone ignores it,
  // so a sideways phone gets the "Turn your phone upright" screen instead.
  try {
    screen.orientation?.lock?.('portrait')?.catch(() => {});
  } catch {
    /* not supported here */
  }

  // The + slides away while you scroll down and comes back when you scroll up.
  let lastScroll = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (Math.abs(y - lastScroll) < 8) return;
    const hide = y > lastScroll && y > 80;
    lastScroll = y;
    if (hide === !!state.fabHidden) return;
    state.fabHidden = hide;
    app.querySelector('.fab')?.classList.toggle('away', hide);
  }, { passive: true });

  app.addEventListener('pointerdown', weightHover);
  app.addEventListener('pointermove', weightHover);

  // A notification came in while the app is open: pull in what happened.
  if (!window.AA_DEMO && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data === 'refresh' && state.pid) guarded(refresh);
    });
  }

  // Keep the partner's side fresh without clobbering anything you're typing.
  setInterval(() => {
    if (document.hidden || !state.pid || state.panel || state.preset || state.reorder) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    guarded(refresh);
  }, 30000);

  // An invite link: remember the code through sign up, then join.
  const joinPath = /^\/join\/([A-Za-z0-9]{4,12})\/?$/.exec(location.pathname);
  if (joinPath) {
    store('aa.join', joinPath[1].toUpperCase());
    history.replaceState(null, '', '/');
  }

  // A reset link from the email: open the reset form with the code filled in.
  const params = new URLSearchParams(location.search);
  if (params.get('reset')) {
    state.authMode = 'reset';
    state.reset = { code: params.get('reset'), email: params.get('email') || '' };
    history.replaceState(null, '', location.pathname);
  }

  boot();
})();
