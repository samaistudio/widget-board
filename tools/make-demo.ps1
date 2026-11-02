# Writes a fictional sample setup ("Alex", a student in London) with dates around today, for `Board.ps1 -Demo` and the
# README screenshots. Nothing here is real. Output: -OutDir (default %LOCALAPPDATA%\WidgetBoard-demo\data).
param([string]$OutDir = (Join-Path $env:LOCALAPPDATA 'WidgetBoard-demo\data'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir, (Join-Path $OutDir 'private') | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false
function Put([string]$name, $obj) { [IO.File]::WriteAllText((Join-Path $OutDir $name), ($obj | ConvertTo-Json -Depth 10), $utf8) }
$now = Get-Date; $today = $now.Date
$mon = $today.AddDays(-(([int]$today.DayOfWeek + 6) % 7))
function T([datetime]$d) { $d.ToString('yyyy-MM-ddTHH:mm') }
function D([datetime]$d) { $d.ToString('yyyy-MM-dd') }

Put 'config.json' ([ordered]@{
    name = 'Alex'; language = 'en'
    city = @{ name = 'London'; lat = 51.5074; lon = -0.1278; timezone = 'Europe/London' }
    shortcuts = [ordered]@{ Gmail = 'https://mail.google.com'; Calendar = 'https://calendar.google.com'; Claude = 'shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude'; Downloads = '%USERPROFILE%\Downloads'; Study = '%USERPROFILE%\Documents' }
    app_folders = [ordered]@{ Work = @('Calendar', 'Study', 'Downloads'); Messages = @('Gmail'); Claude = @('Claude') }
    study = @{ root = '%USERPROFILE%\Documents'; modules = @(
        @{ name = 'Linear Algebra'; short = 'LA'; dir = 'Linear Algebra'; slides = 'slides' },
        @{ name = 'Algorithms'; short = 'ALG'; dir = 'Algorithms'; slides = 'slides' },
        @{ name = 'Statistics'; short = 'STAT'; dir = 'Statistics'; slides = 'slides' },
        @{ name = 'Databases'; short = 'DB'; dir = 'Databases'; slides = 'slides' }) }
    exams_title = 'Exams'
    news = @{ country = 'United Kingdom'; trends24 = 'united-kingdom'; google_trends_geo = 'GB'; interests = @('AI and startups', 'tech') }
    cohort = 'second-year computer science students in London'; coach_tone = 'direct'
    todo_lists = @('Study', 'Work', 'Gym', 'Personal', 'Errands'); drives = @('C'); jobs = @{}
})
[IO.File]::WriteAllText((Join-Path $OutDir 'profile.md'), "Alex (fictional demo user): second-year computer science student in London, likes AI, football and cooking.`n", $utf8)

$weekly = @(
    @{ title = 'LA'; kind = 'Lecture'; room = 'Room 101'; d = 0; h = 10; m = 0; min = 90 },
    @{ title = 'ALG'; kind = 'Exercise'; room = 'Room 204'; d = 0; h = 14; m = 0; min = 90 },
    @{ title = 'STAT'; kind = 'Lecture'; room = 'Hall B'; d = 1; h = 12; m = 0; min = 90 },
    @{ title = 'DB'; kind = 'Lab'; room = 'Lab 3'; d = 2; h = 9; m = 0; min = 120 },
    @{ title = 'ALG'; kind = 'Lecture'; room = 'Hall A'; d = 3; h = 10; m = 0; min = 90 },
    @{ title = 'LA'; kind = 'Exercise'; room = 'Room 110'; d = 4; h = 12; m = 0; min = 90 })
# today always gets one class later on, so the demo has an "Up next"
$weekly += @{ title = 'STAT'; kind = 'Exercise'; room = 'Room 305'; d = [int](($today.DayOfWeek + 6) % 7); h = [math]::Min(21, $now.Hour + 1); m = 30; min = 60 }
Put 'schedule.json' ([ordered]@{ holidays = @(); events = @(); weekly = @($weekly | ForEach-Object {
    @{ title = $_.title; kind = $_.kind; room = $_.room; first = (T ($mon.AddDays($_.d - 7).AddHours($_.h).AddMinutes($_.m))); minutes = $_.min; last = (D $today.AddDays(90)) } }) })
Put 'exams.json' @{ items = @(
    @{ name = 'ALG'; sub = 'midterm'; start = (T $today.AddDays(9).AddHours(14)); end = (T $today.AddDays(9).AddHours(15)); room = 'Hall A' },
    @{ name = 'LA'; sub = 'exam'; start = (T $today.AddDays(96).AddHours(9)); end = (T $today.AddDays(96).AddHours(11)); room = 'Main hall'; note = 'Pass 8 of 10 assignments to take the exam.'
       second = @{ start = (T $today.AddDays(131).AddHours(9)); end = (T $today.AddDays(131).AddHours(11)); room = 'Main hall' } },
    @{ name = 'STAT'; sub = 'exam'; start = (T $today.AddDays(100).AddHours(13)); end = (T $today.AddDays(100).AddHours(15)); room = 'Hall B' },
    @{ name = 'DB'; sub = 'project'; start = (T $today.AddDays(80).AddHours(12)); end = (T $today.AddDays(80).AddHours(12)); room = 'online' }) }
Put 'deadlines.json' @{ updated = (D $today); items = @(
    @{ when = (T $today.AddDays(1).AddHours(12)); what = 'LA assignment 3'; note = 'one PDF' },
    @{ when = (T $today.AddDays(3).AddHours(23).AddMinutes(59)); what = 'DB lab report'; note = 'group of 3' },
    @{ when = (T $today.AddDays(6).AddHours(10)); what = 'ALG homework 2'; note = 'online judge' },
    @{ when = (T $today.AddDays(17).AddHours(18)); what = 'Internship application'; note = 'cover letter + CV' }) }
Put 'gym-plan.json' ([ordered]@{ name = 'Demo plan: 3-day full body + rest'
    days = @(
        @{ title = 'Day 1: Push'; focus = 'Chest, shoulders, triceps'; exercises = @(
            @{ name = 'Bench press'; sets = '3 x 6-8'; target = 'Chest' }, @{ name = 'Overhead press'; sets = '3 x 8'; target = 'Shoulders' },
            @{ name = 'Push-ups'; sets = '2 x max'; target = 'Chest, triceps' }, @{ name = 'Plank'; sets = '3 x 40 s'; target = 'Core' }) },
        @{ title = 'Day 2: Pull'; focus = 'Back, biceps'; exercises = @(
            @{ name = 'Pull-ups'; sets = '3 x max'; target = 'Back' }, @{ name = 'Barbell row'; sets = '3 x 8'; target = 'Mid back' },
            @{ name = 'Hammer curls'; sets = '2 x 12'; target = 'Biceps' }) },
        @{ title = 'Day 3: Legs'; focus = 'Legs, glutes'; exercises = @(
            @{ name = 'Back squat'; sets = '3 x 5'; target = 'Quads, glutes' }, @{ name = 'Romanian deadlift'; sets = '3 x 8'; target = 'Hamstrings' },
            @{ name = 'Walking lunges'; sets = '2 x 12'; target = 'Legs' }, @{ name = 'Calf raises'; sets = '3 x 15'; target = 'Calves' }) },
        @{ title = 'Day 4: Rest'; focus = 'Recover'; exercises = @(@{ name = 'Easy walk'; sets = '30 min'; target = 'Recovery' }) })
    rules = @('Warm up 5 minutes before the first lift', 'Add weight when every set reaches the top of the rep range', 'Stop 1-2 reps before failure') })
Put 'gym-log.json' @(@{ date = (D $today.AddDays(-2)); day = 'Day 1: Push'; started = ''; ended = (T $today.AddDays(-2).AddHours(18)); minutes = 55; exercises = @(); note = 'demo' })
Put 'todos.json' @(
    @{ id = 'demo1'; text = 'email tutor about the LA assignment tomorrow 10:00'; title = 'Email tutor about the LA assignment'; kind = 'event'; start = (T $today.AddDays(1).AddHours(10)); end = ''; list = 'Study'; done = $false; created = (T $now) },
    @{ id = 'demo2'; text = 'buy groceries'; title = 'Buy groceries'; kind = 'task'; start = ''; end = ''; list = 'Errands'; done = $false; created = (T $now) },
    @{ id = 'demo3'; text = 'call mum on sunday'; title = 'Call mum'; kind = 'reminder'; start = (D $today.AddDays(((7 - [int]$today.DayOfWeek) % 7))); end = ''; list = 'Personal'; done = $false; created = (T $now) })
Put 'suggestions.json' @{ date = (D $today); items = @(
    @{ id = 's1'; title = 'Do the first two tasks of LA assignment 3'; why = 'It is due tomorrow at noon and tasks 1-2 are the quickest.'; minutes = '45'; area = 'Study'; done = $false },
    @{ id = 's2'; title = 'Update your CV for the internship'; why = 'The application closes in 17 days; the CV is the slowest part.'; minutes = '40'; area = 'Career'; done = $false }) }
$ws = D $mon
Put 'coursework.json' ([ordered]@{ generated = (Get-Date).ToString('s'); week_start = $ws; lecture_week = 3; courses = @(
    @{ module = 'Linear Algebra'; short = 'LA'; focus = 'Eigenvalues and diagonalisation'; summary = 'Read the slides on eigenvalues first, then do assignment 3 tasks 1-4 in order; task 4 needs the result of task 2.'; status = 'deadline soon'; tip = 'Check every eigenvector by multiplying it back.'
       tasks = @(@{ id = 'la-w3-read'; label = 'Read eigenvalue slides'; note = '30 min'; due = '' }, @{ id = 'la-w3-assignment'; label = 'Assignment 3 handed in'; note = 'one PDF'; due = (T $today.AddDays(1).AddHours(12)) }, @{ id = 'la-w3-review'; label = 'Review last week''s feedback'; note = ''; due = '' }); files = @() },
    @{ module = 'Algorithms'; short = 'ALG'; focus = 'Divide and conquer, master theorem'; summary = 'Work through the master theorem examples, then homework 2 on the online judge.'; status = 'on track'; tip = ''
       tasks = @(@{ id = 'alg-w3-hw'; label = 'Homework 2 on the judge'; note = 'online'; due = (T $today.AddDays(6).AddHours(10)) }, @{ id = 'alg-w3-mid'; label = 'Midterm practice set'; note = 'past paper'; due = '' }); files = @() },
    @{ module = 'Statistics'; short = 'STAT'; focus = 'Confidence intervals'; summary = 'Redo the lecture examples in R.'; status = 'on track'; tip = ''
       tasks = @(@{ id = 'stat-w3-r'; label = 'Lecture examples in R'; note = ''; due = '' }); files = @() },
    @{ module = 'Databases'; short = 'DB'; focus = 'Normal forms'; summary = 'Finish the lab report with your group.'; status = 'busy week'; tip = ''
       tasks = @(@{ id = 'db-w3-lab'; label = 'Lab report submitted'; note = 'group of 3'; due = (T $today.AddDays(3).AddHours(23)) }); files = @() }); admin = @() })
$curve = @(7..23 | ForEach-Object { @{ hour = $_; pct = [math]::Round([math]::Max(3, 42 * [math]::Exp(-[math]::Pow(($_ - 14) / 4.5, 2)))) } })
Put 'benchmark.json' ([ordered]@{ generated = (Get-Date).ToString('s'); date = (D $today); label = 'AI estimate'; context = 'Demo data, week 3 of term'
    cohort = @{ name = 'second-year computer science, London'; size = 420; curve = $curve; six_plus_pct = 18; percentiles = @{ p40 = 2.5; p50 = 3.2; p80 = 5.1; p90 = 6.4 }; reasoning = 'Demo numbers.' }
    ideal_day = @{ target_hours = 7; tips = @('Start with the task due first', 'Phone in another room', 'Walk between blocks'); blocks = @(
        @{ start = '07:30'; end = '08:00'; title = 'Wake up, daylight'; kind = 'break'; why = 'Fixed start keeps the day steady.' },
        @{ start = '08:30'; end = '10:00'; title = 'LA assignment 3, tasks 1-2'; kind = 'study'; why = 'Due tomorrow at noon.' },
        @{ start = '10:00'; end = '11:30'; title = 'LA lecture'; kind = 'class'; why = 'Eigenvalues.' },
        @{ start = '12:00'; end = '12:45'; title = 'Lunch'; kind = 'meal'; why = '' },
        @{ start = '13:00'; end = '14:00'; title = 'ALG practice set'; kind = 'study'; why = 'Midterm in 9 days.' },
        @{ start = '14:00'; end = '15:30'; title = 'ALG exercise'; kind = 'class'; why = '' },
        @{ start = '16:00'; end = '17:30'; title = 'DB lab report'; kind = 'study'; why = 'Group deadline in 3 days.' },
        @{ start = '18:00'; end = '19:00'; title = 'Gym: Push'; kind = 'gym'; why = 'Day 1 of the rotation.' },
        @{ start = '19:30'; end = '20:15'; title = 'Dinner'; kind = 'meal'; why = '' },
        @{ start = '20:30'; end = '21:30'; title = 'LA assignment 3, tasks 3-4'; kind = 'study'; why = 'Finish the assignment tonight.' },
        @{ start = '23:00'; end = '23:59'; title = 'Sleep'; kind = 'sleep'; why = '' }) }
    callout = @{ behind = 'LA assignment 3 is due tomorrow. Close the tabs and start task 1.'; on_pace = 'On pace. Keep the streak going.' } })
Put 'facts.json' @{ date = (D $today); facts = @(
    @{ category = 'Science'; fact = 'Octopuses have three hearts: two pump blood through the gills and one through the rest of the body.'; detail = 'The main heart stops while they swim, one reason they prefer crawling.'; source = 'https://www.britannica.com/animal/octopus-mollusk' },
    @{ category = 'History'; fact = 'The first message sent over ARPANET in 1969 was meant to be LOGIN, but the system crashed after LO.'; detail = 'The network was the forerunner of today''s internet.'; source = 'https://www.computerhistory.org/internethistory/1960s/' }) }
Put 'quote.json' @{ date = (D $today); line1 = 'We suffer more often in imagination than in reality.'; line2 = ''; rtl = $false; author = 'Seneca'; translation = ''; source = 'Letters to Lucilius, 13'; why = 'A busy week looks bigger in your head than on paper: start with assignment 3.' }
Put 'protocol.json' @{ date = (D $today); line = 'Get 10 minutes of daylight before your first study block; it sets your focus and sleep for the day.'; source = 'Demo';
    checks = @(@{ id = 'light'; label = 'Did you get morning light?'; by = '09:00' }, @{ id = 'caffeine'; label = 'Delayed caffeine 90 min?'; by = '' }) }
Put 'trends.json' ([ordered]@{ generated = (Get-Date).ToString('s')
    x = @(@{ topic = 'Champions League'; region = 'Worldwide'; posts = '120K posts'; why = 'Matchday results and the table.'; link = ''; for_you = 70; impact = 30; heat = 85 },
          @{ topic = '#AI'; region = 'Worldwide'; posts = '80K posts'; why = 'A new open model release is being compared to the big labs.'; link = ''; for_you = 88; impact = 64; heat = 72 },
          @{ topic = 'London'; region = 'United Kingdom'; posts = '15K posts'; why = 'Weekend events and transit changes.'; link = ''; for_you = 60; impact = 20; heat = 40 })
    everywhere = @(@{ topic = 'Open-source AI'; source = 'Hacker News'; why = 'A long thread on running models locally.'; link = 'https://news.ycombinator.com/'; for_you = 84; impact = 55; heat = 60 })
    ai = @() })
Put 'digest.json' ([ordered]@{ generated = (Get-Date).ToString('o'); headline = 'Demo inbox: one reply is waiting for you and the LA assignment is due tomorrow at noon.'
    urgent = @('Now: reply to your study group about Thursday', ('{0}: LA assignment 3 due at 12:00' -f $today.AddDays(1).ToString('ddd')))
    good_news = @('Your library room booking for Thursday is confirmed'); bad_news = @()
    messages = @{ now = @(@{ id = 'demo-m1'; from = 'Study group'; subject = 'Thursday session'; action = 'Confirm the time for Thursday'; why = 'They are waiting for you'; when = 'today'; link = ''; draft = ''; draft_link = '' })
                  later = @(@{ id = 'demo-m2'; from = 'Career service'; subject = 'CV check slots'; action = 'Book a CV check this week'; why = 'Slots fill up'; when = 'yesterday'; link = ''; draft = ''; draft_link = '' }); fyi = @() }
    sections = @(@{ routine = 'Morning brief (demo)'; title = 'Busy week, two deadlines'; importance = 4; ranAt = (Get-Date).AddHours(-2).ToString('s'); status = 'succeeded'; summary = 'Demo routine output.'; bullets = @('LA assignment 3 due tomorrow', 'DB lab report in 3 days'); full = 'Demo routine output.'; link = '' }) })
Put 'private\life-plan.json' ([ordered]@{
    areas = @(
        @{ name = 'Health'; items = @(@{ id = 'h-sleep'; title = 'In bed by 23:30'; kind = 'daily'; due = ''; note = '' }, @{ id = 'h-walk'; title = '8k steps'; kind = 'daily'; due = ''; note = '' }, @{ id = 'h-doctor'; title = 'Book a check-up'; kind = 'once'; due = (D $today.AddDays(20)); note = '' }) },
        @{ name = 'Study'; items = @(@{ id = 's-library'; title = 'Three library mornings'; kind = 'weekly'; due = ''; note = '' }, @{ id = 's-plan'; title = 'Make an exam plan'; kind = 'once'; due = ''; note = '' }) },
        @{ name = 'Career'; items = @(@{ id = 'c-cv'; title = 'Update CV'; kind = 'once'; due = ''; note = '' }, @{ id = 'c-apply'; title = 'Send 3 applications'; kind = 'weekly'; due = ''; note = '' }) })
    top = @(@{ n = 1; title = 'Pass the midterm'; items = @('s-plan') }, @{ n = 2; title = 'Land an internship'; items = @('c-cv', 'c-apply') })
    key_dates = @(@{ title = 'ALG midterm'; date = (D $today.AddDays(9)) })
    principles = @('Small first steps', 'Finish before starting something new') })
Put 'private\life-update.json' ([ordered]@{ date = (D $today); generated = (Get-Date).ToString('s'); news = @(
    @{ title = 'Library room booked for Thursday'; detail = 'Group room 2, 14:00 to 16:00. Bring your student card.'; kind = 'study'; urgency = 'soon'; link = '' },
    @{ title = 'CV check slots open this week'; detail = 'The career service has free 20-minute slots until Friday.'; kind = 'career'; urgency = 'fyi'; link = '' }) })
"demo data written to $OutDir"
