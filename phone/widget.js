// Widget Board for Scriptable (iPhone), also run on Android by phone/android/shim.js. Loaded by phone/loader.js.
// Lock screen (inline, rectangular, circular) and home screen (small, medium, large) widgets, plus a full app view.
// Data: phone.json and friends from YOUR private data repo (written by the PC board and the cloud job). The repo name
// and a fine-grained token for it are kept in the phone's Keychain (or the browser on Android), never in this file.

const KEY = "board_token", REPO_KEY = "board_repo"
let REPO = Keychain.contains(REPO_KEY) ? Keychain.get(REPO_KEY) : ""
// the public code repo: the body map artwork is read from here (no token needed)
const CODE = "samaistudio/widget-board"
const BOARD_URL = ""   // empty = tapping a widget opens this script's app view
const fm = FileManager.local()
const cacheDir = fm.joinPath(fm.documentsDirectory(), "widget-board")
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir)

const C = { bg: new Color("#0B0B0E"), card: new Color("#1C1C21"), text: new Color("#F2F2F5"), dim: new Color("#A1A1AA"),
  faint: new Color("#6B6B73"), mint: new Color("#4CCF7A"), amber: new Color("#F2A33A"), coral: new Color("#F26B5E"),
  sky: new Color("#4A9CF2"), violet: new Color("#B07EE6") }

// ---------------------------------------------------------------- data
async function getFile(name) {
  const cache = fm.joinPath(cacheDir, name.replace(/\//g, "_"))
  const token = Keychain.contains(KEY) ? Keychain.get(KEY) : ""
  if (token && REPO) {
    try {
      const r = new Request(`https://api.github.com/repos/${REPO}/contents/${name}?ref=main&t=${Date.now()}`)
      r.headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json", "User-Agent": "WidgetBoard", "Cache-Control": "no-cache" }
      r.timeoutInterval = config.runsInApp ? 15 : 6
      const s = await r.loadString()
      if (r.response && r.response.statusCode === 200) { fm.writeString(cache, s); return JSON.parse(s) }
    } catch (e) { }
  }
  if (fm.fileExists(cache)) { try { return JSON.parse(fm.readString(cache)) } catch (e) { } }
  return null
}
// public files of the code repo (no token); on Android the app sits next to them
async function getAsset(name) {
  const cache = fm.joinPath(cacheDir, name.replace(/\//g, "_"))
  try {
    const url = typeof window !== "undefined" && window.location ? new URL("../../" + name, window.location.href).href : `https://raw.githubusercontent.com/${CODE}/main/${name}`
    const r = new Request(url); r.timeoutInterval = 15
    const t = await r.loadString()
    if (r.response && r.response.statusCode === 200) { fm.writeString(cache, t); return JSON.parse(t) }
  } catch (e) { }
  if (fm.fileExists(cache)) { try { return JSON.parse(fm.readString(cache)) } catch (e) { } }
  return null
}
const d = s => s ? new Date(s.length <= 10 ? s + "T00:00" : s) : null
const hm = dt => { const z = n => String(n).padStart(2, "0"); return `${z(dt.getHours())}:${z(dt.getMinutes())}` }
const sameDay = (a, b) => a.toDateString() === b.toDateString()
function dayWord(dt) {
  const now = new Date(), t = new Date(now); t.setDate(now.getDate() + 1)
  if (sameDay(dt, now)) return "Today"; if (sameDay(dt, t)) return "Tomorrow"
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}
function until(dt) {
  const m = Math.round((dt - new Date()) / 60000)
  if (m < 60) return `${Math.max(1, m)} min`
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
  return `${Math.floor(m / 1440)}d`
}
function model(p, g, gone = {}, dgDone = {}) {
  const now = new Date(); gone = gone || {}; dgDone = dgDone || {}
  if (p) {
    p.todos = (p.todos || []).filter(t => !gone["todo:" + t.id])
    p.deadlines = (p.deadlines || []).filter(x => !gone["due:" + x.when + "|" + x.what])
    for (const gr of p.coursework || []) for (const it of gr.items || []) if (gone["cw:" + it.ref]) it.done = true
  }
  const cls = (p?.schedule || []).map(x => ({ ...x, s: d(x.start), e: d(x.end) })).filter(x => x.e > now)
  const cur = cls.find(x => x.s <= now && x.e > now) || null
  const next = cls.find(x => x.s > now) || null
  const today = cls.filter(x => sameDay(x.s, now))
  const dls = (p?.deadlines || []).map(x => ({ ...x, w: d(x.when) })).filter(x => x.w > now)
  const live = q => q && !(q.id && (gone["msg:" + q.id] || dgDone["msg:" + q.id]))
  const msgs = { now: (g?.messages?.now || []).filter(live), later: (g?.messages?.later || []).filter(live), fyi: (g?.messages?.fyi || []).filter(live) }
  // days since a muscle was trained, counted from today on the phone (the PC's number is from when it wrote the file)
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (p?.muscles) p.muscles = p.muscles.map(x => ({ ...x, days: x.last ? Math.round((today0 - d(x.last)) / 864e5) : 999 }))
  const behind = (p?.muscles || []).filter(m => m.days >= 7).sort((a, b) => b.days - a.days)
  return { cur, next, today, cls, dls, msgs, behind, p, g }
}

// ---------------------------------------------------------------- widgets
function txt(stack, s, size, color, weight) {
  const t = stack.addText(s); t.font = weight === "b" ? Font.semiboldSystemFont(size) : weight === "h" ? Font.boldSystemFont(size) : Font.systemFont(size)
  t.textColor = color || C.text; t.lineLimit = 1; t.minimumScaleFactor = 0.7; return t
}
function relDate(stack, dt, size, color) { const t = stack.addDate(dt); t.applyRelativeStyle(); t.font = Font.semiboldSystemFont(size); t.textColor = color; t.lineLimit = 1; return t }
function classLine(x) { return `${x.title} ${x.kind}`.trim() }

// short labels for the lock screen
const room = s => (s || "").replace(/\s*\(.*\)\s*$/, "").replace(/^Lecture hall\s*/i, "")
const dayShort = dt => { const t = new Date(); t.setDate(t.getDate() + 1); return sameDay(dt, new Date()) ? "Today" : sameDay(dt, t) ? "Tomorrow" : dt.toLocaleDateString("en-GB", { weekday: "long" }) }
const dueShort = dt => dt - new Date() < 6 * 864e5 ? dt.toLocaleDateString("en-GB", { weekday: "short" }) + (dt.getHours() ? " " + hm(dt) : "") : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
// the line above the clock: only the next class, short enough to fit
function lockInline(w, m) {
  const x = m.cur || m.next
  if (!x) { w.addText("No classes soon"); return }
  const day = m.cls.filter(c => sameDay(c.s, x.s) && c.e > new Date())
  const at = c => c.s.getMinutes() ? hm(c.s) : String(c.s.getHours())
  const rest = m.cur ? day.filter(c => c.s > x.s) : day
  const tail = rest.length > 1 ? ` · ${rest.length}× ${rest.map(at).join(",")}` : rest.length === 1 && m.cur ? ` · next ${at(rest[0])}` : room(x.room) ? " · " + room(x.room).split(/[ ,]/)[0] : ""
  w.addText(`${x.title} ${m.cur ? "ends " : ""}${countdown(m.cur ? x.e : x.s)}${tail}`)
}
// "in 21h", "in 3h 20m", "in 45m" (the lock screen redraws about every 15 minutes, so minutes are rounded to 5)
function countdown(t) {
  const mins = Math.max(0, Math.round((t - new Date()) / 60000))
  if (mins < 60) return `in ${Math.max(5, Math.round(mins / 5) * 5)}m`
  if (mins >= 1440) { const dd = Math.floor(mins / 1440), hh = Math.round((mins % 1440) / 60); return hh ? (hh === 24 ? `in ${dd + 1}d` : `in ${dd}d ${hh}h`) : `in ${dd}d` }
  const h = Math.floor(mins / 60), mm = Math.round((mins % 60) / 5) * 5
  return h >= 10 || !mm || mm === 60 ? `in ${mm === 60 ? h + 1 : h}h` : `in ${h}h ${mm}m`
}
// rectangular lock widgets show different things, picked by the widget's Parameter (long-press the lock screen,
// Customize, tap the widget): empty or "class" = the next class day, "day" = changes with the time of day (see lockDay)
function lockRect(w, m) {
  const page = (args.widgetParameter || "class").trim().toLowerCase()
  if (page === "day") return lockDay(w, m)
  w.url = openLink("cw")
  const x = m.cur || m.next
  const modOf = c => c && Object.keys(ABBR).find(k => ABBR[k].toLowerCase() === String(c.title).split(" ")[0].toLowerCase())
  // your courses (not the one-time lists), the one with the next class first
  const order = [modOf(x), ...m.cls.filter(c => x && c.s > x.s).map(modOf)]
  const groups = (m.p?.coursework || []).filter(g => !g.once && (g.items || []).length)
    .sort((a, b) => (order.indexOf(a.course) + 1 || 99) - (order.indexOf(b.course) + 1 || 99))
  const ex = (m.p?.exams || []).map(e => ({ ...e, s: d(e.start) })).find(e => e.s > new Date())
  const row = w.addStack(); row.centerAlignContent()
  const col = row.addStack(); col.layoutVertically(); col.spacing = 2
  // column widths for a 172 pt wide widget, scaled to this phone (devices.json -> phone.json meta.lock)
  const k = lockW(m) / 172, W = [30, 25, 26, 29].map(v => Math.round(v * k))
  const cells = (vals, size, colors, weight) => {
    const r = col.addStack(); r.centerAlignContent()
    vals.forEach((v, i) => { const c = r.addStack(); c.size = new Size(W[i], 0); const t = txt(c, v, size, colors[i], weight); t.minimumScaleFactor = 0.5; c.addSpacer() })
  }
  cells(["", "WEEK", "NEXT", "EXAM"], 7.5, [LDIM, LDIM, LDIM, LDIM], "h")
  const all = (m.p?.exams || []).map(e => ({ ...e, s: d(e.start) })).filter(e => e.s > new Date())
  const days = e => e ? Math.ceil((e.s - new Date()) / 864e5) + "d" : "–"
  for (const g of groups.slice(0, 4)) {
    const ab = abbr(g.course), done = g.items.filter(i => i.done).length
    const mine = all.filter(e => e.name.split(" ")[0] === ab), exam = mine.find(e => /exam/i.test(e.sub || "")), next = mine.find(e => e !== exam)
    cells([ab, `${done}/${g.items.length}`, next ? days(next) : "–", days(exam)], 11, [null, done === g.items.length ? null : LDIM, next ? null : LDIM, LDIM], "h")
  }
  row.addSpacer()
  if (ex) {
    const right = row.addStack(); right.layoutVertically(); right.centerAlignContent()
    // the ring fills from the start of term (config "term.start") to the test; without it, over the last 60 days
    const ts = d(m.p?.meta?.term_start), start = ts && ts < ex.s ? ts : new Date(ex.s - 60 * 864e5), days = Math.ceil((ex.s - new Date()) / 864e5)
    const img = right.addImage(ring(Math.min(1, Math.max(0, (new Date() - start) / (ex.s - start))), `${days}d`)); img.imageSize = new Size(Math.round(46 * k), Math.round(46 * k))
    const lab = right.addStack(); lab.size = new Size(54, 0); const t = txt(lab, ex.name.toUpperCase(), 8, LDIM, "h"); t.centerAlignText(); t.minimumScaleFactor = 0.6
  }
}
// width of the rectangular lock widget in points
function lockW(m) { const w = +m.p?.meta?.lock?.w; if (w > 100) return w; try { return Math.round(Device.screenSize().width * 0.4) } catch (e) { return 160 } }
// the countdown ring, drawn as an image (the lock screen tints them)
function ring(p, label) {
  const S = 100, c = new DrawContext(); c.size = new Size(S, S); c.opaque = false; c.respectScreenScale = true
  const arc = (from, to) => { const pts = [], R = 42; for (let a = from; a <= to + 0.001; a += 0.05) pts.push(new Point(S / 2 + R * Math.sin(a), S / 2 - R * Math.cos(a))); const q = new Path(); q.addLines(pts); return q }
  c.setLineWidth(10)
  c.setStrokeColor(new Color("#FFFFFF", 0.25)); c.addPath(arc(0, 2 * Math.PI)); c.strokePath()
  if (p > 0.01) { c.setStrokeColor(Color.white()); c.addPath(arc(0, 2 * Math.PI * p)); c.strokePath() }
  c.setFont(Font.boldSystemFont(label.length > 3 ? 24 : 30)); c.setTextColor(Color.white()); c.setTextAlignedCenter()
  c.drawTextInRect(label, new Rect(0, S / 2 - 18, S, 40))
  return c.getImage()
}
// one line: a dim tag, then the item
const LDIM = new Color("#FFFFFF", 0.55)
function lrow(w, tag, text, bold, small) {
  const r = w.addStack(); r.centerAlignContent(); r.spacing = 5
  if (tag) { const tg = r.addStack(); tg.size = new Size(34, 0); const a = txt(tg, tag.trim(), 9.5, LDIM, "h"); a.minimumScaleFactor = 0.6; tg.addSpacer() }
  const s = txt(r, text, small ? 10 : 11, small ? new Color("#FFFFFF", 0.8) : null, bold ? "h" : "b"); s.minimumScaleFactor = 0.75
  r.addSpacer()
  return r
}
// the "day" widget changes with the time of day: the class part (first class, free time, now, tomorrow), then the gym
// day and its exercises, then the weather. Never more than four rows.
// short course names come from the data (coursework[].abbr, from "short" in the board's config), else the initials
const ABBR = {}
const abbr = name => ABBR[name] || String(name || "").split(/\s+/).filter(Boolean).map(w => w[0]).join("").toUpperCase()
function wxLine(j) {
  const c = j?.current; if (!c) return ""
  const now = Date.now(), t = j.hourly?.time || [], p = j.hourly?.precipitation_probability || []
  let best = -1, at = null
  for (let i = 0; i < t.length; i++) { const tt = new Date(t[i]); if (tt - now > -36e5 && tt - now < 12 * 36e5 && p[i] > best) { best = p[i]; at = tt } }
  return `${Math.round(c.temperature_2m)}° feels ${Math.round(c.apparent_temperature)}°` + (best >= 40 ? ` · rain ${best}% ${at.getHours()}h` : " · dry")
}
function lockDay(w, m) {
  const now = new Date(), h = now.getHours(), gym = m.p?.gym || {}, ses = gym.session || {}
  // a session counts as running when it was started after it was last ended
  const training = !!ses.started && (!ses.ended || d(ses.started) > d(ses.ended)) && now - d(ses.started) < 3 * 36e5, gymDone = !training && (!!ses.ended || gym.done_today)
  const cls = c => `${c.title}${room(c.room) ? " · " + room(c.room).split(/[ ,]/)[0] : ""}`
  const nx = m.next, today = nx && sameDay(nx.s, now)
  // 1. the class part, depending on the time of day
  if (m.cur) lrow(w, "NOW", `${cls(m.cur)} till ${hm(m.cur.e)}`, true)
  else if (today && h < 11) lrow(w, "FIRST", `${hm(nx.s)} ${cls(nx)}`, true)
  else if (today) { const gap = Math.round((nx.s - now) / 60000)
    lrow(w, gap >= 45 ? "FREE" : "NEXT", gap >= 45 ? `${Math.floor(gap / 60) ? Math.floor(gap / 60) + "h " : ""}${gap % 60}m, then ${nx.title} ${hm(nx.s)}` : `${hm(nx.s)} ${cls(nx)}`, true) }
  else if (nx) lrow(w, sameDay(nx.s, new Date(now.getTime() + 864e5)) ? "TMRW" : nx.s.toLocaleDateString("en-GB", { weekday: "short" }), `${hm(nx.s)} ${cls(nx)}`, true)
  // 2. gym: the day, then its exercises
  if (training) {
    const r = w.addStack(); r.centerAlignContent(); r.spacing = 5
    const tg = r.addStack(); tg.size = new Size(34, 0); txt(tg, "GYM", 9.5, LDIM, "h"); tg.addSpacer()
    txt(r, "in session", 11, null, "h")
    const t = r.addDate(d(ses.started)); t.applyTimerStyle(); t.font = Font.boldSystemFont(11); t.lineLimit = 1; t.leftAlignText()
  }
  else lrow(w, "GYM", gymDone ? "done today" : (gym.next || "no plan").replace(/^Day \d+:\s*/, "").replace(/\s+and\s+/g, " + "), true)
  if (!gymDone && (gym.exercises || []).length)
    lrow(w, " ", gym.exercises.map(e => `${e.name.replace(/\s*\(.*?\)|,.*$/g, "").split(" ").slice(0, 2).join(" ")} ${parseInt(e.sets) || ""}`.trim()).join(" · "), false, true)
  // 3. weather: the temperature as the tag
  const c = m.wx?.current
  if (c) lrow(w, `${Math.round(c.temperature_2m)}°`, wxLine(m.wx).replace(/^\S+ /, ""))
  w.url = openLink(training || (h >= 11 && h < 20) ? "gym" : "cls")
}
// weather for the city in the board's config, kept for 30 minutes (free, no key, the PC is not needed)
async function getWeather(meta) {
  const lat = +meta?.lat, lon = +meta?.lon; if (!isFinite(lat) || !isFinite(lon) || (!lat && !lon)) return null
  const f = fm.joinPath(cacheDir, "weather.json")
  try { if (fm.fileExists(f) && Date.now() - fm.modificationDate(f).getTime() < 30 * 60000) return JSON.parse(fm.readString(f)) } catch (e) { }
  try {
    const r = new Request(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature&hourly=precipitation_probability&forecast_days=2&timezone=${encodeURIComponent(meta?.timezone || "auto")}`)
    r.timeoutInterval = 8; const j = await r.loadJSON(); if (j?.current) { fm.writeString(f, JSON.stringify(j)); return j }
  } catch (e) { }
  try { return JSON.parse(fm.readString(f)) } catch (e) { return null }
}
function lockCircle(w, m) {
  const x = m.cur || m.next
  w.addAccessoryWidgetBackground = true
  const s = w.addStack(); s.layoutVertically(); s.centerAlignContent()
  if (!x) { txt(s, "—", 16, null, "h"); return }
  const mins = Math.round(((m.cur ? x.e : x.s) - new Date()) / 60000)
  txt(s, mins < 100 ? `${Math.max(1, mins)}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`, 16, null, "h").centerAlignText()
  txt(s, x.title, 11, null).centerAlignText()
}
// home screen: square tiles. Tapping a tile opens the full view with that card already open.
const openLink = (id, item) => BOARD_URL || `${URLScheme.forRunningScript()}?open=${id}${item !== undefined ? "&item=" + encodeURIComponent(item) : ""}`
function hero(parent, m, big, w) {
  const x = m.cur || m.next
  const h = parent.addStack(); h.layoutVertically(); h.url = openLink("cls")
  if (w) { h.size = new Size(w, 0); h.setPadding(12, 13, 12, 13); h.cornerRadius = 18
    const g = new LinearGradient(); g.colors = [new Color("#16223A"), new Color("#0E1118")]; g.locations = [0, 1]; h.backgroundGradient = g }
  txt(h, m.cur ? "NOW" : "UP NEXT", 10, m.cur ? C.mint : C.sky, "h")
  if (!x) { txt(h, "No classes soon", big ? 20 : 16, C.text, "h"); return h }
  const t = txt(h, classLine(x), big ? 22 : 17, C.text, "h"); t.lineLimit = big ? 1 : 2
  const r = h.addStack(); r.centerAlignContent()
  if (m.cur) { txt(r, "ends ", big ? 15 : 13, C.mint, "b"); relDate(r, x.e, big ? 15 : 13, C.mint) }
  else if (sameDay(x.s, new Date())) { relDate(r, x.s, big ? 15 : 13, C.mint); txt(r, `  ${hm(x.s)}`, big ? 13 : 12, C.dim) }
  else txt(r, `${dayWord(x.s)} ${hm(x.s)}`, big ? 15 : 13, C.amber, "b")
  if (x.room) txt(h, x.room, 11, C.faint)
  return h
}
function tile(parent, w, h, title, color, id) {
  const t = parent.addStack(); t.layoutVertically(); t.size = new Size(w, h); t.setPadding(10, 11, 10, 11)
  t.cornerRadius = 16; t.backgroundColor = C.card; t.url = openLink(id)
  txt(t, title, 10, color, "h"); t.addSpacer(5); return t
}
function home(w, m, size) {
  w.backgroundColor = C.bg; w.url = openLink("cls")
  const now = new Date(), n = m.msgs.now.length, l = m.msgs.later.length, dl = m.dls[0]
  const dueCol = q => q.w - now < 864e5 ? C.coral : q.w - now < 3 * 864e5 ? C.amber : C.mint
  if (size === "small") {
    w.setPadding(13, 13, 12, 13)
    hero(w, m, false); w.addSpacer()
    const r = w.addStack(); r.centerAlignContent()
    if (n) { txt(r, `● ${n}`, 12, C.coral, "h"); r.addSpacer(8) }
    if (dl) { const s = txt(r, `${until(dl.w)} ${dl.what}`, 11, dueCol(dl), "b"); s.minimumScaleFactor = 0.6 }
    return
  }
  // widget size from the screen width (large and medium are about 86% of it, large is nearly square)
  const W = Math.round(Device.screenSize().width * 0.865), pad = 10, gap = 8, iw = W - 2 * pad, tw = Math.floor((iw - gap) / 2)
  w.setPadding(pad, pad, pad, pad)
  if (size === "medium") {
    const row = w.addStack(); row.layoutHorizontally()
    hero(row, m, false, tw); row.addSpacer(gap)
    const t = tile(row, tw, 0, "MESSAGES", C.coral, "msg")
    txt(t, n ? `${n} need you` : "Nothing urgent", 14, n ? C.text : C.dim, "h"); if (l) txt(t, `${l} can wait`, 12, C.dim)
    t.addSpacer(); if (dl) { txt(t, dl.what, 12, C.text, "b"); txt(t, until(dl.w), 11, dueCol(dl), "b") }
    return
  }
  // large: one page per widget, picked by the widget's Parameter (stack several and swipe between them)
  const page = (args.widgetParameter || "today").trim().toLowerCase()
  largePage(w, m, page, { W, pad, gap, iw, tw, now, dueCol })
  // every page in the stack ends with a way into the chat (the gym page goes to the coach)
  if (page !== "today") {
    const f = w.addStack(); f.centerAlignContent(); f.url = openLink(page === "gym" ? "gym" : "talk")
    f.addSpacer(); txt(f, page === "gym" ? "Log with your coach  ›" : "Talk to Claude  ›", 12, page === "gym" ? C.amber : C.violet, "h")
  }
}
const PAGES = { today: 1, body: 1, gym: 1, tasks: 1, week: 1, messages: 1, due: 1 }
function pageHead(w, title, color, sub, id) {
  const h = w.addStack(); h.centerAlignContent(); h.url = openLink(id)
  txt(h, title, 13, color, "h"); h.addSpacer(); if (sub) txt(h, sub, 11, C.dim, "b")
  w.addSpacer(8)
}
function row(w, left, right, rightCol, leftCol, url) {
  const r = w.addStack(); r.centerAlignContent(); if (url) r.url = url
  const a = txt(r, left, 13, leftCol || C.text, "b"); a.minimumScaleFactor = 0.65
  r.addSpacer(6); if (right) txt(r, right, 12, rightCol || C.dim, "b")
  w.addSpacer(6); return r
}
// next exams as a strip of countdown chips
function examStrip(w, m, iw) {
  const ex = (m.p?.exams || []).map((e, i) => ({ ...e, i, s: d(e.start) })).filter(e => e.s > new Date()).slice(0, 3)
  if (!ex.length) return 0
  const r = w.addStack(); r.layoutHorizontally(); r.centerAlignContent()
  for (const e of ex) {
    const c = r.addStack(); c.centerAlignContent(); c.setPadding(4, 9, 4, 9); c.cornerRadius = 10; c.backgroundColor = new Color("#F2A33A", 0.14); c.url = openLink("ex", e.i)
    const days = Math.ceil((e.s - new Date()) / 864e5)
    txt(c, e.name, 11, C.text, "b"); c.addSpacer(5); txt(c, days + "d", 11, days <= 14 ? C.coral : C.amber, "h"); r.addSpacer(6)
  }
  return 1
}
function largePage(w, m, page, g) {
  if (!PAGES[page]) page = "today"
  const { iw, tw, gap, now } = g, todos = m.p?.todos || [], gym = m.p?.gym
  const mus = (m.p?.muscles || []).slice().sort((a, b) => a.days - b.days)
  const ago = d => d >= 999 ? "never" : d === 0 ? "today" : d === 1 ? "yesterday" : d + " d ago"
  if (page === "today") {
    // calm first page: class, the rest of today, gym, tasks and the chat button. No messages or deadlines here.
    hero(w, m, true, iw); w.addSpacer(gap)
    const strip = examStrip(w, m, iw); if (strip) w.addSpacer(gap)
    const th = Math.floor((g.W * 1.04 - 2 * g.pad - 2 * gap - 112 - (strip ? 22 + gap : 0)) / 2)
    const r1 = w.addStack(); r1.layoutHorizontally()
    const later = m.today.filter(c => c !== (m.cur || m.next) && c.s > now)
    const tl = tile(r1, tw, th, "LATER TODAY", C.sky, "cls"); r1.addSpacer(gap)
    if (later.length) for (const c of later.slice(0, 3)) { const rr = tl.addStack(); txt(rr, hm(c.s), 11, C.dim, "b"); rr.addSpacer(5); txt(rr, c.title, 11, C.text, "b"); tl.addSpacer(2) }
    else txt(tl, "Nothing else today", 12, C.mint, "b")
    tl.addSpacer()
    const tg = tile(r1, tw, th, "GYM", C.amber, "gym"), ses = gym?.session || {}
    if (gym?.next) { const a = txt(tg, gym.next.replace(/^Day \d+:\s*/, ""), 15, C.text, "h"); a.lineLimit = 2; txt(tg, gym.next.match(/^Day \d+/)?.[0] || "", 11, C.dim, "b") }
    tg.addSpacer()
    if (ses.started && !ses.ended) { const rr = tg.addStack(); txt(rr, "In session ", 11, C.mint, "b"); const t = rr.addDate(d(ses.started)); t.applyTimerStyle(); t.font = Font.semiboldSystemFont(11); t.textColor = C.mint }
    else txt(tg, ses.ended ? "Done today" : gym?.done_today ? "Done today" : "Tap to start", 11, ses.ended || gym?.done_today ? C.mint : C.amber, "b")
    w.addSpacer(gap)
    const r2 = w.addStack(); r2.layoutHorizontally()
    const tt = tile(r2, tw, th, "TASKS", C.violet, "tasks"); r2.addSpacer(gap)
    const rc = tt.addStack(); rc.bottomAlignContent(); txt(rc, `${todos.length}`, 22, C.violet, "h"); rc.addSpacer(5); txt(rc, "open", 11, C.dim); tt.addSpacer(4)
    if (todos[0]) { const a = txt(tt, todos[0].title, 11, C.text, "b"); a.lineLimit = 2 }
    tt.addSpacer()
    const tc = tile(r2, tw, th, "TALK TO CLAUDE", C.violet, "talk"); tc.backgroundColor = new Color("#2A2140")
    const a = txt(tc, "Tell it what you did or what to change", 12, C.text, "b"); a.lineLimit = 3
    tc.addSpacer(); txt(tc, "Tap to write  ›", 11, C.violet, "h")
    return
  }
  if (page === "body") {
    const trained = mus.filter(b => b.days < 7).length
    pageHead(w, "BODY", C.mint, `${trained} of ${mus.length} this week`, "body")
    const cw = Math.floor((iw - 2 * 6) / 3)
    for (let i = 0; i < mus.length && i < 18; i += 3) {
      const r = w.addStack(); r.layoutHorizontally()
      for (const b of mus.slice(i, i + 3)) {
        const c = r.addStack(); c.layoutVertically(); c.size = new Size(cw, 40); c.setPadding(5, 8, 5, 8); c.cornerRadius = 10
        const col = new Color(heat(b.days)); c.backgroundColor = new Color(heat(b.days), 0.16); c.url = openLink("body", b.key)
        txt(c, b.name, 11, col, "h"); txt(c, ago(b.days), 10, C.dim); r.addSpacer(6)
      }
      w.addSpacer(5)
    }
    w.addSpacer(); return
  }
  if (page === "gym") {
    const ses = gym?.session || {}, E = ses.entries || [], kc = E.reduce((a, e) => a + (+e.kcal || 0), 0)
    if (ses.started && !ses.ended) {
      pageHead(w, "GYM", C.amber, kc ? kc + " kcal" : "in session", "gym")
      const r = w.addStack(); r.centerAlignContent(); r.url = openLink("gym"); txt(r, "In session ", 18, C.text, "h")
      const t = r.addDate(d(ses.started)); t.applyTimerStyle(); t.font = Font.boldSystemFont(18); t.textColor = C.mint
      w.addSpacer(8)
      for (const e of E.slice(-6)) row(w, e.name, e.kcal ? e.kcal + " kcal" : [e.sets ? e.sets + " sets" : "", e.minutes ? e.minutes + " min" : ""].filter(Boolean).join(" "), e.kcal ? C.amber : C.dim)
      if (!E.length) txt(w, "Tap to tell your coach what you are doing", 13, C.dim)
      w.addSpacer(); return
    }
    pageHead(w, "GYM", C.amber, ses.ended ? "done today" : "", "gym")
    if (ses.ended) {
      const mins = Math.round((d(ses.ended) - d(ses.started)) / 60000)
      txt(w, mins + " min" + (kc ? " · " + kc + " kcal" : ""), 20, C.mint, "h"); w.addSpacer(6)
      for (const e of E.slice(0, 7)) row(w, e.name, e.kcal ? e.kcal + " kcal" : e.sets ? e.sets + " sets" : "", e.kcal ? C.amber : C.dim)
      w.addSpacer(); return
    }
    txt(w, "What are you doing today?", 18, C.text, "h"); w.addSpacer(4)
    txt(w, "Plan: " + (gym?.next || "none"), 13, C.amber, "b"); w.addSpacer(8)
    for (const x of (gym?.exercises || []).slice(0, 5)) row(w, x.name, x.sets, C.dim)
    const last = mus.filter(b => b.days < 999).slice(0, 3)
    if (m.behind.length) txt(w, "Neglected: " + m.behind.slice(0, 3).map(b => b.name).join(", "), 11, C.coral, "b")
    w.addSpacer(); return
  }
  if (page === "tasks") {
    pageHead(w, "TASKS", C.violet, `${todos.length} open`, "tasks")
    for (const q of todos.slice(0, 9)) row(w, q.title, q.start ? dayWord(d(q.start)) : "", C.dim, null, openLink("tasks", q.id))
    if (!todos.length) txt(w, "Nothing open", 14, C.mint, "b")
    w.addSpacer(); return
  }
  if (page === "week") {
    pageHead(w, "NEXT CLASSES", C.sky, "", "cls")
    let last = "", n = 0
    for (const c of m.cls) { const dw = dayWord(c.s); if (dw !== last) { if (n >= 9) break; txt(w, dw.toUpperCase(), 10, C.sky, "h"); w.addSpacer(3); last = dw; n++ }
      row(w, `${hm(c.s)}  ${classLine(c)}`, c.room ? c.room.split(",")[0] : "", C.faint, null, openLink("cls", c.start)); if (++n >= 11) break }
    w.addSpacer(); return
  }
  if (page === "messages") {
    const N = m.msgs.now, L = m.msgs.later
    pageHead(w, "MESSAGES", C.coral, m.g?.generated ? "updated " + hm(new Date(m.g.generated)) : "", "msg")
    if (!N.length && !L.length) { txt(w, "Nothing needs you", 15, C.mint, "h"); w.addSpacer(); return }
    for (const q of N.slice(0, 4)) { const s = w.addStack(); s.layoutVertically(); s.url = openLink("msg", q.id)
      txt(s, q.from, 12, C.coral, "h"); const t = txt(s, q.subject, 12, C.text); w.addSpacer(6) }
    if (L.length) { txt(w, `${L.length} CAN WAIT`, 10, C.amber, "h"); w.addSpacer(3); for (const q of L.slice(0, 6 - Math.min(4, N.length))) row(w, q.from, "", null, C.dim, openLink("msg", q.id)) }
    w.addSpacer(); return
  }
  if (page === "due") {
    pageHead(w, "DUE", C.amber, `${m.dls.length} coming`, "due")
    m.dls.slice(0, 7).forEach((q, i) => row(w, q.what, until(q.w), g.dueCol(q), null, openLink("due", i)))
    const ex = (m.p?.exams || []).slice(0, 2)
    if (ex.length) { w.addSpacer(4); txt(w, "EXAMS", 10, C.amber, "h"); w.addSpacer(3); ex.forEach((e, i) => row(w, e.name, Math.ceil((d(e.start) - now) / 864e5) + "d", C.amber, null, openLink("ex", i))) }
    w.addSpacer()
  }
}

// ---------------------------------------------------------------- full view in the app (dark cards; each one folds, one open at a time)
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const BODY_TAG = (v, x) => ({ chest: "chest", abs: "abs", obliques: "abs", biceps: "biceps", triceps: "triceps", trapezius: "traps",
  deltoids: v === "front" ? "front_delts,side_delts" : "rear_delts,side_delts", adductors: "adductors", quadriceps: "quads", tibialis: "calves", calves: "calves", forearm: "forearms",
  "upper-back": (x.side === "left" && +x.i === 1) || (x.side === "right" && +x.i === 2) ? "lats" : "upper_back", "lower-back": "lower_back", gluteal: "glutes", hamstring: "hamstrings", hair: "-" })[x.slug] || ""
function lastWorkout(m) {
  const mus = (m.p?.muscles || []).filter(x => x.last), top = mus.map(x => x.last).sort().pop()
  const plan = (Array.isArray(m.glog) ? m.glog : m.glog?.items || []).slice(-1)[0]
  if (top && (!plan || top >= plan.date)) return { date: top, day: mus.filter(x => x.last === top).map(x => x.name).join(", ") }
  return plan ? { date: plan.date, day: plan.day } : null
}
function bodySvg(m) {
  const j = m.bmap; if (!j?.outline) return ""
  const days = {}; for (const x of m.p?.muscles || []) days[x.key] = x.days
  const fig = v => {
    const parts = (j[v] || []).map(x => {
      const tag = BODY_TAG(v, x); if (tag === "-") return ""
      if (!tag) return `<path d="${x.d}" fill="#34343B" stroke="#000" stroke-width="3.5"/>`
      const keys = tag.split(","), dd = Math.min(...keys.map(k => days[k] ?? 999))
      return `<path class="tap" data-sh="mus:${keys[0]}" d="${x.d}" fill="${heat(dd)}" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>`
    }).join("")
    return `<div class="fig"><svg viewBox="${v === "front" ? 38 : 762} 82 650 1280"><path d="${j.outline[v]}" fill="#1B1B20" stroke="rgba(255,255,255,.35)" stroke-width="3"/>${parts}</svg><small>${v === "front" ? "Front" : "Back"}</small></div>`
  }
  const legend = [["#4CCF7A", "today or yesterday"], ["#9BCB5E", "2-3 days"], ["#F2A33A", "4-6 days"], ["#F26B5E", "7+ days or never"]].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("")
  return `<div class="body"><div class="figs">${fig("front")}${fig("back")}</div><div class="legend">${legend}</div><p class="dim small">Tap a muscle for when you trained it and how to hit it.</p></div>`
}
function heat(days) { return days <= 1 ? "#4CCF7A" : days <= 3 ? "#9BCB5E" : days <= 6 ? "#F2A33A" : "#F26B5E" }
function pageHtml(m, chat, open, item) {
  const now = new Date(), x = m.cur || m.next
  // a folding card: the header (title + one-line summary) is always visible, the body only when open
  const fold = (id, title, color, sum, body, extra = "") => `<section class="card fold" id="${id}"><header onclick="tg('${id}\')"><h2 style="color:${color}">${title}${extra ? `<span>${extra}</span>` : ""}</h2><div class="sum">${sum}</div><em>›</em></header><div class="bd">${body}</div></section>`
  const clsRow = c => `<div class="row tap" data-sh="cls:${esc(c.start)}"><b>${hm(c.s)}</b><div><div>${esc(c.title)} ${esc(c.kind)}</div><small>${esc(c.room)}</small></div></div>`
  const today = m.today.filter(c => c !== x)
  const weekHtml = (() => { let last = "", out = ""; for (const c of m.cls.filter(c => c !== x && !sameDay(c.s, now)).slice(0, 40)) { const dw = dayWord(c.s); if (dw !== last) { out += `<div class="day">${esc(dw)}</div>`; last = dw }; out += clsRow(c) }; return out })()
  const hero = `<section class="hero fold" id="cls"><header onclick="tg('cls\')">${x ? `<div class="kick" style="color:${m.cur ? "#4CCF7A" : "#4A9CF2"}">${m.cur ? "NOW" : "UP NEXT"}</div>
      <div class="big">${esc(x.title)} <span class="dim">${esc(x.kind)}</span></div>
      <div class="sub">${esc(dayWord(x.s))} ${hm(x.s)} to ${hm(x.e)}${x.room ? " · " + esc(x.room) : ""}</div>
      <div class="count" data-t="${(m.cur ? x.e : x.s).getTime()}" data-pre="${m.cur ? "ends in " : "in "}"></div>` : `<div class="big">No classes soon</div>`}
      ${(() => { const ex0 = (m.p?.exams || []).map((e, i) => ({ ...e, i, s: d(e.start) })).filter(e => e.s > now).slice(0, 4)
        return ex0.length ? `<div class="exs">${ex0.map(e => { const dd = Math.ceil((e.s - now) / 864e5); return `<span class="tap" data-sh="exam:${e.i}"><b style="color:${dd <= 14 ? "#F26B5E" : "#F2A33A"}">${dd}d</b> ${esc(e.name)}</span>` }).join("")}</div>` : "" })()}
      <div class="sum">${today.length ? `${today.length} more today · ` : ""}tap for the next 14 days</div><em>›</em></header>
      <div class="bd">${today.length ? `<div class="remind tap" data-remind="today">Remind me 15 min before each class today</div>` : ""}${today.length ? `<div class="day">Later today</div>` + today.map(clsRow).join("") : ""}${weekHtml}</div></section>`
  const lastOf = ch => (chat?.msgs || []).filter(q => q.role !== "user" && (q.channel || "") === ch).slice(-1)[0]
  const chatBox = (ch, ph) => `<div class="voice tap" data-voice="1">Reads replies aloud: off</div><div class="chat" id="chat-${ch || "main"}"></div><div class="st dim" id="st-${ch || "main"}"></div><div class="inrow"><textarea id="ta-${ch || "main"}" rows="2" placeholder="${ph}"></textarea><button onclick="send('${ch}\')">Send</button></div>`
  const last = lastOf("")
  const talk = fold("talk", "Talk to Claude", "#B07EE6", last ? esc(last.text) : "Tell it anything: add a task, change the plan, ask something", chatBox("", "Message Claude"))
  // gym: start/end the session, see what is logged, suggestions, and the coach chat that logs everything
  const gp = m.p?.gym || {}
  const gymSum = gp.session?.started && !gp.session?.ended ? "In session, tap to log" : gp.session?.ended ? `Done today · ${(gp.session.entries || []).length} logged` : "What are you doing today?"
  const musAll = (m.p?.muscles || []).slice().sort((a, b) => b.days - a.days)
  const behindTxt = m.behind.length ? `<p class="red small" style="font-weight:600">Falling behind: ${m.behind.slice(0, 8).map(b => esc(b.name) + (b.days >= 999 ? " (never)" : ` (${b.days} d)`)).join(", ")}</p>` : `<p class="dim small">Every muscle trained this week.</p>`
  const musChips = `<div class="chips">${musAll.map(b => `<div class="chip tap" data-sh="mus:${b.key}" style="border-color:${heat(b.days)}55;background:${heat(b.days)}22"><b style="color:${heat(b.days)}">${esc(b.name)}</b><small>${b.days >= 999 ? "never" : b.days === 0 ? "today" : b.days === 1 ? "yesterday" : b.days + " d ago"}${b.sets7 ? " · " + b.sets7 + " sets" : ""}</small></div>`).join("")}</div>`
  const gymCard = fold("gym", "Gym", "#F2A33A", gymSum,
    `${bodySvg(m)}${behindTxt}${musChips}<div id="gs"></div><div id="ge"></div><div id="gsug"></div>
     <div class="qk"><span onclick="qk('Starting now\')">Starting now</span><span onclick="qk('Elliptical 30 min\')">Elliptical 30 min</span><span onclick="qk('What should I do next?\')">What next?</span><span onclick="qk('Done for today\')">Done for today</span></div>
     ${chatBox("gym", "e.g. bench 3 x 8 at 60 kg")}`, gp.next ? "Suggested: " + esc(gp.next.replace(/^Day \d+:\s*/, "").replace(/ and /g, " + ")) : "")
  const bucket = (name, label, color) => { const L = m.msgs[name]; if (!L.length) return ""
    return `<details${name === "now" ? " open" : ""}><summary><i style="background:${color}"></i>${L.length} ${label}</summary>${L.map(q => `<div class="msg tap" data-sh="msg:${esc(q.id)}"><div class="from">${esc(q.from)}</div><div class="subj">${esc(q.subject)}</div>${q.action ? `<div class="act" style="color:${color}">→ ${esc(q.action)}</div>` : ""}${q.why ? `<small>${esc(q.why)}</small>` : ""}</div>`).join("")}</details>` }
  const mn = m.msgs.now.length, ml = m.msgs.later.length, mf = m.msgs.fyi.length
  const msgs = fold("msg", "Messages", "#F26B5E", mn + ml + mf ? [mn && `<b class="red">${mn} need you now</b>`, ml && `${ml} can wait`, mf && `${mf} to know`].filter(Boolean).join(" · ") : "Nothing needs you",
    (bucket("now", "need you now", "#F26B5E") + bucket("later", "can wait", "#F2A33A") + bucket("fyi", "to know", "#8E8E93")) || `<p class="dim">Nothing in the inbox needs you.</p>`, m.g?.generated ? "updated " + (sameDay(new Date(m.g.generated), now) ? "" : dayWord(new Date(m.g.generated)).toLowerCase() + " ") + hm(new Date(m.g.generated)) : "")
  const dueCol = q => { const h = (q.w - now) / 36e5; return h < 24 ? "#F26B5E" : h < 72 ? "#F2A33A" : "#4CCF7A" }
  const d0 = m.dls[0]
  const due = fold("due", "Due", "#F2A33A", d0 ? `${esc(d0.what)} <span class="pill sm" style="color:${dueCol(d0)};background:${dueCol(d0)}22">${until(d0.w)}</span>${m.dls.length > 1 ? ` <span class="dim">+${Math.min(7, m.dls.length - 1)} more</span>` : ""}` : "Nothing due",
    m.dls.slice(0, 8).map((q, i) => `<div class="row tap" data-sh="due:${i}"><div><div>${esc(q.what)}</div><small>${esc(dayWord(q.w))} ${hm(q.w)}${q.note ? " · " + esc(q.note) : ""}</small></div><span class="pill" style="color:${dueCol(q)};background:${dueCol(q)}22">${until(q.w)}</span></div>`).join("") || `<p class="dim">Nothing due.</p>`)
  const groups = (m.p?.coursework || []).filter(g => (g.items || []).length)
  // where you stand: what is still open and what a top student has done by now (written by the coursework job)
  const cj = m.cwj?.courses || []
  const stand = cj.some(c => (c.behind || []).length || c.top) ? `<div class="stand">${m.cwj.top_student ? `<p class="top">${esc(m.cwj.top_student)}</p>` : ""}${cj.filter(c => (c.behind || []).length || c.top).map(c => `<div class="st1"><b>${esc(abbr(c.module) || c.module)}</b>${(c.behind || []).length ? `<ul>${c.behind.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${c.top ? `<small>Top student: ${esc(c.top)}</small>` : ""}</div>`).join("")}</div>` : ""
  const cw = groups.length || stand ? fold("cw", "This week", "#4A9CF2", groups.map(g => `${esc(g.course)} ${g.items.filter(i => i.done).length}/${g.items.length}`).join(" · ") || "Where you stand",
    stand + groups.map(g => { const it = g.items, dn = it.filter(i => i.done).length
      return `<div class="course"><div class="ch"><b>${esc(g.course)}</b><small>${dn}/${it.length}</small></div><div class="bar"><div style="width:${Math.round(100 * dn / Math.max(1, it.length))}%"></div></div>${g.focus ? `<small class="dim">${esc(g.focus)}</small>` : ""}${it.map(i => `<div class="chk tap ${i.done ? "done" : ""}" data-cw="${esc(i.ref)}"><i>${i.done ? "✓" : ""}</i><span>${esc(i.label)}</span></div>`).join("")}</div>` }).join("")) : ""
  const todos = m.p?.todos || []
  const tasks = todos.length ? fold("tasks", "Tasks", "#B07EE6", `${todos.length} open · ${esc(todos[0].title)}`,
    todos.slice(0, 15).map(q => `<div class="chk tap" data-sh="todo:${esc(q.id)}"><i data-done="${esc(q.id)}"></i><span>${esc(q.title)}<small> ${q.start ? esc(dayWord(d(q.start))) : ""}${q.list ? " · " + esc(q.list) : ""}</small></span></div>`).join("")) : ""
  const ex = (m.p?.exams || []).map(e => ({ ...e, s: d(e.start) }))
  const exams = ex.length ? fold("ex", "Exams", "#F2A33A", `${esc(ex[0].name)} in ${Math.ceil((ex[0].s - now) / 864e5)} days`,
    ex.map((e, i) => `<div class="row tap" data-sh="exam:${i}"><div><div>${esc(e.name)} <span class="dim">${esc(e.sub)}</span></div><small>${e.s.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}${e.notime ? "" : " " + hm(e.s)}${e.room ? " · " + esc(e.room) : ""}</small></div><b class="num">${Math.ceil((e.s - now) / 864e5)}d</b></div>`).join("")) : ""
  const chatJson = JSON.stringify(chat || { msgs: [] }).replace(/</g, "\\u003c")
  const dataJson = JSON.stringify({ city: m.p?.meta?.city || "", mus: musAll, todos, plan: m.p?.gym?.plan || [], dls: m.dls.slice(0, 8).map(q => ({ when: q.when, what: q.what, note: q.note })),
    exams: m.p?.exams || [], cls: m.cls.slice(0, 60).map(c => ({ start: c.start, end: c.end, title: c.title, kind: c.kind, room: c.room })),
    msgs: [...m.msgs.now.map(q => ({ ...q, b: "now" })), ...m.msgs.later.map(q => ({ ...q, b: "later" })), ...m.msgs.fyi.map(q => ({ ...q, b: "fyi" }))] }).replace(/</g, "\\u003c")
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>
  :root{color-scheme:dark} *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:#000;color:#F2F2F5;font:15px/1.35 -apple-system,system-ui,sans-serif;padding:max(14px,env(safe-area-inset-top)) 14px 40px}
  .top{display:flex;justify-content:space-between;align-items:baseline;margin:6px 4px 14px}.top h1{font-size:34px;font-weight:700;margin:0;letter-spacing:-.5px}.top small{color:#8E8E93}
  html,body{height:100%;overflow:hidden}body{padding-bottom:0!important}
  #nav{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 10px;scrollbar-width:none}#nav::-webkit-scrollbar{display:none}
  #nav span{flex:none;padding:7px 13px;border-radius:16px;background:#1C1C21;color:#A1A1AA;font-size:14px;font-weight:600}#nav span.on{background:#F2F2F5;color:#000}
  #pager{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;height:calc(100% - 118px);margin:0 -14px;scrollbar-width:none}#pager::-webkit-scrollbar{display:none}
  .pg{flex:0 0 100%;scroll-snap-align:start;overflow-y:auto;padding:0 14px 40px;box-sizing:border-box}
  .pg .bd{display:block!important}.pg .sum{display:none}.pg header{cursor:default}.pg header em{display:none}
  .voice{font-size:12.5px;color:#8E8E93;text-align:right;margin:0 2px 4px}
  .tap{cursor:pointer}.tap:active{opacity:.6}
  .exs{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.exs span{background:#F2A33A1f;border-radius:12px;padding:5px 10px;font-size:13px;color:#F2F2F5}
  .remind{background:#4A9CF21f;color:#4A9CF2;border-radius:14px;padding:10px 12px;margin:4px 0 6px;font-weight:600;font-size:14px;text-align:center}
  #sheet{position:fixed;inset:0;background:#000a;display:none;align-items:flex-end;z-index:20}#sheet.on{display:flex}
  #shc{background:#1A1A1F;width:100%;max-height:82vh;overflow-y:auto;border-radius:24px 24px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom));animation:up .22s ease}
  @keyframes up{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
  #shc .grab{width:40px;height:5px;border-radius:3px;background:#ffffff30;margin:0 auto 12px}
  #shc h3{margin:0 0 2px;font-size:22px}#shc .k{font-size:12px;font-weight:700;letter-spacing:.6px;margin-bottom:6px}
  #shc .stat{font-size:30px;font-weight:700;margin:10px 0 2px}#shc p{margin:8px 0;color:#C7C7CC}
  #shc .li{padding:8px 0;border-top:1px solid #ffffff10;font-size:14px}
  .acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.acts div{background:#2A2A31;border-radius:14px;padding:12px;text-align:center;font-weight:600;font-size:14px}
  .acts .pri{background:#F2F2F5;color:#000}.acts .wide{grid-column:1/3}
  #toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);background:#F2F2F5;color:#000;padding:10px 16px;border-radius:16px;font-weight:600;font-size:14px;opacity:0;transition:opacity .2s;z-index:30;pointer-events:none;width:max-content;max-width:90%}
  #toast.on{opacity:1}
  .chatbtn{margin:6px 0 20px;text-align:center;padding:13px;border-radius:18px;background:#2A2140;color:#B07EE6;font-weight:700}
  .card,.hero{background:#141418;border:1px solid #ffffff12;border-radius:24px;margin-bottom:12px;overflow:hidden}
  .hero{background:linear-gradient(160deg,#16223A,#0E1118);border-color:#ffffff14;border-radius:26px}
  header{position:relative;padding:15px 44px 14px 16px;cursor:pointer}.hero header{padding:18px 44px 16px 20px}
  header em{position:absolute;right:16px;top:50%;margin-top:-13px;font-style:normal;font-size:22px;color:#6B6B73;transition:transform .25s}.open header em{transform:rotate(90deg)}
  .sum{color:#A1A1AA;font-size:14px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.open .sum{display:none}.hero .sum{font-size:13px;color:#8E8E93;margin-top:8px}
  .bd{display:none;padding:0 16px 12px}.open .bd{display:block;animation:in .25s ease}.hero .bd{padding:0 20px 14px}
  @keyframes in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
  .kick{font-size:12px;font-weight:700;letter-spacing:.6px}.big{font-size:28px;font-weight:700;margin-top:4px;letter-spacing:-.3px}.sub{color:#A1A1AA;margin-top:4px}
  .count{font-size:22px;font-weight:600;color:#4CCF7A;margin-top:10px;font-variant-numeric:tabular-nums}
  h2{font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;margin:0;display:flex;justify-content:space-between}h2 span{color:#6B6B73;text-transform:none;font-weight:500;letter-spacing:0}
  .row{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:9px 0;border-top:1px solid #ffffff0d}.row>div{flex:1}.row>b{width:46px;color:#A1A1AA;font-weight:600;font-variant-numeric:tabular-nums}
  small{color:#8E8E93;font-size:12.5px}.dim{color:#8E8E93}.num{font-size:20px;color:#F2A33A}.red{color:#F26B5E}
  .pill{font-size:13px;font-weight:600;padding:4px 10px;border-radius:12px;white-space:nowrap}.pill.sm{font-size:12px;padding:2px 8px;margin-left:4px}
  details{border-top:1px solid #ffffff0d}summary{list-style:none;padding:11px 0;font-weight:600;display:flex;align-items:center;gap:10px}summary::-webkit-details-marker{display:none}
  summary:after{content:"›";margin-left:auto;color:#6B6B73;font-size:20px;transition:transform .2s}details[open] summary:after{transform:rotate(90deg)}summary i{width:9px;height:9px;border-radius:5px}
  .msg{display:block;text-decoration:none;color:inherit;background:#1E1E24;border-radius:16px;padding:12px 14px;margin:0 0 8px}.from{font-weight:600}.subj{color:#A1A1AA;font-size:13.5px}.act{font-weight:600;margin-top:6px}
  .stand{margin:2px 0 8px}.stand .top{color:#F2A33A;font-weight:600;margin:4px 0 8px}.st1{padding:6px 0;border-top:1px solid #ffffff0d}.st1 ul{margin:4px 0 2px;padding-left:18px;color:#F2F2F5}.st1 li{margin:2px 0}.st1 small{color:#A1A1AA}.big2{font-size:20px;color:#4CCF7A;width:auto}.small{font-size:12px}
  .course{padding:8px 0 10px;border-top:1px solid #ffffff0d}.ch{display:flex;justify-content:space-between}
  .bar{height:5px;background:#ffffff12;border-radius:3px;margin:7px 0 6px;overflow:hidden}.bar div{height:100%;background:linear-gradient(90deg,#4A9CF2,#4CCF7A)}
  .chk{display:flex;gap:10px;align-items:flex-start;padding:6px 0}.chk i{flex:none;width:20px;height:20px;border-radius:10px;border:1.5px solid #ffffff40;font-style:normal;font-size:12px;text-align:center;line-height:18px;color:#000}
  .chk.done i{background:#4CCF7A;border-color:#4CCF7A}.chk.done span{color:#6B6B73;text-decoration:line-through}
  .chips{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 8px}.chip{border:1px solid;border-radius:14px;padding:8px 11px}.chip b{display:block;font-size:14px}
  .day{font-size:12px;font-weight:700;color:#4A9CF2;margin:12px 0 2px;text-transform:uppercase;letter-spacing:.5px}
  .chat{display:flex;flex-direction:column;gap:8px;max-height:38vh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:4px 0 8px;border-radius:14px}
  .gsrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0 10px}.gsrow small{display:block}.gsrow b{font-size:24px;font-variant-numeric:tabular-nums}
  .gbtn{background:#F2A33A}.gbtn.end{background:#2A2A31;color:#F2F2F5}
  .ent{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #ffffff0d}.ent small{display:block}.kc{color:#F2A33A;font-weight:600;white-space:nowrap}
  .sug{background:#1E1E24;border-radius:14px;padding:10px 12px;margin:10px 0;font-size:14px}.sug b{color:#F2A33A;font-size:12px;letter-spacing:.5px;display:block;margin-bottom:4px}
  .body{margin:2px 0 6px}.figs{display:flex;gap:6px}.fig{flex:1;text-align:center}.fig svg{width:100%;height:auto;max-height:300px}.fig small{color:#8E8E93;font-size:11px}.legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 0 2px;font-size:11px;color:#8E8E93}.legend i{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:5px}.red{color:#F26B5E}
  .qk{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.qk span{background:#2A2A31;border-radius:14px;padding:6px 11px;font-size:13px}
  .b{max-width:82%;padding:9px 13px;border-radius:18px;white-space:pre-wrap;word-wrap:break-word}.b.me{align-self:flex-end;background:#7B52C9;color:#fff;border-bottom-right-radius:6px}.b.cl{align-self:flex-start;background:#24242B;border-bottom-left-radius:6px}.b.wait{opacity:.6}
  .st{font-size:12.5px;min-height:16px;margin:2px 2px 8px}
  .inrow{display:flex;gap:8px;align-items:flex-end}textarea{flex:1;background:#1E1E24;color:#F2F2F5;border:1px solid #ffffff1a;border-radius:18px;padding:10px 14px;font:16px -apple-system,system-ui,sans-serif;resize:none;outline:none}
  button{background:#B07EE6;color:#000;border:0;border-radius:18px;padding:11px 16px;font:600 15px -apple-system,system-ui,sans-serif}
  </style></head><body>
  <div class="top"><h1>${now.getHours() < 12 ? "Morning" : now.getHours() < 18 ? "Afternoon" : "Evening"}</h1><small>${m.p?.generated ? "board " + hm(d(m.p.generated)) : ""}</small></div>
  ${(() => {
    // calm pages first, stressful ones last
    const pages = [["cls", "Today", hero], ["gym", "Gym", gymCard], ["tasks", "Tasks", tasks], ["cw", "Week", cw], ["talk", "Chat", talk], ["msg", "Messages", msgs], ["due", "Due", due], ["ex", "Exams", exams]].filter(p => p[2])
    return `<nav id="nav">${pages.map(p => `<span data-p="${p[0]}" onclick="tg('${p[0]}')">${p[1]}</span>`).join("")}</nav>
      <div id="pager">${pages.map(p => `<div class="pg" data-p="${p[0]}">${p[2]}${p[0] === "talk" || p[0] === "gym" ? "" : `<div class="chatbtn" onclick="tg('talk')">Talk to Claude  ›</div>`}</div>`).join("")}</div>`
  })()}
  <div id="sheet"><div id="shc"></div></div><div id="toast"></div>
  <script>
  function tick(){document.querySelectorAll('.count').forEach(e=>{let s=Math.max(0,Math.round((+e.dataset.t-Date.now())/1000));let h=Math.floor(s/3600),mi=Math.floor(s%3600/60),se=s%60;e.textContent=e.dataset.pre+(h?h+'h ':'')+String(mi).padStart(h?2:1,'0')+'m '+String(se).padStart(2,'0')+'s'})}tick();setInterval(tick,1000)
  // one card open at a time: opening one folds the others, tapping the open one folds it
  const PG=[...document.querySelectorAll('.pg')],PAGER=document.getElementById('pager')
  function mark(id){document.querySelectorAll('#nav span').forEach(e=>e.classList.toggle('on',e.dataset.p===id));const n=document.querySelector('#nav span.on');if(n)n.scrollIntoView({inline:'center',block:'nearest'});if(id==='talk')draw('');if(id==='gym'){draw('gym');drawGym()}}
  function tg(id){const i=PG.findIndex(p=>p.dataset.p===id);if(i<0)return;if(Math.round(PAGER.scrollLeft/PAGER.clientWidth)===i){PG[i].scrollTo({top:0,behavior:'smooth'});return}PAGER.scrollTo({left:i*PAGER.clientWidth,behavior:'smooth'});mark(id)}
  function fit(){PAGER.style.height=(innerHeight-PAGER.getBoundingClientRect().top)+'px'}fit();addEventListener('resize',fit)
  let SCT;PAGER.addEventListener('scroll',()=>{clearTimeout(SCT);SCT=setTimeout(()=>{const i=Math.round(PAGER.scrollLeft/PAGER.clientWidth);if(PG[i])mark(PG[i].dataset.p)},80)})
  let CHAT=${chatJson},PEND=[],FAIL={},G=${JSON.stringify(gp.session || {})},PLAN=${JSON.stringify(gp.exercises || [])},DAY=${JSON.stringify(gp.next || "")},SUG=${JSON.stringify(gp.next || "")},LAST=${JSON.stringify(lastWorkout(m))},BEHIND=${JSON.stringify(m.behind.slice(0, 3).map(b => b.name))},LOCAL=false
  const H=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]),K=ch=>ch||'main'
  function draw(ch){const c=document.getElementById('chat-'+K(ch));if(!c)return;const mine=(CHAT.msgs||[]).filter(q=>(q.channel||'')===ch),ids=new Set(mine.map(q=>q.id));PEND=PEND.filter(p=>!ids.has(p.id))
    const all=mine.slice(-30).concat(PEND.filter(p=>p.ch===ch))
    c.innerHTML=all.length?all.map(q=>'<div class="b '+(q.role==='user'?'me':'cl')+(q.wait?' wait':'')+'">'+H(q.text)+'</div>').join(''):'<div class="dim">'+(ch==='gym'?'Tell your coach what you are doing. Everything gets logged.':'Say what you did, ask something, or tell it what to change. It updates your board.')+'</div>'
    const ans=new Set(mine.filter(q=>q.role!=='user').map(q=>String(q.id).replace(/-r$/,''))),open=mine.some(q=>q.role==='user'&&!ans.has(q.id))
    document.getElementById('st-'+K(ch)).textContent=FAIL[ch]?FAIL[ch]:PEND.some(p=>p.ch===ch)?'Sending...':open?(ch==='gym'?'Coach is typing, about a minute.':'Claude is on it, about a minute.'):''
    c.scrollTop=c.scrollHeight}
  function setChat(o){if(o&&o.msgs){const inc=new Set(o.msgs.map(q=>q.id)),keep=(CHAT.msgs||[]).filter(q=>!inc.has(q.id));if(keep.length&&CHAT.updated&&o.updated&&o.updated<CHAT.updated){CHAT={...CHAT,msgs:(CHAT.msgs||[]).concat(o.msgs.filter(q=>!(CHAT.msgs||[]).some(x=>x.id===q.id)))}}else{CHAT={...o,msgs:o.msgs.concat(keep)}}FAIL={};draw('');draw('gym');const l=o.msgs.filter(q=>q.role!=='user'&&!q.channel).slice(-1)[0];if(l)document.querySelector('#talk .sum').textContent=l.text}}
  function sentOk(id){const p=PEND.find(p=>p.id===id);if(p){CHAT.msgs=(CHAT.msgs||[]).concat([{id:p.id,role:'user',text:p.text,channel:p.ch}]);PEND=PEND.filter(x=>x.id!==id);draw(p.ch)}}
  function sentFail(id,why){const p=PEND.find(p=>p.id===id);PEND=PEND.filter(p=>p.id!==id);if(p){document.getElementById('ta-'+K(p.ch)).value=p.text;FAIL[p.ch]=why;draw(p.ch)}}
  function send(ch){const ta=document.getElementById('ta-'+K(ch)),v=ta.value.trim();if(!v)return;const id=Date.now().toString(36);PEND.push({id,role:'user',text:v,wait:true,ch});ta.value='';FAIL[ch]='';draw(ch);nav('board://say?id='+id+'&ch='+ch+'&t='+encodeURIComponent(v))}
  function qk(t){const ta=document.getElementById('ta-gym');ta.value=t;send('gym')}
  const iso=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+'T'+z(d.getHours())+':'+z(d.getMinutes())+':'+z(d.getSeconds())}
  let VOICE=false
  function setVoice(v){VOICE=!!v;document.querySelectorAll('[data-voice]').forEach(e=>e.textContent='Reads replies aloud: '+(VOICE?'on':'off'))}
  function gymDo(n,quiet){if(n&&!quiet&&!run()){setTimeout(()=>{const ta=document.getElementById('ta-gym');ta.value='Starting my session now'+(DAY?', doing '+DAY.replace(/^Day \\d+:\\s*/,'').toLowerCase():'')+'. What should I do first?';send('gym')},300)}const w=n?'start':'end';if(n){G=Object.assign({},G,{started:iso(),ended:''});LOCAL=true}else{G=Object.assign({},G,{ended:iso()})}nav('board://gym?do='+w+'&at='+encodeURIComponent(iso())+(n?'':'&day='+encodeURIComponent(DAY)));drawGym()}
  const run=()=>!!G.started&&(!G.ended||new Date(G.started)>new Date(G.ended))
  // the repo copy can lag behind a tap here: only take it once it has caught up with the local start
  function setGym(s){if(!s)return;if(DEL&&s.started===DEL)return;if(LOCAL&&!(s.started&&new Date(s.started)>=new Date(G.started)))return;LOCAL=false;G=s;drawGym()}
  let DEL=''
  function gymDel(el){if(!el.dataset.sure){el.dataset.sure=1;el.textContent='Tap again to delete it';el.style.color='#F26B5E';return}DEL=G.started||'';G={};LOCAL=false;nav('board://gym?do=delete&at='+encodeURIComponent(iso()));drawGym();toast('Session deleted')}
  function pickDay(i){const d0=D.plan[i];if(!d0)return;DAY=d0.title;PLAN=d0.exercises||[];drawGym();toast(DAY)}
  function el(t){const m=Math.max(0,Math.round((Date.now()-new Date(t))/1000)),h=Math.floor(m/3600),mi=Math.floor(m%3600/60),se=m%60;return (h?h+':':'')+String(mi).padStart(h?2:1,'0')+':'+String(se).padStart(2,'0')}
  function drawGym(){const gs=document.getElementById('gs');if(!gs)return;const E=G.entries||[],kc=E.reduce((a,e)=>a+(+e.kcal||0),0)
    const short=t=>String(t).replace(/^Day \\d+:\\s*/,'').replace(/ and /g,' + ')
    const lastTxt=LAST?'Last time: '+H(short(LAST.day))+', '+ago(Math.round((new Date(new Date().toDateString())-new Date(LAST.date+'T00:00'))/864e5)):''
    const days=G.ended&&!run()?'':'<div class="k" style="margin-top:4px">WHAT ARE YOU DOING TODAY?</div><p class="dim small" style="margin:2px 0 0">Suggested: '+H(short(SUG))+(lastTxt?' · '+lastTxt:'')+'. Pick whatever you feel like.</p><div class="qk">'+D.plan.map((d0,i)=>'<span onclick="pickDay('+i+')" style="'+(d0.title===DAY?'background:#4CCF7A;color:#000;font-weight:700':d0.title===SUG?'box-shadow:inset 0 0 0 1.5px #4CCF7A':'')+'">'+H(short(d0.title))+'</span>').join('')+'</div>'
    const del=G.started?'<div class="dim small" style="text-align:right;margin:-4px 2px 8px" onclick="gymDel(this)">Delete this session</div>':''
    gs.innerHTML=days+(run()?'<div class="gsrow"><div><small>In session</small><b id="gt">'+el(G.started)+'</b></div><button class="gbtn end" onclick="gymDo(0)">End session</button></div>'
      :G.ended?'<div class="gsrow"><div><small>Done today</small><b>'+Math.max(0,Math.round((new Date(G.ended)-new Date(G.started))/60000))+' min</b></div><button class="gbtn" onclick="gymDo(1)">Go again</button></div>'
      :'<div class="gsrow"><div><small>Today</small><b style="font-size:18px">'+H(short(DAY)||'Free choice')+'</b></div><button class="gbtn" onclick="gymDo(1)">Start session</button></div>')+del
    document.getElementById('ge').innerHTML=E.length?E.map(e=>'<div class="ent"><div>'+H(e.name)+'<small>'+H([e.sets?e.sets+' sets':'',e.minutes?e.minutes+' min':'',e.detail].filter(Boolean).join(' · '))+'</small></div>'+(e.kcal?'<span class="kc">'+e.kcal+' kcal</span>':'')+'</div>').join('')+(kc?'<div class="ent"><div><b>Total</b></div><span class="kc">'+kc+' kcal</span></div>':''):''
    const done=new Set(E.map(e=>String(e.name).toLowerCase())),todo=PLAN.filter(x=>!done.has(String(x.name).toLowerCase()))
    document.getElementById('gsug').innerHTML=(todo.length||BEHIND.length)?'<div class="sug"><b>SUGGESTED</b>'+(todo.length?todo.slice(0,4).map(x=>'<div class="tap" data-ask="Doing '+H(x.name)+' now: " data-ch="gym">'+H(x.name)+' <span class="dim">'+H(x.sets)+'</span></div>').join(''):'')+(BEHIND.length?'<div class="dim" style="margin-top:6px">Neglected: '+H(BEHIND.join(', '))+'</div>':'')+'</div>':''}
  setInterval(()=>{const t=document.getElementById('gt');if(t&&run())t.textContent=el(G.started)},1000)
  const D=${dataJson},ITEM=${JSON.stringify(item ?? "")}
  const z2=n=>String(n).padStart(2,'0'),loc=d=>d.getFullYear()+'-'+z2(d.getMonth()+1)+'-'+z2(d.getDate())+'T'+z2(d.getHours())+':'+z2(d.getMinutes())
  const pd=s=>new Date(s&&s.length<=10?s+'T00:00':s),days=s=>Math.ceil((pd(s)-new Date())/864e5)
  const dw=s=>{const d=pd(s),t=new Date(),n=new Date(t);n.setDate(t.getDate()+1);if(d.toDateString()===t.toDateString())return 'Today';if(d.toDateString()===n.toDateString())return 'Tomorrow';return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
  const hhmm=s=>{const d=pd(s);return z2(d.getHours())+':'+z2(d.getMinutes())}
  const ago=n=>n>=999?'never':n===0?'today':n===1?'yesterday':n+' days ago'
  function toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2600)}
  function shx(){document.getElementById('sheet').classList.remove('on')}
  document.getElementById('sheet').addEventListener('click',e=>{if(e.target.id==='sheet')shx()})
  // a tap that changes the board: goes to the PC through the inbox; the item disappears here right away
  function act(obj,key,msg){nav('board://act?k='+encodeURIComponent(key||'')+'&j='+encodeURIComponent(JSON.stringify(obj)));toast(msg||'Sent, your board updates in a few minutes');shx();if(key)document.querySelectorAll('[data-sh="'+key.replace(/"/g,'')+'"]').forEach(x=>x.style.display='none')}
  function remind(list,msg){nav('board://notify?j='+encodeURIComponent(JSON.stringify(list)));toast(msg);shx()}
  function ask(text,ch,now){shx();ch=ch||'';tg(ch==='gym'?'gym':'talk');const ta=document.getElementById('ta-'+K(ch));ta.value=text;if(now)send(ch);else setTimeout(()=>{ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length)},400)}
  function nav(u){location.href=u}
  function go(u){nav(u)}
  // a course task: done, later (comes back and pings you), ignore, or ask Claude when you do not know what it means
  function cwMenu(el){B=[];const ref=el.dataset.cw,lab=el.querySelector('span').textContent,now=new Date(),tn=at(now,19),tm=new Date(now);tm.setDate(now.getDate()+1)
    const later=(t,msg)=>{nav('board://cwlater?r='+encodeURIComponent(ref)+'&u='+t.getTime()+'&t='+encodeURIComponent(lab));el.style.display='none';toast(msg);shx()}
    open_('<div class="k" style="color:#4A9CF2">TASK</div><h3>'+H(lab)+'</h3><div class="acts">'
      +btn('Done',()=>{el.classList.add('done');el.querySelector('i').textContent='✓';act({coursework_done:[ref]},'','Checked off')},'pri')
      +(tn-now>30*6e4?btn('Later tonight',()=>later(tn,'Back at 19:00, I will remind you')):'')
      +btn('Tomorrow',()=>later(at(tm,9),'Back tomorrow at 9:00'))
      +btn('Ignore',()=>later(new Date(8e15),'Ignored, it stays off your lists'))
      +btn("I don't know",()=>ask('I do not know what to do for this course task: "'+lab+'". Explain what it means, where I find it and how to start, short.','',1),'wide')+'</div>')}
  let B=[]
  function btn(label,fn,cls){B.push(fn);return '<div class="tap '+(cls||'')+'" data-b="'+(B.length-1)+'">'+H(label)+'</div>'}
  function open_(h){document.getElementById('shc').innerHTML='<div class="grab"></div>'+h;document.getElementById('sheet').classList.add('on')}
  function at(d,h,mi){const x=new Date(d);x.setHours(h,mi||0,0,0);return x}
  const HOW={chest:['Bench press (barbell or dumbbell)','Incline dumbbell press','Cable or pec deck fly','Push-ups or dips'],front_delts:['Overhead press','Front raise'],side_delts:['Lateral raise (dumbbell or cable)','Upright row, wide grip'],rear_delts:['Reverse pec deck fly','Face pull','Bent-over rear delt raise'],biceps:['Barbell or dumbbell curl','Hammer curl','Cable curl'],triceps:['Cable pushdown','Overhead extension','Dips or close-grip bench'],forearms:['Wrist curl and reverse wrist curl','Farmer carry','Dead hang'],abs:['Hanging leg raise','Cable crunch','Plank'],traps:['Shrugs (barbell or dumbbell)','Farmer carry','Face pull'],lats:['Lat pulldown','Pull-ups','Straight-arm pulldown'],upper_back:['Seated or cable row','Chest-supported row','Face pull'],lower_back:['Back extension','Romanian deadlift','Deadlift'],glutes:['Hip thrust','Squat or lunges','Romanian deadlift'],adductors:['Adductor machine','Sumo squat','Copenhagen plank'],quads:['Squat','Leg press','Leg extension'],hamstrings:['Romanian deadlift','Leg curl','Nordic curl'],calves:['Standing calf raise','Seated calf raise']}
  function sh(kind,key){B=[];let h=''
    if(kind==='mus'){const b=D.mus.find(x=>x.key===key);if(!b)return;const how=HOW[key]||[];const col=b.days<=1?'#4CCF7A':b.days<=3?'#9BCB5E':b.days<=6?'#F2A33A':'#F26B5E'
      const inPlan=[];for(const dd of D.plan)for(const x of dd.exercises||[])if((x.muscles||[]).includes(key))inPlan.push(x.name+' <span class="dim">'+H(x.sets)+' · '+H(String(dd.title).replace(/^Day \\d+:\\s*/,''))+'</span>')
      h='<div class="k" style="color:'+col+'">MUSCLE</div><h3>'+H(b.name)+'</h3><div class="stat" style="color:'+col+'">'+ago(b.days)+'</div>'+(b.sets7?'<p>'+b.sets7+' sets this week</p>':'<p>No sets this week</p>')
        +((b.recent||[]).length?'<div class="k" style="margin-top:12px">RECENT</div>'+b.recent.map(r=>'<div class="li">'+H(r)+'</div>').join(''):'')
        +(how.length?'<div class="k" style="margin-top:12px">HOW TO HIT IT</div>'+how.map(r=>'<div class="li">'+H(r)+'</div>').join(''):'')
        +(inPlan.length?'<div class="k" style="margin-top:12px">IN YOUR PLAN</div>'+inPlan.map(r=>'<div class="li">'+r+'</div>').join(''):'')
        +'<div class="acts">'+btn('Trained it today',()=>act({muscles:[{muscle:key,date:loc(new Date()).slice(0,10),sets:0,detail:'marked on the phone'}]},'','Logged '+b.name.toLowerCase()),'pri')+btn('Log with details',()=>ask('Did '+b.name.toLowerCase()+': ','gym'))+btn('What should I do?',()=>ask('What should I do for '+b.name.toLowerCase()+' today? Last trained '+ago(b.days)+'.','gym',1))+btn('Start a session for it',()=>{gymDo(1,1);ask('Starting a session, focus on '+b.name.toLowerCase()+'. What first?','gym',1)},'wide')+'</div>'}
    else if(kind==='todo'){const t=D.todos.find(x=>x.id===key);if(!t)return;const now=new Date(),tm=new Date(now);tm.setDate(now.getDate()+1);const nw=new Date(now);nw.setDate(now.getDate()+7)
      const keep=d=>t.start&&t.start.length>10?loc(at(d,pd(t.start).getHours(),pd(t.start).getMinutes())):loc(at(d,10)).slice(0,10)
      h='<div class="k" style="color:#B07EE6">TASK'+(t.list?' · '+H(t.list).toUpperCase():'')+'</div><h3>'+H(t.title)+'</h3>'+(t.start?'<p>'+dw(t.start)+(t.start.length>10?' '+hhmm(t.start):'')+'</p>':'<p class="dim">No date</p>')
        +'<div class="acts">'+btn('Done',()=>act({todos_done:[t.id]},'todo:'+t.id,'Done. Nice.'),'pri')+btn('Tomorrow',()=>act({todos_move:[{id:t.id,start:keep(tm)}]},'','Moved to tomorrow'))
        +btn('Next week',()=>act({todos_move:[{id:t.id,start:keep(nw)}]},'','Moved to next week'))+btn('Remind me in 1 h',()=>remind([{title:'Task',body:t.title,at:loc(new Date(Date.now()+36e5))}],'Reminder in 1 hour'))
        +btn('Remind me tonight',()=>remind([{title:'Task',body:t.title,at:loc(at(new Date(),19))}],'Reminder at 19:00'))+btn('Ask Claude',()=>ask('About my task "'+t.title+'": '))+'</div>'}
    else if(kind==='msg'){const q=D.msgs.find(x=>x.id===key);if(!q)return;const col=q.b==='now'?'#F26B5E':q.b==='later'?'#F2A33A':'#8E8E93'
      h='<div class="k" style="color:'+col+'">'+(q.b==='now'?'NEEDS YOU NOW':q.b==='later'?'CAN WAIT':'TO KNOW')+(q.when?' · '+H(q.when):'')+'</div><h3>'+H(q.from)+'</h3><p>'+H(q.subject)+'</p>'
        +(q.action?'<p style="color:'+col+';font-weight:600">→ '+H(q.action)+'</p>':'')+(q.why?'<p class="dim">'+H(q.why)+'</p>':'')+(q.draft?'<div class="k" style="margin-top:12px">DRAFT REPLY</div><p style="white-space:pre-wrap">'+H(q.draft)+'</p>':'')
        +'<div class="acts">'+(q.link?btn('Open in Gmail',()=>go(q.link),'pri'):'')+(q.draft_link?btn('Open the draft',()=>go(q.draft_link),q.link?'':'pri'):'')
        +btn('Done',()=>act({digest_done:[{id:q.id,state:'done',text:q.from+' '+q.subject}]},'msg:'+q.id,'Marked done'))+btn('Ignore',()=>act({digest_done:[{id:q.id,state:'ignored',text:q.from+' '+q.subject}]},'msg:'+q.id,'Ignored'))
        +btn('Make it a task',()=>act({todos_add:[{title:q.action||q.subject}]},'','Added to your tasks'))+btn('Ask Claude',()=>ask('Help me with this email from '+q.from+': "'+q.subject+'". '+(q.action||'')))+'</div>'}
    else if(kind==='due'){const q=D.dls[+key];if(!q)return;const dd=days(q.when),col=dd<=1?'#F26B5E':dd<=3?'#F2A33A':'#4CCF7A',pre=new Date(pd(q.when));pre.setDate(pre.getDate()-1)
      h='<div class="k" style="color:#F2A33A">DEADLINE</div><h3>'+H(q.what)+'</h3><div class="stat" style="color:'+col+'">'+(dd<=0?'today':dd===1?'tomorrow':'in '+dd+' days')+'</div><p>'+dw(q.when)+' '+hhmm(q.when)+'</p>'+(q.note?'<p class="dim">'+H(q.note)+'</p>':'')
        +'<div class="acts">'+btn('Done',()=>act({deadlines_done:[{what:q.what,when:q.when}]},'due:'+key,'Marked done'),'pri')+btn('Remind me the day before',()=>remind([{title:'Due tomorrow',body:q.what+' '+hhmm(q.when),at:loc(at(pre,18))}],'Reminder the day before, 18:00'))
        +btn('Add a task to start it',()=>act({todos_add:[{title:'Start: '+q.what,start:loc(at(pre,10)).slice(0,10)}]},'','Task added for the day before'))+btn('Plan it with Claude',()=>ask('Help me plan "'+q.what+'", due '+dw(q.when)+' '+hhmm(q.when)+'. '+(q.note||''),'',1))+'</div>'}
    else if(kind==='exam'){const e=D.exams[+key];if(!e)return;const dd=days(e.start),wk=new Date(pd(e.start));wk.setDate(wk.getDate()-7);const db=new Date(pd(e.start));db.setDate(db.getDate()-1)
      h='<div class="k" style="color:#F2A33A">EXAM'+(e.sub?' · '+H(e.sub).toUpperCase():'')+'</div><h3>'+H(e.name)+'</h3><div class="stat" style="color:'+(dd<=14?'#F26B5E':'#F2A33A')+'">'+dd+' days</div><p>'+dw(e.start)+(e.notime?'':' '+hhmm(e.start))+(e.room?' · '+H(e.room):'')+'</p><p class="dim">About '+Math.max(0,Math.floor(dd/7))+' weeks left</p>'
        +'<div class="acts">'+btn('Make me a study plan',()=>ask('Make me a study plan for the exam '+e.name+(e.sub?' ('+e.sub+')':'')+' on '+dw(e.start)+', '+dd+' days left. Add the sessions to my tasks.','',1),'pri wide')
        +btn('Remind me 1 week before',()=>remind([{title:'Exam in a week',body:e.name,at:loc(at(wk,10))}],'Reminder one week before'))+btn('Remind me the day before',()=>remind([{title:'Exam tomorrow',body:e.name,at:loc(at(db,18))}],'Reminder the day before'))+'</div>'}
    else if(kind==='cls'){const c=D.cls.find(x=>x.start===key);if(!c)return;const st=pd(c.start),pre=new Date(st.getTime()-15*6e4),q=(c.room||'').split(',')[0]
      h='<div class="k" style="color:#4A9CF2">'+H((c.kind||'class').toUpperCase())+'</div><h3>'+H(c.title)+'</h3><p>'+dw(c.start)+' '+hhmm(c.start)+' to '+hhmm(c.end)+'</p>'+(c.room?'<p class="dim">'+H(c.room)+'</p>':'')
        +'<div class="acts">'+(c.room?btn('Directions',()=>go('https://maps.apple.com/?q='+encodeURIComponent(q+(D.city?' '+D.city:''))),'pri'):'')+(pre>new Date()?btn('Remind me 15 min before',()=>remind([{title:c.title+' '+(c.kind||''),body:hhmm(c.start)+(c.room?' · '+c.room:''),at:loc(pre)}],'Reminder 15 min before')):'')
        +btn('What should I prepare?',()=>ask('What should I prepare for '+c.title+' '+(c.kind||'')+' '+dw(c.start)+'?','',1),'wide')+'</div>'}
    if(h)open_(h)}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-b]');if(b){B[+b.dataset.b]();return}
    const vo=e.target.closest('[data-voice]');if(vo){setVoice(!VOICE);nav('board://voice?on='+(VOICE?1:0));toast(VOICE?'Replies are read aloud':'Voice off');return}
    const dn=e.target.closest('[data-done]');if(dn){e.stopPropagation();act({todos_done:[dn.dataset.done]},'todo:'+dn.dataset.done,'Done. Nice.');return}
    const cw=e.target.closest('[data-cw]');if(cw){if(cw.classList.contains('done'))return;cwMenu(cw);return}
    const rm=e.target.closest('[data-remind]');if(rm){const L=D.cls.filter(c=>pd(c.start).toDateString()===new Date().toDateString()&&pd(c.start)-9e5>Date.now()).map(c=>({title:c.title+' '+(c.kind||''),body:hhmm(c.start)+(c.room?' · '+c.room:''),at:loc(new Date(pd(c.start)-9e5))}));if(L.length)remind(L,L.length+' reminder'+(L.length>1?'s':'')+' set');else toast('No more classes today');return}
    const a=e.target.closest('[data-ask]');if(a){ask(a.dataset.ask,a.dataset.ch||'');return}
    const s=e.target.closest('[data-sh]');if(s){const v=s.dataset.sh,i=v.indexOf(':');sh(v.slice(0,i),v.slice(i+1))}})
  draw('');draw('gym');drawGym()
  const OPEN=${JSON.stringify(open || "")};const I0=PG.findIndex(p=>p.dataset.p===OPEN);if(I0>0){PAGER.scrollLeft=I0*PAGER.clientWidth;setTimeout(()=>{PAGER.scrollLeft=I0*PAGER.clientWidth},60)}mark(I0>0?OPEN:(PG[0]&&PG[0].dataset.p))
  const KIND={body:'mus',tasks:'todo',msg:'msg',due:'due',ex:'exam',cls:'cls'}[OPEN];if(KIND&&ITEM!=='')setTimeout(()=>sh(KIND,ITEM),350)
  </script>
  </body></html>`
}
async function sendSay(id, text, channel) { return sendInbox(id, { source: "phone", say: text, id, channel: channel || "" }, "ask") }
async function sendInbox(id, obj, dir) {
  const token = Keychain.contains(KEY) ? Keychain.get(KEY) : ""
  if (!token) return "No GitHub token set."
  const z = n => String(n).padStart(2, "0"), t = new Date()
  const path = `${dir || "inbox"}/phone-${t.getFullYear()}${z(t.getMonth() + 1)}${z(t.getDate())}-${z(t.getHours())}${z(t.getMinutes())}${z(t.getSeconds())}-${id}.json`
  const r = new Request(`https://api.github.com/repos/${REPO}/contents/${path}`)
  r.method = "PUT"; r.timeoutInterval = 20
  r.headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "WidgetBoard", "Content-Type": "application/json" }
  r.body = JSON.stringify({ message: "phone: message to Claude", content: Data.fromString(JSON.stringify(obj, null, 2)).toBase64String() })
  try { await r.loadString() } catch (e) { return "No connection, not sent." }
  const sc = r.response?.statusCode
  if (sc === 201 || sc === 200) return ""
  if (sc === 403 || sc === 404) return "Your token can only read. Make one with Contents: Read and write, then tap Talk to Claude again."
  return `Not sent (GitHub ${sc}).`
}
async function fullView(m, chat, open, item) {
  const wv = new WebView()
  let tokenAsk = false
  wv.shouldAllowRequest = req => {
    const u = req.url || ""
    if (u.startsWith("board://say")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      sendSay(q.id, q.t, q.ch).then(async err => {
        if (err && err.startsWith("Your token") && !tokenAsk) { tokenAsk = true; await askToken(true) }
        await wv.evaluateJavaScript(err ? `sentFail(${JSON.stringify(q.id)}, ${JSON.stringify(err)})` : `sentOk(${JSON.stringify(q.id)})`, false)
      })
      return false
    }
    if (u.startsWith("board://gym")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      try { fm.writeString(gymLocalFile, JSON.stringify({ do: q.do, at: q.at, t: Date.now() })) } catch (e) { }
      sendInbox(Date.now().toString(36), { source: "phone", gym_session: q.do, at: q.at }, "ask").then(async err => { if (err) await wv.evaluateJavaScript(`FAIL.gym=${JSON.stringify(err)};draw('gym')`, false) })
      // the day you picked is logged, so the next suggestion follows from it (applied in the cloud without Claude)
      if (q.do === "end" && q.day) sendInbox(Date.now().toString(36) + "d", { source: "phone", actions: { gym_done: true, gym_day: q.day } }, "ask")
      return false
    }
    if (u.startsWith("board://act")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      if (q.k) markGone(q.k)
      sendInbox(Date.now().toString(36), { source: "phone", actions: JSON.parse(q.j) }, "ask").then(async err => { if (err) await wv.evaluateJavaScript(`toast(${JSON.stringify(err)})`, false) })
      return false
    }
    if (u.startsWith("board://cwlater")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      const L = loadLater(), until = Number(q.u); L[q.r] = until; try { fm.writeString(laterFile, JSON.stringify(L)) } catch (e) { }
      const z = n => String(n).padStart(2, "0"), dt = new Date(Math.min(until, 4070908800000)), iso = `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}T${z(dt.getHours())}:${z(dt.getMinutes())}`
      sendInbox(Date.now().toString(36), { source: "phone", actions: { coursework_hide: [{ ref: q.r, until: iso }] } }, "ask")
      if (until < 1e14) { const n = new Notification(); n.title = "Course task"; n.body = q.t; n.setTriggerDate(new Date(until)); n.openURL = URLScheme.forRunningScript() + "?open=cw"; n.schedule() }
      return false
    }
    if (u.startsWith("board://voice")) { fm.writeString(voiceFile, u.endsWith("on=1") ? "1" : "0"); return false }
    if (u.startsWith("board://notify")) {
      const list = JSON.parse(decodeURIComponent(u.split("j=")[1] || "[]"))
      ;(async () => { for (const r of list) { const n = new Notification(); n.title = r.title; n.body = r.body || ""; n.setTriggerDate(new Date(r.at)); n.openURL = URLScheme.forRunningScript(); await n.schedule() } })()
      return false
    }
    if (/^https?:/.test(u)) { Safari.open(u); return false }
    return true
  }
  await wv.loadHTML(pageHtml(m, chat, open, item))
  const voiceOn = () => fm.fileExists(voiceFile) && fm.readString(voiceFile) === "1"   // off unless you switch it on
  try { await wv.evaluateJavaScript(`setVoice(${voiceOn()})`, false) } catch (e) { }
  const heard = new Set((chat?.msgs || []).map(q => q.id))
  // today's gym session comes straight from the repo, so it is current even when the PC is off
  const pushSess = async () => { const z = n => String(n).padStart(2, "0"), d = new Date(), t = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); const gs = await getFile("gym-session.json"); if (gs && gs.date === t) { try { await wv.evaluateJavaScript(`setGym(${JSON.stringify(gs)})`, false) } catch (e) { } } }
  await pushSess()
  // replies come back through the repo: check every 12 s while the view is open
  const timer = Timer.schedule(12000, true, async () => {
    const c = await getFile("phone-chat.json")
    if (c) {
      try { await wv.evaluateJavaScript(`setChat(${JSON.stringify(c)})`, false) } catch (e) { }
      // a new answer from Claude or the coach: read it out
      for (const q of c.msgs || []) if (!heard.has(q.id)) { heard.add(q.id); if (q.role !== "user" && voiceOn()) Speech.speak(String(q.text).replace(/\s*\(Updated .*?\)\s*$/, "")) }
    }
    await pushSess()
  })
  await wv.present(true)
  timer.invalidate()
}
// items handled on the phone stay hidden for 3 hours, until the PC has caught up
const gymLocalFile = fm.joinPath(cacheDir, "gym-local.json"), laterFile = fm.joinPath(cacheDir, "later.json"), goneFile = fm.joinPath(cacheDir, "gone.json"), voiceFile = fm.joinPath(cacheDir, "voice.txt")
function loadGone() { let g = {}; try { if (fm.fileExists(goneFile)) g = JSON.parse(fm.readString(goneFile)) || {} } catch (e) { g = {} }; if (typeof g !== "object" || !g) g = {}; const t = Date.now(); for (const k in g) if (t - g[k] > 3 * 36e5) delete g[k]; return g }
// tasks ignored (forever) or put off (until a time): hidden on the phone and left out of the lock screen counts
function loadLater() { try { return fm.fileExists(laterFile) ? JSON.parse(fm.readString(laterFile)) || {} : {} } catch (e) { return {} } }
function hideLater(p, synced) { const L = loadLater(), S = synced?.items || {}, t = Date.now(); for (const g of p?.coursework || []) g.items = (g.items || []).filter(i => !(L[i.ref] > t) && !(S[i.ref] && new Date(S[i.ref]).getTime() > t)) }
function markGone(k) { try { const g = loadGone(); g[k] = Date.now(); fm.writeString(goneFile, JSON.stringify(g)) } catch (e) { } }
async function askToken(needWrite) {
  const a = new Alert(); a.title = needWrite ? "Token needs write access" : "Widget Board setup"
  a.message = "Your private data repo (owner/name) and a fine-grained GitHub token for that repo only, with Contents: Read and write (write is needed for taps and chat). Both stay on this phone."
  a.addTextField("owner/name", REPO); a.addSecureTextField("github_pat_...", ""); a.addAction("Save"); a.addCancelAction("Cancel")
  if (await a.present() === 0) {
    const r = a.textFieldValue(0).trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, ""), v = a.textFieldValue(1).trim()
    if (/^[\w.-]+\/[\w.-]+$/.test(r)) Keychain.set(REPO_KEY, r)
    if (v) Keychain.set(KEY, v)
  }
}

// ---------------------------------------------------------------- run
if (config.runsInApp && (!Keychain.contains(KEY) || !REPO)) { await askToken(); REPO = Keychain.contains(REPO_KEY) ? Keychain.get(REPO_KEY) : "" }
const [p, g, dgd, hid] = await Promise.all([getFile("phone.json"), getFile("digest.json"), getFile("digest-done.json"), getFile("hidden-tasks.json")])
hideLater(p, hid)
for (const g0 of p?.coursework || []) if (g0.abbr) ABBR[g0.course] = g0.abbr
// a gym tap on this phone that the synced data has not caught up with yet wins (start, end or delete)
try {
  const L = fm.fileExists(gymLocalFile) ? JSON.parse(fm.readString(gymLocalFile)) : null
  if (L && p?.gym && sameDay(new Date(L.t), new Date()) && L.t > Date.parse(p.generated || 0)) {
    const s0 = p.gym.session || {}
    if (L.do === "start") p.gym.session = { ...s0, started: L.at, ended: "" }
    else if (L.do === "end") p.gym.session = { ...s0, ended: L.at }
    else if (L.do === "delete") { p.gym.session = { started: "", ended: "", entries: [] }; p.gym.done_today = false }
  }
} catch (e) { }
const m = model(p, g, loadGone(), dgd?.items || {})
if (config.runsInWidget || config.runsInAccessoryWidget) try {
  const w = new ListWidget()
  const fam = config.widgetFamily
  if (!p) { w.addText(Keychain.contains(KEY) && REPO ? "No data yet" : "Open Widget Board once to set it up") }
  else if (fam === "accessoryInline") lockInline(w, m)
  else if (fam === "accessoryRectangular") { if ((args.widgetParameter || "").trim().toLowerCase() === "day") m.wx = await getWeather(m.p?.meta); else m.cwj = await getFile("coursework.json"); lockRect(w, m) }
  else if (fam === "accessoryCircular") lockCircle(w, m)
  else home(w, m, fam || "medium")
  if (!w.url) w.url = BOARD_URL || URLScheme.forRunningScript()
  const x = m.cur || m.next
  const soon = new Date(Date.now() + 15 * 60000)
  w.refreshAfterDate = x && (m.cur ? x.e : x.s) < soon ? (m.cur ? x.e : x.s) : soon
  const gs0 = m.p?.gym?.session || {}
  if (gs0.started && (!gs0.ended || new Date(gs0.started) > new Date(gs0.ended))) w.refreshAfterDate = new Date(Date.now() + 5 * 60000)
  Script.setWidget(w)
} catch (e) {
  // show the error on the widget instead of silently keeping the old picture
  const w = new ListWidget(); const t = w.addText(`Widget Board error ${e.line || ""}: ${e.message}`); t.font = Font.systemFont(10); t.lineLimit = 3
  Script.setWidget(w)
} else {
  const qp = args.queryParameters || {}
  m.cwj = await getFile("coursework.json"); m.glog = await getFile("gym-log.json"); m.bmap = await getAsset("assets/body-map.json");
  await fullView(m, await getFile("phone-chat.json"), qp.open, qp.item)
}
Script.complete()
