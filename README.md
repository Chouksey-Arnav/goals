# goals

A daily accountability tracker with one job: finish two Udemy courses by **October 31, 2026**, on the way to AI Olympiad prep.

| Course | Instructor | Tracked from |
|---|---|---|
| Mathematical Foundations of Machine Learning | Jon Krohn | Lesson 77 to 114 |
| Python for Data Science and Machine Learning Bootcamp | Jose Portilla | Lesson 16 to 165 (10 names pending) |

Every lesson name is copied exactly from the Udemy sidebar.

## What it does

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

## Daily emails

Three emails a day, written from your synced record, sent through your Gmail with Nodemailer:

| Email | When | What it says |
|---|---|---|
| **Morning plan** | First hourly check after 7:00 local | The exact Up Next lesson, the full checklist with real-work minutes, your pace vs the deadline, the chain, and one Atomic Habits idea as a task. Leads with any unpaid contract breach. After a miss: *never miss twice*. |
| **Midday check-in** | The moment you reach halfway (5 of 10 lessons, or 50% of the minutes), or 14:00 local if that never happens | "Halfway. 5 down, 5 to go." / "0 of 10 done. Two minutes, that's all." / "Day complete. Reward unlocked." |
| **Evening wrap** | First hourly check after 20:00 local | Done: recap, identity vote, tomorrow's first lesson. Partial: what's left, honestly. Nothing: "your chain breaks at midnight", the minimum, and the contract cost if a second miss would breach it. |

Rest days get a short morning note only. After the last lesson you get one celebration email, then they stop.

How it works:

- **Schedule.** Vercel's free plan allows only daily crons, each firing somewhere in its hour. `vercel.json` registers 24 of them (one per UTC hour), and [`js/schedule.js`](js/schedule.js) decides which email is due in `GOALS_TZ`. Time zones and daylight saving need no code changes.
- **Halfway trigger.** After each synced tick the app calls `POST /api/nudge`. The server checks that the session belongs to `EMAIL_TO`, re-reads your progress from the database and decides on its own.
- **Exactly once.** Table `email_log` has one row per (recipient, day, slot). Inserting it is the claim, so a cron run and a nudge racing each other can't both send. A failed send releases the claim and the next hour retries. A sent email is never re-sent.
- **Same plan as the app.** [`js/digest.js`](js/digest.js) computes "where do I stand" for both the Today tab and the emails, and [`js/state.js`](js/state.js) normalizes old saves for both.
- **Sign-in codes through Gmail.** `POST /api/login-code` emails a 6-digit code via Nodemailer, because Supabase's built-in mailer only delivers to project team members. It only sends to `EMAIL_TO`, so strangers can't sign up. It's throttled to one code per 45 s and 10 per day.

### Environment variables (Vercel → Settings → Environment Variables, Production)

| Name | Required | Value |
|---|---|---|
| `GMAIL_USER` | yes | The Gmail address that sends, e.g. `you@gmail.com` |
| `GMAIL_APP_PASSWORD` | yes | 16-character [app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification). Not your Gmail password. |
| `EMAIL_TO` | yes | Where emails go. Also the only address allowed to sign in. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase → Project Settings → API Keys → **secret** key (`sb_secret_…`). Server only, never in `js/`. |
| `CRON_SECRET` | yes | A long random string (`openssl rand -hex 32`). Vercel sends it with every cron call. |
| `GOALS_TZ` | yes | Your IANA time zone, e.g. `America/New_York`, `America/Chicago`, `America/Los_Angeles` |
| `APP_URL` | no | Defaults to `https://goals-taupe-six.vercel.app` |
| `GOALS_NAME` | no | Greeting name. Defaults to the first name on your signed contract. |
| `EMAIL_MORNING_HOUR` / `EMAIL_MIDDAY_HOUR` / `EMAIL_EVENING_HOUR` | no | Local hours, default 7 / 14 / 20 |

Then redeploy, sign in on the site with the `EMAIL_TO` address, and tick one lesson.

To check it at any time, replace `SECRET`:

- `/api/cron?status=1&key=SECRET` shows config, local time and what was sent today.
- `/api/cron?slot=morning&dry=1&key=SECRET` previews an email in the browser (add `&format=text` for plain text).
- `/api/cron?slot=evening&force=1&key=SECRET` sends one now, ignoring "already sent".

Honest limits: the emails only know what has synced, so ticks on a signed-out device are invisible to them. Vercel Hobby crons can fire up to 59 minutes into their hour, so "7:00" means 7:00 to 7:59.

## Olympiad focus

Every lesson was checked against the official [IOAI 2026 syllabus](https://ioai-official.org/wp-content/uploads/2025/10/Syllabus.pdf). Off-syllabus lessons are marked **Optional** and left out of the daily plan (Settings can include them):

- Plotly and Cufflinks, Geographical Plotting, Recommender Systems, Tensorboard
- The Finance capstone (the 911 Calls project already drills pandas)
- Big Data and Spark (watch only if included; AWS/EC2 setup is never planned)

The System tab lists what the two courses do **not** cover (PyTorch, CNNs, transformers, and more). That's the work for after Oct 31, before USAAIO Round 1 on Feb 19, 2027.

## Data and sync

Progress is saved in the browser first. Signing in (email login link) syncs it through Supabase so a phone and a laptop stay in step. Whichever copy was changed most recently wins.

Security model: table `public.progress` holds one JSON row per user. Row Level Security is on, and the only policies let a signed-in user read, insert and update **their own** row. Anonymous visitors have no grants at all. The publishable key in `js/config.js` is meant to be public. Tables `email_log` and `login_throttle` (see [`supabase/migrations`](supabase/migrations)) have RLS on, no policies and no grants, so only the server's secret key can touch them.

Preview any date with `?today=2026-10-20`.

## Updating courses

Habit rules live in [`js/habits.js`](js/habits.js) (pure, unit tested in `tests/habits.test.js`). Sound and haptics are in [`js/feedback.js`](js/feedback.js).

All lessons are in [`js/data.js`](js/data.js) as `[number, "exact title", minutes, kind]`. Lessons marked `pending` exist in the sidebar but their names haven't been transcribed yet:

- Portilla Section 7 (lessons 35 to 39) and Section 8 (lessons 40 to 44)

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # planner, habit-rule, schedule and email tests (Node 20+)
```

The site is static with no build step. The only dependency is Nodemailer, used by the three serverless routes in `api/`. Vercel serves everything else as-is.

Built with help from Claude Code (AI).
