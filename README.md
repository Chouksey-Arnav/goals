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
- **Atomic Habits, all four laws** (System tab):
  1. *Make It Obvious:* implementation intention (time and place) plus the Up Next cue.
  2. *Make It Attractive:* a temptation-bundle reward that stays locked until today hits 100%, a motivation ritual checklist before you start, joining a culture, and reframing "have to" as "get to".
  3. *Make It Easy:* the two-minute rule. One lesson keeps the streak alive.
  4. *Make It Satisfying:* a streak, a heatmap chain, confetti, and a "never miss twice" warning.

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

All lessons are in [`js/data.js`](js/data.js) as `[number, "exact title", minutes, kind]`. Lessons marked `pending` exist in the sidebar but their names haven't been transcribed yet:

- Portilla Section 7 (lessons 35 to 39) and Section 8 (lessons 40 to 44)

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # planner and data tests (Node 20+)
```

It's a static site with no build step and no dependencies. Vercel serves it as-is.

Built with help from Claude Code (AI).
