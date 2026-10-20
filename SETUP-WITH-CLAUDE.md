# Setup guide for Claude

You are Claude Code, and the user gave you this repository's link to set up their widget board.
Follow this guide from top to bottom. Talk to the user in plain, friendly words; keep each message short.
Everything personal you create stays on the user's PC: `.gitignore` keeps all data files out of git.

## Step 0. Check the machine (no questions yet)
- Windows 10 or 11 with Windows PowerShell 5.1 (`powershell.exe`, built in). The board does not run on macOS or Linux.
- Claude Code CLI: `%USERPROFILE%\.local\bin\claude.exe` (or `claude` on PATH). The board's AI features call it headless
  (`claude -p`) on the user's own Claude subscription. If it is missing, tell the user how to install it and sign in.
- Git (only needed to clone and update).
- Clone (or move) the repo to `%USERPROFILE%\WidgetBoard` unless the user wants another folder.
- Show the demo so they see what they get: `powershell -NoProfile -ExecutionPolicy Bypass -STA -File Board.ps1 -Demo -Show`
  (fictional sample data written by `tools\make-demo.ps1` to `%LOCALAPPDATA%\WidgetBoard-demo`; their real data is not touched). Close it with Esc.

## Step 1. Give the user the feature list: what to implement and what to let go
Show this list (adapted to what you learned in step 0), with your recommendation for each, and ask them to confirm or change it.
Recommend "implement" for what fits their life and "let go" for what does not (for example no Study card for someone who
is not a student, no Display card on a laptop without external monitors). Keep it to one message.

| Card / feature | What it does | Needs |
|---|---|---|
| Island + board | The pill at the top of the screen; click or drag it down and the board slides out. Ctrl+Alt+W toggles. | nothing |
| Up next | The current and next event of the day, with a progress bar | `schedule.json` (from their timetable / calendar) |
| Due | Upcoming deadlines with friendly countdowns | `deadlines.json` |
| Exams | Countdown to each exam, retake dates behind a "Retake" switch | `exams.json` |
| Coursework | A weekly checklist per course, written each morning by Claude from their course folders | `courses` in config + the coursework job |
| Study | One tile per course that opens its folder | a study folder (Claude can create the layout) |
| Gym + coach | Today's workout from a rotating plan, Done / Skip, a 7-day strip, a coach chat that logs workouts and answers from the plan | `gym-plan.json`, which Claude GENERATES with the user (step 3). Never copy someone else's plan |
| Quick capture | Type anything ("call mum tomorrow 18:00"); Claude sorts it into a task, event or reminder, with "+ Calendar" | Claude CLI |
| Suggested work | Claude proposes concrete next actions when the list is empty | Claude CLI |
| Top performers | Progress tracker: how many hours a top-10% person in their cohort has done by now vs them, an ideal day, a check-in chat | the benchmark job + `cohort` in config |
| Life plan | Progress tracker for life goals: one-time steps, daily and weekly habits, the six that matter most, key dates | `private\life-plan.json`, generated from a short interview |
| Daily runs | One screen with their inbox (act now / can wait / FYI) and the output of their Claude cloud routines | the digest job + the Gmail connector in claude.ai |
| New for you | A daily read-only scan of Gmail and Calendar for news about their things | Gmail and Google Calendar connectors |
| Focus | Pomodoro, timer and stopwatch, with templates | nothing |
| News & trending | X trends, Google Trends, world, tech, AI, business feeds, each headline scored for them | the trends job; feeds in config |
| Weather | Now, hourly, tomorrow | their city in config (open-meteo.com, no key) |
| Did you know | Five facts a day next to the clock, "5 more" on demand | the facts job |
| Quote of the day | A quote or verse picked for their day, in any language or tradition they like | the quote job + `quote` in config |
| Daily protocol | One science-based health habit fitted to their day, with tap-to-tick checks | the protocol job |
| Display | Brightness and contrast per monitor, night light, Day / Evening / Night presets | Twinkle Tray (external monitors) or a laptop screen |
| System | Free space per drive, RAM, CPU, antivirus status, background job status with "Run now" | nothing |


## Step 2. A short interview (only for the features they kept)
Ask in 2 to 4 grouped messages, never one question at a time. Offer sensible defaults so they can answer "default".
- About them, in a sentence or two: what they do (study what and where / work as what), their main goals right now, interests.
  This becomes `profile.md` (git-ignored). Ask before writing anything sensitive; keep only what helps the board.
- City (weather, timezone), board language, light or dark, which monitor (portrait monitors get the tall layout, landscape
  screens get 2-5 columns).
- Timetable: easiest is a screenshot or export of their uni timetable or calendar; or let them list fixed weekly events.
- Exams and deadlines they know about.
- Courses (for Coursework / Study): names, short names, where the material lives, how homework works.
- Gym: goal (strength, muscle, fat loss, fitness), days per week, gym or home, equipment, experience, injuries, time per session.
- Quote style, news interests and country, coach tone (friendly, direct, tough love), cohort to compare with.
- Which apps and sites they open most (for the app folders in the header).

## Step 3. Generate their files
All of these live in the repo folder and are git-ignored. Use the shapes in `examples\` (copy, then fill in). Validate every
JSON file after writing it: `Get-Content <file> -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null`.
- `config.json` from `examples\config.example.json`: name, city (latitude, longitude, timezone), cards on/off, shortcuts and
  app folders, study root and modules, courses and term, news (country, trends24 slug, Google Trends geo, interests, feeds),
  quote, cohort, coach_tone, todo_lists, drives, monitors, jobs (which background jobs run and when), digest.drafts.
- `profile.md`: a short, neutral description of the user for the AI features (what they do, goals, interests, preferences).
- `schedule.json`, `exams.json`, `deadlines.json` from their answers.
- `gym-plan.json`: write a NEW plan for this user. A sensible split for their days per week and equipment, 4-7 exercises a day,
  sets and rep ranges, a "target" muscle label per exercise, a rest day, and 3-6 rules (warm-up, progression, deload). Show it to
  them in a short table and adjust before saving.
- `private\life-plan.json` (only if they kept Life plan): areas (for example Health, Study, Career, Money, People), each with items
  `{ "id", "title", "kind": "once|daily|weekly", "due": "", "note": "" }`, plus `top` (the six that matter most:
  `{ "n", "title", "items": [ids] }`), `key_dates` (`{ "title", "date" }`) and `principles` (3-5 short lines). Titles are shown
  on screen: keep them neutral.
- Study folder (only if kept): create `<root>\<course>\slides`, `exercises`, `notes` and point
  `config.json` at it.
- Gym icons (optional): `tools\make-gym-icons.ps1` draws an icon per exercise with the OpenAI Images API if the user has an
  `OPENAI_API_KEY`; without it the card shows the first letter. Never put a key in a file.

## Step 4. Background jobs
The jobs in `jobs\*.md` (facts, quote, protocol, trends, benchmark, coursework, digest) write the data the cards show. They run locally:
- List the wanted jobs with their times in `config.json` -> `jobs`. The running board starts each one with the
  Claude CLI at that time (and catches up after a late boot). They use the user's Claude usage; say so.
Connectors: Daily runs and New for you need the Gmail (and Google Calendar) connectors enabled for Claude Code. Tell the user
how to enable them; never ask for passwords or tokens. The board's mail features are read-only, except optional reply drafts
(off unless `digest.drafts` is true); nothing is ever sent. The board blocks the Gmail and Calendar write tools for every Claude run, and the jobs run with full file permissions inside the board folder, so tell the user that.

## Step 5. Start it and check it
1. Parse check: `[System.Management.Automation.Language.Parser]::ParseFile("$PWD\Board.ps1",[ref]$null,[ref]$e); $e.Count` must be 0.
2. Render it off-screen and LOOK at the picture: `powershell -NoProfile -ExecutionPolicy Bypass -STA -File Board.ps1 -Snapshot shot.png`.
3. Start at sign-in, Start-menu shortcut with Ctrl+Alt+W and a desktop shortcut: `powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1`.
   Some antivirus programs flag hidden PowerShell windows; if the board does not start, add an exception for the folder.
4. Start it: `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -STA -File Board.ps1 -Show`.
5. Run each enabled job once ("Run now" in the System card) so every card has data today.

## Step 6. Tell the user what you did
A short list: what is set up, what was let go, what they still have to do (enable connectors, install Twinkle Tray, pin the
shortcut to the taskbar). Then explain that from now on they can change anything by talking to Claude in this folder
(see `CLAUDE.md`), for example "add a deadline Friday 12:00", "did leg day", "make the news card smaller".
