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
| Phone (iPhone or Android) | Lock screen widgets (iPhone), home screen widgets, and the app: Today, Gym with body map, Tasks, Week, Chat, Due, Exams. Works with the PC off | a free GitHub account and a private data repo; Scriptable (iPhone) or Chrome (Android); chat in the cloud needs `claude setup-token` |


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
- Phone (only if they kept it): **iPhone or Android, and which model** (for example "iPhone 15 Pro Max", "Pixel 9").
  For an iPhone, match the model to a name in `phone\devices.json` (it sizes the lock screen widgets); if it is not
  listed, leave `phone.model` empty and tell them the widgets size themselves from the screen width. Ask whether the chat
  should work while the PC is off (needs `claude setup-token` and a GitHub secret).

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

## Step 5b. The phone part (only if they kept it)
Follow IPHONE-SETUP.md or ANDROID-SETUP.md. Do the PC side yourself; guide the user through the phone side.
1. They need a PRIVATE repo on github.com (for example `board-data`). Create it with `gh repo create board-data --private`
   if the GitHub CLI is signed in, or ask them to create it. Never make it public.
2. Clone it to `%USERPROFILE%\board-data`, copy `phone\cloud-answer.mjs` to `phone\cloud-answer.mjs` and
   `phone\workflow-phone.yml` to `.github\workflows\phone.yml` there, set `TZ:` to their time zone, commit, push.
   With their OK, write a short `about-me.md` there (goals, body weight for calorie estimates, coach tone).
3. Add `"phone": { "repo_dir": "%USERPROFILE%\\board-data", "model": "<their model>", "platform": "iphone" }` (or
   `"android"`) to `config.json`, restart the board, and after 2 to 3 minutes check that `phone.json` is in the repo.
4. Walk them through the token: fine-grained, that repo only, Contents: Read and write. Never ask them to paste the token to
   you or into a file; it goes straight into the phone. The same for the `claude setup-token` value: they put it into the
   repo's Actions secret `CLAUDE_CODE_OAUTH_TOKEN` themselves.
5. iPhone: Scriptable, a script named "Widget Board" with `phone\loader.js`, then the lock screen widgets (inline: empty
   Parameter; left rectangle: empty; right rectangle: `day`). Android: GitHub Pages on their fork, open `/phone/android/`
   in Chrome, Install app; KWGT + Tasker only if they want home screen widgets. Be honest that Android lock screen widgets
   depend on their phone and Android version.
6. Ask them to tick a task and send one chat message, and look at the repo's Actions tab together.

## Step 6. Tell the user what you did
A short list: what is set up, what was let go, what they still have to do (enable connectors, install Twinkle Tray, pin the
shortcut to the taskbar). Then explain that from now on they can change anything by talking to Claude in this folder
(see `CLAUDE.md`), for example "add a deadline Friday 12:00", "did leg day", "make the news card smaller".
