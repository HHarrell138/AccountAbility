'use strict';

(() => {
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // ---------- look ----------

  // Each palette gives you and your partner their own color.
  const PALETTES = [
    { key: 'sunset', label: 'Sunset', you: '#f2622e', them: '#6b55e0' },
    { key: 'jungle', label: 'Jungle', you: '#11875a', them: '#e0902b' },
    { key: 'ink', label: 'Ink', you: '#e8356d', them: '#2b2b2b' },
  ];

  function applyPalette(key) {
    const p = PALETTES.find((x) => x.key === key) || PALETTES[0];
    document.documentElement.dataset.palette = p.key;
    return p.key;
  }

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
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    flame: ICONS.calories,
    pact: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  };
  const uiIcon = (key, cls = '') =>
    `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UI_ICONS[key]}</svg>`;

  // Presets fill in the goal form. {n} is the amount the person picks.
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
    panel: null, // { type: 'miss' | 'archive', habitId }
    addOpen: null, // which goal picker is open: 'shared' | 'side' | 'closed' | null
    preset: null, // selected preset key in the open picker
    editStakes: false,
    expanded: new Set(), // shared goals opened to compare with your partner
    palette: applyPalette(store('aa.palette')),
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
    if (!state.user) app.innerHTML = authView();
    else if (!state.pid || !state.dash) app.innerHTML = onboardView();
    else app.innerHTML = dashView();
    const focus = app.querySelector('[data-autofocus]');
    if (focus) focus.focus();
  }

  const logoMark = () => `<span class="mark">${uiIcon('pact')}</span>`;

  function authView() {
    const signup = state.authMode === 'signup';
    return `
      <section class="hero">
        ${logoMark()}
        <h1 class="wordmark">AccountAbility</h1>
        <p class="tagline">Goals you keep because someone's counting on you.</p>
      </section>
      <form class="card" data-form="${signup ? 'signup' : 'login'}">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" aria-selected="${signup}" data-action="auth-mode" data-mode="signup">Sign up</button>
          <button type="button" role="tab" aria-selected="${!signup}" data-action="auth-mode" data-mode="login">Log in</button>
        </div>
        ${signup ? `<label for="f-name">Your first name<input id="f-name" name="name" autocomplete="given-name" maxlength="40" required></label>` : ''}
        <label for="f-user">Username<input id="f-user" name="username" autocomplete="username" autocapitalize="none" minlength="3" maxlength="30" required></label>
        <label for="f-pass">Password<input id="f-pass" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required></label>
        <button class="btn primary wide" type="submit">${signup ? 'Create account' : 'Log in'}</button>
      </form>
      <ul class="pitch">
        <li>${uiIcon('pact')}<span><strong>Just you and one person.</strong> No followers, no feed of strangers.</span></li>
        <li>${uiIcon('done')}<span><strong>Goals you agree on.</strong> You both say yes, then you're compared side by side.</span></li>
        <li>${uiIcon('flame')}<span><strong>One shared streak.</strong> It only grows if you <em>both</em> show up.</span></li>
      </ul>`;
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
        <label for="p-name">Name it <span class="muted">(optional)</span><input id="p-name" name="name" maxlength="60" placeholder="Hank &amp; Jake"></label>
        <label for="p-stakes">What's on the line? <span class="muted">(optional)</span>
          <input id="p-stakes" name="stakes" maxlength="200" placeholder="Whoever misses their week buys dinner"></label>
        <button class="btn primary wide" type="submit">Create pact</button>
      </form>
      <form class="card" data-form="join-pact">
        <h2 class="card-title">Join with a code</h2>
        <label for="p-code">Invite code<input id="p-code" name="code" maxlength="12" autocapitalize="characters" autocomplete="off" required placeholder="ABC234"></label>
        <button class="btn wide" type="submit">Join</button>
      </form>
      <footer class="foot">
        ${state.partnerships.length ? `<button class="link" data-action="back-to-pact">Back to my pact</button>` : ''}
        <button class="link" data-action="logout">Log out</button>
      </footer>`;
  }

  const isMe = (id) => id === state.dash.me;
  const whoClass = (id) => (isMe(id) ? 'you' : 'them');
  const avatar = (m) => `<span class="av ${whoClass(m.id)}" aria-hidden="true">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span>`;

  function dashView() {
    const d = state.dash;
    const partners = d.members.filter((m) => !isMe(m.id));
    const partnerName = partners[0] ? esc(partners[0].name) : 'your partner';
    const waiting = d.members.length < d.partnership.max_members;
    const active = d.goals.filter((g) => g.status === 'active');
    const proposals = d.goals.filter((g) => g.status === 'proposed');
    const sideMine = d.habits.filter((h) => isMe(h.user_id) && !h.goal_id);
    const unread = d.events.filter((e) => e.id > d.last_seen_event_id && !isMe(e.actor_id)).length;

    const myShared = d.habits.filter((h) => isMe(h.user_id) && h.goal_id);
    const left = myShared.filter((h) => !d.checkins.some((c) => c.habit_id === h.id && c.day === d.today)).length;
    const todayLine = !myShared.length
      ? 'Agree on a goal to get started.'
      : left
        ? `${left} shared goal${left === 1 ? '' : 's'} left for you today.`
        : 'You’ve checked in on every shared goal today.';

    return `
      <header class="top">
        <div>
          <p class="eyebrow">${esc(prettyDay(d.today))}</p>
          ${pactTitle()}
          <p class="today-line">${todayLine}</p>
        </div>
        <div class="pair">${d.members.map(avatar).join('')}</div>
      </header>

      ${waiting ? inviteCard() : ''}
      ${streakCard()}
      ${proposals.length ? proposalsCard(proposals) : ''}

      <section class="block">
        <h2 class="section-title">Shared goals</h2>
        ${active.length
          ? active.map(goalCard).join('')
          : `<p class="empty">${proposals.length ? 'Nothing is agreed yet.' : 'Agree on your first goal.'} You're both held to shared goals, and they're what your streak counts.</p>`}
        ${addForm('shared', active.length === 0 && proposals.length === 0, partnerName)}
      </section>

      <section class="block">
        <h2 class="section-title">Your side goals</h2>
        <p class="section-note">Just yours. ${partnerName} can see them, but they don't count toward the streak.</p>
        ${sideMine.map((h) => sideCard(h)).join('')}
        ${addForm('side', false, partnerName)}
      </section>

      ${partners
        .map((p) => {
          const theirs = d.habits.filter((h) => h.user_id === p.id && !h.goal_id);
          return theirs.length
            ? `<section class="block"><h2 class="section-title">${esc(p.name)}'s side goals</h2>${theirs.map((h) => sideCard(h)).join('')}</section>`
            : '';
        })
        .join('')}

      <section class="block">
        <h2 class="section-title">Activity ${unread ? `<span class="badge">${unread} new</span>` : ''}</h2>
        <ol class="feed">${d.events.map(feedItem).join('') || '<li class="muted">Nothing yet.</li>'}</ol>
      </section>

      <footer class="foot">
        <div class="looks" role="radiogroup" aria-label="Color palette">
          <span class="eyebrow">Look</span>
          ${PALETTES.map(
            (p) => `<button type="button" class="swatch ${p.key === state.palette ? 'on' : ''}" role="radio" aria-checked="${p.key === state.palette}" data-action="palette" data-palette="${p.key}">
              <span class="chips"><span style="background:${p.you}"></span><span style="background:${p.them}"></span></span>${esc(p.label)}</button>`
          ).join('')}
        </div>
        <button class="link" data-action="new-pact">Start or join another pact</button>
        <button class="link" data-action="logout">Log out</button>
      </footer>`;
  }

  function pactTitle() {
    if (state.partnerships.length <= 1) return `<h1 class="title">${esc(state.dash.partnership.name)}</h1>`;
    return `<select class="pact-select title" data-action="switch-pact" aria-label="Switch pact">
      ${state.partnerships.map((p) => `<option value="${p.id}" ${p.id === state.pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>`;
  }

  function inviteCard() {
    const code = state.dash.partnership.invite_code;
    return `
      <section class="card invite">
        <h2 class="card-title">Bring in your partner</h2>
        <p class="small">They sign up, tap <em>Join with a code</em>, and you're locked in. You can propose shared goals now; they start once your partner agrees.</p>
        <div class="code">${esc(code)}</div>
        <button class="btn wide" data-action="share-code" data-code="${esc(code)}">Share invite</button>
        ${window.AA_DEMO ? `<button class="btn primary wide" data-action="demo-join">Preview: have your partner join</button>` : ''}
      </section>`;
  }

  function streakCard() {
    const d = state.dash;
    const s = d.streak;
    const bars = d.members
      .map((m) => {
        const ms = d.sharedWeek.members[m.id];
        const total = ms ? ms.habits.length : 0;
        const hit = total ? ms.habits.filter((h) => h.met).length : 0;
        const pct = total ? Math.round((hit / total) * 100) : 0;
        return `
          <div class="bar-row">
            ${avatar(m)}
            <div class="bar ${whoClass(m.id)}"><span style="width:${pct}%"></span></div>
            <span class="bar-num">${total ? `${hit}/${total}` : '–'}</span>
          </div>`;
      })
      .join('');
    const lw = d.sharedLastWeek;
    const hadGoals = d.members.length > 1 && d.members.every((m) => lw.members[m.id]?.habits.length);
    const lastWeekLine = hadGoals
      ? lw.allMet
        ? 'Last week you both delivered.'
        : `Last week ${d.members.filter((m) => !lw.members[m.id]?.met).map((m) => (isMe(m.id) ? 'you' : esc(m.name))).join(' and ')} came up short.`
      : '';

    const stakes = state.editStakes
      ? `<form class="stakes-form" data-form="stakes">
           <label for="stakes-input">On the line
             <input id="stakes-input" name="stakes" maxlength="200" value="${esc(d.partnership.stakes)}" placeholder="Loser buys dinner" data-autofocus>
           </label>
           <button class="btn small primary" type="submit">Save</button>
         </form>`
      : `<button class="stakes" data-action="edit-stakes">
           ${uiIcon('lock')}
           <span class="stakes-body"><span class="eyebrow">On the line</span><span class="stakes-text">${d.partnership.stakes ? esc(d.partnership.stakes) : 'Nothing yet. Tap to set stakes.'}</span></span>
           ${uiIcon('pencil', 'faint')}
         </button>`;

    return `
      <section class="card streak-card ${s.weeks > 0 ? 'lit' : ''}">
        <div class="streak">
          <span class="streak-flame">${uiIcon('flame')}</span>
          <div>
            <div class="streak-num">${s.weeks}<span> week${s.weeks === 1 ? '' : 's'}</span></div>
            <div class="small muted">Pair streak. Grows when you both hit every shared goal.</div>
          </div>
        </div>
        <div class="bars">
          <p class="eyebrow">Shared goals hit this week</p>
          ${bars}
        </div>
        ${lastWeekLine ? `<p class="small">${lastWeekLine}</p>` : ''}
        ${stakes}
      </section>`;
  }

  function proposalsCard(proposals) {
    const d = state.dash;
    const nameOf = (id) => esc(d.members.find((m) => m.id === id)?.name || 'Your partner');
    const partner = d.members.find((m) => !isMe(m.id));
    return `
      <section class="card proposals">
        <h2 class="card-title">Waiting for a yes</h2>
        ${proposals
          .map((g) => {
            const mine = isMe(g.proposed_by);
            return `
            <div class="proposal">
              <span class="icon-tile">${iconSvg(g.icon)}</span>
              <div class="proposal-body">
                <p class="small muted">${mine ? `You proposed. ${partner ? `Waiting on ${esc(partner.name)}.` : 'Waiting for your partner to join.'}` : `${nameOf(g.proposed_by)} wants you both to`}</p>
                <p class="proposal-title">${esc(g.title)}</p>
                <p class="small muted">${g.target_per_week}x a week${g.why ? ` · ${esc(g.why)}` : ''}</p>
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

  // One person's week on one habit.
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
    else if (need === daysLeft) outlook = `<span class="pill warn">no slack</span>`;
    else outlook = `<span class="pill">${need} to go</span>`;

    const dots = DAY_LABELS.map((label, i) => {
      const day = addDays(start, i);
      const c = byDay.get(day);
      const cls = ['dot', c ? c.status : '', day === d.today ? 'today' : '', day > d.today || day < h.created_day ? 'off' : ''].join(' ');
      const title = c ? `${c.status}${c.late ? ' (late)' : ''}${c.note ? ': ' + c.note : ''}` : day;
      return `<span class="${cls}" title="${esc(title)}"></span>`;
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
    const bits = [`<strong>${mine ? 'You' : esc(person.name)}</strong>`, `<span class="num">${w.done}/${w.target}</span>`, w.outlook];
    if (w.todayC) {
      const note = w.todayC.note ? `: “${esc(w.todayC.note)}”` : '';
      bits.push(`<span class="${w.todayC.status}-text">${w.todayC.status === 'done' ? 'did it today' : 'missed today'}${note}</span>`);
    }
    if (mine && !w.todayC) bits.push(`<button class="link" data-action="open-miss" data-habit="${h.id}">Missed it?</button>`);
    const yesterday = addDays(d.today, -1);
    if (mine && !w.yesterdayC && yesterday >= h.created_day) {
      bits.push(`<button class="link" data-action="log-done" data-habit="${h.id}" data-day="${yesterday}">Log yesterday (late)</button>`);
    }
    return `<div class="subline">${bits.join('')}</div>`;
  }

  function trackerRow(h, person) {
    const w = habitWeek(h);
    const missOpen = state.panel && state.panel.type === 'miss' && state.panel.habitId === h.id;
    return `
      <div class="tracker-row ${whoClass(h.user_id)}">
        ${avatar(person)}
        ${w.dots}
        ${rowAction(h, w)}
        ${subline(h, w, person)}
        ${missOpen ? missPanel(h) : ''}
      </div>`;
  }

  function missPanel(h) {
    return `
      <form class="panel" data-form="miss" data-habit="${h.id}">
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
    return `<div class="card-foot"><button class="link quiet" data-action="confirm-archive" data-habit="${h.id}">${shared ? 'End shared goal' : 'Drop goal'}</button></div>`;
  }

  function cardHead(icon, title, sub, why) {
    return `
      <div class="card-head">
        <span class="icon-tile">${iconSvg(icon)}</span>
        <div class="card-head-text">
          <h3>${esc(title)}</h3>
          <p class="small muted">${sub}</p>
          ${why ? `<p class="why">${esc(why)}</p>` : ''}
        </div>
      </div>`;
  }

  function proratedNote(h) {
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
      <article class="card goal ${open ? 'is-open' : ''}">
        <div class="goal-hit" data-action="toggle-goal" data-goal="${g.id}">
          ${cardHead(g.icon, g.title, `Both of you · ${g.target_per_week}x a week`, g.why)}
          ${mine ? proratedNote(mine) : ''}
        </div>
        <div class="tracker">
          ${dayHeader()}
          ${mine ? trackerRow(mine, d.members.find((m) => isMe(m.id))) : ''}
          ${open ? others.map(({ m, h }) => trackerRow(h, m)).join('') : ''}
        </div>
        ${compare}
        ${mine && open ? endControl(mine, true) : ''}
      </article>`;
  }

  // A side goal: one person's row.
  function sideCard(h) {
    const d = state.dash;
    const person = d.members.find((m) => m.id === h.user_id);
    const mine = isMe(h.user_id);
    return `
      <article class="card side">
        ${cardHead(h.icon, h.title, `${mine ? 'Side goal' : `${esc(person.name)}'s side goal`} · ${h.target_per_week}x a week`, h.why)}
        ${proratedNote(h)}
        <div class="tracker">
          ${dayHeader()}
          ${trackerRow(h, person)}
        </div>
        ${mine ? endControl(h, false) : ''}
      </article>`;
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
        <form data-form="goal" data-kind="${kind}" data-preset="${preset.key}">
          ${fields}
          <label for="${kind}-why">${shared ? 'Why you’re doing it together' : 'Why it matters'} <span class="muted">(optional)</span>
            <input id="${kind}-why" name="why" maxlength="200" placeholder="${shared ? 'Feel good for the wedding' : 'Content pays for the trip'}"></label>
          <label for="${kind}-days">Days per week${shared ? ' (for both of you)' : ''}
            <select id="${kind}-days" name="target_per_week">
              ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === preset.days ? 'selected' : ''}>${n}${n === 7 ? ' (every day)' : ''}</option>`).join('')}
            </select>
          </label>
          <button class="btn primary wide" type="submit">${shared ? `Propose to ${partnerName}` : 'Add side goal'}</button>
        </form>`;
    }

    return `
      <details class="add ${shared ? 'add-shared' : ''}" data-kind="${kind}" ${isOpen ? 'open' : ''}>
        <summary>${uiIcon('plus')}${shared ? 'Propose a shared goal' : 'Add a side goal'}</summary>
        <div class="add-body">
          <p class="small muted">${shared ? `${partnerName} has to agree before it starts. Then you're both on the hook.` : 'Pick one to start from, or make your own.'}</p>
          <div class="presets">${tiles}</div>
          ${form}
        </div>
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
    const who = isMe(e.actor_id) ? 'You' : esc(e.actor_name);
    const whom = isMe(e.target_id) ? 'you' : esc(e.target_name);
    const habit = e.habit_title ? `<strong>${esc(e.habit_title)}</strong>` : '';
    const note = e.message ? ` <span class="quote">“${esc(e.message)}”</span>` : '';
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
      case 'stakes': text = e.message ? `${who} set the stakes: <span class="quote">“${esc(e.message)}”</span>` : `${who} cleared the stakes.`; break;
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

  async function afterJoinOrCreate(pid) {
    const me = await api('GET', '/api/me');
    state.partnerships = me.partnerships;
    state.pid = pid;
    store('aa.pid', String(pid));
    await refresh();
  }

  async function logDone(habitId, day) {
    await api('POST', '/api/checkins', { habit_id: habitId, day, status: 'done', today: localToday() });
    state.panel = null;
    await refresh();
    toast(day === state.dash.today ? 'Done. Logged.' : 'Logged for yesterday, marked late.', {
      label: 'Undo',
      run: async () => {
        await api('POST', '/api/checkins/undo', { habit_id: habitId, day, today: localToday() });
        await refresh();
      },
    });
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
      state.editStakes = false;
      toast('Stakes saved. Your partner will see it.');
      await refresh();
    },
    async goal(f) {
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
    async miss(f) {
      await api('POST', '/api/checkins', { habit_id: Number(f.dataset.habit), status: 'missed', note: f.note.value, today: localToday() });
      state.panel = null;
      toast('Logged. Owning it counts.');
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
    async 'log-done'(el) {
      await logDone(Number(el.dataset.habit), el.dataset.day);
    },
    async 'undo-done'(el) {
      await api('POST', '/api/checkins/undo', { habit_id: Number(el.dataset.habit), day: el.dataset.day, today: localToday() });
      toast('Undone.');
      await refresh();
    },
    'open-miss'(el) {
      state.panel = { type: 'miss', habitId: Number(el.dataset.habit) };
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
    'edit-stakes'() {
      state.editStakes = true;
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
    palette(el) {
      state.palette = applyPalette(el.dataset.palette);
      store('aa.palette', state.palette);
      render();
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
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.disabled) return;
    el.disabled = true; // no double taps
    guarded(() => actions[el.dataset.action](el)).finally(() => {
      if (el.isConnected) el.disabled = false;
    });
  });

  // Live title preview while typing an amount.
  app.addEventListener('input', (ev) => {
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
    }
  });

  // Keep the partner's side fresh without clobbering anything you're typing.
  setInterval(() => {
    if (document.hidden || !state.pid || state.panel || state.preset || state.editStakes) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    guarded(refresh);
  }, 30000);

  boot();
})();
