# Data file shapes

Copy what you need into the repo folder (without `.example`) and fill it in. All of these are git-ignored there.

- `config.example.json` -> `config.json`: everything the board needs to know (city, cards on/off, shortcuts, news, jobs...).
- `schedule.example.json` -> `schedule.json`: fixed events. `weekly` repeats every 7 days from `first` until `last`,
  skipping `holidays`; `events` are one-offs.
- `exams.example.json` -> `exams.json`: exams with an optional `second` (resit) date. `no_time: true` = only the day is known.
- `deadlines.example.json` -> `deadlines.json`: `{ "items": [ { "when", "what", "note" } ] }`.
- `gym-plan.schema.json`: the SHAPE of `gym-plan.json` only. Claude writes a plan for you during setup; do not use this as a plan.
- `life-plan.schema.json`: the shape of `private\life-plan.json`.

- `config.json` -> `phone`: only for the phone part (IPHONE-SETUP.md, ANDROID-SETUP.md). `repo_dir` = local clone of your
  private data repo, `model` = a name from `phone\devices.json`, `platform` = `iphone` or `android`.

Times are local, ISO style: `2027-05-20T14:00`.
