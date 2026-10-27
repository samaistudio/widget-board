# Android setup

On Android you get the same app as on iPhone (Today, Gym with the body map, Tasks, Week, Chat, Messages, Due, Exams),
installed from the browser as a web app, plus optional home screen widgets. It reads the same private data repo, so it
keeps working while the PC is off.

![The app: Week](screenshots/phone-app-week.png)

*Screenshot with the built-in demo data (a fictional student, "Alex").*

The easiest way: open Claude Code in the board folder and say **"set up the Android part"**. Claude follows this page,
asks for your phone model, and does the PC-side steps. The steps on the phone are yours. Below is everything in full.

## Honest overview: what Android can and cannot do here

| Part | Status |
|---|---|
| The app | Works: an installable web app (PWA) in Chrome. Same features as the iPhone app. |
| Taps and chat | Work the same way: notes go to your data repo, a GitHub Action applies them, PC on or off. |
| Home screen widgets | Possible with **KWGT** (Kustom Widget Maker) fed by **Tasker**. Tasker is a paid app; KWGT is free with an optional Pro key. This route is described below but has **not** been tested on a device by us. |
| Lock screen widgets | **Not promised.** Android removed lock screen widgets on phones years ago. Google announced their return for phones with Android 16 QPR1, reportedly through a hub shown while the phone is charging or docked, and manufacturers decide whether to ship it. Whether a KWGT widget can sit on your lock screen depends on your phone and Android version. Check: long-press the lock screen or look under Settings > Lock screen. If there is no widget option, use the home screen. |
| Reminders | Only while the app is open (browsers cannot schedule notifications reliably). |

## How it works

```
 PC board (Board.ps1)  --git-->  your PRIVATE data repo on GitHub  <--GitHub API--  Android (Chrome web app)
   writes phone.json             phone.json, digest, gym log ...      reads it, shows the app
   applies notes from inbox/     ask/  (taps and chat from the phone)  writes ask/ notes when you tap or chat
                                 GitHub Actions: phone/cloud-answer.mjs answers ask/ notes, PC on or off
```

The app is the same code as on iPhone (`phone/widget.js`), run in the browser by `phone/android/shim.js`.

## Step 1. Your private data repo (on the PC)

Exactly as in [IPHONE-SETUP.md, step 1](IPHONE-SETUP.md#step-1-your-private-data-repo-on-the-pc), with this in `config.json`:
```json
"phone": { "repo_dir": "%USERPROFILE%\\board-data", "model": "", "platform": "android" }
```
(`model` only sizes the iPhone lock screen widgets; on Android the app sizes itself.)

## Step 2. A token for the phone

Exactly as in [IPHONE-SETUP.md, step 2](IPHONE-SETUP.md#step-2-a-token-for-the-phone): a fine-grained token for the data
repo only, **Contents: Read and write**.

## Step 3. Host the app (your own copy, free)

The web app has to be served over https. The simplest free way is GitHub Pages on your own fork of this repo:

1. On github.com, open this repository and tap **Fork** (it stays public: it holds only code, never your data).
2. In your fork: **Settings**, **Pages**, **Source: Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**.
3. After a minute your app is at `https://<you>.github.io/widget-board/phone/android/`.
4. To get updates later: on your fork's page, **Sync fork**.

The app stores your repo name and token in the browser's storage for that address, on your phone only. Everything on
`<you>.github.io` shares that storage, so do not host other people's code under the same account's Pages.

## Step 4. Install the app on the phone

1. Open `https://<you>.github.io/widget-board/phone/android/` in **Chrome** on the phone.
2. It asks for your data repo (`you/board-data`) and the token from step 2. Both stay in this browser on this phone.
   "Change repo or token" on the start screen (when something fails) clears them.
3. Chrome menu (three dots), **Add to home screen** / **Install app**. It now opens full screen like an app.
4. Tap around: tasks have Done / Later tonight / Tomorrow / Ignore / I don't know, the Gym page has the day picker,
   session timer and body map.

## Step 5. Chat with Claude while the PC is off (optional)

Exactly as in [IPHONE-SETUP.md, step 5](IPHONE-SETUP.md#step-5-chat-with-claude-while-the-pc-is-off-optional):
`claude setup-token`, then the `CLAUDE_CODE_OAUTH_TOKEN` secret in the data repo. Taps never use Claude; each chat
message is one short Claude run on your subscription.

## Step 6. Home screen widgets with KWGT and Tasker (optional, advanced)

KWGT cannot send the token GitHub needs, so Tasker fetches the data and hands three ready-made lines to KWGT. The board
writes those lines into `phone.json` as `glance`:

| Variable | Example | |
|---|---|---|
| `glance.top` | `ALG in 21h · 3× 10,12,14` | next class, countdown, that day's start hours |
| `glance.exam` | `ALG midterm in 10d` | next test or exam |
| `glance.gym` | `Gym: Pull` | suggested gym day, or "Gym done today" |

The countdowns are as fresh as the last fetch (Tasker below fetches every 30 minutes).

**Tasker** (paid, Play Store):
1. New **Profile**, **Time**, every 30 minutes (for example 06:00 to 23:30, repeat 30 min).
2. New **Task** for it, with these actions:
   - **Net, HTTP Request**: Method `GET`, URL `https://api.github.com/repos/<you>/board-data/contents/phone.json`,
     Headers (one per line) `Authorization: Bearer <your token>` and `Accept: application/vnd.github.raw+json`.
     Store the token in a Tasker variable (for example `%BOARD_TOKEN`) instead of typing it into several places.
   - Tasker reads JSON fields of `%http_data` with dot notation (recent Tasker versions): `%http_data.glance.top`, `%http_data.glance.exam`,
     `%http_data.glance.gym`.
   - Three **Plugin, KWGT** actions (the Kustom plugin action that sends a variable): names `top`, `exam`, `gym`, values
     the three fields above.
3. Run the task once by hand to check it.

**KWGT** (Play Store): add a KWGT widget to the home screen, open it, add three Text items
with the formulas `$br(tasker, top)$`, `$br(tasker, exam)$` and `$br(tasker, gym)$`. Style them to taste (small, white,
dim labels look like the iPhone version). Tapping the widget can open the web app: Touch action, Open link, your app's address.

We could not test this route on a device. If a step looks different on your phone, ask Claude in the board folder; give it
the exact screen you see.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Could not start: ..." | Check the connection and reload. "Change repo or token" lets you enter them again. |
| The app shows old data | The board pushes every 2 minutes while the PC is on; check `phone.json` in the data repo on github.com. |
| Taps or chat do nothing | The token needs **Contents: Read and write** on the data repo. For chat, check the secret and the repo's Actions tab. |
| No "Install app" in Chrome | Open the exact `/phone/android/` address over https (GitHub Pages), not a file or http. |
| KWGT shows the formula text | Tasker has not sent the variables yet: run the Tasker task once. |

## Privacy

- The public repo (and your fork) hold only code. Your data lives in the private data repo, the board folder on your PC,
  and this browser on your phone.
- The token is limited to the data repo and stays in the browser (and Tasker, if you use the widgets).
- The app talks only to api.github.com (your data repo) and api.open-meteo.com (weather).
