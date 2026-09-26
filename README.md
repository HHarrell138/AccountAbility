# AccountAbility

**Habits you keep because someone's counting on you.**

Most habit trackers are either solo (easy to lie to yourself) or social (performing for strangers). AccountAbility is neither: it's a closed pact between **you and one person** (a friend, spouse, or training partner) built so that skipping costs something.

## What makes it different

| Rule | Why |
| --- | --- |
| **Shared goals come first** | You and your partner agree on goals together. One proposes, the other has to say yes, and then you're compared side by side on them. |
| **Side goals** | Personal goals your partner can see and nudge you on, but they don't count toward the streak. |
| **1-on-1 pacts** | No followers, no public feed. Just the person whose opinion you actually care about. |
| **Misses need a reason** | You can't log a miss without saying what got in the way, and your partner sees it. |
| **Shared pair streak** | The streak only grows in weeks where *both* of you hit *every shared goal*. If you slack, you break it for them too. |
| **No rewriting history** | You can log today or yesterday, and yesterday is marked *late*. Nothing older. |
| **Quitting is visible** | Dropping a goal shows up in the feed, and that week still counts. Ending a shared goal ends it for both of you. |
| **Stakes** | "Loser buys coffee" is pinned at the top where you both see it. |
| **Nudge / Cheer** | One tap to call your partner out or hype them up. |

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

Environment variables: `PORT` (default 3000) and `DB_FILE` (SQLite path, or `:memory:`).

### Deploy (Render, about $7.25/mo)

`render.yaml` in the repo defines everything: a Docker web service, a 1 GB persistent disk for the database, and a health check.

1. Sign up at [render.com](https://render.com) with GitHub.
2. **New → Blueprint**, pick this repo and branch, then click **Apply**.
3. Wait for the first deploy to go green (a few minutes), then open the `onrender.com` URL.

Every push to that branch redeploys automatically, and the database lives on the disk, so it survives deploys.
Paid instances are needed because free ones have no persistent disk and would wipe everyone's data on each restart.

The `Dockerfile` also runs anywhere else (Railway, Fly.io, a VPS). Just mount a volume at `/var/data`.

## How it's built

```
src/server.js   HTTP server + JSON API (node:http, no framework)
src/db.js       SQLite schema (node:sqlite)
src/logic.js    Pure week/score/streak logic, the part worth unit testing
public/         Installable web app (vanilla JS, mobile-first, light + dark)
test/           node:test suites
```

The data model already supports groups: `partnerships.max_members` is 2 today. Raising it is the path to family, team, and church groups once 1-on-1 is proven.

## Roadmap (in priority order)

1. **Push notifications:** get a nudge, see your partner's miss, get an evening reminder if you haven't checked in. This is the single biggest retention lever, and the 30-second polling in the MVP is a stand-in.
2. **Weekly review ritual:** a Sunday screen where both of you see the week and settle the stakes.
3. **Proof check-ins:** attach a photo for habits where "trust me" isn't enough.
4. **Groups:** raise `max_members`, add a group view, and let a group streak work the same way as the pair streak.
5. **Native wrapper (Capacitor/Expo)** once people are using it and App Store distribution matters.
