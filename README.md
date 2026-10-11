# goals

A daily accountability tracker with one job: finish two Udemy courses by **October 31, 2026**, on the way to AI Olympiad prep.

| Course | Instructor | Tracked from |
|---|---|---|
| Mathematical Foundations of Machine Learning | Jon Krohn | Lesson 77 to 114 |
| Python for Data Science and Machine Learning Bootcamp | Jose Portilla | Lesson 16 to 152 (some names pending) |

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

## Data

Progress lives in your browser's `localStorage`, on one device. Use **Settings → Export / Import** to move it between devices. There's no account and no backend.

Preview any date with `?today=2026-10-20`.

## Updating courses

All lessons are in [`js/data.js`](js/data.js) as `[number, "exact title", minutes, kind]`. Lessons marked `pending` exist in the sidebar but their names haven't been transcribed yet:

- Portilla Section 7 (lessons 35 to 39), Section 8 (40 to 44), Section 25 (139 to 152, plus the length of 138)
- Any Portilla sections after 25 are **not loaded**, so if they exist the plan underestimates the real load.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # planner unit tests (Node 20+)
```

It's a static site with no build step and no dependencies. Vercel serves it as-is.

Built with help from Claude Code (AI).
