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

## Olympiad focus

Every lesson was checked against the official [IOAI 2026 syllabus](https://ioai-official.org/wp-content/uploads/2025/10/Syllabus.pdf). Off-syllabus lessons are marked **Optional** and left out of the daily plan (Settings can include them):

- Plotly and Cufflinks, Geographical Plotting, Recommender Systems, Tensorboard
- The Finance capstone (the 911 Calls project already drills pandas)
- Big Data and Spark (watch only if included; AWS/EC2 setup is never planned)

The System tab lists what the two courses do **not** cover (PyTorch, CNNs, transformers, and more). That's the work for after Oct 31, before USAAIO Round 1 on Feb 19, 2027.

## Data and sync

Progress is saved in the browser first. Signing in (email login link) syncs it through Supabase so a phone and a laptop stay in step. Whichever copy was changed most recently wins.

Security model: table `public.progress` holds one JSON row per user. Row Level Security is on, and the only policies let a signed-in user read, insert and update **their own** row. Anonymous visitors have no grants at all. The publishable key in `js/config.js` is meant to be public.

Preview any date with `?today=2026-10-20`.

## Updating courses

Habit rules live in [`js/habits.js`](js/habits.js) (pure, unit tested in `tests/habits.test.js`). Sound and haptics are in [`js/feedback.js`](js/feedback.js).

All lessons are in [`js/data.js`](js/data.js) as `[number, "exact title", minutes, kind]`. Lessons marked `pending` exist in the sidebar but their names haven't been transcribed yet:

- Portilla Section 7 (lessons 35 to 39) and Section 8 (lessons 40 to 44)

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # planner, data and habit-rule tests (Node 20+)
```

It's a static site with no build step and no dependencies. Vercel serves it as-is.

Built with help from Claude Code (AI).
