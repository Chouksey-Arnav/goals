# goals

A daily accountability system built on *Atomic Habits*. Two jobs:

1. **Your daily habits.** Reading *Atomic Habits*, your AP World History book, anything you want to do every day. You put them in; the app turns each one into a system and emails you when you create it, every time you do it, and every Monday with a scorecard.
2. **Finish two Udemy courses by October 31, 2026**, on the way to AI Olympiad prep.

| Course | Instructor | Tracked from |
|---|---|---|
| Mathematical Foundations of Machine Learning | Jon Krohn | Lesson 77 to 114 |
| Python for Data Science and Machine Learning Bootcamp | Jose Portilla | Lesson 16 to 165 (10 names pending) |

Every lesson name is copied exactly from the Udemy sidebar.

## Read this first (humans and future Claude sessions)

This README is the project's single source of truth: what exists, why, and the rules for changing it. `CLAUDE.md` only points here. Read all of it, plus the code you're touching, before changing anything.

**Rules for every change**

1. **Log it here, in the same commit.** Add a dated entry to the [Changelog](#changelog) (newest first) and update every section the change affects: features, emails, env vars, migrations, rules. A change that isn't in this README didn't happen.
2. **Logic is pure and tested.** Anything that decides something (plans, streaks, habits, schedules, email content) lives in a pure module in `js/` with no DOM, storage or clock, and gets tests in `tests/`. `npm test` must pass before every push.
3. **One brain for the app and the emails.** `js/digest.js` (`dayFacts`) computes "where do I stand" for both. Never compute the same fact twice in two places.
4. **The server decides what gets emailed.** The app may only *hint* (`POST /api/notify`, `POST /api/boost`); the server re-reads progress from the database, checks the session is the owner's, and decides. Never send email from the browser.
5. **Every email is sent exactly once.** Claim a row in `email_log` first, send, then mark it sent; a failed send releases the claim so the next run retries. New kinds of email need a slot name the table's check constraint allows (a migration in `supabase/migrations/`, applied to the Supabase project "Focus").
6. **Fail loudly.** Errors say exactly what to fix (see `hint()` in `api/_lib/supabase.js`). Scheduled failures email an alert. Silence must always mean "working".
7. **No build step, one dependency** (Nodemailer). Static files plus five serverless routes in `api/`. Vercel Hobby limits: daily crons only (hence 24 of them), 12 functions max.
8. **Honest, not hype.** Numbers come from the record. Praise what happened, name what didn't. Don't add features that let the user fake progress.
9. **Keep it simple to navigate.** Five tabs, no more. New things go inside an existing tab or under More.
10. **Never commit secrets.** Server keys live in Vercel env vars only; `js/config.js` holds only the public publishable key.

## Navigation

| Tab | What's there |
|---|---|
| **Today** | Everything to do today, in order: warnings, the progress ring, your habits (one tap each), today on your calendar, the next lesson, the checklist, rewards and *Close the day*. |
| **Habits** | Your daily habits: this week's score, each habit's chain and week, the two-minute version, add / edit / archive, last week's scorecard. |
| **Courses** | Every lesson of both courses by section. Tick anything in any order. |
| **Progress** | The chain heatmap, stats, savings jar, check-in trends, milestones. |
| **More** | Links to *How the system works* (Atomic Habits, contract, olympiad roadmap), sign-in and emails, study plan settings, backup. |

## Your daily habits

[`js/dailyhabits.js`](js/dailyhabits.js) (pure, tested in `tests/dailyhabits.test.js`). Up to 12 live habits. Creating one *is* making the plan, law by law:

| Field | Law | Example |
|---|---|---|
| Habit, how much | | Read Atomic Habits, 10 pages |
| When + where (implementation intention) | 1 Obvious | 9:30 pm, in bed |
| Habit stack: right after I… | 1 Obvious | I brush my teeth |
| Every rep is a vote for… (identity) | 2 Attractive | I am a reader |
| Two-minute version (still counts on bad days) | 3 Easy | Open the book and read one page |
| Days | | every day / weekdays / any set |
| One tap to tick, a chain, a week score, an email | 4 Satisfying | |

- One-tap templates: *Read Atomic Habits* and *Read my AP World History book*. Every field stays editable.
- **Ticking.** Today and Habits tabs: ✓ Done, or the two-minute version. Tap again to undo. Days in the current week can be filled in afterwards ("I read last night, forgot to tick"); those don't send an email.
- **Streaks.** Consecutive days done. Days a habit isn't scheduled neither add nor break the chain; doing it anyway counts. Today never breaks it while it's still open.
- **Never miss twice.** Missed last time → a red line under the habit (and in emails) pointing at the two-minute version.
- **Week.** Monday to Sunday. Every Monday's email and the Habits tab show last week's score per habit and name the weakest one to fix (usually its time or place).
- **Archive** stops scheduling a habit and keeps its history; *Restore* brings it back.
- Habits are independent of the course chain and contract, and keep running (with their own emails) on course rest days and after the courses are finished.
- State: `state.habits = [habit]`, `state.habitLog = { "YYYY-MM-DD": { habitId: "full" | "min" } }`, synced like everything else.

## Every email, and what triggers it

All sent from your Gmail with Nodemailer, to `EMAIL_TO` with `EMAIL_CC` as BCC (the partner report goes to partners only).

| Email | Trigger |
|---|---|
| **Morning plan** | Hourly cron, first run after 7:00 local. Lessons + today's habits + today's calendar (see [Calendar integration](#calendar-integration)). On course rest days or after the courses end: a habits-only morning email (if any are scheduled). |
| **Midday check-in** | Weekend morning block done, or the whole weekday done (sent the moment it happens), else 14:00 local. |
| **Evening wrap** | First run after 20:00 local. Lists habits still open. On course rest days: only if a habit is still open. |
| **Partner report** | Morning, to `PARTNER_EMAILS`, about yesterday (now including yesterday's habits). |
| **Weekly kickoff** | Monday morning window: last week's habit scorecard, the weakest habit to fix, this week's plan. With no habits: a prompt to add them. |
| **Done** | **Every lesson ticked and every habit done**, the moment it syncs. Things synced together (e.g. after being offline) share one email. If the same moment earns the midday email, the completions ride on it instead of sending two. |
| **New habit** | **Every habit you create**: "Here's your habit. Let's make it real." Your implementation intention, the four laws applied to it, the two-minute version, never miss twice. |
| **Send me motivation** | The Today button, on demand (max 1 a minute, 8 a day). |
| **Sign-in code** | Signing in. |
| **Failure alert** | A scheduled run fails (at most at 7:00, 14:00, 20:00). |

How *Done* and *New habit* are delivered: after every synced tick/habit/new habit the app calls `POST /api/notify`. The server checks the session is the owner's, re-reads progress, and emails whatever completed or was created **today** that has no `email_log` row yet (slots `done:<lesson id>`, `habit:<habit id>`, `new:<habit id>`). Every hourly cron run does the same check as a catch-up, so a dropped request (offline, tab closed) delays the email by at most an hour instead of losing it. Unticking and re-ticking never sends twice. Cap: 60 of these a day. Limit: a tick that only syncs after midnight is not emailed (it's no longer "today").

Volume check: a full day is about 3 daily emails + ~10 lessons + your habits ≈ 15 emails, each to you plus every `EMAIL_CC` address. Consumer Gmail allows roughly 500 recipients a day, so 15 emails × (1 + 15 copies) = 240 still fits, but if `EMAIL_CC` holds other people they will get every tick too. Keep `EMAIL_CC` to your own addresses.

## The course plan

- **Today tab:** tells you the exact next lesson ("Up next, do exactly this"), gives you today's checklist and a progress ring, and has a "Done, next lesson" button.
- **Auto re-planning:** today's plan comes from whatever work is left and the days remaining, weighted by how many minutes you can do on school days vs weekends. Miss a day and the remaining days get heavier. The plan never quietly assumes you'll catch up.
- **Honest pace:** shows the minutes per day you need, your capacity, and the date you'll actually finish at your capacity. It warns you when that date falls after the deadline.
- **Real work, not video time:** each lesson is estimated as code-along video × 1.5, exercises at least 20 min, projects 75 min. Exercises are tagged **Solve first**.
- **Atomic Habits, all four laws** (System tab), with the 4th Law and its inversion built through the whole app. See below.

## The 4th Law: make it satisfying

> What is immediately rewarded is repeated. What is immediately punished is avoided.

Laws 1 to 3 get a session done *this* time. Law 4 gets it done *next* time. So doing the work always feels good immediately, and only skipping it costs anything.

| Rule | Where it lives |
|---|---|
| **Immediate reinforcement** | Each tick plays a chime whose pitch climbs with every lesson that day. It also gives a haptic tap, sets off confetti, casts an identity vote and drops a paper clip from the *to do* jar into the *done* jar. Hitting 100% plays a fanfare. |
| **Rewards aligned with identity** | One daily reward stays locked until 100%. It is checked against your identity statement: self-assessed, plus a keyword nudge for things like ice cream or TikTok. Settings suggests aligned rewards. |
| **Bridging delayed returns** | System tab: an interactive time-inconsistency slider shows how small the olympiad payoff *feels* tonight, and how an immediate reward tips the balance. There is also an immediate/ultimate outcome grid. |
| **Make avoidance visible** | Give each thing you avoid a price ("Skip snacks out = 4"). In *Close the day*, mark it Avoided or Slipped. The money builds up in a labeled jar ("Olympiad fund") until you confirm you actually moved it. |
| **Incentives to identity** | A reinforcement phase (Spark, then Bridge, then Identity, by days shown up) shifts the reward card's message from external rewards to internal ones. It quotes your own check-in trends as evidence. |
| **Habit tracker / don't break the chain** | A 14-day chain on Today, a streak pill in the header, and on the Tracker tab: a full heatmap, stats and milestones. Rest days (0 capacity) neither extend nor break the chain. |
| **Habit stacking + tracking** | *Close the day*: "After [I finish dinner], I will [close the day in Goals]." This takes about 20 seconds. |
| **Automated tracking** | Minutes, streaks, the heatmap and savings all log themselves. An optional per-lesson timer records real minutes when you tick, then keeps running into the next lesson. Tracker compares your real pace to the estimate. |
| **Never miss twice** | One missed scheduled day shows a warning with a one-tap switch to a minimum day. Two in a row counts as a breach. |
| **Show up on bad days** | Bad-day mode shrinks today to one lesson that counts for the chain. The rest re-plans automatically. The full reward stays locked, so the minimum can't be gamed. |
| **Measure the right thing** | *Lock it in* asks for the core idea in one sentence after each tick, and Tracker shows what share of lessons you can explain. Ticking a long lesson within 3 minutes of the previous tick gets an honesty nudge. |
| **Non-scale victories** | A daily check-in on energy, focus and calm with trend sparklines, plus a one-line daily "win no number shows". |

### Inversion: make it unsatisfying

- **Habit contract** (System tab): your goal, specific daily habits, a penalty per breach (money and an optional public cost), and up to two accountability partners. You sign it by typing your name, and partners can sign later. It is printable and shareable. Voiding it is logged.
- **Immediate, local, reliable punishment:** breaches are computed from the record. A breach is a missed scheduled day directly after another one, counted only after signing and never judging today. The morning after a breach, a red banner on Today names the days and the amount owed. It cannot be dismissed until you confirm you paid.
- **Accountability partner:** one tap sends today's check-in by SMS or email, depending on the contact you saved, or through the share sheet. It includes the chain, what you did and any penalty owed.

Honest limits: the app can't move money or message anyone by itself. It builds the message and the reminder, and you press send. Penalties are only as real as your partner makes them.

## Atomic Habits as a daily system

[`js/principles.js`](js/principles.js) holds 30 ideas from the book, paraphrased and grouped as the foundations, the Four Laws and the advanced chapters. They include 1% better, systems vs goals, identity votes, the plateau of latent potential, implementation intentions, habit stacking, environment design, temptation bundling, reframing, the two-minute rule, decisive moments, the Goldilocks rule, boredom, deliberate practice, and reflection and review. Each idea has an `action(F)` that turns it into one concrete instruction computed from *today's* record, e.g. "Two minutes: open 'Introduction to Numpy' and press play."

The situation picks the idea: missed yesterday → *never miss twice*; nothing done by midday → *two-minute rule*; finished → *what is rewarded is repeated*. Otherwise it rotates through the whole book. The three emails of one day never repeat an idea. The System tab shows today's idea and the full library.

## Daily course emails in detail

Three emails a day, written from your synced record, sent through your Gmail with Nodemailer.

**Weekdays are one sitting**: the whole day's list in one go, at your planned time. **Weekends are two blocks**: about half the minutes in the morning (due by the midday hour), the rest in the afternoon. The split keeps plan order (math first) and cuts at the point closest to half the minutes. The Today tab shows the same two blocks.

| Email | When | What it says |
|---|---|---|
| **Morning plan** | First hourly check after 7:00 local | The exact Up Next lesson, the checklist with real-work minutes (weekdays: one sitting; weekends: morning block and afternoon block), your pace vs the deadline, the chain, and one Atomic Habits idea as a task. Leads with any unpaid contract breach. After a miss: *never miss twice*. |
| **Midday check-in** | Weekend: the moment the morning block is done, or 14:00 local. Weekday: 14:00 local, or the moment the whole sitting is done (it never interrupts a sitting halfway) | Weekend: "Morning block done. Afternoon block: 9 lessons, ~2h 34m." / "Morning block: 2 lessons left. Finish it, then the afternoon." Weekday: "Today: 10 lessons, ~3h, one sitting. Prime it now." / "4 of 10 done. Same sitting: 6 to go." Either: "Day complete. Reward unlocked." |
| **Evening wrap** | First hourly check after 20:00 local | Done: recap, identity vote, tomorrow's first lesson. Partial: what's left, honestly. Nothing: "your chain breaks at midnight", the minimum, and the contract cost if a second miss would breach it. |

Rest days get a short morning note only. After the last lesson you get one celebration email, then they stop.

### A cheer on every tick

Every lesson you tick gets a short toast built from that tick: *"Yes, let's go! 22 min more and today's done."*, *"You just saved 30 min of your day."*, *"Congratulations, you're 10% closer to today's goal."*, followed by a push like *"Keep on going, you can do this."* Weekends add block-aware lines (*"Morning block: 3 left, about 40 min."*, and a handoff when the morning block is done). Bonus lessons and the tick that finishes the day get their own sets.

[`js/cheers.js`](js/cheers.js) has 36 facts and 32 pushes (over a thousand pairs). Each pool is a shuffled deck: a line only comes back after every other line that fits has been shown. Lines that would be false right now (e.g. "one lesson left") wait in the deck until they're true. Percent lines need the tick to move the ring at least 3%. A suspiciously fast tick still gets the honest "a tick isn't learning" instead. Decks are kept per device in `localStorage`.

### "Send me motivation" button

On the Today tab. One tap emails you a push built from this exact moment. Not started: "Right now: open X. Just 2 minutes." Partway: what's left and the next lesson. Done: what that's worth. It always includes a fresh Atomic Habits idea that is never this morning's and never repeats within the day. It goes to `EMAIL_TO` and `EMAIL_CC`, never to partners. It saves any unsynced ticks first, works only for the owner's signed-in account, and is limited to 1 a minute and 8 a day (`POST /api/boost`).

### More people (up to 15 per list)

- **`EMAIL_CC`**: people who get copies of your three daily emails.
- **`PARTNER_EMAILS`**: accountability partners who get a separate **partner report** each morning about *yesterday*, once the day is final. It says whether you hit 100%, showed up partway, did the bad-day minimum or missed. It also gives how many misses in a row, your chain, whether you're on pace, any contract penalty you haven't paid, and your "win of the day". Missed days come with a nudge for them to send you a message. Partners get no app links. Replies come straight to your Gmail. No report after rest days.

Everyone is BCC'd, so nobody sees anyone else's address, and the partner report never lands in your own inbox. A typo drops only that address. More than 15 drops the whole list until you trim it. Both show up as `warnings` in `/api/cron?status=1` and never block your own emails.

How it works:

- **Schedule.** Vercel's free plan allows only daily crons, each firing somewhere in its hour. `vercel.json` registers 24 of them (one per UTC hour), and [`js/schedule.js`](js/schedule.js) decides which email is due in `GOALS_TZ`. Time zones and daylight saving need no code changes.
- **Early midday trigger.** After each synced tick the app calls `POST /api/notify` (weekend: morning block done; weekday: day done). The server checks that the session belongs to `EMAIL_TO`, re-reads your progress from the database and decides on its own.
- **Exactly once.** Table `email_log` has one row per (recipient, day, slot). Inserting it is the claim, so a cron run and an `/api/notify` call racing each other can't both send. A failed send releases the claim and the next hour retries. A sent email is never re-sent. If a run dies between claiming and sending (a timeout), the claim goes stale after 5 minutes and the next run sends it.
- **Retries and alerts.** A Gmail hiccup (timeout, dropped connection, 4xx) gets one immediate retry on a fresh connection; a wrong password doesn't. If a scheduled run fails for any other reason (database, keys, permissions, config), you get a "your daily emails are failing" email with the exact error, at most at 7:00, 14:00 and 20:00, so an outage can't stay silent.
- **Same plan as the app.** [`js/digest.js`](js/digest.js) computes "where do I stand" for both the Today tab and the emails, and [`js/state.js`](js/state.js) normalizes old saves for both.
- **Sign-in codes through Gmail, only.** `POST /api/login-code` emails a 6-digit code via Nodemailer. The app never falls back to Supabase's built-in mailer, which only delivers to project team members; if the server can't send, you see its real error. It only sends to `EMAIL_TO`, so strangers can't sign up. It's throttled to one code per 45 s and 10 per day.

### Database permissions

The server reads `progress` and writes `email_log` with the secret key (`service_role`). This project has table auto-expose off, so those grants must be explicit: [`20261012030000_grant_service_role.sql`](supabase/migrations/20261012030000_grant_service_role.sql). Without them every server call fails with `Supabase 403 ... permission denied for table progress`, and the error message now says which file to run.

### Environment variables (Vercel → Settings → Environment Variables, Production)

| Name | Required | Value |
|---|---|---|
| `GMAIL_USER` | yes | The Gmail address that sends, e.g. `you@gmail.com` |
| `GMAIL_APP_PASSWORD` | yes | 16-character [app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification). Not your Gmail password. |
| `EMAIL_TO` | yes | Where emails go. Also the only address allowed to sign in. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase → Project Settings → API Keys → **secret** key (`sb_secret_…`). Server only, never in `js/`. |
| `CRON_SECRET` | yes | A long random string (`openssl rand -hex 32`). Vercel sends it with every cron call. |
| `GOALS_TZ` | yes | Your IANA time zone, e.g. `America/New_York`, `America/Chicago`, `America/Los_Angeles` |
| `APP_URL` | no | Defaults to `https://goalsforarnav.vercel.app`. Must be the address you actually use: sign-in and local progress belong to one address, so links to another alias open an empty, signed-out app. |
| `EMAIL_CC` | no | Up to 15 comma-separated addresses that get copies of your 3 daily emails |
| `PARTNER_EMAILS` | no | Up to 15 comma-separated accountability partners for the morning partner report |
| `GOALS_NAME` | no | Your first name, used in the greeting and in partner report subjects. Defaults to the first name on your signed contract. Set it if you have partners, or reports say "Goals check-in". |
| `EMAIL_MORNING_HOUR` / `EMAIL_MIDDAY_HOUR` / `EMAIL_EVENING_HOUR` | no | Local hours, default 7 / 14 / 20 |

Then redeploy, sign in on the site with the `EMAIL_TO` address, and tick one lesson.

To check it at any time, replace `SECRET`:

- `/api/cron?status=1&key=SECRET` shows config, local time, what was sent today, your habits and any completion emails still pending.
- `/api/cron?slot=morning&dry=1&key=SECRET` previews an email in the browser (`slot=partner`, `weekly`, `done` (today's latest completion) and `new` (your newest habit) work too; add `&format=text` for plain text).
- `/api/cron?slot=evening&force=1&key=SECRET` sends one now, ignoring "already sent".

Honest limits: the emails only know what has synced, so ticks on a signed-out device are invisible to them. Vercel Hobby crons can fire up to 59 minutes into their hour, so "7:00" means 7:00 to 7:59.

## Calendar integration

Goals and [Calendar](https://github.com/Chouksey-Arnav/calendarforarnav) share one Supabase project and one account, so each can show the other:

- **Today tab:** a "Today on your calendar" card, right under your habits, lists today's events and open to-dos. It loads after the tab renders, from the calendar's `/api/agenda` with your session token, and hides itself if you're signed out or the calendar is unreachable.
- **Morning email:** the same agenda appears after the checklist and habits, so the study plan is written around the rest of your day. It is in every kind of morning email: course days, rest days, the day the courses finish, and the habits-only morning email after that. The server fetches it with `CALENDAR_SECRET` (the calendar project's `CRON_SECRET`). If it's missing or the calendar is down, the email goes out without that section after at most 5 seconds.
- **The other way:** `GET /api/today` (your session token) returns today's ring, next lesson and streak as JSON. The calendar shows it as a study card. CORS allows only `CALENDAR_URL`.

| Name | Required | Value |
|---|---|---|
| `CALENDAR_SECRET` | no | The calendar project's `CRON_SECRET` |
| `CALENDAR_URL` | no | Defaults to `https://calendarforarnav.vercel.app` |

## Olympiad focus

Every lesson was checked against the official [IOAI 2026 syllabus](https://ioai-official.org/wp-content/uploads/2025/10/Syllabus.pdf). Off-syllabus lessons are marked **Optional** and left out of the daily plan (Settings can include them):

- Plotly and Cufflinks, Geographical Plotting, Recommender Systems, Tensorboard
- The Finance capstone (the 911 Calls project already drills pandas)
- Big Data and Spark (watch only if included; AWS/EC2 setup is never planned)

The System tab lists what the two courses do **not** cover (PyTorch, CNNs, transformers, and more). That's the work for after Oct 31, before USAAIO Round 1 on Feb 19, 2027.

## Data and sync

Progress is saved in the browser first. Signing in (a 6-digit code by email) syncs it through Supabase so a phone and a laptop stay in step. Whichever copy was changed most recently wins.

Security model: table `public.progress` holds one JSON row per user. Row Level Security is on, and the only policies let a signed-in user read, insert and update **their own** row. Anonymous visitors have no grants at all. The publishable key in `js/config.js` is meant to be public. Tables `email_log` and `login_throttle` (see [`supabase/migrations`](supabase/migrations)) have RLS on, no policies and no grants, so only the server's secret key can touch them.

Preview any date with `?today=2026-10-20`.

## Updating courses

Habit rules live in [`js/habits.js`](js/habits.js) (pure, unit tested in `tests/habits.test.js`). Sound and haptics are in [`js/feedback.js`](js/feedback.js).

All lessons are in [`js/data.js`](js/data.js) as `[number, "exact title", minutes, kind]`. Lessons marked `pending` exist in the sidebar but their names haven't been transcribed yet:

- Portilla Section 7 (lessons 35 to 39) and Section 8 (lessons 40 to 44)

## Database migrations

In [`supabase/migrations`](supabase/migrations), applied in order to the Supabase project **Focus** (`dgfbirenbnhkqwrxkxcn`). A new migration must be applied there (SQL editor, or the Supabase connector) before the code that needs it is deployed.

| File | What |
|---|---|
| `20261011134958_create_progress_table.sql` | `progress`: one JSON row per user, RLS own-row only |
| `20261012000000_email_log_and_login_throttle.sql` | `email_log` (exactly-once claims), `login_throttle` |
| `20261012010000_email_log_partner_slot.sql` | `partner` slot |
| `20261012020000_boost_throttle.sql` | `claim_boost_send` |
| `20261012030000_grant_service_role.sql` | explicit grants for the secret key |
| `20261013000000_email_log_events.sql` | `weekly`, `done:*`, `habit:*`, `new:*` slots. **Applied 2026-10-12.** |

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # planner, habits, schedule, email and delivery tests (Node 20+)
```

The site is static with no build step. The only dependency is Nodemailer, used by the five serverless routes in `api/` (`cron`, `notify`, `boost`, `login-code`, `today`). Vercel serves everything else as-is.

Built with help from Claude Code (AI).

## Changelog

Newest first. Every change adds an entry here (see rule 1).

### 2026-10-13 · Calendar integration (PR #8)
- **Today on your calendar** (from the new [calendar app](https://github.com/Chouksey-Arnav/calendarforarnav), same Supabase project and account): a card on Today, right under your habits, and a section in every morning email, including the habits-only one after the courses end. Fetched from the calendar's `/api/agenda`; any failure just leaves it out.
- `GET /api/today`: today's ring, next lesson and streak as JSON for the calendar's study card. Owner's session only; CORS allows `CALENDAR_URL`.
- New optional env vars `CALENDAR_SECRET` and `CALENDAR_URL`. Serverless routes: four → five.
- Tests: 87 → 89.

### 2026-10-12 · Daily habits, an email for everything, simpler navigation
- **Daily habits** ([`js/dailyhabits.js`](js/dailyhabits.js)): add your own habits (templates for *Atomic Habits* and AP World History), each with a time, place, habit stack, identity, two-minute version and days. One-tap ticking on Today and Habits, per-habit chains, week dots, never-miss-twice warnings, last week's scorecard, edit, archive, restore.
- **Emails on every trigger**: a *Done* email for every lesson ticked and habit done, a *New habit* email with the implementation plan for every habit created, a Monday *weekly kickoff*, and habits inside the morning/midday/evening emails and partner report. Habits-only emails on course rest days and after the courses end.
- `POST /api/nudge` replaced by `POST /api/notify` (completions, new habits and the early midday email, decided server side). The hourly cron catches up anything it misses.
- Migration `20261013000000_email_log_events.sql` (new `email_log` slots), applied to Focus.
- Navigation: Today · Habits · Courses · Progress · More. *System* moved under More. Today shows habits right under the ring.
- README became the source of truth with rules for future changes; `CLAUDE.md` points here.
- Tests: 66 → 87, including exactly-once delivery against a fake email log (retries, races, merging, daily cap).

### 2026-10-12 · A cheer on every tick (PR #6)
- Non-repeating, fact-based toasts on every tick ([`js/cheers.js`](js/cheers.js)).
- Fixed server 403s (explicit `service_role` grants), split weekend days into a morning and an afternoon block, hardened email delivery (one retry, stale-claim recovery, failure alerts).

### 2026-10-12 · "Send me motivation" (PR #5)
- Today button that emails a push built from this exact moment (`POST /api/boost`), throttled to 1 a minute, 8 a day.

### 2026-10-12 · Copies and partner reports (PR #4)
- `EMAIL_CC` and `PARTNER_EMAILS` (up to 15 each, BCC), a morning partner report on yesterday. Out-of-order email hours are rejected loudly.

### 2026-10-12 · Three daily emails (PR #3)
- Morning plan, midday check-in, evening wrap through Gmail + Nodemailer, hourly crons, exactly-once `email_log`. Sign-in codes through Gmail. An Atomic Habits principle engine ([`js/principles.js`](js/principles.js)).

### 2026-10-11 · The 4th Law and its inversion (PR #2)
- Immediate rewards, paper-clip jars, chain and heatmap, bad-day mode, habit contract with penalties and partners, avoidance jar, milestones.

### 2026-10-11 · Course tracker (PR #1)
- Daily ML course tracker with auto re-planning against the Oct 31 deadline, olympiad-syllabus focus, Supabase sync.
