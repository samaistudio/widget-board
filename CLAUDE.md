# Widget board: how to change anything by talking

This folder is a desktop widget board for Windows: a pill-shaped island plus a pull-down board of cards.
The user talks to you in plain words ("did leg day", "add a deadline Friday 12:00", "make the news card smaller").
Your job: make the change so the WHOLE board updates, then say in one or two sentences what changed.
Not set up yet? Follow `SETUP.md` first. These rules apply to any AI, not only Claude. Never add real people or AI personas of them; see "Real people" in `SETUP.md`.

## 1. Something about the user's day -> drop it in the inbox (preferred)
The running board keeps today's state in memory (coursework ticks, study hours, gym rotation, to-dos). Never edit
`%LOCALAPPDATA%\WidgetBoard\state.json` while it runs. Instead write ONE JSON file into `inbox\` (any name ending .json).
Within about 2 seconds the board applies it exactly like a chat would, refreshes every card and moves it to `inbox\done\`.

```json
{
  "source": "claude",
  "actions": {
    "journal": ["Trained legs, about 60 min", "Studied 2 h in the library"],
    "study_hours_today": 2,
    "gym_done": true,
    "gym_day": "legs",
    "gym_minutes": 60,
    "coursework_done": ["2027-04-12::<task id>"],
    "todos_done": ["<todo id>"],
    "suggestions_done": ["<suggestion id>"],
    "todos_add": [{ "title": "Upload assignment 1 as PDF", "start": "2027-04-19T12:00" }],
    "life_done": ["<life plan item id>"],
    "memory": [{ "kind": "long", "text": "Works at the campus cafe on Saturdays", "replaces": "" }]
  }
}
```
- `journal`: short neutral facts every widget should know today (they land in `today.json`, which every AI prompt reads).
- `study_hours_today`: TOTAL focused hours today (feeds Top performers).
- `gym_done` + `gym_day`: logs the workout and moves the rotation to the day they actually did. For an earlier day add
  `"gym_date": "yyyy-MM-dd"`.
- Refs: read `coursework.json`, `todos.json`, `suggestions.json` for ids. Coursework refs are `<week-start yyyy-MM-dd>::<id>`
  (or `once::<id>`).
- `memory`: lasting facts (`long`) or what is going on lately (`short`, expires after about 3 weeks), kept in `private\memory.md`.
- Leave out anything that does not apply. Only write what the user actually said.

## 2. Plans and content -> edit the file directly
The board notices changed data files and re-renders within a few seconds.
| What | File |
|---|---|
| Settings: city, cards on/off, shortcuts, news feeds, jobs and their times | `config.json` |
| About the user, for the AI features | `profile.md` |
| Timetable | `schedule.json` |
| Exams | `exams.json` |
| Deadlines | `deadlines.json` |
| Gym plan (only the user changes it; the coach chat never does) | `gym-plan.json` |
| Gym history | `gym-log.json` (prefer the inbox for new workouts) |
| Life plan | `private\life-plan.json` |
| To-dos, suggestions | `todos.json`, `suggestions.json` |
| Job output | `facts.json`, `quote.json`, `protocol.json`, `trends.json`, `benchmark.json`, `coursework.json`, `digest.json` |
| Job prompts | `jobs\*.md` |
Shapes are in `examples\`. Keep JSON valid and UTF-8, then check it:
`powershell -NoProfile -Command "Get-Content '<file>' -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null; 'ok'"`

## 3. Look, layout, behaviour -> edit the code
Everything is in `Board.ps1` (Windows PowerShell 5.1 + WPF, one file).
- Keep it UTF-8 WITH BOM and CRLF line endings. Make exact, small edits. Never rewrite the file by filtering lines through a pipeline.
- PowerShell variable names are case-insensitive: `$mtQs` and `$MtQs` are the same variable.
- After every change:
  1. Parse: `[System.Management.Automation.Language.Parser]::ParseFile("$PWD\Board.ps1",[ref]$null,[ref]$e); $e.Count` must be 0
  2. Render off-screen and LOOK at the image: `powershell -NoProfile -ExecutionPolicy Bypass -STA -File Board.ps1 -Snapshot shot.png`
     (`-Layout landscape` or `-Layout portrait` forces a layout, `-Demo` uses the sample data)
  3. Restart: stop the powershell process whose command line contains `Board.ps1`, then start
     `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -STA -File "<folder>\Board.ps1"` (add `-Show` to open it).
- Key places: `New-Card` (card look), `$Glass` / `$Pal` (theme), `$ActionSpec` + `Apply-Actions` + `Refresh-Linked` (the shared
  action layer every chat uses), `Profile-Context` (what every AI prompt knows about the user), "final card order" (layout),
  `Pick-Screen` (which monitor).

## 4. The phone (iPhone or Android), if set up
- `config.json` -> `phone.repo_dir` is a local clone of the user's PRIVATE data repo. The board writes `phone.json` there
  (plus copies of `digest.json`, `digest-done.json`, `coursework.json`, `gym-log.json`) and syncs it with git every 2 minutes.
- The phone writes notes into `ask/` of that repo. GitHub Actions (`.github/workflows/phone.yml` running `phone/cloud-answer.mjs`)
  applies them and forwards them to `inbox/` of that repo; the board moves them into its own inbox folder and applies them.
- Code: `phone/widget.js` (the app and the iPhone widgets; run by Scriptable through `phone/loader.js`, and on Android by
  `phone/android/shim.js`), `phone/devices.json` (lock screen widget sizes per iPhone model), `phone/cloud-answer.mjs`.
  Check a change with `node --check`. Phones load `phone/widget.js` from GitHub, so a pushed change reaches them on their next run.
- Lock screen widgets: inline (empty Parameter), left rectangle (empty), right rectangle (Parameter `day`).
- Settings: `app-config.json` in the data repo (table in `SETUP.md`, shape in `examples\app-config.example.json`). Nothing personal goes in the code: names, courses, goals, meals, currency and targets all come from there, and the app must keep working with the file missing and with no courses.
- The phone's taps and chats log to files in the data repo, written by the cloud job and not forwarded to the PC: `food-log.json` (`food_add`, `food_remove`, `food_goal`), `study-log.json` (`study_add`, `study_remove`), `day-log.json` (`day_add`, `day_edit`, `day_remove`; kind `move` with `value` in kcal raises that day's calorie goal), `gym-phone.json` (`workout`, `gym_remove`; separate from `gym-log.json`, which the board rewrites), `money-log.json` (`money_add`, `money_remove`, `money_balance`), `quests.json` (`quest_add`, `quest_done`, `game_cfg`), `health-log.json` (`health_add`), `degree.json` (`degree_set`), `app-config.json` (`app_cfg`), `gym-session.json` (`gym_suggest`: the plan day a chat settled on, it wins over the rotation for that day). `food_ai`, `study_ai`, `journal_ai`, `body_ai` and `money_ai` notes in `ask/` call the AI and answer in `food-ai.json`, `study-ai.json`, `journal.json`, `body-log.json` and `money-log.json`.
- Anything new `phone/widget.js` needs from Scriptable must exist in `phone/android/shim.js` or fail gracefully. Links out of the page go through `nav()`.
- The game's rules are in `SETUP.md`: no negative points, no guilt copy, never praise eating less, never score journal content, chat confirms what was logged, screen time is not tracked.

## 5. Privacy
- Everything the user tells the board stays in this folder and in `%LOCALAPPDATA%\WidgetBoard`. `.gitignore` keeps all data
  files out of git. Never commit `config.json`, `profile.md`, `private\` or any data JSON to a public repo.
- Never put API keys or passwords in any file. Mail features are read-only; nothing is ever sent.
- The phone token and the `claude setup-token` value never go into a file, a chat or the public repo: the user puts them
  into the phone and into the data repo's Actions secret themselves. The data repo must stay private.
