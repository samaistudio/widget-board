# Setup guide

You are an AI assistant, and the user gave you this repository's link to set up their widget board.
Follow this guide from top to bottom. Talk to the user in plain, friendly words; keep each message short.
Everything personal you create stays on the user's PC: `.gitignore` keeps all data files out of git.

Pictures for the user: `tutorial/README.md`.

## Step 0. Check the machine (no questions yet)
- Windows 10 or 11 with Windows PowerShell 5.1 (`powershell.exe`, built in). The board does not run on macOS or Linux.
- Git (only needed to clone and update).
- Clone (or move) the repo to `%USERPROFILE%\WidgetBoard` unless the user wants another folder.
- Show the demo so they see what they get: `powershell -NoProfile -ExecutionPolicy Bypass -STA -File Board.ps1 -Demo -Show`
  (fictional sample data written by `tools\make-demo.ps1` to `%LOCALAPPDATA%\WidgetBoard-demo`; their real data is not touched). Close it with Esc.

## Step 1. Ask which AI they pay for: they tick all that apply
Show this list as tick boxes and let them tick any number, or say "none". Do not assume they have Claude.

- [ ] Claude (Pro, Max or Team)
- [ ] ChatGPT (Plus, Pro or Team)
- [ ] Google Gemini (Google AI Pro or Ultra)
- [ ] Gemini API key
- [ ] DeepSeek
- [ ] GitHub Copilot
- [ ] Grok (SuperGrok or X Premium+)
- [ ] Mistral (Le Chat Pro or API)
- [ ] Kimi
- [ ] Qwen
- [ ] Perplexity
- [ ] Microsoft Copilot
- [ ] Meta AI
- [ ] Cursor
- [ ] A local model (for example Ollama)
- [ ] Something else: ask which

The board needs a command line tool it can hand a prompt to. These are starting points, and they change often:

| They have | Try this tool | Command to test |
|---|---|---|
| Claude | Claude Code | built in, leave `ai.command` empty |
| ChatGPT | Codex CLI | read only `codex exec -`, can edit files `codex exec --sandbox workspace-write -` |
| Google AI Pro or Ultra | Antigravity CLI | check its `--help` |
| Gemini API key | Gemini CLI | check its `--help` |
| GitHub Copilot | Copilot CLI | check its `--help` (has `-p`) |
| Grok | Grok Build | check its `--help` |
| Mistral | Mistral Vibe | check its `--help` |
| Kimi, Qwen, Cursor | their own CLI | check its `--help` |
| DeepSeek | a tool that takes an OpenAI-compatible API key, paid per use | check its `--help` |
| Local model | Ollama or similar | check its `--help` |
| Perplexity, Microsoft Copilot, Meta AI, or nothing | no suitable tool known | use another AI they ticked, or set up without AI |

Then:
1. For each ticked AI, look online and in the tool's `--help` for the current way to run it from a script. Do not trust this table blindly.
2. Help them install and sign in. They type passwords and keys themselves. Never ask them to paste one to you or put one in a file.
3. Pick the one that works best. Say which and why. If a plan's terms limit automated use, or use is paid per request, tell them before going on.
4. Test it: pipe "Reply with only OK" into the command. It must read the prompt from stdin and print only the answer. If it does not, wrap it in a small `.cmd` file in the board folder that does.
5. Unless it is Claude Code, write `"ai": { "name": "<their AI>", "command": "<read only command>", "command_files": "<command that may edit files in the board folder>" }` to `config.json`.
6. With no working AI tool, say so plainly: the cards marked "nothing" and any data they enter by hand still work, and the rest stays off.

Be honest about limits on anything but Claude Code: the board cannot block individual tools there, so **leave Daily runs and New for you off unless they use Claude Code**, because those read their mail and the block on write tools only exists for Claude. Those two are also the only features that need Claude's connectors. Buttons on the board still say "Claude" for now; tell them that is just a label.

## Step 2. They tick the features they want
Show the whole list below as numbered tick boxes, every one unticked, and ask them to reply with the numbers or "all". All is a fine answer, and do not talk them out of it. Add at most one short note where a feature cannot work on their setup. Keep it to one message.

| Card / feature | What it does | Needs |
|---|---|---|
| Island + board | The pill at the top of the screen; click or drag it down and the board slides out. Ctrl+Alt+W toggles. | nothing |
| Up next | The current and next event of the day, with a progress bar | `schedule.json` (from their timetable / calendar) |
| Due | Upcoming deadlines with friendly countdowns | `deadlines.json` |
| Exams | Countdown to each exam, retake dates behind a "Retake" switch | `exams.json` |
| Coursework | A weekly checklist per course, written each morning by the AI from their course folders | `courses` in config + the coursework job |
| Study | One tile per course that opens its folder | a study folder (the AI can create the layout) |
| Gym + coach | Today's workout from a rotating plan, Done / Skip, a 7-day strip, a coach chat that logs workouts and answers from the plan | `gym-plan.json`, which the AI GENERATES with the user (step 3). Never copy someone else's plan |
| Quick capture | Type anything ("call mum tomorrow 18:00"); the AI sorts it into a task, event or reminder, with "+ Calendar" | the AI tool |
| Suggested work | the AI proposes concrete next actions when the list is empty | the AI tool |
| Top performers | Progress tracker: how many hours a top-10% person in their cohort has done by now vs them, an ideal day, a check-in chat | the benchmark job + `cohort` in config |
| Life plan | Progress tracker for life goals: one-time steps, daily and weekly habits, the six that matter most, key dates | `private\life-plan.json`, generated from a short interview |
| Daily runs | One screen with their inbox (act now / can wait / FYI) and the output of their cloud routines | the digest job + the Gmail connector in claude.ai |
| New for you | A daily read-only scan of Gmail and Calendar for news about their things | Gmail and Google Calendar connectors |
| Focus | Pomodoro, timer and stopwatch, with templates | nothing |
| News & trending | X trends, Google Trends, world, tech, AI, business feeds, each headline scored for them | the trends job; feeds in config |
| Weather | Now, hourly, tomorrow | their city in config (open-meteo.com, no key) |
| Did you know | Five facts a day next to the clock, "5 more" on demand | the facts job |
| Quote of the day | A quote or verse picked for their day, in any language or tradition they like | the quote job + `quote` in config |
| Daily protocol | One science-based health habit fitted to their day, with tap-to-tick checks | the protocol job |
| Display | Brightness and contrast per monitor, night light, Day / Evening / Night presets | Twinkle Tray (external monitors) or a laptop screen |
| System | Free space per drive, RAM, CPU, antivirus status, background job status with "Run now" | nothing |
| Phone (iPhone or Android) | Lock screen widgets (iPhone), home screen widgets, and the app: Today with a day line, Heads up and chat (photos, camera, barcodes), Study timer and forest, Gym with body map, Food (ring, macros, barcode scan, photo or text estimate, exercise calories), Stats, Body (weigh-ins, real burn, progress photos), Money (bank CSV, categories), Journal, Game, Everything logged, Tasks, Week, Due, Exams. Works with the PC off | a free GitHub account and a private data repo; Scriptable (iPhone) or Chrome (Android); chat, photos and the journal in the cloud need `claude setup-token` or `AI_COMMAND` |
| Historic role models | Optional: one idea now and then from how a figure from long ago worked, inside Top performers | `role_models` in config, picked from the fixed list below |

## Step 3. Tailor every ticked feature to them
Everything must be made for this person. Never leave demo data, examples or "Alex" in their files. Ask in 2 to 4 grouped messages, only about what they ticked, and offer sensible defaults so they can answer "default".
- About them, in a sentence or two: what they do (study what and where / work as what), their main goals right now, interests.
  This becomes `profile.md` (git-ignored). Ask before writing anything sensitive; keep only what helps the board.
- City (weather, timezone), board language, light or dark, which monitor (portrait monitors get the tall layout, landscape
  screens get 2-5 columns).
- Up next: easiest is a screenshot or export of their timetable or calendar; or let them list fixed weekly events.
- Due and Exams: everything they know about, with dates.
- Coursework and Study: course names, short names, where the material lives, how homework works.
- Gym and workout: goal (strength, muscle, fat loss, fitness), days per week, gym or home, equipment, experience, injuries, time per session, exercises they like and hate, coach tone (friendly, direct, tough love). Write a new plan for them and show it for changes. If they mention an injury or a health condition, adjust the plan and suggest they check with a doctor or physio.
- Top performers: who to compare with (their own cohort, in general terms, never named people).
- Life plan: their real goals in each area, the six that matter most, key dates.
- Quick capture and Suggested work: the task lists and areas that fit their life.
- News: interests, country, feeds. Quote: tradition and language. Did you know: topics they like. Daily protocol: their habits and what to skip.
- Focus: their usual work and break lengths. Display and System: their monitors and drives.
- Which apps and sites they open most (for the app folders in the header).
- Phone: **iPhone or Android, and which model** (for example "iPhone 15 Pro Max", "Pixel 9").
  For an iPhone, match the model to a name in `phone\devices.json` (it sizes the lock screen widgets); if it is not
  listed, leave `phone.model` empty and tell them the widgets size themselves from the screen width. Ask whether the chat
  should work while the PC is off. Then what goes in `app-config.json` (see "The phone app's settings" below): the name for the greeting, courses (none is fine), a calorie and protein goal only if they want one, currency, any meals they already paid for, their wake window and study target. Location logging stays off unless they ask for it.

## The phone app's settings: app-config.json
Everything personal in the phone app comes from one optional file in the PRIVATE data repo, `app-config.json`. The shape is
`examples\app-config.example.json`. Every key has a default, so the app also runs with the file missing and for someone with
no courses at all. Write only what the user told you. The chat can change it later with the action `app_cfg`, and More,
Settings in the app shows what is set.

| Key | What it does | Without it |
|---|---|---|
| `name` | The greeting: "Good morning, Alex" | "Good morning" |
| `courses` | List of names or `{name, short, keywords, tree, color}`. Study chips, charts, nudges and the study AI use it by index, and everything else goes in an Other bucket. `keywords` help the app find the course in what they say. An empty list means no courses | The courses the board exports in `phone.json`, else none |
| `term_start` | Where the lock screen ring starts counting | `term.start` in the board's config |
| `goals` | First calorie and protein goal, `{kcal, protein}`. A goal set later in the app or the chat wins | No goal: the Food page shows what was eaten and offers to set one |
| `currency`, `currency_after`, `locale` | The Money page: the symbol, whether it follows the number, how numbers read (`en-US` also makes CSV dates month first). Other dates stay en-GB | No symbol, en-GB |
| `meals` | Meals already paid for (a canteen plan, for example): `{name, days: "weekdays"\|"weekends"\|"all" or a list with 0 for Sunday, from, to, kcal, protein, carbs, fat}`. Shows a Plan meal button and an "already paid for" line in Heads up while one is open | Both off |
| `wake` | The wake window for the game, `{from, to}`. Also changeable on the Game page | 07:00 to 09:00 |
| `game` | `study_hours_week`, `study_days` and the `weekly` targets (`moneycheck`, `contact`, `making`, `application`; 0 hides one). Ask what fits them; do not set a target they did not choose | 15 h over 5 days; 1, 2, 2, 0 |
| `food` | How exercise raises the calorie goal: `gym_free_week`, `gym_extra_kcal`, `bonus_cap` | 3, 300, 600 |
| `body` | `goal_kg`, or `goal_bf` with `goal_bf_low` (percent). Only if they ask for one | No goal shown |
| `nudges` | `false` turns Heads up off | On |
| `location` | `true` saves the place with each log. Off unless they ask for it, and explain that it goes to their private repo | Off |

Other files the app and the cloud job keep in the data repo, all created when first needed: `food-log.json`, `food-ai.json`,
`study-log.json`, `study-ai.json`, `day-log.json`, `journal.json`, `quests.json` (one-off quests, bosses with `{id, title, when,
prep_start, prep_end, area, quests}`, game settings), `body-log.json`, `money-log.json`, `health-log.json`, `gym-phone.json`, `gym-session.json`,
`hidden-tasks.json`, and optionally `degree.json` (`{done, total, modules}`, shown on Study only when `total` is set).

## The life game's rules
The Game page scores from the logs, on the phone. These rules are part of the feature; do not weaken them when you tailor it.
- Six areas: Study, Body, Sleep, People, Money, Making. Points can only be added. There are no negative points, no punishment, no guilt copy and no "you missed" notifications.
- A floor day is logging honestly and reaching one area. One tap on Rough day is a floor by itself, and that day shows one nudge at most.
- Food scores hitting the target, never a deficit: under and over lose equally, very low logged days score Body 0, and the app never shows a lower number as progress or praises eating less. A photo read can only move an existing goal in small steps, never under 1500 kcal.
- Under 6 hours of sleep scores Sleep 0. Rest days score (3 a week). There is no bonus past 5 training days in a row.
- The journal scores logged or not logged only. What is said or felt is never scored. Mood is one tap and is never scored.
- No comparison with other people, no leaderboards. Screen time is not tracked. Nothing outside the user's control is a quest, and neither is anything legal, medical or about their family or relationship.
- Heads up says plainly what has not been logged lately and always has "I did it" or "Not now". Facts only.

## Real people: strict rule
This project does not ship, suggest or advertise real people as a feature. Never add a living person, or anyone who died recently, to the board, its files or its text. There is no "talk to" a person or AI persona of anyone, and you never write as a real person.
The only names allowed are in the optional Historic role models list, all long dead, and only as a short idea from documented history:
Marcus Aurelius, Leonardo da Vinci, Benjamin Franklin, Napoleon Bonaparte, Charles Darwin, Abraham Lincoln, Cornelius Vanderbilt, Andrew Carnegie, Florence Nightingale, Ada Lovelace.
If they ticked it, let them pick from this list and write the picks to `role_models` in `config.json`. If they ask for someone else, explain that this project only includes this list.

## Step 4. Generate their files
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

## Step 5. Background jobs
The jobs in `jobs\*.md` (facts, quote, protocol, trends, benchmark, coursework, digest) write the data the cards show. They run locally:
- List the wanted jobs with their times in `config.json` -> `jobs`. The running board starts each one with the
  the AI tool at that time (and catches up after a late boot). They use the user's the AI usage; say so.
Connectors: Daily runs and New for you need the Gmail (and Google Calendar) connectors enabled for Claude Code. Tell the user
how to enable them; never ask for passwords or tokens. The board's mail features are read-only, except optional reply drafts
(off unless `digest.drafts` is true); nothing is ever sent. The board blocks the Gmail and Calendar write tools for every the AI run, and the jobs run with full file permissions inside the board folder, so tell the user that.

## Step 6. Start it and check it
1. Parse check: `[System.Management.Automation.Language.Parser]::ParseFile("$PWD\Board.ps1",[ref]$null,[ref]$e); $e.Count` must be 0.
2. Render it off-screen and LOOK at the picture: `powershell -NoProfile -ExecutionPolicy Bypass -STA -File Board.ps1 -Snapshot shot.png`.
3. Start at sign-in, Start-menu shortcut with Ctrl+Alt+W and a desktop shortcut: `powershell -ExecutionPolicy Bypass -File tools\install-autostart.ps1`.
   Some antivirus programs flag hidden PowerShell windows; if the board does not start, add an exception for the folder.
4. Start it: `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -STA -File Board.ps1 -Show`.
5. Run each enabled job once ("Run now" in the System card) so every card has data today.

## Step 6b. The phone part (only if they kept it)
Follow IPHONE-SETUP.md or ANDROID-SETUP.md. Do the PC side yourself; guide the user through the phone side.
1. They need a PRIVATE repo on github.com (for example `board-data`). Create it with `gh repo create board-data --private`
   if the GitHub CLI is signed in, or ask them to create it. Never make it public.
2. Clone it to `%USERPROFILE%\board-data`, copy `phone\cloud-answer.mjs` to `phone\cloud-answer.mjs` and
   `phone\off.mjs` to `phone\off.mjs`, and `phone\workflow-phone.yml` to `.github\workflows\phone.yml` there, set `TZ:` to their time zone, write `app-config.json` from their answers, commit, push.
   With their OK, write a short `about-me.md` there (goals, body weight for calorie estimates, coach tone).
3. Add `"phone": { "repo_dir": "%USERPROFILE%\\board-data", "model": "<their model>", "platform": "iphone" }` (or
   `"android"`) to `config.json`, restart the board, and after 2 to 3 minutes check that `phone.json` is in the repo.
   If they are not using Claude: replace the `npm install` line in the workflow with their tool's install, set the repo variable `AI_COMMAND` to its command, add its sign-in as a secret and pass it in the workflow's `env`. If their tool cannot sign in on a server, tell them chat with the PC off is not available; taps still work.
4. Walk them through the token: fine-grained, that repo only, Contents: Read and write. Never ask them to paste the token to
   you or into a file; it goes straight into the phone. The same for the `claude setup-token` value: they put it into the
   repo's Actions secret `CLAUDE_CODE_OAUTH_TOKEN` themselves.
5. iPhone: Scriptable, a script named "Widget Board" with `phone\loader.js`, then the lock screen widgets (inline: empty
   Parameter; left rectangle: empty; right rectangle: `day`). Android: GitHub Pages on their fork, open `/phone/android/`
   in Chrome, Install app; KWGT + Tasker only if they want home screen widgets. Be honest that Android lock screen widgets
   depend on their phone and Android version.
   Tell them the phone downloads its code from the public repo each time it runs. If they would rather decide when it updates, use their own fork: change `CODE` in `phone\loader.js` and `phone\widget.js` to it.
6. Ask them to tick a task and send one chat message, and look at the repo's Actions tab together.

## Step 7. Tell the user what you did
A short list: what is set up, what was let go, what they still have to do (enable connectors, install Twinkle Tray, pin the
shortcut to the taskbar). Then explain that from now on they can change anything by talking to their AI in this folder
(see `CLAUDE.md`), for example "add a deadline Friday 12:00", "did leg day", "make the news card smaller".
