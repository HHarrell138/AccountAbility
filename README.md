# AccountAbility

**Goals you keep because someone's counting on you.**

Most habit trackers are either solo (easy to lie to yourself) or social (performing for strangers). AccountAbility is neither: it's a closed pact between **you and one person** (a friend, spouse, or training partner) built so that skipping costs something.

## What makes it different

| Rule | Why |
| --- | --- |
| **Shared goals come first** | You and your partner agree on goals together. One proposes, the other has to say yes, and then you're compared side by side on them. |
| **Side goals** | Personal goals your partner can see and nudge you on, but they don't count toward the streak. |
| **1-on-1 pacts** | No followers, no public feed. Just the person whose opinion you actually care about. |
| **One tap to log** | Tap the check and it's logged. Tap again (or Undo) if it was an accident. |
| **Log as you go** | Water has a + button (+8 oz a tap, changeable after) that adds to today's total; protein and calories ask how much each time. Run is weekly: each tap adds a mile (or type a longer run), and it all adds to the week's miles ("Run 15 miles a week"). Hitting the amount counts as done, and your partner sees the running total. |
| **Your own numbers** | Protein and calorie goals are agreed as a habit, but each of you sets your own number (you at 180 g, your partner at 130 g). Whoever agrees picks theirs when they say yes, and either of you can change it later; your partner sees the change. |
| **Log once, counts everywhere** | In a pact with your brother and another with a friend, and both have water? One tap logs it in both, each against its own target, with no extra messages about it. Amount goals link by what they count (oz, miles), wake-up links on its own, and anything else has to have the same name. |
| **Edit what's yours** | Every goal's ⋯ menu changes what's yours: your number where each of you sets one (protein, calories) and anything on a side goal, your wake-up times (not which days), your workout day plan, tap size, or ending it. A number you both agreed on (a gallon, 10,000 steps) and days per week are the pact itself: change those by proposing a new goal. |
| **Challenges** | Any goal can have a finish line: 7, 14, 21, 30, 60 or 90 days, or ongoing. No alcohol starts as a 30-day challenge. Cards count it (Day 12 of 30; on a shared goal Day 1 is the day you both agree), the last week's target stops at the finish line, and when it's over it wraps itself up: you both see the result (28 of 30 days) and get a notification. |
| **Weight** | Log your weight once a day and see it over time (30 days, 90 days, all). It's yours across every pact and private unless you choose to share it with your partners. Not a goal, not in the streak. |
| **Tips as you go** | No wall of instructions. One short tip at a time shows up right where it applies, the first time it applies (tap + to propose, tap the check, how protein logging works, Compare, the circles, the streak bar...). "Got it" or just doing the thing, and it's gone. The how-to lines in the goal form show the first time you pick that kind of goal. The full How it works page is still in the pacts menu, with a button to bring the tips back. |
| **Misses need a reason** | You can't log a miss without saying what got in the way, and your partner sees it. A logged miss can't be undone. |
| **Shared pair streak** | Scored weekly as one combined bar that moves every time either of you logs: each goal earns credit as you go (3 of 4 workouts is 75% of it, a weekly run counts its miles), each of you fills half, so one person doing everything is only 50%. 70%+ keeps it alive (blue), 100% makes it green, three 100% weeks in a row make it gold. A 70-99% week drops it a level; under 70% breaks it. If you slack, you break it for them too. |
| **No rewriting history** | Tap today's or yesterday's circle to log it; yesterday is marked *late* for your partner to see. Nothing older. |
| **Quitting is visible** | Dropping a goal shows up in the feed, and that week still counts. Ending a shared goal ends it for both of you. |
| **Nudge / Cheer** | One tap to call your partner out or hype them up. |
| **Notifications** | On the home-screen app: when your partner joins, is up (wake-up logged, with the time it was for), or hits every goal for the day; nudges, cheers and goal requests; and an evening reminder (your time zone, your time) only if goals are still open. Not every single check-in. |
| **Weekly recap** | Sunday through Tuesday: the week's combined score, where the streak landed, each shared goal, and every miss with its reason. |
| **Your color, their color** | Black and blue. You're blue and your partner is ice-white, so every shared goal reads as you vs. them at a glance. |

Weekly targets ("4x per week") beat daily all-or-nothing streaks: they survive a travel day or a sick day but still keep you on the hook. A habit created mid-week gets a prorated target for that first week, so a new habit never starts as an automatic fail.

## Run it

Requires Node **22.5+**. There are no dependencies to install.

```bash
npm start          # http://localhost:3000, data in ./data/accountability.db
npm test           # logic + API tests
```

On a phone, open the URL and use **Add to Home Screen**. It installs like an app.

### Preview without a server

`npm run build:preview` bundles the app into one file, `dist/preview.html`, with an in-browser stand-in for the server (`public/demo.js`) and a simulated partner who reacts to check-ins and nudges. Open it on any phone to click around. It uses the same scoring code as the real server (`src/logic.js`).

Environment variables: `PORT` (default 3000), `DB_FILE` (SQLite path, or `:memory:`), and for password reset emails `SMTP_USER` / `SMTP_PASS` (a Gmail address and a Google app password; see `src/mail.js`). Without them, Forgot password says reset by email is not set up.

### Deploy (Render, about $7.25/mo)

`render.yaml` in the repo defines everything: a Docker web service, a 1 GB persistent disk for the database, and a health check.

1. Sign up at [render.com](https://render.com) with GitHub.
2. **New → Blueprint**, pick this repo and the **`main`** branch, then click **Apply**.
3. Wait for the first deploy to go green (a few minutes), then open the `onrender.com` URL.

Render deploys from **`main`**, which is the live app. Work happens on other branches and gets tried in the preview first; merging into `main` is what ships it. Every push to `main` redeploys automatically, and the database lives on the disk, so it survives deploys.
Paid instances are needed because free ones have no persistent disk and would wipe everyone's data on each restart.

The `Dockerfile` also runs anywhere else (Railway, Fly.io, a VPS). Just mount a volume at `/var/data`.

## How it's built

```
src/server.js   HTTP server + JSON API (node:http, no framework)
src/db.js       SQLite schema (node:sqlite)
src/logic.js    Pure week/score/streak logic, the part worth unit testing
public/         Installable web app (vanilla JS, mobile-first, dark theme)
test/           node:test suites
```

The data model already supports groups: `partnerships.max_members` is 2 today. Raising it is the path to family, team, and church groups once 1-on-1 is proven.

## Roadmap (in priority order)

1. **Proof check-ins:** attach a photo for habits where "trust me" isn't enough.
2. **Groups:** raise `max_members`, add a group view, and let a group streak work the same way as the pair streak.
3. **Native wrapper (Capacitor/Expo)** once people are using it and App Store distribution matters.
