# goals

A daily accountability system built on *Atomic Habits*, live at **[www.arnavcalendar.online/goals](https://www.arnavcalendar.online/goals/)** (same site as the [calendar](https://www.arnavcalendar.online)). Two jobs, a graded check at halftime, and one honest verdict on both every night (see [Halftime](#halftime-are-you-through-half-the-list) and [End-of-day review](#end-of-day-review-groq)):

1. **Your daily habits.** Reading *Atomic Habits*, your AP World History book, anything you want to do every day. You put them in; the app turns each one into a system and emails you when you create it, once when the whole day is done, and every Monday with a scorecard.
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
7. **No build step, one dependency** (Nodemailer). Static files plus five serverless routes in `api/`. Vercel Hobby limits: daily crons only (hence 24 of them, as the backup clock; the real clock is Supabase pg_cron every minute), 12 functions max.
8. **Honest, not hype.** Numbers come from the record. Praise what happened, name what didn't. Don't add features that let the user fake progress.
9. **Keep it simple to navigate.** Five tabs, no more. New things go inside an existing tab or under More.
10. **Never commit secrets.** Server keys live in Vercel env vars only; `js/config.js` holds only the public publishable key.
11. **Paths are relative.** Goals is served at `/goals/` on the calendar's domain, so the app calls `api/notify`, never `/api/notify` (that's the calendar's API). Assets are relative too. Server-to-server calls with a secret never go to a redirecting address (a redirect drops the `Authorization` header).
12. **Don't nag.** An email or prompt has to change what you'd do next. Nothing emails you about something you just did in the app (the app already showed it), nothing asks the same question twice, and anything that only matters at one time of day stays folded until then. Per-tick emails exist, but only as an opt-in.

## Navigation

| Tab | What's there |
|---|---|
| **Today** | Everything to do today, in the order you do it: warnings, the progress ring, your habits (one tap each), the ritual (before you start), exactly the next lesson, then today on your calendar, the checklist, rewards and *Close the day* (folded to one line until 7 PM, the day is done, or you start it). |
| **Habits** | Your daily habits: this week's score, each habit's chain and week, the two-minute version, add / edit / archive, last week's scorecard. |
| **Courses** | Every lesson of both courses by section. Tick anything in any order. |
| **Progress** | The chain heatmap, stats, savings jar, check-in trends, milestones. |
| **More** | Links to *How the system works* (Atomic Habits, contract, olympiad roadmap), sign-in and emails, study plan settings, backup. |

A **Calendar** link in the header goes back to the calendar (same site, same tab).

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
- **Ticking.** Today and Habits tabs: ✓ Done, or the two-minute version. Tap again to undo. Days in the current week can be filled in afterwards ("I read last night, forgot to tick"); those don't send an email. A tick sends no email of its own (unless you turn on every-tick emails); finishing everything on the day's list sends one.
- **Streaks.** Consecutive days done. Days a habit isn't scheduled neither add nor break the chain; doing it anyway counts. Today never breaks it while it's still open.
- **Never miss twice.** Missed last time → a red line under the habit (and in emails) pointing at the two-minute version.
- **Week.** Monday to Sunday. Every Monday's email and the Habits tab show last week's score per habit and name the weakest one to fix (usually its time or place).
- **Archive** stops scheduling a habit and keeps its history; *Restore* brings it back.
- Habits are independent of the course chain and contract, and keep running (with their own emails) on course rest days and after the courses are finished.
- State: `state.habits = [habit]`, `state.habitLog = { "YYYY-MM-DD": { habitId: "full" | "min" } }`, synced like everything else.

## Every email, and what triggers it

All sent with Nodemailer (Gmail, or Brevo from your own domain with Gmail as backup: see [Sending email](#sending-email-gmail-or-brevo)), to `EMAIL_TO` with `EMAIL_CC` as BCC (the partner report goes to partners only). Times are minute-accurate: the database runs the schedule every minute (see [The clock](#the-clock)).

**The work day.** School days (Mon to Fri) start when you get home: **2:32 PM** (`WORKDAY_START`). Weekends start at **9:00 AM** (`WEEKEND_START`). Both end at the review hour (10 PM). Halftime is the exact middle: **6:16 PM** on school days, **3:30 PM** on weekends.

| Email | Trigger |
|---|---|
| **Morning plan** | 7:00 local. Lessons + today's habits + today's calendar (see [Calendar integration](#calendar-integration)). On course rest days or after the courses end: a habits-only morning email (if any are scheduled). |
| **Work starts** (midday) | School days: **2:32 PM**, the moment you're home: "Work starts now: 9 lessons, ~2h 43m, one sitting. Phone in another room." Weekends: the moment the morning block is done, else 14:00. Either: the moment the whole day is done, if that's earlier. |
| **Halftime** | **6:16 PM** school days, **3:30 PM** weekends. A grade for the first half: you should be through 50% of today's list. Free-time math, what's left, whether it still fits. See [Halftime](#halftime-are-you-through-half-the-list). Not sent if everything is already done. |
| **Evening wrap** | 20:00 local (until the review hour). Lists habits still open. On course rest days: only if a habit is still open. **Not sent once the whole day is done** (the review covers tonight). |
| **Day review** | 22:00 local (`EMAIL_REVIEW_HOUR`). The whole day judged: lessons, habits, the calendar's to-dos and whether you had the time, a grade, what didn't happen, the pattern, three orders for tomorrow. Written by Groq from your record; see [End-of-day review](#end-of-day-review-groq). Not sent when there's nothing to judge. |
| **Partner report** | Morning, to `PARTNER_EMAILS`, about yesterday (now including yesterday's habits). |
| **Weekly kickoff** | Monday morning window: last week's habit scorecard, the weakest habit to fix, this week's plan. With no habits: a prompt to add them. |
| **Day complete** | **Once, the moment everything on today's list is done**: the course plan (or the bad-day minimum) and every habit scheduled today (slot `done:day`). Ticks before that send nothing. If the same moment earns the midday email, it rides on that instead of sending two. |
| **Done, per tick** (opt-in) | Only with *Email me every time I tick something* on (More → Sign-in and emails, `settings.emailEachTick`): every lesson ticked and every habit done, the moment it syncs. Things synced together share one email. |
| **New habit** | **Every habit you create**: "Here's your habit. Let's make it real." Your implementation intention, the four laws applied to it, the two-minute version, never miss twice. |
| **Send me motivation** | The Today button, on demand (max 1 a minute, 8 a day). |
| **Sign-in code** | Signing in. |
| **Failure alert** | A scheduled run fails (at most at 7:00, 14:00, 20:00, 22:00). |

How *Day complete*, *Done* and *New habit* are delivered: after every synced tick/habit/new habit the app calls `POST /api/notify`. The server checks the session is the owner's, re-reads progress, and decides. A habit created **today** with no `email_log` row gets its plan (`new:<habit id>`). In quiet mode (the default) ticks are left unclaimed until the whole day is done; then one email claims `done:day` plus every tick (`done:<lesson id>`, `habit:<habit id>`). In every-tick mode each completion with no row yet is emailed. Turning every-tick on mid-day emails the ticks that were waiting, once. Every hourly cron run does the same check as a catch-up, so a dropped request (offline, tab closed) delays the email by at most an hour instead of losing it. Unticking and re-ticking never sends twice. Cap: 60 of these a day. Limit: a tick that only syncs after midnight is not emailed (it's no longer "today").

Volume check: a normal school day is now about 5 emails (morning, work starts, halftime, day complete or evening wrap, review), down from about 16 when every tick was emailed. With every-tick on it's about 6 + ~10 lessons + your habits ≈ 15, each to you plus every `EMAIL_CC` address; consumer Gmail allows roughly 500 recipients a day, so 15 × (1 + 15 copies) = 240 still fits. Keep `EMAIL_CC` to your own addresses.

## Halftime: are you through half the list?

[`js/worktime.js`](js/worktime.js) (pure, tested in `tests/worktime.test.js`), written in [`js/emails.js`](js/emails.js) (`halftime()`), sent at the middle of the work day. Rules, not a model: it's numbers and orders, and it has to land on time.

- **The grade.** Share of today's list done right now, weighted like the review (course plan 50, habits 25, the calendar's to-dos counted today 25: its ledger, pushes off today included; renormalized over what exists), judged against the halfway target of 50%. 50% done at halftime is an A; 25% is half the target, a D; nothing is an F.
- **Where the first half went.** Free time since the work day started = the window minus timed calendar events minus a flat allowance for dinner and breaks (1 h on school days, 2 h on weekends, spread evenly). If that free time was well above the lesson minutes logged and you're behind: "About 1h 14m went somewhere else. That was a choice." It never says where: the record doesn't know.
- **Whether the rest fits.** Lesson minutes left vs free time until 10 PM: "It fits with 1h 11m to spare, if you start now. Every 15 minutes of YouTube spends that spare." Or: "It doesn't fit anymore: you're 40 min short."
- **The order.** "Next 10 minutes: phone in another room, every non-course tab closed." Then the exact next lesson.

Without the calendar (unreachable, or `CALENDAR_SECRET` unset) it still sends the grade and the next lesson, and says there's no time math. Preview: `/api/cron?slot=halftime&dry=1&key=SECRET`.

## End-of-day review (Groq)

[`js/review.js`](js/review.js) (pure, tested in `tests/review.test.js`), sent by the hourly cron in the review window. It's built so the model **can't** sugarcoat:

1. **Facts, from code.** `reviewFacts()` turns the record into numbered facts, each with a status the code decides: `done`, `partial`, `missed` or `info`. Lessons (planned vs done, which ones), fast ticks (a long lesson ticked within 3 minutes of the last one), lessons ticked without writing the core idea, pace vs Oct 31, the chain and contract breaches, every habit (two-minute version = partial), avoidance slips, and from the calendar: to-dos done, to-dos due today and not done, overdue to-dos (and how late), work blocks you scheduled and skipped, deadlines, and jotting far more to-dos than you finish. Calendar events are `info` ("attendance not tracked"), never accomplishments; check-ins and the daily win are labeled self-reported.
   **Calendar to-dos come from the calendar's ledger** (`agenda.tasks.ledger`, the same "counted tonight" its To-do tab shows): each to-do once, with why it counts. Overdue, due today (and if its block was skipped, said in the same fact, not counted twice), **pushed off today's list** ("Moving it is not doing it", flag `pushed`, with how many times it's been pushed), and blocks you gave a time and skipped. To-dos jotted and ticked within 5 minutes are an `info` fact and never count. An older calendar without the ledger falls back to its plain lists.
2. **The grade, from code.** `gradeDay()`: share of commitments kept, course plan 50 / habits 25 / calendar to-dos 25 (renormalized over what exists that day). Fast ticks cap it at C; a broken chain or breach caps it at D. Groq is told the grade and can't change it.
   **The time fact** ([`js/worktime.js`](js/worktime.js)): free time between the work start and 10 PM, after the calendar and the breaks allowance, vs what the plan needed and what you logged. If the plan fit and you didn't do it, it's `missed` and flagged `slack`: "you had about 5h 28m free… The whole plan needed 3h 03m. You logged about 1h. The time was there; it went to something else." If the day was overbooked it's `info` and says the plan needs fixing. No calendar, no time fact: it never accuses you of free time it can't see. It doesn't change the grade; it explains it.
3. **Words, from Groq.** `openai/gpt-oss-120b` (strict JSON schema, reasoning `medium`; one call a day, well under a cent). The prompt (`REVIEW_SYSTEM`) asks for a ruthless mentor, and since 2026-10-14 a more ruthless one, in your words: "If I should have done this, I could have done all this, I had free time, but I chose to slack off: say that." When the time fact is `slack`, the verdict opens with "You had the time. You chose something else." Misses first and specific, their cost named, no praise padding, no comfort, every line citing a fact id, three orders for tomorrow starting at tomorrow's work start (2:32 PM on school days) with a first physical step and one that removes the distraction in advance, one hard question.
4. **Every line checked.** `checkReview()` drops a "done" line citing a fact that wasn't done, any line citing an unknown fact, any number that isn't in the facts, any sentence with praise or comfort ("great job", "it's okay", "tomorrow is a new day", "!", emojis…) or an insult ("lazy", "pathetic", "loser"…: ruthless about the choices, never about the person), and a headline without the right grade letter. Every missed fact the model skipped is added back in the record's own words: nothing missed can be hidden.
5. **Always sends.** No `GROQ_API_KEY`, a timeout, a rate limit or an answer that doesn't survive the checks: `fallbackReview()` writes the same email from the facts alone (and says so in the footer). It leads with "You had the time. You chose something else." on a `slack` day too.

**Check which one you're getting:** the footer says "Written without Groq" when it's the rules version. As of 2026-10-14 the goals project had **no `GROQ_API_KEY`**, so every review so far (including the "F. You planned a day and didn't do it.") was the rules version. Add the key (the calendar's works) to get Groq's.

The email: grade badge, headline, verdict, **Didn't happen**, **Done**, **The pattern**, **Tomorrow**, **Before bed**. It only knows what synced; the last sync time is one of the facts. Preview: `/api/cron?slot=review&dry=1&key=SECRET`; facts, grade and dropped lines as JSON: add `&format=json`.

## Focus guard: YouTube blocked during the work day

[`extension/`](extension) is a small Chrome extension. During the work day (school days 2:32 PM to 10 PM, weekends 9 AM to 10 PM, the computer's own clock) any visit to YouTube opens a page that says "Not now. It's your work day." with a button to the next lesson. YouTube tabs already open when the block starts get sent there too.

You can still get in, but it costs something: type "I am choosing YouTube over my work right now.", wait 60 seconds, and you get 15 minutes. Two unlocks a day, then it stays shut until 10 PM. The logic is in [`extension/rules.js`](extension/rules.js) (pure, tested in `tests/extension.test.js`); it was also loaded in Chromium and checked to redirect YouTube and leave other sites alone.

**Install** (personal Chrome, once): download this repo (GitHub → Code → Download ZIP), unzip it, open `chrome://extensions`, turn on *Developer mode*, *Load unpacked*, pick the `extension` folder.

Honest limits: it's a speed bump, not a wall. You can turn it off in `chrome://extensions` (that's the point where you'd be choosing YouTube on purpose). It can't be installed on a school-managed Chromebook (the school controls extensions there), and it does nothing on your phone: there, use Screen Time (iPhone) or Digital Wellbeing (Android) to block YouTube 2:32 PM to 10 PM, with a passcode someone else holds.

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

The course emails, written from your synced record, sent with Nodemailer.

**Weekdays are one sitting**: the whole day's list in one go, at your planned time. **Weekends are two blocks**: about half the minutes in the morning (due by the midday hour), the rest in the afternoon. The split keeps plan order (math first) and cuts at the point closest to half the minutes. The Today tab shows the same two blocks.

| Email | When | What it says |
|---|---|---|
| **Morning plan** | First hourly check after 7:00 local | The exact Up Next lesson, the checklist with real-work minutes (weekdays: one sitting; weekends: morning block and afternoon block), your pace vs the deadline, the chain, and one Atomic Habits idea as a task. Leads with any unpaid contract breach. After a miss: *never miss twice*. |
| **Work starts / midday** | Weekend: the moment the morning block is done, or 14:00 local. School day: 2:32 PM (`WORKDAY_START`), or the moment the whole sitting is done (it never interrupts a sitting halfway) | Weekend: "Morning block done. Afternoon block: 9 lessons, ~2h 34m." / "Morning block: 2 lessons left. Finish it, then the afternoon." School day: "Work starts now: 10 lessons, ~3h, one sitting." (it's 2:32, school's done, phone in another room, open the first lesson) / "4 of 10 done. Same sitting: 6 to go." Either: "Day complete. Reward unlocked." |
| **Halftime** | Middle of the work day | See [Halftime](#halftime-are-you-through-half-the-list). |
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

- <a id="the-clock"></a>**The clock.** Supabase pg_cron calls `/api/cron?src=db` every minute ([`20261015000100_goals_tick.sql`](supabase/migrations/20261015000100_goals_tick.sql)), straight at the goals project's own address (`goals-taupe-six.vercel.app`, not through the site's rewrite), with the calendar's shared secret, which Goals accepts as `CALENDAR_SECRET` for that plain run only: no previews, no forced sends, no status. [`js/schedule.js`](js/schedule.js) decides which email is due in `GOALS_TZ` from the local minute and whether it's a school day. Vercel's 24 hourly crons (`vercel.json`, the free plan only allows daily ones) still run as the backup clock; the `email_log` claim keeps the two from ever sending twice. Time zones and daylight saving need no code changes.
- **Early midday trigger.** After each synced tick the app calls `POST /api/notify` (weekend: morning block done; weekday: day done). The server checks that the session belongs to `EMAIL_TO`, re-reads your progress from the database and decides on its own.
- **Exactly once.** Table `email_log` has one row per (recipient, day, slot). Inserting it is the claim, so a cron run and an `/api/notify` call racing each other can't both send. A failed send releases the claim and the next hour retries. A sent email is never re-sent. If a run dies between claiming and sending (a timeout), the claim goes stale after 5 minutes and the next run sends it.
- **Retries and alerts.** A send hiccup (timeout, dropped connection, 4xx) gets one immediate retry on a fresh connection; a wrong password doesn't. With Brevo and Gmail both set, a Brevo failure goes straight to Gmail in the same run. If a scheduled run fails for any other reason (database, keys, permissions, config), you get a "your daily emails are failing" email with the exact error, at most at 7:00, 14:00, 20:00 and 22:00, and only from the hourly runs, so the minute clock can't send sixty alerts an hour.
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
| `APP_URL` | no | Defaults to `https://www.arnavcalendar.online/goals`. Must be the address you actually use: sign-in and local progress belong to one address, so links to another alias open an empty, signed-out app. |
| `WORKDAY_START` / `WEEKEND_START` | no | When the work day starts, `HH:MM` local. Defaults `14:32` (school days, Mon to Fri) and `09:00` (weekends). Halftime is halfway from there to `EMAIL_REVIEW_HOUR`. A value that leaves no room for halftime before the evening wrap falls back to the default, with a warning in `?status=1`. |
| `BREVO_SMTP_LOGIN` / `BREVO_SMTP_KEY` / `EMAIL_FROM` | no | Send from your own domain through Brevo; all three or none. With the Gmail variables also set, Gmail is the automatic backup. See [Sending email](#sending-email-gmail-or-brevo). |
| `EMAIL_CC` | no | Up to 15 comma-separated addresses that get copies of your 3 daily emails |
| `PARTNER_EMAILS` | no | Up to 15 comma-separated accountability partners for the morning partner report |
| `GOALS_NAME` | no | Your first name, used in the greeting and in partner report subjects. Defaults to the first name on your signed contract. Set it if you have partners, or reports say "Goals check-in". |
| `EMAIL_MORNING_HOUR` / `EMAIL_MIDDAY_HOUR` / `EMAIL_EVENING_HOUR` / `EMAIL_REVIEW_HOUR` | no | Local hours, default 7 / 14 / 20 / 22, in that order |
| `GROQ_API_KEY` | no, but set it | Writes the end-of-day review ([console.groq.com/keys](https://console.groq.com/keys); the calendar's key works). Without it the review is written from your record by rules. **Not set on the goals project as of 2026-10-14.** |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b`. Only if Groq retires it. |

Then redeploy, sign in on the site with the `EMAIL_TO` address, and tick one lesson.

To check it at any time, replace `SECRET`:

- `/api/cron?status=1&key=SECRET` shows config, local time, what was sent today, your habits and any completion emails still pending.
- `/api/cron?slot=morning&dry=1&key=SECRET` previews an email in the browser (`slot=review`, `slot=partner`, `weekly`, `done` (today's latest completion) and `new` (your newest habit) work too; add `&format=text` for plain text).
- `/api/cron?slot=evening&force=1&key=SECRET` sends one now, ignoring "already sent".

Honest limits: the emails only know what has synced, so ticks on a signed-out device are invisible to them. The minute clock makes "2:32 PM" mean 2:32 PM; if the database clock stops, the hourly Vercel backup still sends everything, up to 59 minutes late. School holidays aren't known: on a weekday off, "work starts" still comes at 2:32 PM.

### Sending email: Gmail or Brevo

[`api/_lib/mailer.js`](api/_lib/mailer.js), the same file as the calendar's. Gmail (`GMAIL_USER` + `GMAIL_APP_PASSWORD`) works today: about 500 recipients a day. Brevo (`BREVO_SMTP_LOGIN` + `BREVO_SMTP_KEY` + `EMAIL_FROM`) sends from your own domain, e.g. `goals@arnavcalendar.online`; the free plan is 300 emails a day (each recipient counts), and replies go to `EMAIL_TO`. With both set, Brevo sends and Gmail is the backup. Setup steps are in the calendar's README (*Sending email*); `/api/cron?status=1` shows which providers are active.

## Calendar integration

Goals and [Calendar](https://github.com/Chouksey-Arnav/calendarforarnav) share one site, one Supabase project and one account, so each can show the other.

**One site.** Goals is at `https://www.arnavcalendar.online/goals/`: the calendar project's `vercel.json` rewrites `/goals/*` to this project's own address, `goals-taupe-six.vercel.app` (never redirect that one). `goalsforarnav.vercel.app` redirects its pages to `/goals/` (this repo's `vercel.json`; `/api/*` still answers there). Because the two apps are now the same origin, the Today card and the calendar's study card need no CORS, and they share one sign-in (see [Data and sync](#data-and-sync)).

- **Today tab:** a "Today on your calendar" card, right under your habits, lists today's events and open to-dos. It loads after the tab renders, from the calendar's `/api/agenda` with your session token, and hides itself if you're signed out or the calendar is unreachable.
- **Morning email:** the same agenda appears after the checklist and habits, so the study plan is written around the rest of your day. It is in every kind of morning email: course days, rest days, the day the courses finish, and the habits-only morning email after that. The server fetches it with `CALENDAR_SECRET` (the calendar project's `CRON_SECRET`). If it's missing or the calendar is down, the email goes out without that section after at most 5 seconds.
- **Halftime and end-of-day review:** today's agenda (event `start`/`end` for the free-time math) and, for the review, tomorrow's, plus the calendar's `tasks.blocks` (work blocks that started today, done or not) and `tasks.addedToday` (how many to-dos you jotted). Without `CALENDAR_SECRET` the review covers Goals only and says so.
- **The clock:** the same secret lets the database's minute job trigger the schedule (see [The clock](#the-clock)).
- **Today tab card:** besides events, it shows the calendar's *to-dos counted tonight* ("2 of 5 done", overdue and pushed ones marked) with a **To-do list →** link to the calendar's To-do tab (`/#todo`).
- **The other way:** `GET /goals/api/today` (your session token) returns today's ring, next lesson and streak as JSON (the calendar's study card), plus for the calendar's **To-do tab**: `habits` (done, total, open names), `work` (today's work day in local minutes: start, end at the review hour, breaks allowance, so its "does it fit" matches halftime) and `grade`: **the day review's grade if the day ended now** ([`gradeNow()`](js/review.js): the same `reviewFacts` + `gradeDay`, no second formula), with parts per area. For the grade it fetches the calendar's agenda server-side (`CALENDAR_SECRET`, 3 s timeout); without it the grade covers Goals only (`grade.calendar: false`). Same origin on the site; CORS allows only `CALENDAR_URL`'s origin otherwise.

| Name | Required | Value |
|---|---|---|
| `CALENDAR_SECRET` | no (needed for the calendar sections and the minute clock) | The calendar project's `CRON_SECRET` (= Vault `cal_cron_secret`) |
| `CALENDAR_URL` | no | Defaults to `https://www.arnavcalendar.online`. Never a redirecting address: the agenda call carries a secret. |

## Olympiad focus

Every lesson was checked against the official [IOAI 2026 syllabus](https://ioai-official.org/wp-content/uploads/2025/10/Syllabus.pdf). Off-syllabus lessons are marked **Optional** and left out of the daily plan (Settings can include them):

- Plotly and Cufflinks, Geographical Plotting, Recommender Systems, Tensorboard
- The Finance capstone (the 911 Calls project already drills pandas)
- Big Data and Spark (watch only if included; AWS/EC2 setup is never planned)

The System tab lists what the two courses do **not** cover (PyTorch, CNNs, transformers, and more). That's the work for after Oct 31, before USAAIO Round 1 on Feb 19, 2027.

## Data and sync

Progress is saved in the browser first. Signing in (a 6-digit code by email) syncs it through Supabase so a phone and a laptop stay in step. Whichever copy was changed most recently wins, except the **first sync of a device** with the account (`goals.syncedWith` in that browser's storage, not in the synced state): then the two copies are merged ([`mergeStates`](js/state.js), tested in `tests/sync.test.js`), so ticking on a new phone before signing in adds to your record instead of replacing it. Every lesson, habit tick, note, check-in and day log on either copy survives; on a conflict, and for settings, habit definitions and the contract, the synced copy wins.

**One sign-in for the whole site.** Goals keeps its session under the calendar's storage key (`cal-auth`, same origin, same Supabase project), so signing in to either app signs you in to both, and signing out of either signs out both. Goals' old session (supabase-js's default key) is moved there once, never copied (two copies of one refresh token would sign one app out); if the calendar already had a session, that one wins. supabase-js locks token refreshes per storage key across tabs, so the apps never race for the token.

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
| `20261014000000_email_log_review_slot.sql` | `review` slot. **Applied 2026-10-13** (as `email_log_review_slot`). |
| `20261015000000_email_log_halftime_slot.sql` | `halftime` slot. **Applied 2026-10-14** (as `email_log_halftime_slot`). |
| `20261015000100_goals_tick.sql` | the minute clock: `goals_tick()` + pg_cron job `goals-emails`, Vault `goals_cron_url`. **Applied 2026-10-14.** |

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # planner, habits, schedule, email, halftime, review, focus guard, sync and delivery tests (Node 20+)
```

The site is static with no build step. The only dependency is Nodemailer, used by the five serverless routes in `api/` (`cron`, `notify`, `boost`, `login-code`, `today`). Vercel serves everything else as-is.

Built with help from Claude Code (AI).

## Changelog

Newest first. Every change adds an entry here (see rule 1).

### 2026-10-15 · Fewer emails, one sign-in, nothing lost on a new device
- **One email when the day is done, not one per tick.** Ticks no longer email you (the app already celebrates each one); a single *Day complete* email (slot `done:day`, no migration: it fits the existing `done:*` pattern) goes out the moment every lesson and habit on today's list is done. Every-tick emails are an opt-in toggle under More → Sign-in and emails (`settings.emailEachTick`). A normal day drops from about 16 emails to about 5.
- **The evening wrap stays silent once the whole day is done**; the review at 10 PM is tonight's one email.
- **One sign-in for Calendar and Goals.** Goals now keeps its session under the calendar's key (`cal-auth`) on the shared origin, moving its old session over once. Sign in to either, you're in both.
- **Fixed: a new device could wipe your progress.** Ticking anything before signing in made that device's copy "newest", so signing in replaced the whole synced record with it. The first sync of a device with the account now merges the two copies (`mergeStates`).
- **Today, in the order you do it:** the next lesson now comes right after your habits (and the ritual), above the calendar card. *Close the day* is folded to one line until 7 PM, the day is done, or you start it.
- Rule 12 (*Don't nag*) added.
- Tests: 117 → 123.

### 2026-10-15 · Grading from the calendar's To-do tab
- **The review and halftime grade calendar to-dos from the calendar's ledger** (`agenda.tasks.ledger`, calendarforarnav same date): the exact list its new To-do tab shows as "counted tonight". Fixes a double count (a to-do due today whose block was also skipped counted twice), and **pushing a to-do off today no longer makes the day look clean**: it stays counted and the review names it. Jot-and-tick within 5 minutes is reported, not counted. The review prompt lists pushing as a pattern to call out.
- **`/api/today` returns `habits`, `work` and `grade`** (`gradeNow()`: the review's own grade if the day ended now, with parts), for the calendar's To-do tab.
- Today tab's calendar card: *to-dos counted tonight* and a link to the To-do tab. The halftime email marks pushed to-dos.
- Tests: 114 → 117.

### 2026-10-14 · One site, a 2:32 PM work day, halftime, a harder review, Focus guard
- **Goals moved to `https://www.arnavcalendar.online/goals/`** (rewrite in the calendar project). API calls and the manifest are relative; `goalsforarnav.vercel.app` redirects its pages there. `APP_URL` and `CALENDAR_URL` default to the domain. Rule 11 added. A **Calendar** link in the header.
- **The work day starts at 2:32 PM on school days** (`WORKDAY_START`; weekends `WEEKEND_START`, 9:00). The weekday midday email is now "Work starts now", sent at 2:32 PM.
- **Halftime email** ([`js/worktime.js`](js/worktime.js), `halftime()` in `js/emails.js`): a grade against 50% done at the middle of the work day, where the first half's free time went, whether the rest still fits, and the next lesson. Migration `20261015000000_email_log_halftime_slot.sql`, applied.
- **Minute-accurate emails:** Supabase pg_cron calls `/api/cron?src=db` every minute (migration `20261015000100_goals_tick.sql`, applied); the hourly Vercel crons stay as backup. Alerts only from hourly runs.
- **More ruthless review:** a code-computed time fact (free time vs plan vs logged work); "You had the time. You chose something else." when the plan fit and didn't happen; orders start at tomorrow's work start; insults are filtered out like praise.
- **Focus guard** ([`extension/`](extension)): a Chrome extension that blocks YouTube during the work day, with a costly, capped unlock.
- **Brevo** as an optional sender, Gmail as automatic backup (shared `api/_lib/mailer.js`).
- Found: `GROQ_API_KEY` was never set on the goals project, so every review so far was the rules version.
- Tests: 100 → 114.

### 2026-10-13 · End-of-day review (Groq)
- **Day review email** at 22:00 local ([`js/review.js`](js/review.js)): the whole day, Goals and Calendar, judged from facts the code computes, graded by code, written by Groq (`openai/gpt-oss-120b`) as a ruthless mentor. Every line is checked against the record: no claimed accomplishments that didn't happen, no invented numbers, no praise or comfort phrases, every miss shown. Falls back to a rules-written review without Groq.
- New optional env vars `GROQ_API_KEY`, `GROQ_MODEL`, `EMAIL_REVIEW_HOUR` (default 22; must come after the evening hour). The evening wrap's window now ends at the review hour.
- Migration `20261014000000_email_log_review_slot.sql` (`review` slot), applied to Focus.
- Uses the calendar's new `/api/agenda` fields `tasks.blocks` and `tasks.addedToday` (calendarforarnav, same date).
- `/api/cron?slot=review&dry=1` previews it; `&format=json` shows facts, grade and dropped lines. `?status=1` shows whether Groq and the calendar are configured.
- Tests: 89 → 100.

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
