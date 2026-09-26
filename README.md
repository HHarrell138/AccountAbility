# AccountAbility

**Habits you keep because someone's counting on you.**

Most habit trackers are either solo (easy to lie to yourself) or social (performing for strangers). AccountAbility is neither: it's a closed pact between **you and one person** (a friend, spouse, or training partner) built so that skipping costs something.

## What makes it different

| Rule | Why |
| --- | --- |
| **1-on-1 pacts** | No followers, no public feed. Just the person whose opinion you actually care about. |
| **Misses need a reason** | You can't log a miss without saying what got in the way, and your partner sees it. |
| **Shared pair streak** | The streak only grows in weeks where *both* of you hit *every* target. If you slack, you break it for them too. |
| **No rewriting history** | You can log today or yesterday, and yesterday is marked *late*. Nothing older. |
| **Quitting is visible** | Dropping a habit shows up in the feed, and that week still counts. |
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

Environment variables: `PORT` (default 3000) and `DB_FILE` (SQLite path, or `:memory:`).

### Put it online so your partner can use it

Any host that runs Node and has a persistent disk works (Render, Railway, Fly.io, or a $5 VPS):

- Start command: `npm start`
- Mount a persistent volume and set `DB_FILE=/data/accountability.db`
- Serve over HTTPS (the session cookie becomes `Secure` behind a proxy that sets `x-forwarded-proto`)

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
