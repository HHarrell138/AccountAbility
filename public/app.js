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
  const iconSvg = (key) =>
    `<svg class="hicon i-${esc(key)}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[key] || ICONS.check}</svg>`;

  // Presets fill in the add-habit form. {n} is the amount the person picks.
  const PRESETS = [
    { key: 'water', icon: 'water', label: 'Water', title: (n) => `Drink ${n} gallon${n === 1 ? '' : 's'} of water`, amount: 1, step: 0.25, min: 0.25, unit: 'gallons', days: 7 },
    { key: 'protein', icon: 'protein', label: 'Protein', title: (n) => `Eat ${n}g of protein`, amount: 150, step: 5, min: 5, unit: 'grams', days: 7 },
    { key: 'calories', icon: 'calories', label: 'Hit calories', title: (n) => `Eat at least ${n.toLocaleString()} calories`, amount: 2500, step: 50, min: 500, unit: 'calories', days: 7 },
    { key: 'calorie-cap', icon: 'calorie-cap', label: 'Calorie cap', title: (n) => `Stay under ${n.toLocaleString()} calories`, amount: 2000, step: 50, min: 500, unit: 'calories', days: 6 },
    { key: 'workout', icon: 'workout', label: 'Workout', title: () => 'Work out', days: 4 },
    { key: 'steps', icon: 'steps', label: 'Steps', title: (n) => `Walk ${n.toLocaleString()} steps`, amount: 10000, step: 500, min: 500, unit: 'steps', days: 5 },
    { key: 'read', icon: 'read', label: 'Read', title: (n) => `Read ${n} pages`, amount: 20, step: 5, min: 1, unit: 'pages', days: 5 },
    { key: 'sleep', icon: 'sleep', label: 'Sleep', title: (n) => `Sleep ${n} hours`, amount: 8, step: 0.5, min: 4, unit: 'hours', days: 5 },
    { key: 'custom', icon: 'check', label: 'Custom', days: 5 },
  ];

  const state = {
    user: null,
    partnerships: [],
    pid: null,
    dash: null,
    authMode: 'signup',
    panel: null, // { type: 'checkin', habitId, status, day } | { type: 'nudge', habitId, userId }
    addOpen: false, // add-habit section expanded
    preset: null, // selected preset key in the add-habit form
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
    const waiting = d.members.length < d.partnership.max_members;
    const mine = d.habits.filter((h) => h.user_id === d.me);
    const unread = d.events.filter((e) => e.id > d.last_seen_event_id && e.actor_id !== d.me).length;

    return `
      <header class="bar">
        ${pactSwitcher()}
        <button class="link" data-action="logout">Log out</button>
      </header>

      ${waiting ? inviteCard() : ''}
      ${scoreCard(me, partners)}

      <section>
        <h2>Your habits <span class="muted small">today, ${esc(prettyDay(d.today))}</span></h2>
        ${mine.length ? mine.map((h) => habitCard(h, true)).join('') : `<p class="empty">Nothing on the line yet. Add a habit so ${partners[0] ? esc(partners[0].name) : 'your partner'} has something to hold you to.</p>`}
        ${addHabitForm(mine.length === 0)}
      </section>

      ${partners
        .map((p) => {
          const theirs = d.habits.filter((h) => h.user_id === p.id);
          return `
          <section>
            <h2>${esc(p.name)}'s habits</h2>
            ${theirs.length ? theirs.map((h) => habitCard(h, false)).join('') : `<p class="empty">${esc(p.name)} hasn't committed to anything yet. Give them a nudge.</p>${nudgeRow(p.id, null)}`}
          </section>`;
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
        <p>Send them this code. They sign up, tap <em>Join with a code</em>, and you're locked in.</p>
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
      const ms = d.week.members[m.id];
      if (!ms || ms.habits.length === 0) return `<span class="pill">no habits</span>`;
      const hit = ms.habits.filter((h) => h.met).length;
      return ms.met ? `<span class="pill good">week won</span>` : `<span class="pill">${hit}/${ms.habits.length} targets hit</span>`;
    };
    const lw = d.lastWeek;
    const lastWeekLine =
      d.partnership.created_day <= lw.end && people.length > 1
        ? lw.allMet
          ? 'Last week: you both delivered.'
          : `Last week: ${people.filter((m) => !lw.members[m.id]?.met).map((m) => (m.id === d.me ? 'you' : esc(m.name))).join(' and ')} came up short.`
        : '';
    return `
      <section class="card score">
        <div class="streak">
          <span class="flame" aria-hidden="true">${s.weeks > 0 ? '🔥' : '🪵'}</span>
          <div>
            <div class="streak-num">${s.weeks} week${s.weeks === 1 ? '' : 's'}</div>
            <div class="muted small">pair streak: both of you hit every target</div>
          </div>
        </div>
        <ul class="who">
          ${people.map((m) => `<li><span>${m.id === d.me ? 'You' : esc(m.name)}</span>${status(m)}</li>`).join('')}
        </ul>
        ${lastWeekLine ? `<p class="small">${lastWeekLine}</p>` : ''}
        <form class="stakes" data-form="stakes">
          <label>On the line
            <input name="stakes" maxlength="200" value="${esc(d.partnership.stakes)}" placeholder="Loser buys coffee">
          </label>
          <button class="btn small" type="submit">Save</button>
        </form>
      </section>`;
  }

  function habitCard(h, mine) {
    const d = state.dash;
    const start = weekStart(d.today);
    const yesterday = addDays(d.today, -1);
    const byDay = new Map(d.checkins.filter((c) => c.habit_id === h.id).map((c) => [c.day, c]));
    const score = d.week.members[h.user_id]?.habits.find((x) => x.habit_id === h.id);
    const done = score ? score.done : 0;
    const target = score ? score.target : h.target_per_week;
    const todayC = byDay.get(d.today);
    const yesterdayC = byDay.get(yesterday);
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

    const panel = state.panel;
    let actions = '';
    if (mine) {
      if (panel && panel.type === 'checkin' && panel.habitId === h.id) {
        actions = checkinPanel(h, panel);
      } else if (panel && panel.type === 'archive' && panel.habitId === h.id) {
        actions = `
          <div class="panel">
            <p class="small"><strong>Drop this habit?</strong> Your partner will see that you dropped it, and this week still counts.</p>
            <div class="row">
              <button class="btn danger" data-action="archive" data-habit="${h.id}">Drop it</button>
              <button class="btn" data-action="close-panel">Keep it</button>
            </div>
          </div>`;
      } else {
        const yesterdayOpen = !yesterdayC && yesterday >= h.created_day;
        actions = `
          <div class="row">
            ${todayC
              ? `<span class="logged ${todayC.status}">${todayC.status === 'done' ? '✓ Done today' : '✗ Missed today'}</span>
                 <button class="link" data-action="open-checkin" data-habit="${h.id}" data-status="${todayC.status === 'done' ? 'missed' : 'done'}" data-day="${d.today}">change</button>`
              : `<button class="btn primary" data-action="open-checkin" data-habit="${h.id}" data-status="done" data-day="${d.today}">✓ Done</button>
                 <button class="btn" data-action="open-checkin" data-habit="${h.id}" data-status="missed" data-day="${d.today}">✗ Missed</button>`}
          </div>
          ${yesterdayOpen ? `<button class="link small" data-action="open-checkin" data-habit="${h.id}" data-status="done" data-day="${yesterday}">Forgot yesterday? Log it (shows as late)</button>` : ''}
          <button class="link small quiet" data-action="confirm-archive" data-habit="${h.id}">Drop this habit</button>`;
      }
    } else {
      const status = todayC
        ? `<p class="small ${todayC.status}">${todayC.status === 'done' ? '✓ Done today' : '✗ Missed today'}${todayC.note ? `: “${esc(todayC.note)}”` : ''}</p>`
        : `<p class="small muted">Not checked in today</p>`;
      actions = status + nudgeRow(h.user_id, h.id, !todayC || todayC.status !== 'done');
    }

    return `
      <article class="card habit">
        <div class="habit-head">
          <span class="icon-tile">${iconSvg(h.icon)}</span>
          <div class="habit-title">
            <h3>${esc(h.title)}</h3>
            ${h.why ? `<p class="why">${esc(h.why)}</p>` : ''}
          </div>
          <div class="count"><strong>${done}</strong>/${target}<div class="muted small">this week</div></div>
        </div>
        <div class="dots">${dots}</div>
        <div class="outlook">${outlook}${target < h.target_per_week ? `<span class="muted small">First week, so the goal is ${target} instead of ${h.target_per_week}</span>` : ''}</div>
        ${actions}
      </article>`;
  }

  function checkinPanel(h, panel) {
    const missed = panel.status === 'missed';
    const late = panel.day !== state.dash.today;
    return `
      <form class="panel" data-form="checkin" data-habit="${h.id}" data-day="${panel.day}">
        <div class="seg" role="radiogroup" aria-label="Status">
          <label><input type="radio" name="status" value="done" ${missed ? '' : 'checked'} data-action="panel-status"> ✓ Done</label>
          <label><input type="radio" name="status" value="missed" ${missed ? 'checked' : ''} data-action="panel-status"> ✗ Missed</label>
        </div>
        ${late ? `<p class="small warn-text">Logging for yesterday. Your partner will see it was late.</p>` : ''}
        <label>${missed ? 'What got in the way? (your partner will see this)' : 'Anything to add? (optional)'}
          <textarea name="note" rows="2" maxlength="280" ${missed ? 'required' : ''} data-autofocus></textarea>
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
          <label>${panel.kind === 'cheer' ? 'Say something (optional)' : 'Add a message (optional)'}
            <input name="message" maxlength="280" data-autofocus placeholder="${panel.kind === 'cheer' ? 'Let’s go' : 'You said you would.'}">
          </label>
          <div class="row">
            <button class="btn primary" type="submit">${panel.kind === 'cheer' ? '👏 Send cheer' : '👉 Send nudge'}</button>
            <button class="btn" type="button" data-action="close-panel">Cancel</button>
          </div>
        </form>`;
    }
    const attrs = `data-user="${userId}" data-habit="${habitId ?? ''}"`;
    return `
      <div class="row">
        <button class="btn small" data-action="open-nudge" data-kind="cheer" ${attrs}>👏 Cheer</button>
        ${showNudge ? `<button class="btn small" data-action="open-nudge" data-kind="nudge" ${attrs}>👉 Nudge</button>` : ''}
      </div>`;
  }

  function addHabitForm(firstHabit) {
    const open = firstHabit || state.addOpen;
    const preset = PRESETS.find((p) => p.key === state.preset);
    const tiles = PRESETS.map(
      (p) => `
        <button type="button" class="preset ${p.key === state.preset ? 'on' : ''}" data-action="pick-preset" data-preset="${p.key}" aria-pressed="${p.key === state.preset}">
          <span class="icon-tile">${iconSvg(p.icon)}</span>
          <span>${esc(p.label)}</span>
        </button>`
    ).join('');

    let form = '';
    if (preset) {
      const fields =
        preset.key === 'custom'
          ? `<label for="habit-title">Habit<input id="habit-title" name="title" maxlength="80" required placeholder="Edit one video" data-autofocus></label>`
          : preset.amount
            ? `<label for="habit-amount">How much? <span class="muted">(${esc(preset.unit)})</span>
                 <input id="habit-amount" name="amount" type="number" inputmode="decimal" min="${preset.min}" step="${preset.step}" value="${preset.amount}" required data-action="preset-amount">
               </label>
               <p class="preview-title">${iconSvg(preset.icon)}<span id="habit-preview">${esc(preset.title(preset.amount))}</span></p>`
            : `<p class="preview-title">${iconSvg(preset.icon)}<span>${esc(preset.title())}</span></p>`;
      form = `
        <form data-form="habit" data-preset="${preset.key}">
          ${fields}
          <label for="habit-why">Why it matters <span class="muted">(your partner sees this)</span>
            <input id="habit-why" name="why" maxlength="200" placeholder="Content pays for the trip"></label>
          <label for="habit-days">Days per week
            <select id="habit-days" name="target_per_week">
              ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === preset.days ? 'selected' : ''}>${n}${n === 7 ? ' (every day)' : ''}</option>`).join('')}
            </select>
          </label>
          <button class="btn primary" type="submit">Commit to it</button>
        </form>`;
    }

    return `
      <details class="card add" ${open ? 'open' : ''}>
        <summary>+ Add a habit</summary>
        <p class="small muted">Pick one to start from, or make your own.</p>
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
    const late = e.kind.endsWith('_late') ? ' <span class="pill warn">late, for yesterday</span>' : '';
    let text;
    switch (e.kind) {
      case 'created': text = `${who} started the pact.`; break;
      case 'joined': text = `${who} joined. It's on.`; break;
      case 'done': case 'done_late': text = `${who} did ${habit}.${note}${late}`; break;
      case 'missed': case 'missed_late': text = `${who} missed ${habit}.${note}${late}`; break;
      case 'habit_added': text = `${who} committed to ${habit} (${esc(e.message)}).`; break;
      case 'habit_archived': text = `${who} dropped ${habit}.`; break;
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
      toast("You're in. Add your first habit.");
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
      await api('POST', '/api/habits', {
        partnership_id: state.pid,
        title,
        icon: preset.icon,
        why: f.why.value,
        target_per_week: Number(f.target_per_week.value),
        today: localToday(),
      });
      state.preset = null;
      state.addOpen = false;
      toast('Committed. Your partner can see it.');
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
      toast(f.dataset.kind === 'cheer' ? 'Cheer sent 👏' : 'Nudge sent 👉');
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
      state.preset = state.preset === el.dataset.preset ? null : el.dataset.preset;
      state.addOpen = true;
      render();
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
    const preset = PRESETS.find((p) => p.key === state.preset);
    const out = document.getElementById('habit-preview');
    if (preset && out) out.textContent = presetTitle(preset, ev.target.value) || '…';
  });

  // Remember whether the add-habit section is open across re-renders.
  app.addEventListener(
    'toggle',
    (ev) => {
      if (ev.target.matches && ev.target.matches('details.add')) {
        state.addOpen = ev.target.open;
        if (!ev.target.open) state.preset = null;
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
