# Widget Board for Windows, iPhone and Android, set up and run by your AI

https://github.com/user-attachments/assets/6a82edc8-f313-45a0-b831-3f41e3532dc4

A widget board tailored to your life. On Windows, a small pill sits at the top of your screen; click it (or drag it down)
and a board of cards slides out. On your phone, the same day lives on the lock screen and in an app. It shows what is next today, your deadlines and exams, a gym plan with a coach, your inbox,
a progress tracker against the top 10% of your peers, news and trends, the weather, a focus timer and more. Many cards
are filled by your AI in the background, and you can change anything just by telling it. Claude works best, and the setup also helps you use ChatGPT, Gemini, DeepSeek, Grok, Copilot, Mistral and others.

![The board (landscape screen)](screenshots/board-hero.png)

<p align="center"><img src="screenshots/phone-lockscreen.png" width="380" alt="The phone lock screen: a countdown to the next class above the clock, your courses with test and exam countdowns on the left, class, gym and weather on the right"></p>
<p align="center"><em>The same day on your lock screen: countdown above the clock, courses and exams on the left, class, gym and weather on the right.</em></p>

*All screenshots use the built-in demo data (a fictional student, "Alex").*

## On your phone

| iPhone lock screen | The app: Today | Food |
|---|---|---|
| ![Lock screen](screenshots/phone-lockscreen.png) | ![Today](screenshots/phone-app-today.png) | ![Food](screenshots/phone-app-food.png) |

| Study and forest | Gym | Life game |
|---|---|---|
| ![Study](screenshots/phone-app-study.png) | ![Gym](screenshots/phone-app-gym.png) | ![Game](screenshots/phone-app-game.png) |

| Body | Money | Journal |
|---|---|---|
| ![Body](screenshots/phone-app-body.png) | ![Money](screenshots/phone-app-money.png) | ![Journal](screenshots/phone-app-journal.png) |

- **iPhone** (free app [Scriptable](https://scriptable.app)): a countdown line above the clock, a left widget with your
  courses (tasks ticked this week, days to the next test and to the exam, a countdown ring) and a right widget that changes
  with the time of day (next class or free time, today's gym day and exercises, the weather), sized for your iPhone model.
  See [IPHONE-SETUP.md](IPHONE-SETUP.md).
- **Android**: the same app as an installable web app, plus optional home screen widgets through KWGT and Tasker. Lock
  screen widgets depend on your phone and Android version. See [ANDROID-SETUP.md](ANDROID-SETUP.md).
- **The app** (both): Today with a day line, Heads up and one chat that takes photos, the camera and barcodes; Study with a timer and a forest that grows; Gym with a tappable body map and a coach; Food (calorie ring, macros, barcode scan, photo or text estimate, exercise calories); Stats, Body (weigh-ins, your real burn, progress photos), Money (bank CSV, categories), Journal, a life game with floors, areas and quests, Everything logged, Tasks, Week, Messages, Due and Exams. Your name, courses, goals, currency and targets are settings, and the app also works with no courses and no goals.
- **Your data stays private**: the phone reads it from a second, *private* GitHub repo of yours. Taps work while the PC is
  off and use no Claude; chat messages are answered by Claude in GitHub Actions on your own subscription.

## Your data stays yours

**Free and open source (MIT; the body map artwork keeps its own license, see assets/BODY-MAP-LICENSE.txt). Read every line yourself.** There is no server of ours, no account with us and no tracking. Nothing in the code sends your data to us.

- Your files stay on your PC, and git ignores them.
- The phone part uses your own private GitHub repo and your own token.
- What you ask your AI goes to the AI company you chose, under its terms. Weather asks open-meteo.com for your city, news comes from public feeds, and phone data sits in your GitHub account.
- The phone app downloads its newest code from this public repo each time it runs, so it stays up to date. If you would rather decide when it updates, ask your AI to use your own fork instead.

![Your data stays yours](tutorial/privacy.png)

## What it needs

**In plain words:** almost any Windows PC from the last 10 years should run it, and you won't notice it running.

| | |
|---|---|
| Memory (RAM) | About 245 MB (measured on the demo board) |
| Processor | About 0.14% when idle (measured on a 6-core Ryzen 5 3600X) |
| Disk | About 10 MB, plus your own data |
| System | Windows 10 or 11 with PowerShell 5.1 and .NET Framework, both built in. No macOS or Linux |
| Suggested PC | 4 GB of RAM or more (our estimate) |
| Internet | Needed for AI, weather, news and phone sync. The clock, timer and your own files work without it |
| iPhone | The free Scriptable app. Lock screen widgets need iOS 16 or newer |
| Android | Chrome, installed as a web app |
| Cost | The board is free. You pay only for your own AI plan |

**More technical:** one PowerShell and WPF process, with no installer or background service of its own. Your AI tool runs as a separate process only while it works. It adds its own memory and uses your plan's limits, so those numbers are not included above. Background jobs run at the times you set in `config.json`. Chat with the PC off runs in GitHub Actions on your private repo, which uses your account's Actions minutes.

## Install: give this link to your AI

**New here? Follow the [step-by-step tutorial with pictures](tutorial/README.md), with a card for each AI.**

You need Windows 10 or 11 and an AI tool that can work on your PC, such as Claude Code or Codex. Open it in any folder and paste:

```
Set up this widget board for me: https://github.com/samaistudio/widget-board
Follow SETUP.md in the repo.
```

Your AI will:
1. Clone the board and show you the demo, and ask whether you have an iPhone or an Android phone (and which model).
2. Ask which AI subscriptions you have, so you can tick them all, and pick what works best.
3. Show every feature as a tick box. Tick the ones you want, or all of them.
4. Ask a few short questions to tailor each one to you (what you do, your city, timetable, exams, your gym goal and equipment, what news you like).
5. Write your own files: settings, timetable, deadlines, a gym plan made for you, a life plan, a study folder if you want one.
6. Turn on the background jobs you picked (facts, quote of the day, trends, daily inbox digest, coursework plan, ideal day).
7. Start the board at sign-in (Ctrl+Alt+W opens and closes it) and check that it works.
8. If you want the phone part: create your private data repo with you and walk you through the steps on the phone.

Want to look first? `powershell -ExecutionPolicy Bypass -STA -File Board.ps1 -Demo -Show` opens it with the sample data.

## How it works

- **The island.** The black pill at the top of the screen shows the clock and what is next (your next class, a deadline,
  the running timer). Click it or drag it down to open the board, drag it up or press Esc to close it. Drag it sideways to
  park it anywhere; it snaps to corners and edges and tucks itself away. Right-click: Refresh or Quit.
- **Cards.** Click a card's title (or anywhere on it) and a detail sheet slides up. Related cards are tabs of one card:
  *You* (New for you, Life plan, Daily protocol, Quote), *Plan* (Coursework, Up next, Due, Exams, Study),
  *Tasks* (Quick capture, Suggested work) and *PC* (Display, System, Weather).
- **Talk to it.** Quick capture turns "email Alex tomorrow 10:00" into a dated task with a "+ Calendar" button. The Gym
  coach, the Top performers check-in, Daily runs and News each have a small chat. Anything you tell one of them
  ("did legs, 2 h library") updates the whole board: the gym rotation, your study hours, your to-dos.
- **Claude in the background.** Jobs in `jobs\*.md` run with your Claude Code CLI at the times you choose (or as Claude
  cloud routines) and write small JSON files the cards read. The System card shows each job and a "Run now" button.
- **Change anything by asking.** Open Claude Code in the board folder and say what you want: "add a deadline Friday 12:00",
  "make the news card smaller", "switch the quote to haiku with English translations". `CLAUDE.md` tells Claude how.
- **Your monitor.** On a portrait monitor you get a tall two-column board; on a landscape screen the board fills the
  width with 2 to 5 columns. With two monitors, the Left / Right pills move it.

<details>
<summary>The whole board, landscape and portrait</summary>

![Landscape](screenshots/board-landscape.png)

![Portrait](screenshots/board-portrait.png)

</details>

## The cards

| Card | What you see |
|---|---|
| Daily runs | Your inbox sorted into act now / can wait / FYI, plus the output of your Claude cloud routines, one page at a time |
| Up next, Due, Exams | Today's next event with a progress bar, countdowns to deadlines and exams (retake dates behind "Retake") |
| Coursework, Study | A weekly checklist per course written by Claude from your course folders; one tile per course folder |
| Gym | Today's workout from your rotating plan, Done / Skip, the last 7 days, strength progression, a coach chat |
| Top performers | A progress tracker: what a top-10% person in your cohort has done by now vs you, the path to a top-10% day, an ideal day plan, a check-in chat |
| Life plan | A progress tracker for your goals: one-time steps, daily and weekly habits, the six that matter most, key dates |
| New for you | A daily read-only look at your Gmail and calendar for things that changed |
| Quick capture, Suggested work | Your task list (sorted by Claude) and ideas for what to do next |
| Focus | Pomodoro, timer and stopwatch with templates |
| News & trending | X trends, Google Trends and RSS feeds, each headline scored for you (For you / Impact / Heat) |
| Did you know, Quote of the day, Daily protocol | Five verified facts a day, a quote picked for your day in any language, one science-based health habit |
| Weather, Display, System | Forecast, monitor brightness / contrast and night light, drives, RAM, CPU and antivirus status |

## Privacy

See [Your data stays yours](#your-data-stays-yours). The mail features are read-only (optional reply drafts are off by default; nothing is ever sent). There are no API keys in this repo.

## Files

| | |
|---|---|
| `Board.ps1` | The whole app (Windows PowerShell 5.1 + WPF, one file) |
| `SETUP.md` | The setup guide your AI follows |
| `CLAUDE.md` | How Claude changes the board when you ask |
| `jobs\*.md` | Prompts of the background jobs |
| `examples\` | The shapes of the data files |
| `tools\` | Autostart, night light, demo data, optional icon generators |
| `ui-icons\`, `gym-icons\` | Icons |

Flags: `-Show` opens the board at start, `-Demo` uses the sample data, `-Snapshot <png>` renders it off-screen,
`-Layout portrait|landscape` forces a layout.
