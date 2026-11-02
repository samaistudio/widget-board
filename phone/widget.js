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
// opening the app: what is saved on the phone first, so the page paints at once; refreshBehind() fetches the rest
async function fromPhone(name) {
  const cache = fm.joinPath(cacheDir, name.replace(/\//g, "_"))
  if (fm.fileExists(cache)) { try { return JSON.parse(fm.readString(cache)) } catch (e) { } }
  if (name === "assets/body-map.json") return getAsset(name)
  if (fm.fileExists(fm.joinPath(cacheDir, "phone.json"))) return null
  return getFile(name)
}
// the PC writes gym-log.json and the cloud job writes gym-phone.json (workouts logged from the phone); the app shows both
function mergeGym(a, b) {
  const list = v => Array.isArray(v) ? v : v?.items || [], out = list(a).filter(Boolean).map(w => ({ ...w }))
  for (const w of list(b)) { if (!w) continue; const e = out.find(x => x.date === w.date && x.day === w.day); if (e) e.exercises = (e.exercises || []).concat(w.exercises || []); else out.push(w) }
  return out.sort((x, y) => String(x.date).localeCompare(String(y.date)))
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
// a day the chat settled on today wins over the plan rotation, on the app and on the widgets
function daySuggest(p) {
  try {
    const f = fm.joinPath(cacheDir, "gym-session.json"), g = p.gym; if (!g || g.done_today || !fm.fileExists(f)) return
    const gs = JSON.parse(fm.readString(f)), z = n => String(n).padStart(2, "0"), d = new Date(), t = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate())
    const day = gs.date === t && gs.suggest ? (g.plan || []).find(x => x.title === gs.suggest) : null
    if (day) { g.next = day.title; g.exercises = (day.exercises || []).map(e => ({ name: e.name, sets: e.sets })) }
  } catch (e) { }
}
function model(p, g, gone = {}, dgDone = {}) {
  const now = new Date(); gone = gone || {}; dgDone = dgDone || {}
  if (p) {
    for (const g0 of p.coursework || []) if (g0.abbr) ABBR[g0.course] = g0.abbr
    daySuggest(p)
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
    const ts = d(m.app?.term_start || m.p?.meta?.term_start), start = ts && ts < ex.s ? ts : new Date(ex.s - 60 * 864e5), days = Math.ceil((ex.s - new Date()) / 864e5)
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
    // the first page: class, the rest of today, gym, tasks and the chat button. No messages or deadlines here.
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
  return `<div class="body"><div class="figs">${fig("front")}${fig("back")}</div><div class="legend">${legend}</div><p class="dim small" id="bodyHint">Slide over a muscle to highlight it, release to open it.</p></div>`
}
function heat(days) { return days <= 1 ? "#4CCF7A" : days <= 3 ? "#9BCB5E" : days <= 6 ? "#F2A33A" : "#F26B5E" }
// the user's settings: app-config.json in their data repo (examples/app-config.example.json, SETUP.md). The file is
// optional and every key has a default, so the app also runs without it, and without any courses
const COURSE_TREES = ["oak", "cherry", "pine", "maple", "plum", "lime", "jacaranda", "gold"], COURSE_COLS = ["#3F9E60", "#E37FA0", "#2F8A75", "#E08A38", "#7C8BD9", "#C77FD0", "#6FA9B8", "#D98A1F"], COURSE_VARS = ["--c1", "--c2", "--c3", "--c4", "--c6", "--c7", "--c8", "--c9"]
const NAME_SKIP = ["introduction", "advanced", "basics", "foundations", "fundamentals", "principles", "theory", "applied", "general", "modern", "topics"]
function appCfg(m) {
  const a = m.app && typeof m.app === "object" ? m.app : {}, ob = v => v && typeof v === "object" ? v : {}, num = (v, def) => v !== "" && v != null && isFinite(+v) ? +v : def
  const mins = s => { const q = String(s || "").split(":"); return q.length > 1 ? (+q[0]) * 60 + (+q[1]) : null }, norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  // your own course list, else what the board exports, by index, with Other for everything that is no course
  let list = Array.isArray(a.courses) ? a.courses : (m.p?.coursework || []).filter(g => !g.once && g.course).map(g => ({ name: g.course, short: g.abbr }))
  if (!Array.isArray(a.courses) && !list.length) list = (m.cwj?.courses || []).filter(c => c.module).map(c => ({ name: c.module }))
  const seen = new Set(), courses = list.map(c => typeof c === "string" ? { name: c } : ob(c)).filter(c => c.name).map((c, i) => {
    let short = String(c.short || abbr(c.name)).replace(/['"\\<>]/g, ""); if (!short || /^other$/i.test(short) || seen.has(short)) short += i + 1; seen.add(short)
    const words = [...new Set([short, c.name, ...(Array.isArray(c.keywords) ? c.keywords : []), ...norm(c.name).split(" ").filter(w => w.length >= 5 && !NAME_SKIP.includes(w))].map(norm).filter(Boolean))]
    return { name: String(c.name), short, tree: String(c.tree || COURSE_TREES[i % COURSE_TREES.length]), color: String(c.color || COURSE_COLS[i % COURSE_COLS.length]), cvar: COURSE_VARS[i % COURSE_VARS.length], words }
  })
  const dayList = v => Array.isArray(v) ? v.map(Number) : v === "weekdays" ? [1, 2, 3, 4, 5] : v === "weekends" ? [0, 6] : [0, 1, 2, 3, 4, 5, 6]
  const meals = (Array.isArray(a.meals) ? a.meals : []).map(ob).filter(x => x.name && mins(x.from) != null && mins(x.to) != null).map(x => ({ name: String(x.name), days: dayList(x.days), a: mins(x.from), b: mins(x.to), kcal: +x.kcal || 0, protein: +x.protein || 0, carbs: +x.carbs || 0, fat: +x.fat || 0 }))
  const g = ob(a.game), w = ob(a.wake), b = ob(a.body), fo = ob(a.food), ga = ob(a.goals), days = Math.max(1, Math.min(7, num(g.study_days, 5))), hours = Math.max(1, num(g.study_hours_week, 15))
  let locale = "en-GB"; try { if (a.locale) { new Date().toLocaleDateString(String(a.locale)); locale = String(a.locale) } } catch (e) { }
  return { name: String(a.name || "").trim(), courses, meals, currency: String(a.currency || ""), currency_after: a.currency_after === true, locale, location: a.location === true, nudges: a.nudges !== false,
    goals: { ...(+ga.kcal > 0 ? { kcal: +ga.kcal } : {}), ...(+ga.protein > 0 ? { protein: +ga.protein } : {}) }, wake: { from: String(w.from || "07:00"), to: String(w.to || "09:00") },
    game: { study_days: days, study_minutes_day: Math.round(hours * 60 / days), weekly: { moneycheck: 1, contact: 2, making: 2, application: 0, ...ob(g.weekly) } },
    body: { goal_kg: num(b.goal_kg, 0), goal_bf: num(b.goal_bf, 0), goal_bf_low: num(b.goal_bf_low, 0) }, food: { gym_free_week: num(fo.gym_free_week, 3), gym_extra_kcal: num(fo.gym_extra_kcal, 300), bonus_cap: num(fo.bonus_cap, 600) } }
}
function pageHtml(m, chat, open, item) {
  const now = new Date(), x = m.cur || m.next, J = o => JSON.stringify(o).replace(/</g, "\\u003c"), cfg = appCfg(m)
  const crsOf = n => { const k = String(n || "").toLowerCase(), c = cfg.courses.find(y => y.name.toLowerCase() === k || y.short.toLowerCase() === k); return c ? c.short : "Other" }
  const foodData = { items: [], ...(m.food || {}) }; foodData.goal = { ...cfg.goals, ...(foodData.goal || {}) }
  // a folding card: the header (title + one-line summary) is always visible, the body only when open
  const fold = (id, title, color, sum, body, extra = "") => `<section class="card fold" id="${id}"><header onclick="tg('${id}\')"><h2 style="color:${color}">${title}${extra ? `<span>${extra}</span>` : ""}</h2><div class="sum">${sum}</div><em>›</em></header><div class="bd">${body}</div></section>`
  const clsRow = c => `<div class="row tap" data-sh="cls:${esc(c.start)}"><b>${hm(c.s)}</b><div><div>${esc(c.title)} ${esc(c.kind)}</div><small>${esc(c.room)}</small></div></div>`
  const today = m.today.filter(c => c !== x)
  const weekHtml = (() => { let last = "", out = ""; for (const c of m.cls.filter(c => c !== x && !sameDay(c.s, now)).slice(0, 6)) { const dw = dayWord(c.s); if (dw !== last) { out += `<div class="day">${esc(dw)}</div>`; last = dw }; out += clsRow(c) }; return out })()
  const hero = `<section class="hero fold" id="cls"><header><div id="islF" onclick="islOpen()">${x ? `<div class="kick" style="color:${m.cur ? "#4CCF7A" : "#4A9CF2"}">${m.cur ? "On now" : "Up next"}</div>
      <div class="big">${esc(x.title)} <span class="dim">${esc(x.kind)}</span></div>
      <div class="sub">${esc(dayWord(x.s))} ${hm(x.s)} to ${hm(x.e)}${x.room ? " · " + esc(x.room) : ""}</div>
      <div class="count" data-t="${(m.cur ? x.e : x.s).getTime()}" data-pre="${m.cur ? "ends in " : "in "}"></div>` : `<div class="big">Nothing scheduled soon</div>`}
      </div><div id="islR"></div>
      <div class="sum">${today.length ? `${today.length} more today · ` : ""}tap for the next 14 days</div><em>›</em></header></section><!--today--><section class="card" id="clsl"><div class="bd"><h3 class="s-h" style="margin:16px 0 0">Coming up</h3>${today.length ? `<div class="remind tap" data-remind="today">Remind me 15 min before each class today</div>` : ""}${today.length ? `<div class="day">Later today</div>` + today.map(clsRow).join("") : ""}${weekHtml}</div></section>`
  const lastOf = ch => (chat?.msgs || []).filter(q => q.role !== "user" && (q.channel || "") === ch).slice(-1)[0]
  const chatBox = (ch, ph) => `<div class="voice tap" data-voice="1">Reads replies aloud: off</div><div class="chat" id="chat-${ch || "main"}"></div><div class="st dim" id="st-${ch || "main"}"></div><div class="att-l" id="att-${ch || "main"}"></div><div class="att-t"><label>Photos<input type="file" multiple accept="image/*,video/*,application/pdf,.pdf" style="display:none" onchange="attPick(this,'${ch}\')"></label><label>Camera<input type="file" accept="image/*" capture="environment" style="display:none" onchange="attPick(this,'${ch}\')"></label><span onclick="bcScan('${ch}\')">Barcodes</span></div><div class="inrow"><textarea id="ta-${ch || "main"}" rows="2" oninput="taFit(this)" placeholder="${ph}"></textarea><button onclick="send('${ch}\')">Send</button></div>`
  const last = lastOf("")
  const talk = fold("talk", "Chat", "#B07EE6", last ? esc(last.text) : "Tell it anything: add a task, change the plan, ask something", chatBox("", "Say or ask anything"))
  // gym: start/end the session, see what is logged, suggestions, and the coach chat that logs everything
  const gp = m.p?.gym || {}
  const gymSum = gp.session?.started && !gp.session?.ended ? "In session, tap to log" : gp.session?.ended ? `Done today · ${(gp.session.entries || []).length} logged` : "What are you doing today?"
  const musAll = (m.p?.muscles || []).slice().sort((a, b) => b.days - a.days)
  const behindTxt = m.behind.length ? `<p class="dim small" style="font-weight:600">Longest since trained: ${m.behind.slice(0, 8).map(b => esc(b.name) + (b.days >= 999 ? " (never)" : ` (${b.days} d)`)).join(", ")}</p>` : `<p class="dim small">Every muscle trained this week.</p>`
  const musChips = `<div class="chips">${musAll.map(b => `<div class="chip tap" data-sh="mus:${b.key}" style="border-color:${heat(b.days)}55;background:${heat(b.days)}22"><b style="color:${heat(b.days)}">${esc(b.name)}</b><small>${b.days >= 999 ? "never" : b.days === 0 ? "today" : b.days === 1 ? "yesterday" : b.days + " d ago"}${b.sets7 ? " · " + b.sets7 + " sets" : ""}</small></div>`).join("")}</div>`
  const gymCard = fold("gym", "Gym", "#F2A33A", gymSum,
    `${bodySvg(m)}${behindTxt}${musChips}<div id="gs"></div><div id="ge"></div><div id="gsug"></div>
     <div class="qk"><span onclick="qk('Starting now\')">Starting now</span><span onclick="qk('Elliptical 30 min\')">Elliptical 30 min</span><span onclick="qk('What should I do next?\')">What next?</span><span onclick="qk('Done for today\')">Done for today</span></div>
     ${chatBox("gym", "e.g. bench 3 x 8 at 60 kg")}`, gp.next ? "Suggested: " + esc(gp.next.replace(/^Day \d+:\s*/, "").replace(/ and /g, " + ")) : "")
  const bucket = (name, label, color) => { const L = m.msgs[name]; if (!L.length) return ""
    return `<details${name === "now" ? " open" : ""}><summary><i style="background:${color}"></i>${L.length} ${label}</summary>${L.map(q => `<div class="msg tap" data-sh="msg:${esc(q.id)}"><div class="from">${esc(q.from)}</div><div class="subj">${esc(q.subject)}</div>${q.action ? `<div class="act">${esc(q.action)}</div>` : ""}${q.why ? `<small>${esc(q.why)}</small>` : ""}</div>`).join("")}</details>` }
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
  const stand = cj.some(c => (c.behind || []).length || c.top) ? `<div class="stand">${cj.filter(c => (c.behind || []).length || c.top).map(c => `<div class="st1"><b>${esc(abbr(c.module) || c.module)}</b>${(c.behind || []).length ? `<ul>${c.behind.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${c.top ? `<small>Top student: ${esc(c.top)}</small>` : ""}</div>`).join("")}</div>` : ""
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
  return `<!doctype html><html data-theme="dark"><head><script>try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>
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
  .f-top{display:flex;align-items:flex-end;justify-content:space-between;margin:2px 2px 14px}.f-top h2{margin:0;font-size:30px;font-weight:800;letter-spacing:-.8px;text-transform:none;color:#fff;line-height:1.05}.f-top small{display:block;color:#8E8E93;font-size:13px;font-weight:600;margin-bottom:2px}.f-gear{width:40px;height:40px;border-radius:20px;background:#1C1D23;display:flex;align-items:center;justify-content:center;color:#C9C9CF}.f-gear svg{width:20px;height:20px}
  .f-week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:14px}.f-day{display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 0 9px;border-radius:16px;font-size:11px;font-weight:600;color:#8E8E93}.f-day.on{background:#1C1D23;color:#fff}.f-dr{position:relative;width:32px;height:32px}.f-dr svg{width:100%;height:100%;transform:rotate(-90deg)}.f-dr circle{fill:none;stroke-width:3.5}.f-dr b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#E8E8EC}
  .f-hero{position:relative;overflow:hidden;border-radius:30px;padding:22px 20px 20px;background:linear-gradient(160deg,#17372A 0%,#10201B 45%,#121418 100%);box-shadow:inset 0 1px 0 #ffffff14,0 14px 34px #0009}.f-hero:before{content:"";position:absolute;width:260px;height:260px;left:50%;top:-110px;margin-left:-130px;border-radius:50%;background:#4CCF7A;opacity:.13;filter:blur(55px)}.f-main{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}.f-side{text-align:center}.f-side b{display:block;font-size:22px;font-weight:800;letter-spacing:-.5px}.f-side small{font-size:12px;color:#ffffff80;font-weight:600}.f-mv{position:relative;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:16px;padding-top:13px;border-top:1px solid #ffffff1a;color:#fff}.f-mv b{display:block;font-size:14.5px;font-weight:700}.f-mv small{font-size:12.5px;color:#ffffff80}.f-mv span{font-size:14.5px;font-weight:800;color:#4CCF7A;white-space:nowrap}.f-mv:active{opacity:.6}.f-ring{position:relative;width:168px;height:168px}.f-ring svg{width:100%;height:100%;transform:rotate(-90deg);overflow:visible}.f-ring circle{fill:none;stroke-width:12}.f-ring .bg{stroke:#ffffff14}.f-ring .fg{stroke-linecap:round;transition:stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)}.f-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.f-num b{font-size:42px;font-weight:800;letter-spacing:-1.8px;line-height:1;color:#fff}.f-num small{font-size:13px;color:#ffffffa6;margin-top:5px;font-weight:600}
  .f-mac{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:20px}.f-mac small{display:block;font-size:12.5px;color:#ffffffb3;font-weight:600;margin-bottom:7px}.f-mac b{display:block;font-size:13.5px;font-weight:700;margin-top:7px;color:#fff}.f-mac b span{color:#ffffff66;font-weight:500}.f-bar{height:7px;border-radius:4px;background:#ffffff17;overflow:hidden}.f-bar i{display:block;height:100%;border-radius:4px;min-width:3px}
  .f-meal{background:#15161B;border-radius:24px;padding:14px;margin-top:10px;box-shadow:inset 0 1px 0 #ffffff0b}.f-mh{display:flex;align-items:center;gap:12px}.f-mi{width:46px;height:46px;border-radius:16px;display:flex;align-items:center;justify-content:center;flex:none}.f-mi svg{width:24px;height:24px}.f-mt{flex:1;min-width:0}.f-mt h3{margin:0;font-size:16.5px;font-weight:700;color:#fff;text-transform:none;letter-spacing:-.2px}.f-mt small{display:block;font-size:12.5px;color:#8E8E93;font-weight:500;margin-top:2px}.f-add{width:36px;height:36px;border-radius:18px;background:#4CCF7A;color:#04170B;font-size:24px;font-weight:600;display:flex;align-items:center;justify-content:center;line-height:1;flex:none;padding-bottom:2px;box-sizing:border-box}.f-row{display:flex;align-items:center;gap:12px;padding-top:11px;margin-top:11px;border-top:1px solid #ffffff0d}.f-th{width:40px;height:40px;border-radius:12px;flex:none;object-fit:cover;background:#26272E;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#C9C9CF}img.f-th{background:#fff;object-fit:contain}.f-row div.f-rt{flex:1;min-width:0}.f-rt b{display:block;font-size:14.5px;font-weight:600;color:#F2F2F5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.f-rt small{font-size:12px;color:#8E8E93}.f-row>span{font-size:14.5px;font-weight:700;color:#E8E8EC}.f-row>span small{font-size:11px;color:#8E8E93;font-weight:500;margin-left:2px}
  .f-dock{position:sticky;bottom:12px;z-index:5;display:grid;grid-template-columns:1fr 60px;gap:10px;margin-top:16px}.f-btn{height:60px;border-radius:30px;display:flex;align-items:center;justify-content:center;gap:10px;font-weight:800;font-size:16.5px;background:#4CCF7A;color:#04170B;box-shadow:0 10px 26px #000b,0 2px 14px #4CCF7A40}.f-btn svg{width:24px;height:24px}.f-btn.sq{background:#26272E;color:#fff;font-size:28px;font-weight:500;box-shadow:0 10px 26px #000b}.f-btn:active,.f-row:active,.f-add:active,.f-day:active,.f-cta:active,.f-sec:active{opacity:.6}
  .f-sh h3{margin:6px 0 2px;font-size:22px;font-weight:800;letter-spacing:-.4px;color:#fff;text-transform:none}.f-sh .sub{color:#8E8E93;font-size:13.5px;margin:0 0 12px;line-height:1.35}.f-lab{font-size:12px;color:#8E8E93;font-weight:700;margin:16px 0 7px;letter-spacing:.3px}.f-in{width:100%;box-sizing:border-box;background:#26272E;color:#fff;border:1.5px solid transparent;border-radius:15px;padding:14px;font-size:16px;font-weight:500;outline:0;-webkit-appearance:none}.f-in:focus{border-color:#4CCF7A}.f-in::placeholder{color:#77777F}.f-g{display:grid;grid-template-columns:1fr 1fr;gap:8px}.f-seg{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.f-seg::-webkit-scrollbar{display:none}.f-seg span{flex:none;background:#26272E;border-radius:17px;padding:10px 14px;font-size:13.5px;font-weight:700;color:#D5D5DA}.f-seg span.on{background:#4CCF7A;color:#04170B}
  .f-prod{display:flex;gap:13px;align-items:center}.f-prod img{width:68px;height:68px;object-fit:contain;background:#fff;border-radius:16px;flex:none}.f-big{display:flex;align-items:baseline;gap:6px;margin-top:14px}.f-big b{font-size:44px;font-weight:800;letter-spacing:-1.5px;color:#fff}.f-big small{color:#8E8E93;font-weight:600}.f-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.f-tiles div{background:#26272E;border-radius:15px;padding:11px 13px}.f-tiles small{display:block;font-size:12px;color:#8E8E93;font-weight:600}.f-tiles b{font-size:17px;color:#fff}
  .f-cta{display:block;background:#4CCF7A;color:#04170B;text-align:center;border-radius:17px;padding:16px;font-weight:800;font-size:16.5px;margin-top:18px}.f-sec{display:block;background:#26272E;color:#F2F2F5;text-align:center;border-radius:17px;padding:15px;font-weight:700;margin-top:8px}.f-sec.red{color:#F26B5E}.f-rec{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid #ffffff0d;font-size:14.5px}.f-rec span{color:#8E8E93;flex:none}.f-spin{width:30px;height:30px;border-radius:50%;border:3px solid #ffffff26;border-top-color:#4CCF7A;animation:fsp .8s linear infinite;margin:18px auto}@keyframes fsp{to{transform:rotate(360deg)}}
  #scan{position:fixed;inset:0;z-index:40;background:#000;display:none;color:#fff}#scan.on{display:block}#scan video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.sc-win{position:absolute;left:50%;top:40%;width:80vw;height:40vw;transform:translate(-50%,-50%);border-radius:26px;box-shadow:0 0 0 100vmax #000000a6;border:3px solid #ffffffd9;overflow:hidden;transition:border-color .15s,box-shadow .15s}.sc-win.seen{border-color:#F2A33A}.sc-win.ok{border-color:#4CCF7A;box-shadow:0 0 0 100vmax #000000a6,inset 0 0 40px #4CCF7A80}.sc-win i{position:absolute;left:6%;right:6%;height:2px;background:#4CCF7A;box-shadow:0 0 14px 3px #4CCF7A99;animation:scl 1.8s ease-in-out infinite alternate}.sc-win.ok i{display:none}@keyframes scl{from{top:10%}to{top:88%}}.sc-top{position:absolute;top:calc(env(safe-area-inset-top) + 12px);left:16px;right:16px;display:flex;justify-content:space-between}.sc-x{background:#ffffff26;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-radius:20px;padding:10px 17px;font-weight:700}.sc-t{position:absolute;left:0;right:0;top:calc(40% + 24vw);text-align:center;padding:0 24px}.sc-t b{display:block;font-size:18px;font-weight:700}.sc-t small{display:block;font-size:13.5px;color:#ffffffb3;margin-top:4px}.sc-b{position:absolute;left:18px;right:18px;bottom:calc(env(safe-area-inset-bottom) + 22px)}.sc-bs{display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center}.sc-bs label,.sc-bs span{display:block;background:#ffffff26;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-radius:18px;padding:16px;font-weight:700}.sc-bs input{display:none}
  .gbtn{background:#F2A33A}.gbtn.end{background:#2A2A31;color:#F2F2F5}
  .ent{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #ffffff0d}.ent small{display:block}.kc{color:#F2A33A;font-weight:600;white-space:nowrap}
  .sug{background:#1E1E24;border-radius:14px;padding:10px 12px;margin:10px 0;font-size:14px}.sug b{color:#F2A33A;font-size:12px;letter-spacing:.5px;display:block;margin-bottom:4px}
  .body{margin:2px 0 6px}.figs{display:flex;gap:6px;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.figs path.hot{stroke:#fff;stroke-width:9;filter:brightness(1.25)}.fig{flex:1;text-align:center}.fig svg{width:100%;height:auto;max-height:300px}.fig small{color:#8E8E93;font-size:11px}.legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 0 2px;font-size:11px;color:#8E8E93}.legend i{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:5px}.red{color:#F26B5E}
  .qk{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.qk span{background:#2A2A31;border-radius:14px;padding:6px 11px;font-size:13px}
  .b{max-width:82%;padding:9px 13px;border-radius:18px;white-space:pre-wrap;word-wrap:break-word}.b.me{align-self:flex-end;background:#7B52C9;color:#fff;border-bottom-right-radius:6px}.b.cl{align-self:flex-start;background:#24242B;border-bottom-left-radius:6px}.b.wait{opacity:.6}
  .st{font-size:12.5px;min-height:16px;margin:2px 2px 8px}
  .inrow{display:flex;gap:8px;align-items:flex-end}textarea{flex:1;background:#1E1E24;color:#F2F2F5;border:1px solid #ffffff1a;border-radius:18px;padding:10px 14px;font:16px -apple-system,system-ui,sans-serif;resize:none;outline:none}
  button{background:#B07EE6;color:#000;border:0;border-radius:18px;padding:11px 16px;font:600 15px -apple-system,system-ui,sans-serif}
  /* friendly theme: warm paper, rounded type, soft tinted cards. Follows the phone's light or dark mode */
  :root{color-scheme:light;--bg:#F6F2E8;--card:#FFFFFF;--fill:#F1ECE0;--ink:#2B2A25;--ink2:#55524A;--dim:#8B867A;--line:#00000012;--line2:#0000001f;--green:#3F9E60;--greens:#E3F2E1;--shadow:0 2px 10px #6b5d3a14;--bodyfill:#EDE7D9}
  :root[data-theme=dark]{color-scheme:dark;--bg:#0F1210;--card:#1A1E1A;--fill:#272C26;--ink:#F3F1E8;--ink2:#CFCCBF;--dim:#8F9286;--line:#ffffff10;--line2:#ffffff22;--green:#58BE7B;--greens:#21352A;--shadow:0 1px 0 #ffffff08 inset;--bodyfill:#272C26}
  html,body{background:var(--bg)}body{color:var(--ink);font:16px/1.38 ui-rounded,"SF Pro Rounded",-apple-system,system-ui,sans-serif;padding:max(10px,env(safe-area-inset-top)) 16px 0}
  .top{align-items:center;margin:6px 2px 14px}.top h1{font-size:28px;font-weight:800;letter-spacing:-.4px;line-height:1.1}.top small{display:block;font-size:14px;color:var(--dim);font-weight:600}
  .say{flex:none;display:flex;align-items:center;gap:7px;background:var(--green);color:#fff;font-weight:800;font-size:15px;padding:10px 15px;border-radius:22px;box-shadow:var(--shadow)}.say svg{width:18px;height:18px}.say:active{opacity:.7}
  #pager{margin:0 -16px;height:auto}.pg{padding:0 16px 24px}
  #nav{position:static;display:grid;grid-template-columns:repeat(7,1fr);gap:0;margin:0 -16px;overflow:visible;padding:8px 6px calc(4px + env(safe-area-inset-bottom));background:var(--card);border-top:1px solid var(--line)}
  #nav span{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;padding:2px 0;border-radius:0;color:var(--dim);font-size:11px;font-weight:700}#nav span svg{width:25px;height:25px}#nav span.on{background:none;color:var(--green)}
  .back{color:var(--green);font-weight:800;padding:2px 2px 10px;font-size:16px}
  .card,.hero{background:var(--card);border:0;border-radius:26px;box-shadow:var(--shadow);margin-bottom:14px}
  .hero{background:linear-gradient(165deg,#DFF0E2,#EEF5DC)}.hero .big,.hero .sub,.hero .kick,.hero .day,.hero .row *{color:#25402D!important}.hero .dim{color:#5C7562!important}.hero .sub{opacity:.82}.hero .row small{opacity:.72}.hero .row{border-top-color:#25402D1a}
  .kick{font-size:14px;font-weight:800;letter-spacing:0;text-transform:none}.big{font-size:27px;font-weight:800;line-height:1.15}.count{font-size:18px;font-weight:800;color:#2C7E4A}
  header{padding:18px 18px 12px;cursor:default}.hero header{padding:20px 20px 14px}.bd{padding:0 18px 16px}.hero .bd{padding:0 20px 16px}
  h2{font-size:24px;font-weight:800;letter-spacing:-.3px;text-transform:none;color:var(--ink)!important}h2 span{font-size:13px;color:var(--dim);align-self:center}
  .exs span{background:#ffffff99;color:#25402D;border-radius:14px;padding:6px 11px;font-weight:600}.exs b{color:#25402D!important}
  .day{color:var(--dim);font-size:14px;font-weight:800;text-transform:none;letter-spacing:0;margin:14px 0 2px}.remind{background:#ffffff99;color:#25402D}
  .row{border-top-color:var(--line);padding:11px 0}.row>b{color:var(--ink2)}small{color:var(--dim);font-size:13px}.dim{color:var(--dim)}.num{color:#D98A1F}
  details{border-top:0}summary{font-size:16px;font-weight:800;padding:8px 0 10px}summary i{display:none}
  .msg{background:var(--fill);border-radius:18px;padding:14px}.from{font-weight:800}.subj{color:var(--ink2)}.act{color:var(--ink)!important;font-weight:600;margin-top:8px}.msg small{display:none}
  .stand .top{display:block;color:var(--ink2);font-weight:500;font-size:15px;margin:0 0 10px}.st1{border-top-color:var(--line);padding:10px 0}.st1 ul{color:var(--ink);padding-left:0;list-style:none}.st1 li{background:var(--fill);border-radius:14px;padding:10px 12px;margin:6px 0}.st1 small{display:none}
  .course{border-top-color:var(--line)}.bar{height:8px;border-radius:4px;background:var(--fill)}.bar div{background:var(--green);border-radius:4px}
  .chk{padding:9px 0}.chk i{width:24px;height:24px;border-radius:12px;border:2px solid var(--line2);line-height:20px;color:#fff}.chk.done i{background:var(--green);border-color:var(--green)}.chk.done span{color:var(--dim)}
  .chip{border-width:0;border-radius:16px}.qk span{background:var(--fill);color:var(--ink);border-radius:16px;padding:9px 13px;font-size:14px;font-weight:600}
  .b.me{background:var(--green);color:#fff}.b.cl{background:var(--fill);color:var(--ink)}.chat{max-height:52vh}.chat>*{flex:none}
  .inrow button{background:var(--green);color:#fff;border:0;border-radius:18px;padding:12px 16px;font:800 15px ui-rounded,-apple-system,sans-serif}textarea{background:var(--fill);color:var(--ink);border:0;font-family:inherit}textarea::placeholder{color:var(--dim)}.voice{color:var(--dim)}
  #sheet{background:#0000004d}#shc{background:var(--card);color:var(--ink);border-radius:28px 28px 0 0}#shc .grab{background:var(--line2)}#shc p{color:var(--ink2)}#shc .li{border-top-color:var(--line)}.acts div{background:var(--fill);color:var(--ink)}.acts .pri{background:var(--green);color:#fff}
  #toast{background:var(--ink);color:var(--bg);bottom:calc(84px + env(safe-area-inset-bottom))}
  .figs path[data-sh]{stroke:var(--card)}.fig svg>path:first-child{fill:var(--bodyfill);stroke:var(--line2)}.legend,.fig small{color:var(--dim)}
  .sug{background:var(--fill)}.ent{border-top-color:var(--line)}.gbtn.end{background:var(--fill);color:var(--ink)}
  /* food */
  .f-top h2{color:var(--ink)!important}.f-top small{color:var(--dim)}.f-gear{background:var(--card);color:var(--ink2);box-shadow:var(--shadow)}.f-day{color:var(--dim)}.f-day.on{background:var(--card);color:var(--ink);box-shadow:var(--shadow)}.f-dr b{color:var(--ink)}.f-dr circle:first-child{stroke:var(--line2)}
  .f-hero{background:linear-gradient(165deg,#DFF0E2,#EEF5DC);box-shadow:var(--shadow)}.f-hero:before{display:none}.f-side b,.f-num b,.f-mac b{color:#25402D}.f-side small,.f-num small,.f-mac small{color:#25402Dad}.f-mac b span{color:#25402D80}.f-ring .bg{stroke:#25402D14}.f-bar{background:#25402D14}
  .f-list{background:var(--card);border-radius:26px;padding:16px;margin-top:14px;box-shadow:var(--shadow)}.f-list h3{margin:0;font-size:18px;font-weight:800}.f-list p{margin:8px 0 2px;color:var(--dim)}.f-row{border-top-color:var(--line)}.f-th{background:var(--fill);color:var(--ink2)}.f-rt b{color:var(--ink)}.f-rt small{color:var(--dim)}.f-row>span{color:var(--ink)}.f-row>span small{color:var(--dim)}
  .f-dock{grid-template-columns:1fr 58px 58px 58px;gap:8px}.f-btn{height:58px;border-radius:29px;background:var(--green);color:#fff;box-shadow:var(--shadow);white-space:nowrap}.f-btn.sq{background:var(--card);color:var(--ink);box-shadow:var(--shadow)}.f-btn input{display:none}
  .f-sh h3{color:var(--ink)}.f-sh .sub{color:var(--dim)}.f-lab{color:var(--dim)}.f-in{background:var(--fill);color:var(--ink);resize:none;font-family:inherit}.f-in::placeholder{color:var(--dim)}.f-in:focus{border-color:var(--green)}.f-seg span{background:var(--fill);color:var(--ink2)}.f-seg span.on{background:var(--green);color:#fff}
  .f-big b{color:var(--ink)}.f-tiles div{background:var(--fill)}.f-tiles b{color:var(--ink)}.f-cta{background:var(--green);color:#fff}.f-sec{background:var(--fill);color:var(--ink)}.f-rec{border-top-color:var(--line)}.f-rec b{color:var(--ink)}
  .f-spin{border-color:var(--line2);border-top-color:var(--green)}
  .f-ai{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:20px;padding:13px 15px;margin-bottom:12px;box-shadow:var(--shadow)}.f-ai b{display:block}.f-ai small{color:var(--dim)}.f-ai .f-spin{width:24px;height:24px;margin:0;flex:none}.f-aii{width:40px;height:40px;border-radius:20px;background:var(--greens);color:var(--green);display:flex;align-items:center;justify-content:center;flex:none}.f-aii svg{width:22px;height:22px}
  .f-pic{display:block;width:100%;max-height:38vh;object-fit:cover;border-radius:20px;margin-top:6px}.f-ait{display:flex;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--line)}.f-ait .f-rt{flex:1;min-width:0}.f-ait .f-in{width:74px;padding:9px;text-align:center;flex:none}.f-ait span{color:var(--dim);font-size:13px}.f-aix{width:30px;height:30px;border-radius:15px;background:var(--fill);color:var(--dim);display:flex;align-items:center;justify-content:center;flex:none;font-size:18px}
  #gym .bd{display:flex!important;flex-direction:column}#gs{order:-2}#ge{order:-1}#gym .red.small{display:none}.chip{background:var(--fill)!important}.chip b{color:var(--ink)!important}.chips{grid-template-columns:1fr 1fr 1fr}.chip{padding:9px 11px}.chip b{font-size:13.5px}.chip small{font-size:12px}
  .t-tile:last-child:nth-child(odd){grid-column:1/3}
  .s-kinds{display:flex!important;overflow-x:auto;gap:4px;margin:14px -4px 0;padding:0 4px;scrollbar-width:none}.s-kinds::-webkit-scrollbar{display:none}.s-kinds div{flex:0 0 48px}.s-rand{display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:var(--green);background:var(--fill)}.s-q{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:70px;font-weight:800;color:var(--green)}
  :root{--c1:#2a78d6;--c2:#eb6834;--c3:#1baf7a;--c4:#eda100;--c5:#e87ba4;--c6:#7c8bd9;--c7:#c77fd0;--c8:#6fa9b8;--c9:#d98a1f}:root[data-theme=dark]{--c1:#3987e5;--c2:#d95926;--c3:#199e70;--c4:#c98500;--c5:#d55181;--c6:#8a98e0;--c7:#b56ec0;--c8:#5f98a8;--c9:#c47c18}
  .d-q{display:flex;gap:7px;overflow-x:auto;margin:0 -16px 14px;padding:1px 16px;scrollbar-width:none}.d-q::-webkit-scrollbar{display:none}.d-q span{flex:none;background:var(--card);box-shadow:var(--shadow);border-radius:18px;padding:10px 15px;font-weight:700;font-size:14.5px}.d-q span.on{background:var(--greens);color:var(--green)}.d-q span:active{opacity:.6}
  .d-tl{padding:16px;margin-top:14px}.d-tl h3,.c-h h3{margin:0;font-size:18px;font-weight:800}.d-tl p{color:var(--dim);margin:8px 0}.d-r{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line);font-size:15px}.d-tl h3+.d-r{border-top:0;margin-top:4px}.d-r b{width:42px;flex:none;font-weight:700;font-size:13.5px;color:var(--dim);font-variant-numeric:tabular-nums}.d-r i{width:9px;height:9px;border-radius:5px;flex:none}.d-r span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.d-r small{flex:none}
  .j-c{display:flex;gap:13px;align-items:center;background:var(--card);border-radius:20px;padding:13px 15px;margin-bottom:9px;box-shadow:var(--shadow)}.j-c b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600;font-size:14.5px}.j-s{width:44px;height:44px;border-radius:22px;background:var(--greens);color:var(--green);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;flex:none}.j-l{background:var(--fill);border-radius:14px;padding:10px 12px;margin-bottom:6px;font-size:14.5px}.j-p{margin-top:10px}.j-p div{display:flex;align-items:center;gap:10px;padding:4px 0}.j-p span{width:64px;font-size:13.5px;font-weight:700;text-transform:capitalize}.j-p i{flex:1;height:8px;background:var(--fill);border-radius:4px;overflow:hidden;display:block}.j-p em{display:block;height:100%;background:var(--green);border-radius:4px}.j-p b{width:18px;text-align:right;font-size:13.5px}
  .c-card{padding:15px 15px 12px}.c-h{display:flex;justify-content:space-between;align-items:baseline}.c-h b{font-size:17px;font-weight:800}.c-h small{font-weight:600}.c-tip{font-size:12.5px;color:var(--dim);min-height:17px;margin:2px 0 8px}.c-plot{position:relative;display:flex;align-items:stretch;gap:2px;height:130px}.c-col{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;border-radius:6px}.c-col.on{background:var(--fill)}.c-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;align-items:center;min-height:0}.c-bar i{display:block;width:min(70%,18px);min-height:2px;border-radius:2px}.c-bar i:first-child{border-radius:4px 4px 2px 2px}.c-col small{height:18px;line-height:18px;text-align:center;font-size:10.5px;white-space:nowrap;overflow:visible}.c-goal{position:absolute;left:0;right:0;border-top:1.5px dashed var(--line2);pointer-events:none}.c-goal span{position:absolute;right:0;top:-16px;font-size:10.5px;color:var(--dim)}.c-leg{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;font-size:12.5px;color:var(--ink2)}.c-leg i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}.c-ai{padding:14px 16px}.c-ai small{display:block;font-weight:800;color:var(--green)}.c-ai b{font-weight:600;font-size:15px}
  #morn{position:fixed;inset:0;z-index:60;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}#morn small{font-size:17px;font-weight:700;color:var(--dim)}.mo-n{font-size:112px;font-weight:800;letter-spacing:-4px;line-height:1.05;color:var(--green)}.mo-n span{font-size:44px;letter-spacing:-1px;color:var(--dim)}.mo-q{width:100%;margin-top:28px}.mo-q div{background:var(--card);box-shadow:var(--shadow);border-radius:18px;padding:14px;margin-bottom:9px;font-weight:700}.mo-q div.on{background:var(--greens);color:var(--green)}.mo-x{margin-top:18px;color:var(--dim);font-weight:700;padding:12px 24px}
  .g-top{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.g-top div{background:var(--card);box-shadow:var(--shadow);border-radius:20px;padding:13px 4px;text-align:center}.g-top b{display:block;font-size:24px;font-weight:800;line-height:1.1}.g-top b small{font-size:13px}.g-top span{font-size:11.5px;color:var(--dim);font-weight:600}.g-h{margin:0 0 8px;font-size:18px;font-weight:800}.g-a{display:flex;align-items:center;gap:10px;padding:6px 0}.g-a span{width:76px;font-weight:700;font-size:14.5px;flex:none}.g-a span.g-w{width:118px}.g-a i,.g-b>i{flex:1;display:block;height:9px;border-radius:5px;background:var(--fill);overflow:hidden}.g-a em,.g-b em{display:block;height:100%;background:var(--green);border-radius:5px}.g-a b{width:34px;text-align:right;font-size:13.5px}.g-b{padding:9px 0;border-top:1px solid var(--line)}.g-h+.g-b{border-top:0}.g-b>b{display:block;font-weight:700}.g-b small{display:block;margin-bottom:6px}.g-wrap{flex-wrap:wrap}
  .hero{position:relative;background:linear-gradient(165deg,var(--s1,#DFF0E2),var(--s2,#EEF5DC));color:var(--st,#25402D)}.hero header{position:relative;z-index:1}.hero .big,.hero .sub,.hero .kick,.hero .count{color:var(--st,#25402D)!important}.hero .dim{color:var(--st,#25402D)!important;opacity:.62}.hero .exs span,.hero .exs b{color:var(--st,#25402D)!important}.hero .exs span{background:#ffffff33;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}.hero:before{content:"";position:absolute;width:64px;height:64px;border-radius:50%;left:var(--sx,70%);top:var(--sy,14px);background:var(--sun,#FFD568);box-shadow:0 0 34px 10px var(--sun,#FFD568);opacity:.5}.h-hill{position:absolute;left:0;right:0;bottom:0;width:100%;height:70px;pointer-events:none;color:var(--st,#25402D)}
  #nav,.say,#dial,.s-prev,#morn{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.f-seg,.qk,.c-plot,.f-week,.s-forest,.s-card,.f-row,.chk,.msg,#fg,.f-ait input,#gw,#gk,#gp{touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.f-seg{flex-wrap:wrap;overflow:visible}
  #nav span{transition:transform .16s cubic-bezier(.3,1.6,.5,1),color .12s}#nav span.hov{transform:translateY(-9px) scale(1.2);color:var(--green)}.f-seg span,.qk span{transition:transform .14s cubic-bezier(.3,1.6,.5,1)}.f-seg span.hov,.qk span.hov{transform:scale(1.1);box-shadow:0 0 0 2px var(--green)}
  .t-tile,.t-study,.s-card,.f-row,.m-row,.j-c,.d-q span,.s-btns span,.f-cta,.f-sec,.f-btn,.say,.s-ask,.f-add{transition:transform .15s cubic-bezier(.3,1.6,.5,1)}.t-tile:active,.t-study:active,.m-row:active,.j-c:active,.d-q span:active,.s-btns span:active,.f-cta:active,.f-sec:active,.f-btn:active,.say:active,.s-ask:active,.f-add:active{transform:scale(.96)}
  #fan{position:fixed;inset:0;z-index:55;background:#0000004d;-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);display:flex;align-items:flex-end;padding:0 14px calc(92px + env(safe-area-inset-bottom));touch-action:none}#fan.dn{align-items:flex-start;padding:calc(84px + env(safe-area-inset-top)) 14px 0}.fan-g{width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.fan-g div{background:var(--card);border-radius:20px;padding:15px 8px;text-align:center;font-weight:700;font-size:14px;line-height:1.2;box-shadow:0 8px 20px #0003;animation:fanin .24s cubic-bezier(.3,1.5,.5,1) both;transition:transform .13s cubic-bezier(.3,1.6,.5,1)}.fan-g i{display:block;width:26px;height:26px;border-radius:13px;margin:0 auto 7px}.fan-g div.hov{transform:scale(1.13);box-shadow:0 0 0 3px var(--green),0 10px 24px #0005}@keyframes fanin{from{opacity:0;transform:translateY(22px) scale(.82)}}
  .sw-l{position:fixed;z-index:15;padding:6px 13px;border-radius:15px;font-weight:800;font-size:14px;background:var(--fill);color:var(--dim);transition:transform .14s cubic-bezier(.3,1.6,.5,1);pointer-events:none}.sw-l.on{background:var(--green);color:#fff;transform:scale(1.14)}
  .s-mini{transition:transform .1s;transform-origin:50% 90%}.s-prev{transform-origin:50% 95%;transition:transform .08s;cursor:grab}.s-gl{font-size:13.5px;color:var(--dim);margin:2px 0 4px}.s-gl b{color:var(--green);font-weight:800;font-size:17px;margin-right:3px}
  .c-col{transition:background .1s}.f-day{transition:transform .14s cubic-bezier(.3,1.6,.5,1)}.f-day.hov{transform:translateY(-6px) scale(1.08)}.s-forest{position:relative;background:linear-gradient(180deg,var(--s1,#E3F2E1),#CFE6BE 62%,#B8D8A4)}.s-forest>div{transition:transform .14s cubic-bezier(.3,1.6,.5,1)}.s-forest>div.hov{transform:translateY(-10px) scale(1.3);z-index:2}.s-forest svg{transform-origin:50% 90%;animation:sway 5.5s ease-in-out infinite}.s-forest>div:nth-child(2n) svg{animation-delay:-2s}.s-forest>div:nth-child(3n) svg{animation-delay:-3.6s}@keyframes sway{0%,100%{transform:rotate(-1.4deg)}50%{transform:rotate(1.6deg)}}
  .dial{position:relative;width:min(74vw,290px);margin:10px auto 8px;cursor:grab}.dial svg{display:block;width:100%}.dial-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;text-align:center;padding:0 22%}.dial-c b{font-size:34px;font-weight:800;letter-spacing:-1px;font-variant-numeric:tabular-nums;line-height:1.1}.dial-c small{font-size:12.5px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  #fg,.f-ait input,#gw,#gk,#gp{background-image:repeating-linear-gradient(90deg,var(--line2) 0 1px,transparent 1px 9px);background-size:100% 7px;background-repeat:no-repeat;background-position:0 100%}
  .leaf{position:fixed;top:-14px;width:11px;height:11px;border-radius:0 70% 0 70%;z-index:70;pointer-events:none;animation:leaf 1.8s cubic-bezier(.3,.4,.6,1) forwards}@keyframes leaf{to{transform:translate(var(--dx),108vh) rotate(var(--r));opacity:.75}}
  @media (prefers-reduced-motion:reduce){.s-forest svg,.leaf,.fan-g div{animation:none}}
  .s-modes{display:grid!important;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--fill);border-radius:15px;padding:3px}.s-modes span{background:none;text-align:center;padding:9px 2px;border-radius:12px}.s-modes span.on{background:var(--card);color:var(--ink);box-shadow:var(--shadow)}.f-seg span.sug{box-shadow:inset 0 0 0 1.5px var(--green)}
  #bgair{position:fixed;inset:0;width:100%;height:100%;color:var(--ink);opacity:.045;pointer-events:none;z-index:0}.top,#pager,#nav{position:relative;z-index:1}
  .h-arrow{position:absolute;right:14px;top:14px;height:96px;width:66px;color:var(--arrow);opacity:.3;pointer-events:none}:root{--arrow:#6F9CC0}:root[data-theme=dark]{--arrow:#86AECD}.mo-arrow{position:absolute;left:50%;top:50%;height:min(70vh,520px);width:min(86vw,380px);transform:translate(-50%,-50%);color:var(--arrow);opacity:.14;pointer-events:none}#morn>*:not(.mo-arrow){position:relative}
  #nav span{position:relative}#nav span.on:before{content:"";position:absolute;top:-9px;width:12px;height:12px;background:var(--arrow);clip-path:polygon(33% 0,67% 0,70% 55%,100% 55%,50% 100%,0 55%,30% 55%)}#shc .grab{width:15px;height:16px;border-radius:0;background:var(--arrow);opacity:.55;clip-path:polygon(33% 0,67% 0,70% 55%,100% 55%,50% 100%,0 55%,30% 55%)}
  #islF{min-height:132px;position:relative;z-index:1;transition:transform .2s cubic-bezier(.2,.9,.3,1.1),opacity .2s}#islF.in{animation:islin .24s cubic-bezier(.2,.9,.3,1.1)}@keyframes islin{from{opacity:0;transform:translateY(7px) scale(.985)}}#islF .big{font-size:26px;line-height:1.14}.isl-b{display:inline-block;margin-top:10px;padding:9px 18px;border-radius:18px;background:var(--st,#25402D);color:var(--s2,#fff);font-weight:800;font-size:14.5px}.isl-l{margin-top:8px;color:var(--st,#25402D);opacity:.82;font-size:14.5px;line-height:1.5}
  #islR{position:relative;z-index:1;display:grid;grid-template-columns:repeat(6,1fr);gap:2px;margin:12px -8px 0;touch-action:none;-webkit-user-select:none;user-select:none}.isl-k{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0 5px;border-radius:15px;color:var(--st,#25402D);transition:transform .15s cubic-bezier(.3,1.6,.5,1),background .15s}.isl-k.on{background:#ffffff40}.isl-k.hov{transform:translateY(-5px) scale(1.12)}.isl-rg{position:relative;width:44px;height:44px}.isl-rg svg{width:100%;height:100%;transform:rotate(-90deg)}.isl-rg circle{fill:none;stroke:currentColor;stroke-width:3.5}.isl-rg .b{opacity:.15}.isl-rg .f{stroke-linecap:round;transition:stroke-dashoffset .5s}.isl-rg b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;font-variant-numeric:tabular-nums}.isl-k small{color:inherit;font-size:11px;font-weight:700;opacity:.85}.hero{touch-action:pan-y}
  /* study and the forest */
  .tree{display:block;width:100%;height:100%;overflow:visible}
  .s-ask{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:22px;padding:14px;box-shadow:var(--shadow);margin-bottom:6px}.s-ask span{width:42px;height:42px;border-radius:21px;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;flex:none}.s-ask svg{width:22px;height:22px}.s-ask b{font-size:17px;font-weight:700;color:var(--dim)}
  .s-h{font-size:19px;font-weight:800;margin:20px 2px 10px}
  .s-card{display:flex;gap:12px;background:var(--card);border-radius:24px;padding:14px;margin-bottom:10px;box-shadow:var(--shadow)}.s-mini{width:62px;height:72px;flex:none}.s-ct{flex:1;min-width:0}.s-ct b{display:block;font-size:16.5px;font-weight:700;margin-top:5px}.s-ct small{display:block;margin-top:2px}
  .s-c{display:inline-block;font-size:12.5px;font-weight:800;padding:2px 9px;border-radius:10px;color:#fff}
  .s-btns{display:flex;gap:8px;margin-top:10px}.s-btns span{padding:9px 16px;border-radius:17px;font-weight:800;font-size:14.5px}.s-go{background:var(--green);color:#fff}.s-no{background:var(--fill);color:var(--ink2)}.s-btns span:active{opacity:.6}
  .s-forest{display:grid;grid-template-columns:repeat(6,1fr);gap:6px 4px;background:linear-gradient(180deg,#E3F2E1,#D4E8C7);border-radius:26px;padding:16px 12px;min-height:90px;box-shadow:var(--shadow)}.s-forest div{height:58px}.s-forest p{grid-column:1/7;margin:auto;text-align:center;color:#25402D;font-weight:600}
  .s-week{background:var(--card);border-radius:22px;padding:12px 16px;margin-top:12px;box-shadow:var(--shadow)}.s-week div{display:flex;align-items:center;gap:10px;padding:6px 0}.s-week span{width:42px;font-weight:800;font-size:14px}.s-week i{flex:1;height:9px;border-radius:5px;background:var(--fill);overflow:hidden;display:block}.s-week em{display:block;height:100%;border-radius:5px}.s-week b{font-size:13px;color:var(--dim);white-space:nowrap}
  .s-run{text-align:center;padding-top:10px}.s-run small{font-size:15px;font-weight:800;color:var(--green)}.s-run h2{justify-content:center;margin:4px 12px 0}.s-big{width:230px;height:270px;margin:6px auto 0}.s-time{font-size:62px;font-weight:800;letter-spacing:-1.5px;font-variant-numeric:tabular-nums;line-height:1.1}.s-sub{color:var(--dim);margin:4px 0 18px}
  .s-prev{width:120px;height:140px;margin:6px auto 6px}.s-mid{justify-content:center;margin-top:10px}.s-kinds{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;margin-top:14px}.s-kinds div{height:50px;padding:3px;border-radius:12px}.s-kinds div.on{background:var(--greens)}
  .t-study{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:24px;padding:12px 16px;margin-bottom:14px;box-shadow:var(--shadow)}.t-study .s-mini{width:50px;height:58px}.t-study small{font-weight:800;color:var(--green)}.t-study b{display:block;font-size:16.5px;font-weight:700}
  .t-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.t-tile{background:var(--card);border-radius:24px;padding:15px 16px;box-shadow:var(--shadow);min-width:0}.t-tile small{display:block;font-weight:800;font-size:14px}.t-tile b{display:block;font-size:30px;font-weight:800;letter-spacing:-.6px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t-tile span{color:var(--dim);font-size:13.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t-tile:active,.t-study:active,.m-row:active,.s-ask:active{opacity:.65}
  .m-title{font-size:30px;font-weight:800;margin:2px 2px 12px;letter-spacing:-.5px}.m-row{display:flex;align-items:center;gap:13px;background:var(--card);border-radius:20px;padding:13px 15px;margin-bottom:9px;box-shadow:var(--shadow);font-weight:700;font-size:17px}.m-row i{width:12px;height:12px;border-radius:6px;flex:none}.m-row span{margin-left:auto;color:var(--dim);font-weight:600;font-size:15px}
  :root{--f1:#DFF0E2;--f2:#EEF5DC;--fh:#25402D;--g1:#BFDDA6;--g2:#B2D398;--g3:#8A6B4C;--g4:#75593E;--sk1:#DDEFF5;--sk2:#EEF5E2;--h0:#00000010;--h1:#BFE3C5;--h2:#6CC388;--h3:#2C8F52;--capc:#25402D}
  :root[data-theme=dark]{--f1:#1C3226;--f2:#17261F;--fh:#E8F4EA;--g1:#3F6B44;--g2:#37603C;--g3:#4A3827;--g4:#3B2C1E;--sk1:#142231;--sk2:#16251F;--h0:#ffffff0d;--h1:#23492F;--h2:#2F7A49;--h3:#58BE7B;--capc:#CFE5D5}
  .f-hero{background:linear-gradient(165deg,var(--f1),var(--f2))}.f-side b,.f-num b,.f-mac b{color:var(--fh)}.f-side small,.f-num small,.f-mac small,.f-mac b span{color:var(--fh);opacity:.68}.f-ring .bg{stroke:var(--line2)}.f-bar{background:var(--line2)}.isl-k.on{background:#ffffff26}
  #talk{padding:13px;margin-bottom:14px}#talk header{display:none}#talk .bd{padding:0}#talk .voice{display:none}#talk .st{margin:0}#talk .st:empty{display:none}#chat-main{max-height:32vh;padding:0 0 8px}#chat-main .dim{display:none}#talk textarea{min-height:44px}
  .tree{overflow:visible}.grw{transform-box:fill-box;transform-origin:50% 100%;animation:grw .7s cubic-bezier(.3,1.5,.5,1)}@keyframes grw{from{transform:scale(.72)}}
  .s-fh{display:flex;align-items:flex-end;justify-content:space-between;margin:20px 2px 10px}.s-fh .s-h{margin:0}.s-fr{gap:4px}.s-fr span{padding:6px 11px;font-size:12.5px}
  .s-forest{display:block;background:linear-gradient(180deg,var(--sk1),var(--sk2));padding:10px 8px 8px;border-radius:26px;box-shadow:var(--shadow)}.s-forest svg{display:block;width:100%;overflow:visible;animation:none!important;transform:none!important}.ft{fill:var(--g1)}.ft2{fill:var(--g2)}.fs1{fill:var(--g3)}.fs2{fill:var(--g4)}.s-tl{transform-box:fill-box;transform-origin:50% 100%;transition:transform .15s cubic-bezier(.3,1.6,.5,1)}.s-t.hov .s-tl{transform:translateY(-6px) scale(1.28)}.swy{transform-box:fill-box;transform-origin:50% 100%;animation:sway 5.5s ease-in-out infinite}.s-cap{text-align:center;font-weight:700;font-size:13.5px;color:var(--capc);margin-top:4px}
  .s-big{filter:drop-shadow(0 8px 14px #0000002e)}.s-kinds div.on{background:var(--greens)}
  .dial-lg{display:flex;justify-content:center;flex-wrap:wrap;gap:3px 11px;margin:2px 0 8px;font-size:12px;color:var(--dim)}.dial-lg i{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:4px}.dial-c small{padding:0 2px}
  .d-r,.l-r{touch-action:pan-y;-webkit-user-select:none;user-select:none}.l-g{padding:2px 14px;margin-bottom:6px}.l-r{display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid var(--line);font-size:15px;background:var(--card)}.l-g .l-r:first-child{border-top:0}.l-r b{width:42px;flex:none;font-weight:700;font-size:13px;color:var(--dim);font-variant-numeric:tabular-nums}.l-r i{width:9px;height:9px;border-radius:5px;flex:none}.l-r span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.l-r small{flex:none}.d-r{background:var(--card)}.sw-l:empty{display:none}
  #undo{position:fixed;left:16px;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:32;background:var(--ink);color:var(--bg);border-radius:18px;padding:14px 18px;display:none;justify-content:space-between;font-weight:700;box-shadow:0 8px 24px #0005}#undo.on{display:flex}#undo b{color:var(--green)}:root:not([data-theme=dark]) #undo b{color:#7FE0A0}
  .hm{display:grid;grid-template-columns:repeat(13,1fr);gap:3px;touch-action:pan-y}.h-w{display:grid;grid-template-rows:repeat(7,1fr);gap:3px}.h-c{display:block;aspect-ratio:1;border-radius:4px;transition:transform .12s}.h-c.hov{transform:scale(1.5)}.h-0,.h-c.h-e{background:var(--h0)}.h-c.h-e{opacity:.4}.h-1,.c-leg .h-1{background:var(--h1)}.h-2,.c-leg .h-2{background:var(--h2)}.h-3,.c-leg .h-3{background:var(--h3)}
  .nd{padding:14px 14px 6px;margin-bottom:14px}.nd-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}.nd-h h3{margin:0;font-size:18px;font-weight:800}.nd-h span{font-size:13.5px;font-weight:700;color:var(--green)}.nd-r{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);background:var(--card);touch-action:pan-y;-webkit-user-select:none;user-select:none}.nd-h+.nd-r{border-top:0}.nd-r>i{width:9px;height:9px;border-radius:5px;flex:none}.nd-t{flex:1;min-width:0}.nd-t b{display:block;font-size:15.5px;font-weight:700;line-height:1.25}.nd-t small{display:block;margin-top:1px}.nd-d{flex:none;background:var(--fill);color:var(--ink);font-weight:700;font-size:13px;padding:8px 11px;border-radius:14px;white-space:nowrap}.nd-d:active{transform:scale(.95)}
  .g-el{width:17px;height:17px;flex:none}.g-a span{width:66px}.cp-r{padding:11px 0;border-top:1px solid var(--line)}.cp-h{display:flex;justify-content:space-between;font-size:15px}.cp-h b{font-weight:700}.cp-h span{font-weight:800}.cp-b{margin-top:7px}.cp-b i{display:block;height:7px;border-radius:4px;background:var(--fill);overflow:hidden}.cp-b em{display:block;height:100%;background:var(--arrow);border-radius:4px}.cp-b small{display:block;margin-top:4px;line-height:1.35}.cp-b u{text-decoration:none;font-size:10px;font-weight:800;letter-spacing:.3px;padding:1px 5px;border-radius:5px;margin:0 2px;white-space:nowrap}.cp-SOURCED{background:var(--greens);color:var(--green)}.cp-ESTIMATE{background:var(--fill);color:var(--ink2)}.cp-b a{color:var(--dim);text-decoration:underline}
  .s-ren{font-size:13px;font-weight:700;color:var(--dim);margin-top:3px}.b-sp{display:block;width:100%}.b-add{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.b-add .f-sec{margin:0;padding:12px 4px;font-size:13.5px}.b-e{display:flex;gap:12px;align-items:center;background:var(--card);border-radius:18px;padding:10px;margin-bottom:9px;box-shadow:var(--shadow)}.b-e img,.b-ph{width:58px;height:74px;border-radius:12px;object-fit:cover;flex:none;background:var(--fill)}.b-e b{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-weight:600;font-size:14px}.b-cmp{position:relative;aspect-ratio:3/4;border-radius:16px;overflow:hidden;background:var(--fill);touch-action:none;-webkit-user-select:none;user-select:none}.b-cmp img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}.b-top{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}#bcbar{position:absolute;top:0;bottom:0;left:50%;width:3px;margin-left:-1.5px;background:#fff;box-shadow:0 0 8px #0008}.b-cmp small{position:absolute;bottom:7px;padding:3px 8px;border-radius:9px;background:#0009;color:#fff;font-weight:700}.b-cmp .l{left:7px}.b-cmp .r{right:7px}
  #chat-main .b{flex:none;padding-bottom:0;border-bottom:9px solid transparent;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}#chat-main .b.open{display:block}
  #dial.ds{touch-action:pan-y;width:auto;margin:10px 0 4px}.ds-r{display:flex;align-items:baseline;gap:10px;min-height:34px}.ds-r b{font-size:26px;font-weight:800;letter-spacing:-.6px;font-variant-numeric:tabular-nums}.ds-r small{flex:1;min-width:0;line-height:1.2}.ds-b{position:relative;height:40px;margin-top:5px;border-radius:12px;background:var(--fill);overflow:hidden}.ds-p{position:absolute;left:0;top:0;bottom:0;background:var(--greens)}.ds-b i{position:absolute;top:6px;bottom:6px;border-radius:6px;min-width:4px}.ds-b u{position:absolute;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:5px;box-shadow:0 0 0 2px var(--card)}.ds-b s{position:absolute;top:0;bottom:0;width:3px;margin-left:-1.5px;background:var(--ink);border-radius:2px;text-decoration:none}.ds-h{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--dim);margin:4px 1px 6px}
  .b.typing{display:flex;gap:4px;align-items:center;width:fit-content;min-height:18px}.b.typing i{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.25;animation:tyd 1.2s infinite}.b.typing i:nth-child(2){animation-delay:.2s}.b.typing i:nth-child(3){animation-delay:.4s}@keyframes tyd{0%,60%,100%{opacity:.25;transform:none}30%{opacity:1;transform:translateY(-3px)}}#gym.live .bd>*:not(#gs):not(#ge):not(#gsug):not(.qk):not(.chat):not(.st):not(.att-l):not(.att-t):not(.inrow):not(.voice){display:none}:root[data-theme=dark] .say,:root[data-theme=dark] .b.me,:root[data-theme=dark] .inrow button,:root[data-theme=dark] .f-btn:not(.sq),:root[data-theme=dark] .f-seg span.on,:root[data-theme=dark] .f-cta,:root[data-theme=dark] .s-go{color:#06210F}.att-t{display:flex;gap:6px;margin-bottom:8px}.att-t>*{flex:1;text-align:center;background:var(--fill);color:var(--ink);border-radius:14px;padding:10px 4px;font-size:13.5px;font-weight:700}.att-t>*:active{opacity:.6}.att{flex:none;width:44px;height:44px;border-radius:18px;background:var(--fill);color:var(--ink);display:flex;align-items:center;justify-content:center}.att svg{width:20px;height:20px}.att-l{display:flex;flex-wrap:wrap;gap:6px}.att-l:not(:empty){margin-bottom:8px}.att-c{position:relative;display:flex;align-items:center;gap:6px;background:var(--fill);border-radius:12px;padding:4px 26px 4px 4px;max-width:150px}.att-c img{width:34px;height:34px;border-radius:9px;object-fit:cover}.att-c>b{width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:11px;background:var(--card);border-radius:9px}.att-c small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.att-c i{position:absolute;right:6px;top:50%;margin-top:-10px;width:20px;height:20px;font-style:normal;text-align:center;line-height:20px;color:var(--dim)}.b-add{grid-template-columns:1fr 1fr}
  .r-x{flex:none;width:30px;height:30px;margin:-4px -4px -4px 0;border-radius:15px;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:18px;color:var(--dim);background:var(--fill)}.r-x:active{transform:scale(.88)}
  .mn-b{width:auto!important;white-space:nowrap}.g-a span.g-w{width:104px}.sc-s{display:flex;gap:10px;padding:6px 0;font-size:14px}.sc-s>b{flex:none;width:22px;height:22px;border-radius:11px;background:var(--fill);display:flex;align-items:center;justify-content:center;font-size:12px}.sc-s span{min-width:0}
  .top{gap:10px;justify-content:flex-start}.top-t{flex:1;min-width:0}.top .say{margin-left:auto}.top h1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bk{display:none;flex:none;width:38px;height:38px;border-radius:19px;background:var(--fill);color:var(--ink);align-items:center;justify-content:center;font-size:26px;line-height:1;padding-bottom:3px}.bk.on{display:flex}.bk:active{transform:scale(.9)}.sh-bk{display:inline-block;font-weight:800;font-size:15px;color:var(--green);padding:2px 10px 8px 0}
  #nav span{font-size:10.5px}

  .top h1{font-size:min(26px,5.9vw)}.bk.on+.top-t h1{font-size:min(22px,5.4vw)}.bk.on+.top-t small{font-size:12.5px}
  </style></head><body>
  <div class="top"><div id="bk" class="bk" onclick="goBack()" aria-label="Back">‹</div><div class="top-t"><small>${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</small><h1>${now.getHours() < 5 ? "Still up" : now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening"}${cfg.name ? ", " + esc(cfg.name) : ""}</h1></div><div class="say" onclick="sayOpen()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Say it</div></div>
  ${(() => {
    // the easy pages first, the ones that ask something of you last
    const icon = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + p + '"/></svg>'
    const NAVI = { cls: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z", study: "M12 21V11M12 11C12 7 9 5 5 5c0 4 3 6 7 6zM12 14c0-3 3-5 7-5 0 4-3 5-7 5z", gym: "M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12", food: "M7 3v8a2 2 0 0 0 4 0V3M9 3v18M17 3c-2 1-3 4-3 7 0 2 1 3 3 3zM17 13v8", stats: "M5 20v-7M12 20V5M19 20v-11", more: "M5 12h.01M12 12h.01M19 12h.01" }
    const sec = [["money", "Money", '<div id="mn"></div>', "", "#58BE7B"], ["body", "Body", '<div id="bd"></div>', "", "#D98A1F"], ["log", "Everything logged", '<div id="lg"></div>', "", "#2A78D6"], ["game", "Game", '<div id="gm"></div>', "", "#3F9E60"], ["journal", "Journal", '<div id="jr"></div>', "", "#3F9E60"], ["tasks", "Tasks", tasks, todos.length ? todos.length + " open" : "", "#8D62CF"], ["cw", "This week", cw, "", "#4A9CF2"], ["msg", "Messages", msgs, mn ? mn + " need you" : "", "#D9594C"], ["due", "Due", due, m.dls.length ? String(m.dls.length) : "", "#D98A1F"], ["ex", "Exams", exams, "", "#D98A1F"]].filter(p => p[2])
    const more = '<div class="m-title">More</div><div class="m-row" onclick="fxHelp()"><i style="background:#2A78D6"></i>Slide on everything</div><div class="m-row" onclick="fxTheme()"><i style="background:#555"></i>Appearance<span id="thm">Dark</span></div><div class="m-row" id="shr" onclick="fxShort()"><i style="background:#7FB2D6"></i>iPhone shortcuts</div><div class="m-row" onclick="fxSet()"><i style="background:#8E8E93"></i>Settings</div>' + sec.map(p => `<div class="m-row" onclick="tg('${p[0]}')"><i style="background:${p[4]}"></i>${p[1]}<span>${p[3]}</span></div>`).join("")
    const main = [["cls", "Today", hero.replace("<!--today-->", '<div id="nd"></div>' + talk + '<div id="tdy" style="margin-bottom:14px"></div>')], ["study", "Study", '<div id="sd"></div>'], ["gym", "Gym", gymCard], ["food", "Food", '<div id="fd"></div>'], ["stats", "Stats", '<div id="st"></div>'], ["more", "More", more]]
    return `<div id="pager">${main.map(p => `<div class="pg" data-p="${p[0]}">${p[2]}</div>`).join("")}${sec.map(p => `<div class="pg" data-p="${p[0]}">${p[2]}</div>`).join("")}</div>
      <nav id="nav">${main.map(p => `<span data-p="${p[0]}" onclick="tg('${p[0]}')">${icon(NAVI[p[0]])}${p[1]}</span>`).join("")}</nav>`
  })()}
  <div id="sheet"><div id="shc"></div></div><div id="toast"></div>
  <script>
  // the user's settings, see appCfg above
  const APP=${J(cfg)},CRS=APP.courses,CN=CRS.map(c=>c.short),CALL=CN.concat(['Other']),MEALS=APP.meals,STM=APP.game.study_minutes_day
  function nav(u){location.href=u}
  const cKey=c=>CN.includes(c)?c:'Other',cOf=c=>CRS.find(x=>x.short===c),sCol=c=>{const x=cOf(c);return x?x.color:'#8FA84A'},sVar=c=>{const x=cOf(c);return x?x.cvar:'--c5'},sOf=c=>cKey(c)==='Other'?'':' of '+c,sTree=c=>{const x=cOf(c);return x&&STREES[x.tree]?x.tree:'birch'}
  const sChip=c=>CN.length?'<span class="s-c" style="background:'+sCol(c)+'">'+H(c)+'</span>':'',sSeg=(cur,fn)=>CN.length?'<div class="f-seg s-mid">'+CALL.map(c=>'<span class="'+(c===cur?'on':'')+'" onclick="'+fn+'(\\x27'+fq(c)+'\\x27)">'+H(c)+'</span>').join('')+'</div>':''
  const mny=v=>{const a=Math.abs(+v||0),n=a>=100?0:2,s=a.toLocaleString(APP.locale,{minimumFractionDigits:n,maximumFractionDigits:n});return (v<0?'-':'')+(APP.currency_after?s+(APP.currency?' '+APP.currency:''):APP.currency+s)},mHm=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0')
  function tick(){document.querySelectorAll('.count').forEach(e=>{const s=Math.max(0,(+e.dataset.t-Date.now())/1000),h=Math.floor(s/3600),mi=Math.ceil(s%3600/60);e.textContent=e.dataset.pre+(h>=48?Math.round(h/24)+' days':h?h+' h'+(mi?' '+mi+' min':''):mi+' min')})}tick();setInterval(tick,20000)
  // one card open at a time: opening one folds the others, tapping the open one folds it
  const PG=[...document.querySelectorAll('.pg')],PAGER=document.getElementById('pager')
  function mark(id){const bk=document.getElementById('bk');if(bk)bk.classList.toggle('on',id!=='cls');const nv=document.querySelector('#nav span[data-p="'+id+'"]')?id:'more';document.querySelectorAll('#nav span').forEach(e=>e.classList.toggle('on',e.dataset.p===nv));if(id==='game')drawGame();if(id==='stats')drawStats();if(id==='talk')draw('');if(id==='gym'){draw('gym');drawGym()}}
  function tg(id){const i=PG.findIndex(p=>p.dataset.p===id);if(i<0)return;{const cu=PG[Math.round(PAGER.scrollLeft/PAGER.clientWidth)];if(cu&&cu.dataset.p!==id&&!window.BKING)BK.push(cu.dataset.p)}if(Math.round(PAGER.scrollLeft/PAGER.clientWidth)===i){PG[i].scrollTo({top:0,behavior:'smooth'});return}PAGER.scrollTo({left:i*PAGER.clientWidth,behavior:'smooth'});mark(id)}
  function fit(){PAGER.style.height=(innerHeight-PAGER.getBoundingClientRect().top-document.getElementById('nav').offsetHeight)+'px'}fit();addEventListener('resize',fit)
  let SCT;PAGER.addEventListener('scroll',()=>{clearTimeout(SCT);SCT=setTimeout(()=>{const i=Math.round(PAGER.scrollLeft/PAGER.clientWidth);if(PG[i])mark(PG[i].dataset.p)},80)})
  let CHAT=${chatJson},PEND=[],FAIL={},G=${J(gp.session || {})},PLAN=${J(gp.exercises || [])},DAY=${J(gp.next || "")},SUG=${J(gp.next || "")},LAST=${J(lastWorkout(m))},BEHIND=${J(m.behind.slice(0, 3).map(b => b.name))},LOCAL=false
  const H=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]),K=ch=>ch||'main'
  const CSEEN=new Set((CHAT.msgs||[]).map(q=>q.id)),TY={},COPEN={}
  function chatWait(ch){const M=(CHAT.msgs||[]).filter(q=>(q.channel||'')===ch),ans=new Set(M.filter(q=>q.role!=='user').map(q=>String(q.id).replace(/-r$/,''))),P=PEND.filter(p=>p.ch===ch),L=M.filter(q=>q.role==='user'&&!ans.has(q.id)).slice(-1)[0],id=P.length?P[P.length-1].id:L?L.id:'',t=id?parseInt(id,36):0,N=Date.now();return t&&t<=N&&N-t<3e5?t:0}
  function chatStat(ch,w){const M=(CHAT.msgs||[]).filter(q=>(q.channel||'')===ch&&q.role==='user'),who=ch==='gym'?'Coach':'Claude',sec=Math.round((Date.now()-w)/1000),last=M[M.length-1];return (PEND.some(p=>p.ch===ch)?'Sending':last&&last.at?who+' is typing':'Starting '+who)+', '+sec+' s'+(sec>60?'. Taking longer than usual.':'')}
  function chatOpen(){return ['','gym'].some(c=>chatWait(c))}
  setInterval(()=>{['','gym'].forEach(c=>{if(FAIL[c])return;const e=document.getElementById('st-'+K(c)),w=chatWait(c);if(e&&w)e.textContent=chatStat(c,w)})},1000)
  setInterval(()=>{for(const id in TY){const q=(CHAT.msgs||[]).find(x=>x.id===id),e=document.querySelector('[data-ty="'+id+'"]');if(!q||!e){delete TY[id];continue}const t=String(q.text);TY[id]+=Math.max(2,Math.ceil(t.length/60));if(TY[id]>=t.length){delete TY[id];e.textContent=t}else e.textContent=t.slice(0,TY[id]);const c=e.parentNode;c.scrollTop=c.scrollHeight}},30)
  function draw(ch){const c=document.getElementById('chat-'+K(ch));if(!c)return;const mine=(CHAT.msgs||[]).filter(q=>(q.channel||'')===ch),ids=new Set(mine.map(q=>q.id));PEND=PEND.filter(p=>!ids.has(p.id));mine.forEach(q=>{if(!CSEEN.has(q.id)){CSEEN.add(q.id);if(q.role!=='user')TY[q.id]=0}})
    const all=mine.slice(-30).concat(PEND.filter(p=>p.ch===ch)),end=c.scrollHeight-c.scrollTop-c.clientHeight<70,top0=c.scrollTop,lastId=all.length?String(all[all.length-1].id):'',grew=lastId!==c.dataset.last;c.dataset.last=lastId
    const w0=chatWait(ch),lastC=(mine.filter(x=>x.role!=='user').slice(-1)[0]||{}).id;c.innerHTML=all.length?all.map(q=>'<div class="b '+(q.role==='user'?'me':'cl')+(q.wait?' wait':'')+((COPEN[q.id]!==undefined?COPEN[q.id]:q.id===lastC)?' open':'')+'" data-i="'+H(q.id)+'"'+(TY[q.id]!=null?' data-ty="'+H(q.id)+'"':'')+'>'+H(TY[q.id]!=null?String(q.text).slice(0,TY[q.id]):q.text)+'</div>').join('')+(w0?'<div class="b cl typing"><i></i><i></i><i></i></div>':''):'<div class="dim">'+(ch==='gym'?'Tell your coach what you are doing. Everything gets logged.':'Say what you did, ask something, or tell it what to change. It updates your board.')+'</div>'
    document.getElementById('st-'+K(ch)).textContent=FAIL[ch]?FAIL[ch]:w0?chatStat(ch,w0):''
    c.scrollTop=end||grew?c.scrollHeight:top0}
  function setChat(o){if(o&&o.updated&&o.updated===CHAT.updated)return;if(o&&o.msgs){const inc=new Set(o.msgs.map(q=>q.id)),keep=(CHAT.msgs||[]).filter(q=>!inc.has(q.id));if(keep.length&&CHAT.updated&&o.updated&&o.updated<CHAT.updated){CHAT={...CHAT,msgs:(CHAT.msgs||[]).concat(o.msgs.filter(q=>!(CHAT.msgs||[]).some(x=>x.id===q.id)))}}else{CHAT={...o,msgs:o.msgs.concat(keep.filter(q=>!q.at))}}draw('');draw('gym');const l=o.msgs.filter(q=>q.role!=='user'&&!q.channel).slice(-1)[0];if(l)document.querySelector('#talk .sum').textContent=l.text;sayCheck()}}
  function sentOk(id){const p=PEND.find(p=>p.id===id);if(p){if(window.ATTJ&&ATT[p.ch||'']){ATT[p.ch||'']=[];attDraw(p.ch||'');window.ATTJ=''}CHAT.msgs=(CHAT.msgs||[]).concat([{id:p.id,role:'user',text:p.text,channel:p.ch}]);PEND=PEND.filter(x=>x.id!==id);draw(p.ch)}}
  function sentFail(id,why){const p=PEND.find(p=>p.id===id);PEND=PEND.filter(p=>p.id!==id);if(p){const t0=document.getElementById('ta-'+K(p.ch));t0.value=p.text;taFit(t0);FAIL[p.ch]=why;draw(p.ch)}}
  function send(ch){const ta=document.getElementById('ta-'+K(ch)),v=ta.value.trim(),L=ATT[ch||'']||[];if(!v&&!L.length)return;if(L.some(a=>a.busy)){toast('Still reading, one second');return}const id=Date.now().toString(36),c={};L.forEach(a=>{const k=a.code?'barcode':a.ext==='pdf'?'PDF':a.label.startsWith('Video')?'video frame':'photo';c[k]=(c[k]||0)+1});const mark=Object.keys(c).map(k=>'['+c[k]+' '+k+(c[k]>1?'s':'')+']').join(' '),txt=(v+' '+mark).trim();PEND.push({id,role:'user',text:txt,wait:true,ch});ta.value='';taFit(ta);FAIL[ch]='';draw(ch);if(L.length){window.ATTJ=JSON.stringify(L.filter(a=>!a.code).map(a=>({name:a.name,ext:a.ext,b64:a.b64})));window.ATTB=JSON.stringify(L.filter(a=>a.code).map(a=>Object.assign({code:a.code,name:a.name||''},a.p||{})));window.ATTW=ch||''}nav('board://say?id='+id+'&ch='+encodeURIComponent(ch)+'&att='+(L.length?1:0)+'&t='+encodeURIComponent(txt))}
  function taFit(t){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,innerHeight*.35)+'px';try{if(t.value)localStorage.setItem('draft-'+t.id,t.value);else localStorage.removeItem('draft-'+t.id)}catch(e){}}
  function qk(t){const ta=document.getElementById('ta-gym');ta.value=t;send('gym')}
  const iso=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+'T'+z(d.getHours())+':'+z(d.getMinutes())+':'+z(d.getSeconds())}
  let VOICE=false
  function setVoice(v){VOICE=!!v;document.querySelectorAll('[data-voice]').forEach(e=>e.textContent='Reads replies aloud: '+(VOICE?'on':'off'))}
  function gymDo(n,quiet){if(n&&!quiet&&!run()){setTimeout(()=>{const ta=document.getElementById('ta-gym');ta.value='Starting my session now'+(DAY?', doing '+DAY.replace(/^Day \\d+:\\s*/,'').toLowerCase():'')+'. What should I do first?';send('gym')},300)}const w=n?'start':'end';if(n){G=Object.assign({},G,{started:iso(),ended:''});LOCAL=true}else{G=Object.assign({},G,{ended:iso()})}nav('board://gym?do='+w+'&at='+encodeURIComponent(iso())+(n?'':'&day='+encodeURIComponent(DAY)));drawGym()}
  const run=()=>!!G.started&&(!G.ended||new Date(G.started)>new Date(G.ended))
  // the repo copy can lag behind a tap here: only take it once it has caught up with the local start
  function gymSug(s){const d=s.suggest&&(D.plan||[]).find(x=>x.title===s.suggest);if(!d||d.title===SUG)return;if(DAY===SUG){DAY=d.title;PLAN=d.exercises||[]}SUG=d.title;const e=document.querySelector('#gym h2 span');if(e)e.textContent='Suggested: '+SUG.replace(/^Day [0-9]+:[ ]*/,'').split(' and ').join(' + ');drawGym();if(window.drawIsland)drawIsland()}
  function setGym(s){if(!s)return;gymSug(s);if(DEL&&s.started===DEL)return;if(LOCAL&&!(s.started&&new Date(s.started)>=new Date(G.started)))return;LOCAL=false;G=s;drawGym()}
  let DEL=''
  function gymDel(el){if(!el.dataset.sure){el.dataset.sure=1;el.textContent='Tap again to delete it';el.style.color='#F26B5E';return}DEL=G.started||'';G={};LOCAL=false;nav('board://gym?do=delete&at='+encodeURIComponent(iso()));drawGym();toast('Session deleted')}
  function pickDay(i){const d0=D.plan[i];if(!d0)return;DAY=d0.title;PLAN=d0.exercises||[];drawGym();toast(DAY)}
  function el(t){const m=Math.max(0,Math.round((Date.now()-new Date(t))/1000)),h=Math.floor(m/3600),mi=Math.floor(m%3600/60),se=m%60;return (h?h+':':'')+String(mi).padStart(h?2:1,'0')+':'+String(se).padStart(2,'0')}
  function drawGym(){const gs=document.getElementById('gs');if(!gs)return;{const g0=document.getElementById('gym');if(g0)g0.classList.toggle('live',run())}const E=G.entries||[],kc=E.reduce((a,e)=>a+(+e.kcal||0),0)
    const short=t=>String(t).replace(/^Day \\d+:\\s*/,'').replace(/ and /g,' + ')
    const lastTxt=LAST?'Last time: '+H(short(LAST.day))+', '+ago(Math.round((new Date(new Date().toDateString())-new Date(LAST.date+'T00:00'))/864e5)):''
    const days=run()||G.ended?'':'<div class="k" style="margin-top:4px">WHAT ARE YOU DOING TODAY?</div><p class="dim small" style="margin:2px 0 0">Suggested: '+H(short(SUG))+(lastTxt?' · '+lastTxt:'')+'. Pick whatever you feel like.</p><div class="qk">'+D.plan.map((d0,i)=>'<span onclick="pickDay('+i+')" style="'+(d0.title===DAY?'background:#4CCF7A;color:#000;font-weight:700':d0.title===SUG?'box-shadow:inset 0 0 0 1.5px #4CCF7A':'')+'">'+H(short(d0.title))+'</span>').join('')+'</div>'
    const del=G.started?'<div class="dim small" style="text-align:right;margin:-4px 2px 8px" onclick="gymDel(this)">Delete this session</div>':''
    gs.innerHTML=days+(run()?'<div class="gsrow"><div><small>In session</small><b id="gt">'+el(G.started)+'</b></div><button class="gbtn end" onclick="gymDo(0)">End session</button></div>'
      :G.ended?'<div class="gsrow"><div><small>Done today</small><b>'+Math.max(0,Math.round((new Date(G.ended)-new Date(G.started))/60000))+' min</b></div><button class="gbtn" onclick="gymDo(1)">Go again</button></div>'
      :'<div class="gsrow"><div><small>Today</small><b style="font-size:18px">'+H(short(DAY)||'Free choice')+'</b></div><button class="gbtn" onclick="gymDo(1)">Start session</button></div>')+del
    document.getElementById('ge').innerHTML=E.length?E.map(e=>'<div class="ent"><div>'+H(e.name)+'<small>'+H([e.sets?e.sets+' sets':'',e.minutes?e.minutes+' min':'',e.detail].filter(Boolean).join(' · '))+'</small></div>'+(e.kcal?'<span class="kc">'+e.kcal+' kcal</span>':'')+'</div>').join('')+(kc?'<div class="ent"><div><b>Total</b></div><span class="kc">'+kc+' kcal</span></div>':''):''
    const done=new Set(E.map(e=>String(e.name).toLowerCase())),todo=PLAN.filter(x=>!done.has(String(x.name).toLowerCase()))
    document.getElementById('gsug').innerHTML=(todo.length||BEHIND.length)?'<div class="sug"><b>SUGGESTED</b>'+(todo.length?todo.slice(0,4).map(x=>'<div class="tap" data-ask="Doing '+H(x.name)+' now: " data-ch="gym">'+H(x.name)+' <span class="dim">'+H(x.sets)+'</span></div>').join(''):'')+(BEHIND.length?'<div class="dim" style="margin-top:6px">Not trained lately: '+H(BEHIND.join(', '))+'</div>':'')+'</div>':''}
  setInterval(()=>{const t=document.getElementById('gt');if(t&&run())t.textContent=el(G.started)},1000)
  const D=${dataJson},ITEM=${J(item ?? "")}
  const z2=n=>String(n).padStart(2,'0'),loc=d=>d.getFullYear()+'-'+z2(d.getMonth()+1)+'-'+z2(d.getDate())+'T'+z2(d.getHours())+':'+z2(d.getMinutes())
  const pd=s=>new Date(s&&s.length<=10?s+'T00:00':s),days=s=>Math.ceil((pd(s)-new Date())/864e5)
  const dw=s=>{const d=pd(s),t=new Date(),n=new Date(t);n.setDate(t.getDate()+1);if(d.toDateString()===t.toDateString())return 'Today';if(d.toDateString()===n.toDateString())return 'Tomorrow';return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
  const hhmm=s=>{const d=pd(s);return z2(d.getHours())+':'+z2(d.getMinutes())}
  const ago=n=>n>=999?'never':n===0?'today':n===1?'yesterday':n+' days ago'
  function toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2600)}
  function shx(){document.getElementById('sheet').classList.remove('on')}
  document.getElementById('sheet').addEventListener('click',e=>{if(e.target.id==='sheet')shx()})
  // a tap that changes the board: goes to the PC through the inbox; the item disappears here right away
  function act(obj,key,msg){['food_add','day_add','study_add'].forEach(k=>(obj[k]||[]).forEach(x=>{x.meta=x.meta||META(x.src)}));nav('board://act?k='+encodeURIComponent(key||'')+'&j='+encodeURIComponent(JSON.stringify(obj)));toast(msg||'Sent, your board updates in a few minutes');shx();if(key)document.querySelectorAll('[data-sh="'+key.replace(/"/g,'')+'"]').forEach(x=>x.style.display='none')}
  function remind(list,msg){nav('board://notify?j='+encodeURIComponent(JSON.stringify(list)));toast(msg);shx()}
  function ask(text,ch,now){shx();ch=ch||'';tg(ch==='gym'?'gym':'cls');if(ch!=='gym'){const e0=document.getElementById('talk');if(e0)setTimeout(()=>e0.scrollIntoView({block:'center',behavior:'smooth'}),300)}const ta=document.getElementById('ta-'+K(ch));ta.value=text;if(now)send(ch);else setTimeout(()=>{ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length)},400)}
  function go(u){nav(u)}
  // food: ring, macros, meals, add sheet, product sheet and the barcode scanner
  let FOOD=${J(foodData)}
  const FMEALS=[['breakfast','Breakfast',.25,'#F2A33A','M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3'],['lunch','Lunch',.35,'#4CCF7A','M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],['dinner','Dinner',.3,'#B07EE6','M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z'],['snack','Snacks',.1,'#F26B5E','M12 7c-1.5-1.6-3.6-2-5.3-1C4.5 7.300 4 10 5 13c1 3 3 7 5 7 1 0 1.300-.5 2-.5s1 .5 2 .5c2 0 4-4 5-7 1-3 .5-5.700-1.700-7-1.700-1-3.800-.6-5.300 1zM12 7c0-2 1-3.500 3-4']]
  const FICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 8v8M12 8v8M16 8v8"/></svg>',FGEAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>'
  let FOFF=0,FP=null,FMEAL='lunch'
  const fdateAt=o=>{const d=new Date();d.setDate(d.getDate()+o);return loc(d).slice(0,10)},fdate=()=>fdateAt(FOFF),fnum=s=>parseFloat(String(s||'').replace(',','.'))||0,fv=i=>{const e=document.getElementById(i);return e?e.value.trim():''},fq=s=>H(s).split('"').join('&quot;')
  const fhm=()=>new Date().toTimeString().slice(0,5)
  // entries not yet back from the cloud survive a reopen or refresh
  const fls=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||'[]');localStorage.setItem(k,JSON.stringify(v))}catch(e){return []}}
  ;(()=>{const t=Date.now(),a=fls('foodAdd').filter(x=>t-x.t<9e5),r=fls('foodDel').filter(x=>t-x.t<9e5);fls('foodAdd',a);fls('foodDel',r);const ids=new Set((FOOD.items||[]).map(x=>x.id));FOOD.items=(FOOD.items||[]).concat(a.filter(x=>!ids.has(x.it.id)).map(x=>x.it)).filter(x=>!r.some(y=>y.id===x.id))})()
  function drawFood(){const el=document.getElementById('fd');if(!el)return
    const L=(FOOD.items||[]).filter(x=>x.date===fdate()),sum=k=>L.reduce((a,x)=>a+(+x[k]||0),0),kc=Math.round(sum('kcal')),g=FOOD.goal||{},top=fGoal(fdate()),left=top-kc,bon=g.kcal?top-g.kcal:0
    const fatG=top?Math.round(top*.25/9):0,carbG=top?Math.max(0,Math.round((top-(g.protein||0)*4-fatG*9)/4)):0,C=2*Math.PI*76,pct=top?Math.min(1,kc/top):0,col=top&&left<0?'#F2A33A':'#4CCF7A'
    const mac=(n,v,goal,c)=>'<div><small>'+n+'</small><div class="f-bar"><i style="width:'+Math.min(100,goal?v/goal*100:0)+'%;background:'+c+'"></i></div><b>'+Math.round(v)+(goal?' <span>/ '+goal+' g</span>':' <span>g</span>')+'</b></div>'
    const sel=new Date(fdate()+'T12:00'),title=FOFF===0?'Today':FOFF===-1?'Yesterday':sel.toLocaleDateString('en-GB',{weekday:'long'})
    let week='';for(let o=-6;o<=0;o++){const ds=fdateAt(o),dd=new Date(ds+'T12:00'),k0=(FOOD.items||[]).filter(x=>x.date===ds).reduce((a,x)=>a+(+x.kcal||0),0),c0=2*Math.PI*14,t0=fGoal(ds),p0=t0?Math.min(1,k0/t0):(k0?1:0);week+='<div class="f-day'+(o===FOFF?' on':'')+'" onclick="foodDay('+o+')">'+dd.toLocaleDateString('en-GB',{weekday:'short'}).slice(0,2)+'<div class="f-dr"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" stroke="#ffffff14"/><circle cx="16" cy="16" r="14" stroke="'+(t0&&k0>t0?'#F2A33A':'#4CCF7A')+'" stroke-linecap="round" stroke-dasharray="'+c0+'" stroke-dashoffset="'+c0*(1-p0)+'"/></svg><b>'+dd.getDate()+'</b></div></div>'}
    el.innerHTML='<div class="f-top"><div><small>'+sel.toLocaleDateString('en-GB',{day:'numeric',month:'long'})+'</small><h2>'+title+'</h2></div><div class="f-gear" onclick="foodGoalSheet()">'+FGEAR+'</div></div><div class="f-week">'+week+'</div>'+foodAiBanner()
      +'<div class="f-hero"><div class="f-main"><div class="f-side"><b>'+kc+'</b><small>Eaten</small></div><div class="f-ring"><svg viewBox="0 0 168 168"><circle class="bg" cx="84" cy="84" r="76"/><circle class="fg" cx="84" cy="84" r="76" style="stroke:'+col+';stroke-dasharray:'+C+';stroke-dashoffset:'+C*(1-pct)+'"/></svg><div class="f-num"><b>'+(top?Math.abs(left):kc)+'</b><small>'+(!top?'kcal eaten':left<0?'kcal over':'kcal left')+'</small></div></div><div class="f-side" onclick="foodGoalSheet()"><b>'+(top||'Set')+'</b><small>Goal</small></div></div>'
      +'<div class="f-mac">'+mac('Protein',sum('protein'),g.protein,'#5AA9F5')+mac('Carbs',sum('carbs'),carbG,'#F2A33A')+mac('Fat',sum('fat'),fatG,'#B98BEB')+'</div>'+(fShare()&&top?'<div class="f-mv" onclick="moveSheet()"><div><b>Exercise</b><small>'+(bon?'Added to your goal':'Extra exercise raises your goal')+'</small></div><span>'+(bon?'+'+bon+' kcal':'Add')+'</span></div>':'')+'</div>'
      +foodList(L)
      +'<div class="f-dock"><div class="f-btn" onclick="foodScan()">'+FICON+'Barcode</div><label class="f-btn sq">'+FCAM+'<input type="file" accept="image/*" capture="environment" onchange="foodAiPic(this)"></label><div class="f-btn sq" onclick="foodSay()">'+FMIC+'</div><div class="f-btn sq" onclick="foodAddSheet()">+</div></div>'}
  function foodDay(o){FOFF=o;drawFood()}
  function foodList(L){const R=L.slice().sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));return '<div class="f-list"><h3>What you ate</h3>'+(R.length?R.map(x=>{const mn=FMEALS.find(m=>m[0]===x.meal);return '<div class="f-row" data-fid="'+fq(x.id)+'" onclick="foodItem(this.dataset.fid)">'+(x.img?'<img class="f-th" src="'+fq(x.img)+'">':'<div class="f-th">'+H(String(x.name).slice(0,1).toUpperCase())+'</div>')+'<div class="f-rt"><b>'+H(x.name)+'</b><small>'+[x.at,mn&&x.at?mn[1]:'',x.grams?Math.round(x.grams)+' g':'',Math.round(+x.protein||0)+' g protein'].filter(Boolean).join(' · ')+'</small></div><span>'+Math.round(+x.kcal||0)+'<small>kcal</small></span></div>'}).join(''):'<p>Nothing yet. Scan it, snap it or say it.</p>')+'</div>'}
  function foodPut(o){const it=Object.assign({id:Date.now().toString(36),date:fdate(),at:fhm(),meal:FMEAL,kcal:0,protein:0,carbs:0,fat:0,code:''},o);it.kcal=Math.round(it.kcal);['protein','carbs','fat'].forEach(k=>it[k]=Math.round(it[k]*10)/10);FOOD.items=(FOOD.items||[]).concat([it]);fls('foodAdd',fls('foodAdd').concat([{t:Date.now(),it}]));act({food_add:[it]},'','Added');drawFood()}
  const fseg=()=>'<div class="f-seg">'+FMEALS.map(([k,n])=>'<span class="'+(k===FMEAL?'on':'')+'" onclick="foodMeal(this,\\x27'+k+'\\x27)">'+n+'</span>').join('')+'</div>'
  function foodMeal(el,k){const was=FMEAL===k;FMEAL=was?'':k;el.parentNode.querySelectorAll('span').forEach(s=>s.classList.remove('on'));if(!was)el.classList.add('on')}
  function foodRecent(){const s=new Set(),r=[];for(const x of (FOOD.items||[]).slice().reverse()){if(!s.has(x.name)&&r.length<8){s.add(x.name);r.push(x)}}return r}
  function foodAddSheet(meal,name,code){B=[];FMEAL=meal||'';const rec=foodRecent();window.FCODE=code||''
    const n=(id,ph)=>'<input class="f-in" id="'+id+'" inputmode="decimal" placeholder="'+ph+'">'
    open_('<div class="f-sh"><h3>Add food</h3><p class="sub">'+(code?'Enter it once and it is saved for this barcode.':'Type what you ate, or pick something recent.')+'</p>'
      +(rec.length?'<div class="f-lab">RECENT</div>'+rec.map((x,i)=>'<div class="f-rec" onclick="foodAgain('+i+')"><b style="font-weight:600">'+H(x.name)+'</b><span>'+Math.round(+x.kcal||0)+' kcal</span></div>').join(''):'')
      +'<div class="f-lab">FOOD</div><input class="f-in" id="fn" placeholder="e.g. Chicken and rice" value="'+fq(name||'')+'">'
      +'<div class="f-lab">NUTRITION</div><div class="f-g">'+n('fk','Calories (kcal)')+n('fpr','Protein (g)')+n('fca','Carbs (g)')+n('ffa','Fat (g)')+'</div>'
      +'<div class="f-lab">MEAL (OPTIONAL)</div>'+fseg()+'<div class="f-cta" onclick="foodHand()">Add</div>'
      +(code?'':'<div class="f-lab">BARCODE DIGITS</div><div class="f-g"><input class="f-in" id="fc" inputmode="numeric" placeholder="4006381333931"><div class="f-sec" style="margin:0;padding:14px" onclick="foodCodeTyped()">Find</div></div>')+'</div>');window.FREC=rec}
  function foodHand(){const n=fv('fn');if(!n){toast('Enter a food name');return}if(!fv('fk')){toast('Enter the calories');return}const o={src:'manual',name:n,kcal:fnum(fv('fk')),protein:fnum(fv('fpr')),carbs:fnum(fv('fca')),fat:fnum(fv('ffa')),meal:FMEAL};if(window.FCODE)o.code=window.FCODE;foodPut(o)}
  function foodAgain(i){const x=window.FREC[i];if(x)foodPut({src:'repeat',name:x.name,kcal:x.kcal,protein:x.protein,carbs:x.carbs,fat:x.fat,grams:x.grams,code:x.code,img:x.img,meal:FMEAL})}
  function foodItem(id){B=[];const x=(FOOD.items||[]).find(i=>i.id===id);if(!x)return
    open_('<div class="f-sh"><h3>'+H(x.name)+'</h3><p class="sub">'+(x.grams?Math.round(x.grams)+' g':'One portion')+'</p><div class="f-big"><b>'+Math.round(+x.kcal||0)+'</b><small>kcal</small></div><div class="f-tiles"><div><small>Protein</small><b>'+Math.round(+x.protein||0)+' g</b></div><div><small>Carbs</small><b>'+Math.round(+x.carbs||0)+' g</b></div><div><small>Fat</small><b>'+Math.round(+x.fat||0)+' g</b></div></div>'
      +'<div class="f-cta" data-id="'+fq(x.id)+'" onclick="foodCopy(this.dataset.id)">Add again</div><div class="f-sec red" data-id="'+fq(x.id)+'" onclick="foodDel(this.dataset.id)">Remove</div></div>')}
  function foodCopy(id){const x=(FOOD.items||[]).find(i=>i.id===id);if(!x)return;FMEAL=x.meal||'';foodPut({src:'repeat',name:x.name,kcal:x.kcal,protein:x.protein,carbs:x.carbs,fat:x.fat,grams:x.grams,code:x.code,img:x.img,meal:FMEAL})}
  function foodDel(id){logRm('food',id)}
  function foodGoalSheet(){B=[];const g=FOOD.goal||{};open_('<div class="f-sh"><h3>Daily goal</h3><p class="sub">Carbs and fat are worked out from these two.</p><div class="f-lab">CALORIES (KCAL)</div><input class="f-in" id="gk" inputmode="numeric" placeholder="No goal yet" value="'+(g.kcal||'')+'"><div class="f-lab">PROTEIN (G)</div><input class="f-in" id="gp" inputmode="numeric" placeholder="No goal yet" value="'+(g.protein||'')+'"><div class="f-lab">EXTRA EXERCISE ADDS</div><div class="qk" id="ges"></div><p class="sub" style="margin:8px 0 0">How much of what extra exercise burns goes back into your calories. Half is the default because burn estimates run high. Your first '+APP.food.gym_free_week+' gym sessions a week are already in your goal.</p><div class="f-cta" onclick="foodGoal()">Save</div></div>');window.GES=fShare();goalEarn()}
  function goalEarn(v){if(v!==undefined)window.GES=v;const e=document.getElementById('ges');if(e)e.innerHTML=[['Off',0],['Half',.5],['All',1]].map(x=>'<span onclick="goalEarn('+x[1]+')"'+(x[1]===window.GES?' style="background:#4CCF7A;color:#000;font-weight:700"':'')+'>'+x[0]+'</span>').join('')}
  // extra exercise raises a day's calories: logged moves plus any gym session after the third that week
  const MOVES=[['Walk',3.5],['Fast walk',4.5],['Run',9.5],['Cycling',7.5],['Swimming',7],['Sport',7],['Extra gym',5]]
  function fShare(){const e=(FOOD.goal||{}).earn;return e===undefined?.5:+e||0}
  function fMoves(d){const L=gEv(d,'move').map(x=>({id:x.id,t:x.label,v:+x.value||0}));if(!L.some(x=>/^Gym session/.test(x.t))&&gTrained(d)){const m=gMon(d);let n=0;for(let o=0;gPlus(m,o)<=d;o++)if(gTrained(gPlus(m,o)))n++;if(n>APP.food.gym_free_week)L.push({t:'Gym session '+n+' this week',v:APP.food.gym_extra_kcal})}return L}
  function fBonus(d){const s=fShare();return s?Math.min(APP.food.bonus_cap,Math.round(fMoves(d).reduce((a,x)=>a+x.v,0)*s/10)*10):0}
  function fGoal(d){const k=(FOOD.goal||{}).kcal||0;return k?k+fBonus(d):0}
  function moveSheet(){B=[];const L=fMoves(fdate());window.MVL=L;window.MVI=window.MVI||0;open_('<div class="f-sh"><h3>Add exercise</h3><p class="sub">Or just tell the chat what you did and it estimates the calories.'+(APP.food.gym_extra_kcal?' Gym session number '+(APP.food.gym_free_week+1)+' or later in a week counts by itself.':'')+'</p><div class="f-lab">WHAT</div><div class="qk" id="mvk"></div><div class="f-lab">MINUTES</div><input class="f-in" id="mvm" inputmode="numeric" placeholder="30" oninput="moveCalc()"><p class="sub" id="mvn" style="margin:10px 0 0"></p><div class="f-cta" onclick="moveAdd()">Add</div>'+(L.length?'<div class="f-lab">ADDED THIS DAY</div>'+L.map((x,i)=>'<div class="f-rec" onclick="moveEdit('+i+')"><b style="font-weight:600">'+H(x.t)+'</b><span>'+x.v+' kcal burned, tap to change</span></div>').join(''):'')+'</div>');movePick(window.MVI)}
  function movePick(i){window.MVI=i;const e=document.getElementById('mvk');if(e)e.innerHTML=MOVES.map((x,k)=>'<span onclick="movePick('+k+')"'+(k===i?' style="background:#4CCF7A;color:#000;font-weight:700"':'')+'>'+x[0]+'</span>').join('');moveCalc()}
  function moveBurn(){const T=bTrend(),kg=T?T.now:75;return Math.round((MOVES[window.MVI][1]-1)*kg*(parseInt(fv('mvm'))||0)/60)}
  function moveCalc(){const e=document.getElementById('mvn');if(!e)return;const b=moveBurn(),now=fBonus(fdate()),s=fShare(),cap=APP.food.bonus_cap,add=Math.min(cap,Math.round((fMoves(fdate()).reduce((a,x)=>a+x.v,0)+b)*s/10)*10)-now;e.textContent=!b?'':fGoal(fdate())?'Burns about '+b+' kcal above resting. Adds '+add+' kcal to your goal'+(now+add>=cap?', '+cap+' is the daily limit.':'.'):'Burns about '+b+' kcal above resting.'}
  function moveAdd(){const m=parseInt(fv('mvm'));if(!m){toast('Enter the minutes');return}const e={id:Date.now().toString(36)+'d',date:fdate(),at:fhm(),kind:'move',label:MOVES[window.MVI][0]+' '+m+' min',value:moveBurn(),src:'tap'};DLOG.events=(DLOG.events||[]).concat([e]);fls('dayAdd',fls('dayAdd').concat([{t:Date.now(),e}]));act({day_add:[e]},'',fGoal(e.date)?'Goal is now '+fGoal(e.date)+' kcal':'Logged '+e.label);drawAll()}
  function moveEdit(i){const x=window.MVL[i];if(!x)return;window.MVX=x;B=[];open_('<div class="f-sh"><h3>'+H(x.t)+'</h3><p class="sub">Calories burned above resting. This is an estimate, so change it if you know better.</p><div class="f-lab">BURNED (KCAL)</div><input class="f-in" id="mvv" inputmode="numeric" value="'+x.v+'"><div class="f-cta" onclick="moveSave()">Save</div><div class="f-sec" onclick="moveDrop()">Delete</div></div>')}
  function moveNew(v,msg){const e={id:Date.now().toString(36)+'d',date:fdate(),at:fhm(),kind:'move',label:window.MVX.t,value:v,src:'tap'};DLOG.events=(DLOG.events||[]).concat([e]);fls('dayAdd',fls('dayAdd').concat([{t:Date.now(),e}]));act({day_add:[e]},'',msg);drawAll()}
  function moveSave(){const v=parseInt(fv('mvv')),x=window.MVX;if(!(v>=0)){toast('Enter the calories');return}if(!x.id){moveNew(v,'Saved');return}const e=(DLOG.events||[]).find(y=>y.id===x.id);if(e)e.value=v;fls('dayAdd',fls('dayAdd').map(y=>{if(y.e.id===x.id)y.e.value=v;return y}));act({day_edit:[{id:x.id,label:x.t,value:v}]},'','Saved');drawAll()}
  function moveDrop(){const x=window.MVX;if(x.id){shx();logRm('day',x.id)}else moveNew(0,'Not counted')}
  function foodGoal(){const k=parseInt(fv('gk')),p=parseInt(fv('gp'));if(!k){toast('Enter a calorie goal');return}FOOD.goal={kcal:k,protein:p||0,earn:window.GES};act({food_goal:FOOD.goal},'','Goal saved');drawFood()}
  // product from the barcode: choose grams and meal, numbers update live
  function foodProduct(p){B=[];FP=p;FMEAL='';const gs=[...new Set([p.grams||100,50,100,150,200])]
    open_('<div class="f-sh"><div class="f-prod">'+(p.img?'<img src="'+fq(p.img)+'">':'')+'<div><h3>'+H(p.name)+'</h3><p class="sub" style="margin:0">'+H(p.brand||'')+(p.brand?' · ':'')+Math.round(p.kcal100)+' kcal per 100 g</p></div></div>'
      +'<div class="f-big"><b id="fpk">0</b><small>kcal</small></div><div class="f-tiles"><div><small>Protein</small><b id="fpp">0</b></div><div><small>Carbs</small><b id="fpc">0</b></div><div><small>Fat</small><b id="fpf">0</b></div></div>'
      +'<div class="f-lab">AMOUNT (G)</div><input class="f-in" id="fg" inputmode="decimal" value="'+(p.grams||100)+'" oninput="foodCalc()"><div class="f-seg" style="margin-top:8px">'+gs.map(x=>'<span onclick="foodGrams('+x+')">'+x+' g</span>').join('')+'</div>'
      +'<div class="f-lab">MEAL (OPTIONAL)</div>'+fseg()+'<div class="f-cta" onclick="foodAddP()">Add</div></div>');foodCalc()}
  function foodGrams(x){document.getElementById('fg').value=x;foodCalc()}
  function foodCalc(){if(!FP)return;const f=fnum(fv('fg'))/100,s=(i,v)=>document.getElementById(i).textContent=v;s('fpk',Math.round(FP.kcal100*f));s('fpp',Math.round(FP.prot100*f)+' g');s('fpc',Math.round(FP.carb100*f)+' g');s('fpf',Math.round(FP.fat100*f)+' g')}
  function foodAddP(){if(!FP)return;const gr=fnum(fv('fg'))||100,f=gr/100,p=FP;FP=null;foodPut({src:'barcode',name:p.name,kcal:p.kcal100*f,protein:p.prot100*f,carbs:p.carb100*f,fat:p.fat100*f,grams:gr,code:p.code,img:p.img||'',meal:FMEAL})}
  function foodCode(c){c=String(c).split(' ').join('');const prev=(FOOD.items||[]).slice().reverse().find(x=>x.code===c)
    if(prev&&prev.grams){const f=100/prev.grams;foodProduct({code:c,name:prev.name,img:prev.img,kcal100:prev.kcal*f,prot100:prev.protein*f,carb100:(prev.carbs||0)*f,fat100:(prev.fat||0)*f,grams:prev.grams});return}
    if(prev){FMEAL='';foodPut({name:prev.name,kcal:prev.kcal,protein:prev.protein,carbs:prev.carbs,fat:prev.fat,code:c,meal:FMEAL});return}
    B=[];open_('<div class="f-sh" style="text-align:center"><h3>Looking it up</h3><p class="sub">Barcode '+H(c)+'</p><div class="f-spin"></div></div>');nav('board://foodcode?c='+encodeURIComponent(c))}
  function foodCodeTyped(){const c=fv('fc');if(!foodValid(c)){toast('That is not a valid barcode number');return}foodCode(c)}
  function foodFound(p,c,name){if(p){foodProduct(p);return}B=[];window.FMC=c;window.FMN=name||''
    open_('<div class="f-sh"><h3>'+(name?H(name):'Product not found')+'</h3><p class="sub">Barcode '+H(c)+(name?' has no nutrition values in the database.':' is not in the database.')+'</p><div class="f-cta" onclick="foodScan()">Scan again</div><div class="f-sec" onclick="foodAddSheet(null,window.FMN,window.FMC)">Enter it by hand</div></div>')}
  // a barcode counts only with a correct check digit and a real length
  function foodValid(t){if(!/^[0-9]+$/.test(t)||![8,12,13].includes(t.length)||/^(.)[0-9]*$/.test(t)&&new Set(t).size===1)return false;const d=[...t].map(Number),chk=d.pop();let s=0;d.reverse().forEach((n,i)=>{s+=n*(i%2?1:3)});return (10-s%10)%10===chk}
  // scanner: reads only inside the window, and only accepts the same valid code several times in a row
  let SCDONE=true,SCPHOTO=null,SCST=null,SCM=null,SCLAST='',SCN=0,FSCT=0,SCC=null
  const scm=(a,b)=>{const e=document.getElementById('scm');if(e)e.innerHTML='<b>'+H(a)+'</b><small>'+H(b||'')+'</small>'},scw=c=>{const e=document.getElementById('scw');if(e)e.className='sc-win'+(c?' '+c:'')}
  function foodHints(hard){const h=new Map(),F=ZXing.BarcodeFormat;h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[F.EAN_13,F.EAN_8,F.UPC_A]);if(hard)h.set(ZXing.DecodeHintType.TRY_HARDER,true);return h}
  function foodScan(){shx();let o=document.getElementById('scan');if(!o){o=document.createElement('div');o.id='scan';o.innerHTML='<video id="scv" playsinline muted autoplay></video><div class="sc-win" id="scw"><i></i></div><div class="sc-top"><div class="sc-x" onclick="foodScanClose()">Close</div><div class="sc-x" id="sclight" style="display:none" onclick="foodLight()">Light</div></div><div class="sc-t" id="scm"></div><div class="sc-b"><div class="sc-bs"><label>Take photo<input type="file" accept="image/*" capture="environment" onchange="foodPhoto(this)"></label><span onclick="foodScanType()">Type digits</span></div></div>';document.body.appendChild(o)}
    o.classList.add('on');scw('');SCDONE=false;SCPHOTO=null;SCLAST='';SCN=0;scm('Starting the camera');if(window.ZXing)foodLive();else nav('board://foodlib')}
  function foodLibReady(){if(window.LIBW){const w=window.LIBW;window.LIBW=null;w(true);return}if(SCPHOTO){const u=SCPHOTO;SCPHOTO=null;foodTry(u);return}foodLive()}
  function foodLibFail(m){if(window.LIBW){const w=window.LIBW;window.LIBW=null;w(false);return}scm('The scanner could not load',m+'. Check your connection or type the digits.')}
  function foodStop(){SCDONE=true;if(SCST){SCST.getTracks().forEach(t=>t.stop());SCST=null}const v=document.getElementById('scv');if(v)v.srcObject=null}
  function foodScanClose(){foodStop();const o=document.getElementById('scan');if(o)o.classList.remove('on');window.BCCH=null;const e=document.querySelector('#scan .sc-x');if(e)e.textContent='Close';const t=document.querySelector('#scan .sc-bs span');if(t)t.style.display=''}
  function foodScanType(){foodScanClose();foodAddSheet();setTimeout(()=>{const e=document.getElementById('fc');if(e)e.focus()},300)}
  function foodLight(){if(!SCST)return;const t=SCST.getVideoTracks()[0];window.SCL=!window.SCL;t.applyConstraints({advanced:[{torch:window.SCL}]}).catch(()=>{})}
  function foodLive(){const md=navigator.mediaDevices;if(!md||!md.getUserMedia){scm('Live camera is not available','Tap Take photo instead.');return}
    md.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}}).then(st=>{if(SCDONE){st.getTracks().forEach(t=>t.stop());return}SCST=st;const v=document.getElementById('scv');v.srcObject=st;v.play().catch(()=>{})
      try{const cp=st.getVideoTracks()[0].getCapabilities();if(cp&&cp.torch)document.getElementById('sclight').style.display='block'}catch(e){}
      SCM=new ZXing.MultiFormatReader();SCM.setHints(foodHints(false));SCC=document.createElement('canvas');scm('Point at a barcode','Fit it inside the frame');setTimeout(foodTick,250)}).catch(e=>scm('The camera is blocked',(e&&e.name||'error')+'. Tap Take photo instead.'))}
  function foodRead(rd,cv){try{return rd.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv)))).getText()}catch(e){return ''}finally{try{rd.reset()}catch(e){}}}
  function foodTick(){if(SCDONE)return;const v=document.getElementById('scv'),w=document.getElementById('scw');if(v&&w&&v.readyState>=2&&v.videoWidth){const vr=v.getBoundingClientRect(),r=w.getBoundingClientRect(),s=Math.max(vr.width/v.videoWidth,vr.height/v.videoHeight),ox=(vr.width-v.videoWidth*s)/2,oy=(vr.height-v.videoHeight*s)/2,sx=(r.left-vr.left-ox)/s,sy=(r.top-vr.top-oy)/s,sw=r.width/s,sh=r.height/s,m=Math.min(1,1000/sw);SCC.width=sw*m;SCC.height=sh*m;SCC.getContext('2d').drawImage(v,sx,sy,sw,sh,0,0,SCC.width,SCC.height)
      foodSeen(foodRead(SCM,SCC))}
    if(!SCDONE)setTimeout(foodTick,90)}
  function foodSeen(t){const now=Date.now();if(!t||!foodValid(t)){if(SCN&&now-FSCT>1200){SCN=0;SCLAST='';scw('');scm('Point at a barcode','Fit it inside the frame')}return}
    SCN=t===SCLAST&&now-FSCT<1200?SCN+1:1;SCLAST=t;FSCT=now;if(SCN<3){scw('seen');scm('Hold still','Checking the barcode');return}
    if(window.BCCH!=null){if(t===window.BCL)return;window.BCL=t;const dup=ATT[window.BCCH].some(a=>a.code===t);if(!dup)bcAdd(window.BCCH,[t]);scw('ok');scm(dup?'Already added':'Added, '+ATT[window.BCCH].filter(a=>a.code).length+' so far','Point at the next one, or tap Done');return}
    SCDONE=true;scw('ok');scm('Barcode found',t);setTimeout(()=>{foodScanClose();foodCode(t)},450)}
  function foodPhoto(inp){const f=inp.files&&inp.files[0];inp.value='';if(!f)return;if(window.BCCH!=null){attAdd(window.BCCH,[f]);scm('Reading that photo','Keep scanning, or tap Done');return}SCDONE=true;scm('Reading the barcode');const u=URL.createObjectURL(f);if(window.ZXing)foodTry(u);else{SCPHOTO=u;nav('board://foodlib')}}
  // a photo is harder than video: try the middle first, then the whole picture, then turned
  const imgLoad=u=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=u})
  async function foodTry(u){let img;try{img=await imgLoad(u)}catch(e){scm('Could not open that photo');return}
    const W=img.naturalWidth,Hh=img.naturalHeight,rd=new ZXing.MultiFormatReader();rd.setHints(foodHints(true));const shot=(sx,sy,sw,sh,rot)=>{const m=Math.min(1,1600/Math.max(sw,sh)),c=document.createElement('canvas'),w=sw*m,h=sh*m;c.width=rot?h:w;c.height=rot?w:h;const x=c.getContext('2d');if(rot){x.translate(c.width,0);x.rotate(Math.PI/2)}x.drawImage(img,sx,sy,sw,sh,0,0,w,h);return c}
    for(const a of [[W*.1,Hh*.25,W*.8,Hh*.5,0],[0,0,W,Hh,0],[W*.25,Hh*.1,W*.5,Hh*.8,1],[0,0,W,Hh,1]]){const t=foodRead(rd,shot(a[0],a[1],a[2],a[3],a[4]));if(t&&foodValid(t)){URL.revokeObjectURL(u);scw('ok');scm('Barcode found',t);setTimeout(()=>{foodScanClose();foodCode(t)},450);return}}
    URL.revokeObjectURL(u);scm('No barcode in that photo','Hold it flat and closer, or type the digits.')}
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
  function open_(h){document.getElementById('shc').innerHTML='<div class="grab"></div><div class="sh-bk" onclick="shx()">‹ Back</div>'+h;document.getElementById('sheet').classList.add('on')}
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
  // body map: slide a finger over the figures to highlight a muscle, release on it to open it
  ;(()=>{const box=document.querySelector('.figs');if(!box)return;let key='';const hint=document.getElementById('bodyHint'),hint0=hint?hint.textContent:''
    const paint=k=>{if(k===key)return;key=k;box.querySelectorAll('path.hot').forEach(p=>p.classList.remove('hot'));if(k)box.querySelectorAll('path[data-sh="mus:'+k+'"]').forEach(p=>p.classList.add('hot'));if(hint){const b=k&&D.mus.find(x=>x.key===k);hint.textContent=b?b.name+': '+ago(b.days):hint0}}
    const at=e=>{const t=e.touches[0]||e.changedTouches[0],el=document.elementFromPoint(t.clientX,t.clientY),v=el&&el.getAttribute&&el.getAttribute('data-sh');return v&&v.indexOf('mus:')===0?v.slice(4):''}
    box.addEventListener('touchstart',e=>{e.preventDefault();paint(at(e))},{passive:false})
    box.addEventListener('touchmove',e=>{e.preventDefault();paint(at(e))},{passive:false})
    box.addEventListener('touchend',e=>{e.preventDefault();const k=at(e)||'';paint('');if(k)sh('mus',k)},{passive:false})
    box.addEventListener('touchcancel',()=>paint(''))})()
  // AI food: a photo or a description goes to Claude in the cloud, the result comes back to check before it is added
  const FCAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>',FMIC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
  let FAI=${J(m.foodAi?.results || [])},FAIW='',FAIR=null
  const faiSeen=()=>fls('foodAiSeen'),faiWait=()=>fls('foodAiWait')
  function foodAiBanner(){const w=faiWait(),s=faiSeen(),r=FAI.filter(x=>!s.includes(x.id)&&Date.now()-new Date(x.at).getTime()<864e5).slice(-1)[0]
    if(r)return '<div class="f-ai" data-id="'+fq(r.id)+'" onclick="foodAiOpen(this.dataset.id)"><div class="f-aii">'+FCAM+'</div><div><b>Your meal is ready</b><small>Tap to check it and add it</small></div></div>'
    if(w.length)return '<div class="f-ai wait"><div class="f-spin"></div><div><b>Working out your meal</b><small>Usually about a minute</small></div></div>'
    return ''}
  function foodSay(){B=[];FMEAL='';open_('<div class="f-sh"><h3>Say what you ate</h3><p class="sub">Claude works out the calories, then you check them.</p><textarea class="f-in" id="fai" rows="4" placeholder="Two eggs, toast with butter and a protein shake"></textarea><div class="f-lab">MEAL (OPTIONAL)</div>'+fseg()+'<div class="f-cta" onclick="foodAiSend(0,fv(\\x27fai\\x27))">Work it out</div></div>');document.getElementById('fai').focus()}
  // the picture is sent small: enough to see the food, cheap to store
  function foodAiPic(inp){const f=inp.files&&inp.files[0];inp.value='';if(!f)return;const u=URL.createObjectURL(f),img=new Image();img.onload=()=>{const m=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=img.naturalWidth*m;c.height=img.naturalHeight*m;c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);const d=c.toDataURL('image/jpeg',.72);window.FAIP=d.split(',')[1];B=[];FMEAL=''
      open_('<div class="f-sh"><img class="f-pic" src="'+d+'"><div class="f-lab">ANYTHING THE PHOTO CANNOT SHOW?</div><textarea class="f-in" id="fai" rows="2" placeholder="Optional: fried in butter, I only ate half"></textarea><div class="f-lab">MEAL (OPTIONAL)</div>'+fseg()+'<div class="f-cta" onclick="foodAiSend(1,fv(\\x27fai\\x27))">Analyse photo</div><label class="f-sec">Choose another<input type="file" accept="image/*" style="display:none" onchange="foodAiPic(this)"></label></div>')}
    img.onerror=()=>{URL.revokeObjectURL(u);toast('Could not open that photo')};img.src=u}
  function foodAiSend(ph,txt,prev){if(!ph&&!txt){toast('Say what you ate first');return}const id=Date.now().toString(36)+'f';fls('foodAiWait',faiWait().concat([{id,t:Date.now()}]));FAIW=id;B=[]
    open_('<div class="f-sh" style="text-align:center"><h3>'+(ph?'Looking at your food':'Working it out')+'</h3><p class="sub">Usually about a minute. You can close this, the result waits on the Food page.</p><div class="f-spin"></div></div>');drawFood()
    nav('board://foodai?id='+id+'&photo='+(ph?1:0)+'&date='+fdate()+'&meal='+FMEAL+'&t='+encodeURIComponent(txt||'')+'&prev='+encodeURIComponent(prev||''))}
  function foodAiFail(id,why){fls('foodAiWait',faiWait().filter(x=>x.id!==id));if(FAIW===id){FAIW='';B=[];open_('<div class="f-sh"><h3>That did not work</h3><p class="sub">'+H(why)+'</p><div class="f-sec" onclick="shx()">Close</div></div>')}else toast(why);drawFood()}
  function foodAiDone(o){fls('foodAiWait',faiWait().filter(x=>x.id!==o.id));FAI=FAI.filter(x=>x.id!==o.id).concat([o]);const here=FAIW===o.id;if(here)FAIW='';drawFood();if(here)foodAiOpen(o.id);else toast('Your meal is ready, see Food')}
  function foodAiOpen(id){const o=FAI.find(x=>x.id===id);if(!o)return;B=[];FMEAL=o.meal||''
    if(o.error||!(o.items||[]).length){fls('foodAiSeen',faiSeen().concat([id]).slice(-30));drawFood();open_('<div class="f-sh"><h3>'+(o.error?'That did not work':'No food found')+'</h3><p class="sub">'+H(o.error||o.note||'Try a closer photo or say what it is.')+'</p><div class="f-sec" onclick="shx()">Close</div></div>');return}
    FAIR={id,date:o.date,src:o.source||'ai',items:o.items.map(x=>Object.assign({},x,{f:1}))};foodAiDraw(o.note)}
  function foodAiDraw(note){const R=FAIR.items
    open_('<div class="f-sh"><h3>Check your meal</h3><p class="sub">'+H(note||'These are estimates. Change anything that looks off.')+'</p><div class="f-big"><b id="fak">0</b><small>kcal</small></div><div class="f-tiles"><div><small>Protein</small><b id="fap">0</b></div><div><small>Carbs</small><b id="fac">0</b></div><div><small>Fat</small><b id="faf">0</b></div></div>'
      +'<div class="f-lab">WHAT I FOUND</div>'+R.map((x,i)=>'<div class="f-ait"><div class="f-rt"><b>'+H(x.name)+'</b><small id="fai'+i+'"></small></div>'+(x.grams?'<input class="f-in" inputmode="decimal" value="'+Math.round(x.grams)+'" oninput="foodAiAmt('+i+',this.value)"><span>g</span>':'')+'<div class="f-aix" onclick="foodAiDrop('+i+')">&times;</div></div>').join('')
      +'<div class="f-lab">MEAL (OPTIONAL)</div>'+fseg()+'<div class="f-cta" onclick="foodAiAdd()">Add '+(R.length===1?'it':R.length+' items')+'</div>'
      +'<div class="f-lab">WRONG? SAY WHAT TO CHANGE</div><textarea class="f-in" id="faifx" rows="2" placeholder="That was chicken, not tofu. Rice was about 300 g."></textarea><div class="f-sec" onclick="foodAiFix()">Fix it</div><div class="f-sec red" onclick="foodAiDrop(-1)">Discard</div></div>');foodAiSum()}
  function foodAiSum(){const R=FAIR.items,s=k=>R.reduce((a,x)=>a+(+x[k]||0)*x.f,0),t=(i,v)=>{const e=document.getElementById(i);if(e)e.textContent=v};t('fak',Math.round(s('kcal')));t('fap',Math.round(s('protein'))+' g');t('fac',Math.round(s('carbs'))+' g');t('faf',Math.round(s('fat'))+' g');R.forEach((x,i)=>t('fai'+i,Math.round(x.kcal*x.f)+' kcal · '+Math.round(x.protein*x.f)+' g protein'))}
  function foodAiAmt(i,v){const x=FAIR.items[i],g=fnum(v);if(x&&x.grams)x.f=g/x.grams;foodAiSum()}
  function foodAiClose(){if(FAIR)fls('foodAiSeen',faiSeen().concat([FAIR.id]).slice(-30));FAIR=null;shx();drawFood()}
  function foodAiDrop(i){if(i<0){foodAiClose();return}FAIR.items.splice(i,1);if(!FAIR.items.length){foodAiClose();return}foodAiDraw()}
  function foodAiAdd(){const b=Date.now().toString(36),list=FAIR.items.map((x,i)=>{const it={src:FAIR.src,ai:{kcal:x.kcal,grams:x.grams},id:b+'a'+i,date:FAIR.date||fdate(),at:fhm(),meal:FMEAL,name:x.name,kcal:Math.round(x.kcal*x.f),grams:Math.round((+x.grams||0)*x.f),code:'',img:''};['protein','carbs','fat'].forEach(k=>it[k]=Math.round((+x[k]||0)*x.f*10)/10);return it});FOOD.items=(FOOD.items||[]).concat(list);fls('foodAdd',fls('foodAdd').concat(list.map(it=>({t:Date.now(),it}))));foodAiClose();act({food_add:list},'','Added');drawFood()}
  function foodAiFix(){const v=fv('faifx');if(!v){toast('Say what to change');return}const prev=JSON.stringify(FAIR.items.map(x=>({name:x.name,grams:Math.round((+x.grams||0)*x.f),kcal:Math.round(x.kcal*x.f),protein:Math.round(x.protein*x.f),carbs:Math.round(x.carbs*x.f),fat:Math.round(x.fat*x.f)})));fls('foodAiSeen',faiSeen().concat([FAIR.id]).slice(-30));FAIR=null;foodAiSend(0,v,prev)}
  function foodAiBoot(){const t=Date.now(),w=faiWait().filter(x=>t-x.t<6e5&&!FAI.some(r=>r.id===x.id));fls('foodAiWait',w);drawFood();if(w.length)nav('board://foodpoll?id='+w[w.length-1].id)}
  // Study: suggestions from your real tasks, a plan from what you say, and your own forest: a tree grows while you study
  const STREES={oak:['Oak','round','#7B5A3E','#5DB56F','#3F9E60'],pine:['Pine','cone','#6E4F36','#3E9A6B','#2B7F58'],cherry:['Cherry','round','#7A5548','#F5A9C0','#EC86A8'],birch:['Birch','oval','#D9D3C4','#A9CF62','#8CBB4A'],maple:['Maple','round','#7B5038','#F2A04A','#E5803A'],apple:['Apple','apple','#7B5A3E','#63BB6B','#46A25C'],cactus:['Cactus','cactus','#4FA56B','#4FA56B','#3F9059'],shroom:['Mushroom','shroom','#F1E8D8','#E5664F','#CF4F3A'],lime:['Lime','round','#7B5A3E','#B5D95A','#94C43F'],plum:['Plum','round','#5E4438','#A583D9','#8A66C4'],ember:['Ember','round','#6B4332','#E9654F','#CF4A3A'],mint:['Mint','round','#6E5A48','#6FD0B0','#4DB796'],spruce:['Spruce','cone','#5F4A38','#6FA9B8','#538FA0'],snow:['Snow pine','cone','#6E4F36','#CFE6E0','#A9D0C8'],gold:['Ginkgo','oval','#8A6B48','#F4CF55','#E5B93A'],jacaranda:['Jacaranda','oval','#6A5242','#BC9BEA','#9F7ADB'],palm:['Palm','palm','#A67C52','#4FB56F','#39A05C'],bamboo:['Bamboo','bamboo','#6FB25B','#8BC96F','#5E9F4C'],sunflower:['Sunflower','flower','#5FA34F','#F6C83E','#8A5A32'],tulip:['Tulip','tulip','#5FA34F','#EE6F8E','#D9527A']}
  const SGRP=${J(cj.map(c => ({ c: crsOf(c.module), items: (c.tasks || []).filter(t => !/^(attend|pick)\b/i.test(t.label)).map(t => ({ ref: (m.cwj.week_start || "") + "::" + t.id, label: t.label, note: t.note, due: t.due })) })))}
  let STUDY=${J(m.study || { sessions: [] })},SPICK=null
  ;(()=>{const t=Date.now(),a=fls('studyAdd').filter(x=>t-x.t<9e5);fls('studyAdd',a);STUDY.sessions=STUDY.sessions||[];const ids=new Set(STUDY.sessions.map(x=>x.id));STUDY.sessions=STUDY.sessions.concat(a.filter(x=>!ids.has(x.s.id)).map(x=>x.s))})()
  // trees: layered shapes with light from the upper left, so they read as round and alive. Everything stands on (0,0)
  function sMix(h,m,t){const p=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)),a=p(h),b=p(m);return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('')}
  function treeG(k,st,dead){const d=STREES[k]||STREES.oak,tr=dead?'#8F7F6C':d[2],a=dead?'#B5A58F':d[3],b=dead?'#9C8C76':d[4],lt=sMix(a,'#ffffff',.28),dk=sMix(b,'#000000',.14),trd=sMix(tr,'#000000',.2)
    const C=(x,y,r,c)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+c+'"/>',E=(x,y,rx,ry,c)=>'<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="'+c+'"/>'
    const trunk=(h,w)=>'<path d="M'+(-w-2)+' 0C'+(-w)+' '+(-h*.35)+' '+(-w*.7)+' '+(-h*.7)+' '+(-w*.55)+' '+(-h)+'H'+(w*.55)+'C'+(w*.7)+' '+(-h*.7)+' '+w+' '+(-h*.35)+' '+(w+2)+' 0Q0 3 '+(-w-2)+' 0z" fill="'+tr+'"/><path d="M0 1.500V'+(-h)+'H'+(w*.55)+'C'+(w*.7)+' '+(-h*.7)+' '+w+' '+(-h*.35)+' '+(w+2)+' 0Q1 2 0 1.500z" fill="'+trd+'"/>'
    if(st<=0)return '<path d="M-12 1a12 8 0 0 1 24 0z" fill="#9B7650"/><path d="M-6 1a6 3.500 0 0 1 12 0z" fill="#B38A60"/>'+C(0,-4,2.5,a)
    if(st===1)return '<path d="M0 1C0-6 0-10 0-16" stroke="'+b+'" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M0-13C-9-13-14-18-14-24-6-24 0-20 0-13z" fill="'+a+'"/><path d="M0-15C7-15 12-20 12-26 5-26 0-22 0-15z" fill="'+lt+'"/>'
    const sh=d[1];let c=''
    if(sh==='round'||sh==='apple'){c=trunk(40,5)+'<path d="M-2-26C-8-30-13-33-18-40M2-22C8-26 13-30 17-37" stroke="'+tr+'" stroke-width="3" fill="none" stroke-linecap="round"/>'+C(-25,-42,15,dk)+C(25,-44,15,dk)+C(-12,-30,12,dk)+C(13,-31,13,dk)+C(0,-74,18,dk)+C(-16,-46,18,b)+C(16,-48,18,b)+C(0,-36,15,b)+C(-14,-66,17,a)+C(14,-66,17,a)+C(0,-52,20,a)+C(-20,-52,11,a)+C(0,-75,14,a)+C(-13,-71,9,lt)+C(-2,-79,6,lt)+C(-23,-55,5,lt)+C(5,-60,5,lt)
      if(k==='cherry'&&!dead)c+=[[-20,-44],[-6,-58],[14,-72],[22,-52],[4,-40],[-14,-76]].map(p=>C(p[0],p[1],2.2,'#FFE9F0')).join('')
      if(sh==='apple'&&!dead)c+=[[-20,-46],[12,-70],[20,-46],[-3,-38],[-8,-62]].map(p=>C(p[0],p[1],4.2,'#E2554A')+C(p[0]-1.2,p[1]-1.2,1.2,'#F7A79E')).join('')}
    if(sh==='cone'){const tier=(y,h,w)=>'<path d="M0 '+(y-h)+'C'+(-w*.3)+' '+(y-h*.55)+' '+(-w*.7)+' '+(y-h*.2)+' '+(-w)+' '+y+'Q0 '+(y+7)+' '+w+' '+y+'C'+(w*.7)+' '+(y-h*.2)+' '+(w*.3)+' '+(y-h*.55)+' 0 '+(y-h)+'z" fill="'+a+'"/><path d="M0 '+(y-h)+'C'+(w*.3)+' '+(y-h*.55)+' '+(w*.7)+' '+(y-h*.2)+' '+w+' '+y+'Q'+(w*.45)+' '+(y+5.5)+' 0 '+(y+3.500)+'z" fill="'+b+'"/><path d="M0 '+(y-h)+'C'+(-w*.14)+' '+(y-h*.7)+' '+(-w*.32)+' '+(y-h*.5)+' '+(-w*.5)+' '+(y-h*.28)+'Q'+(-w*.16)+' '+(y-h*.42)+' 0 '+(y-h)+'z" fill="'+lt+'"/>'
      c=trunk(18,4.5)+tier(-13,30,31)+tier(-33,30,25)+tier(-52,32,18)}
    if(sh==='oval'){c=trunk(50,3.2)+'<path d="M-3-12h3M0-24h3M-3-36h3" stroke="#4E473C" stroke-width="1.600" stroke-linecap="round"/>'+E(0,-64,23,31,dk)+E(-3,-65,20,29,b)+E(-5,-68,15,23,a)+E(-9,-77,6,9,lt)+E(5,-52,5,6,a)}
    if(sh==='cactus')c='<rect x="-10" y="-62" width="20" height="62" rx="10" fill="'+a+'"/><path d="M1-62h0a9 9 0 0 1 9 9V-1a10 10 0 0 1-9 1z" fill="'+b+'"/><path d="M-10-26h-7a6 6 0 0 1-6-6v-12" fill="none" stroke="'+a+'" stroke-width="9" stroke-linecap="round"/><path d="M10-32h7a6 6 0 0 0 6-6v-14" fill="none" stroke="'+b+'" stroke-width="9" stroke-linecap="round"/><path d="M-4-54v5M-4-38v5M-4-22v5M4-46v5M4-30v5M4-14v5" stroke="'+lt+'" stroke-width="1.800" stroke-linecap="round"/>'+C(0,-66,4,'#F5A9C0')
    if(sh==='shroom')c='<path d="M-9 0c3-10 3-20 2-30h14c-1 10-1 20 2 30q-9 3-18 0z" fill="'+tr+'"/><path d="M0 1V-30h7c-1 10-1 20 2 30q-5 2-9 0z" fill="'+sMix(tr,'#000000',.12)+'"/><path d="M-32-27c0-22 15-35 32-35s32 13 32 35c0 5-64 5-64 0z" fill="'+a+'"/><path d="M0-62c17 0 32 13 32 35 0 3-14 4-32 4z" fill="'+b+'"/>'+(dead?'':C(-15,-42,5.5,'#fff')+C(5,-51,5,'#fff')+C(17,-36,4.5,'#FBE9DE')+C(-3,-33,3.5,'#fff'))
    if(sh==='palm')c='<path d="M-5 0C-3-20 0-40 2-60h4C4-40 3-20 5 0q-5 2-10 0z" fill="'+tr+'"/><path d="M-3-14h7M-1-28h6M0-42h5" stroke="'+trd+'" stroke-width="1.500"/><path d="M4-60C-8-74-26-72-36-52-22-62-10-62 4-60z" fill="'+b+'"/><path d="M4-60C16-74 34-72 44-52 30-62 18-62 4-60z" fill="'+b+'"/><path d="M4-60C-6-80-22-86-32-78-18-76-7-70 4-60z" fill="'+a+'"/><path d="M4-60C14-80 30-86 40-78 26-76 15-70 4-60z" fill="'+a+'"/><path d="M4-60C2-78 4-88 10-94 12-82 10-70 4-60z" fill="'+lt+'"/>'+C(0,-57,4,tr)+C(7,-56,4,trd)
    if(sh==='bamboo')c=[[-11,-66,a],[13,-54,b],[1,-84,a]].map(p=>'<path d="M'+p[0]+' 0V'+p[1]+'" stroke="'+p[2]+'" stroke-width="7" stroke-linecap="round"/><path d="M'+(p[0]-3.5)+' '+Math.round(p[1]*.3)+'h7M'+(p[0]-3.5)+' '+Math.round(p[1]*.62)+'h7" stroke="'+dk+'" stroke-width="2"/>').join('')+'<path d="M1-84c8-7 17-7 23-2-9 4-16 4-23 2zM-11-66c-8-7-17-7-23-2 9 4 16 4 23 2zM13-54c8-7 17-7 23-2-9 4-16 4-23 2zM1-60c-7-6-14-6-20-1 8 3 14 3 20 1z" fill="'+b+'"/>'
    if(sh==='flower')c='<path d="M0 1V-52" stroke="'+tr+'" stroke-width="4.500" stroke-linecap="round"/><path d="M0-18c-9-9-18-9-23-4 7 6 15 7 23 4zM0-30c9-9 18-9 23-4-7 6-15 7-23 4z" fill="'+tr+'"/>'+[0,45,90,135,180,225,270,315].map((z,i)=>'<ellipse cy="-73" rx="6.500" ry="12" fill="'+(i%2?a:sMix(a,'#ffffff',.2))+'" transform="rotate('+z+' 0 -60)"/>').join('')+C(0,-60,9.5,b)+C(-2,-62,4,sMix(b,'#ffffff',.2))
    if(sh==='tulip')c='<path d="M0 1V-44" stroke="'+tr+'" stroke-width="4.500" stroke-linecap="round"/><path d="M0-6c-13-6-17-20-14-31 9 6 14 17 14 31z" fill="'+tr+'"/><path d="M0-6c13-6 17-20 14-31-9 6-14 17-14 31z" fill="'+sMix(tr,'#000000',.15)+'"/><path d="M-17-70l9 10 8-14 8 14 9-10v21c0 9-8 13-17 13s-17-4-17-13z" fill="'+a+'"/><path d="M0-74l8 14 9-10v21c0 9-8 13-17 13z" fill="'+b+'"/>'
    return '<g transform="scale('+[0,0,.55,.78,1][Math.min(st,4)]+')"><g class="grw">'+c+'</g></g>'}
  function treeSvg(k,st,dead){return '<svg class="tree" viewBox="-48 -98 96 108"><ellipse cy="3" rx="31" ry="7" fill="var(--g3,#7FA868)"/><ellipse cx="-1" cy="1" rx="29" ry="6" fill="var(--g1,#A9C98F)"/>'+treeG(k,st,dead)+'</svg>'}
  // the forest: a little plot of land that fills up with what you actually studied
  let FRNG=7
  function forestScene(L){const n=L.length,side=Math.max(4,Math.min(9,Math.ceil(Math.sqrt(n)))),TW=58,TH=29,cells=[];for(let r=0;r<side;r++)for(let c=0;c<side;c++)cells.push([r,c]);cells.sort((p,q)=>(p[0]+p[1])-(q[0]+q[1])||p[0]-q[0]);const X=(r,c)=>(c-r)*TW/2,Y=(r,c)=>(c+r)*TH/2
    let t='';for(const [r,c] of cells){const x=X(r,c),y=Y(r,c);t+='<path class="'+((r+c)%2?'ft':'ft2')+'" d="M'+x+' '+y+'l'+TW/2+' '+TH/2+'l-'+TW/2+' '+TH/2+'l-'+TW/2+' -'+TH/2+'z"/>';if(r===side-1)t+='<path class="fs1" d="M'+(x-TW/2)+' '+(y+TH/2)+'l'+TW/2+' '+TH/2+'v13l-'+TW/2+' -'+TH/2+'z"/>';if(c===side-1)t+='<path class="fs2" d="M'+x+' '+(y+TH)+'l'+TW/2+' -'+TH/2+'v13l-'+TW/2+' '+TH/2+'z"/>'}
    const tr=L.slice(-side*side).map((s,i)=>{const [r,c]=cells[i],x=X(r,c),y=Y(r,c)+TH/2+3;return '<g class="s-t" data-sid="'+fq(s.id)+'" onclick="studySess(\\x27'+fq(s.id)+'\\x27)" transform="translate('+x+' '+y+')"><rect x="-24" y="-46" width="48" height="52" fill="transparent"/><g class="s-tl"><g class="swy" style="animation-delay:-'+(i*.7%5)+'s"><g transform="scale(.47)">'+treeG(s.tree,s.status==='short'?2:4)+'</g></g></g></g>'}).join('')
    return '<svg viewBox="'+(-side*TW/2-6)+' -48 '+(side*TW+12)+' '+(side*TH+68)+'">'+t+tr+'</svg>'}
  function forestBlock(){const today=sDay(0),from=FRNG?gPlus(today,1-FRNG):'0',L=(STUDY.sessions||[]).filter(x=>x.date>=from&&x.status!=='dead'),h=L.reduce((a,x)=>a+(+x.minutes||0),0)
    return '<div class="s-fh"><h3 class="s-h">My forest</h3><div class="f-seg s-fr">'+[[7,'Week'],[30,'Month'],[0,'All']].map(x=>'<span class="'+(x[0]===FRNG?'on':'')+'" onclick="FRNG='+x[0]+';drawStudy()">'+x[1]+'</span>').join('')+'</div></div><div class="s-forest">'+forestScene(L)+'<div class="s-cap">'+(L.length?L.length+(L.length===1?' tree, ':' trees, ')+sFmt(h):'Plant your first tree')+'</div></div>'}
  const sNow=()=>{try{return JSON.parse(localStorage.getItem('studyRun')||'null')}catch(e){return null}},sSet=v=>{try{if(v)localStorage.setItem('studyRun',JSON.stringify(v));else localStorage.removeItem('studyRun')}catch(e){}}
  const sDay=o=>fdateAt(o),sMins=f=>(STUDY.sessions||[]).filter(f).reduce((a,x)=>a+(+x.minutes||0),0),sFmt=m=>m>=60?Math.floor(m/60)+' h'+(m%60?' '+(m%60)+' min':''):m+' min'
  function sDueText(i){if(!i.due)return i.note||'';const dd=Math.ceil((new Date(i.due)-Date.now())/864e5);return dd<0?'Still open':dd===0?'Due today':dd===1?'Due tomorrow':'Due in '+dd+' days'}
  function sSuggest(){const no=fls('studyNope').filter(x=>Date.now()-x.t<864e5),fin=fls('studyDone'),all=[];SGRP.forEach(g=>g.items.forEach(i=>{if(!no.some(n=>n.r===i.ref)&&!fin.includes(i.ref))all.push({ref:i.ref,topic:i.label,course:g.c,why:sDueText(i),due:i.due?new Date(i.due).getTime():9e15})}));return all.sort((a,b)=>a.due-b.due).slice(0,3)}
  function sGuess(t){return /[0-9]+ *(h|hours?)/i.test(t)?60*parseInt(t):/([0-9]+) *min/i.test(t)?parseInt(t.match(/([0-9]+) *min/i)[1]):/sheet|solve|homework|exercise|assignment|project/i.test(t)?45:25}
  // the course a sentence talks about, from your own course list: its short name, its name, or a keyword you set
  function sCourse(t){const n=' '+String(t).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu,' ')+' ',c=CRS.find(x=>x.words.some(w=>n.includes(' '+w+' ')));return c?c.short:'Other'}
  function sClean(x){let o=String(x).trim(),p='';while(o!==p){p=o;o=o.replace(/^(so|ok|okay|and|um|uh|then|also|now|well)\\b[ ,]*/i,'').replace(/^(i'm|i am|im|i)\\s+(gonna|going to|want to|wanna|will|need to|have to|should)?\\s*/i,'').replace(/^(study|studying|do|doing|learn|learning|read|reading|work on|working on|practice)\\s+/i,'')}return o}
  function sParse(t){return t.split(/,| and | then |[.;]/i).map(x=>sClean(x)).filter(x=>x.length>1).slice(0,5).map((x,i)=>({id:Date.now().toString(36)+i,topic:x.charAt(0).toUpperCase()+x.slice(1),course:sCourse(x),min:sGuess(x)}))}
  function sCard(x,i,kind){return '<div class="s-card" data-k="'+kind+'" data-i="'+i+'"><div class="s-mini">'+treeSvg(sTree(x.course),4)+'</div><div class="s-ct">'+sChip(x.course)+'<b>'+H(x.topic)+'</b><small>'+H(x.why||((x.min||sGuess(x.topic))+' min'))+'</small><div class="s-btns"><span class="s-go" onclick="studyPick(\\x27'+kind+'\\x27,'+i+')">Plant</span><span class="s-no" onclick="studyNo(\\x27'+kind+'\\x27,'+i+')">Not now</span></div></div></div>'}
  function drawStudy(){const el=document.getElementById('sd');if(!el)return;const r=sNow();
    if(r){const left=r.start+sLen(r)*6e4-Date.now();if(left<=0){studyGrown();return}el.innerHTML='<div class="s-run"><small>'+H(CN.length?r.course:'')+'</small><h2 onclick="studyEdit()">'+H(r.topic)+'</h2><div class="s-ren" onclick="studyEdit()">Rename or scrap</div><div class="s-big" id="sdtree">'+treeSvg(r.tree,sStage(r))+'</div><div class="s-time" id="sdt"></div><div class="s-sub" id="sdm">Growing your '+H(STREES[r.tree][0].toLowerCase())+'.</div>'+(r.mode==='up'?'<div class="f-cta" onclick="studyEarly()">Done</div>':'<div class="f-sec" onclick="studyEarly()">I finished early</div><div class="f-sec" onclick="studyGiveUp()">Stop here</div>')+'</div>';studyTick();return}
    const today=sMins(x=>x.date===sDay(0)&&x.status!=='dead'),week=[];for(let o=-6;o<=0;o++)week.push(sDay(o));const wk=(STUDY.sessions||[]).filter(x=>week.includes(x.date)),plan=fls('studyPlan'),sug=sSuggest()
    const cs=CALL.map(c=>[c,wk.filter(x=>cKey(x.course)===c&&x.status!=='dead').reduce((a,x)=>a+(+x.minutes||0),0)]).filter(x=>x[1]),mx=Math.max(1,...cs.map(x=>x[1]))
    el.innerHTML='<div class="f-top"><div><small>'+(today?sFmt(today)+' today':'Nothing yet today')+'</small><h2>Study</h2></div></div>'
      +'<div class="s-ask" onclick="SPICK=null;studySay()"><span>'+FMIC+'</span><b>Start studying</b></div>'
      +(plan.length?'<h3 class="s-h">Your plan</h3>'+plan.map((x,i)=>sCard(x,i,'p')).join(''):'')
      +(sug.length?'<h3 class="s-h">'+(plan.length?'Also on your list':'I would do this next')+'</h3>'+sug.map((x,i)=>sCard(x,i,'s')).join(''):'')
      +forestBlock()
      +(cs.length?'<div class="s-week">'+cs.map(c=>'<div><span>'+c[0]+'</span><i><em style="background:'+sCol(c[0])+';width:'+Math.round(c[1]/mx*100)+'%"></em></i><b>'+sFmt(c[1])+'</b></div>').join('')+'</div>':'')+degreeBlock()
    window.SSUG=sug}
  function sStage(r){const e=(Date.now()-r.start)/6e4,p=r.mode==='up'?e/60:e/sLen(r);return p<.1?0:p<.3?1:p<.55?2:p<.85?3:4}
  const sLen=r=>r.mode==='up'?Infinity:r.mode==='rounds'?r.rounds*25+(r.rounds-1)*5:r.min
  function sFocusMin(r){const e=(Date.now()-r.start)/6e4;if(r.mode!=='rounds')return e;return Math.min(r.rounds*25,Math.floor(e/30)*25+Math.min(25,e%30))}
  const sClock=t=>{const h=Math.floor(t/3600),m=Math.floor(t%3600/60),z=String(Math.floor(t%60)).padStart(2,'0');return h?h+':'+String(m).padStart(2,'0')+':'+z:m+':'+z}
  function sLast(){try{return JSON.parse(localStorage.getItem('studyLast')||'{}')}catch(e){return {}}}
  function sNoteIds(r){if(r.mode==='up')return '';if(r.mode!=='rounds')return 'study-'+r.id;const a=[];for(let i=0;i<r.rounds*2-1;i++)a.push('study-'+r.id+'-'+i);return a.join(',')}
  function sNotes(r){const T=STREES[r.tree][0].toLowerCase();if(r.mode==='up')return [];if(r.mode!=='rounds')return [{id:'study-'+r.id,title:'Your '+T+' is fully grown',body:r.topic+', '+r.min+' min done',at:new Date(r.start+r.min*6e4).toISOString()}];const a=[];for(let i=0;i<r.rounds;i++){const end=r.start+(i*30+25)*6e4;a.push({id:'study-'+r.id+'-'+i*2,title:i===r.rounds-1?'Your '+T+' is fully grown':'Round '+(i+1)+' done, take 5',body:r.topic,at:new Date(end).toISOString()});if(i<r.rounds-1)a.push({id:'study-'+r.id+'-'+(i*2+1),title:'Back to it, round '+(i+2),body:r.topic,at:new Date(end+3e5).toISOString()})}return a}
  function sSetK(k,v){if(SPICK.kind==='q')studyQ(k,v);else studySet(k,v)}
  function sGl(p){const m=p.mode||'down';return m==='up'?'<b id="sdpl">Count up</b> stop when you are done':m==='rounds'?'<b id="sdpl">'+(p.rounds||4)+' x 25 min</b> with 5 min breaks':'<b id="sdpl">'+p.min+' min</b> slide the tree up'}
  function sTimerUI(p){const m=p.mode||'down',n=new Date(),nm=n.getHours()*60+n.getMinutes(),nx=TDC.filter(c=>c.a-nm>=25&&c.a-nm<=300).sort((a,b)=>a.a-b.a)[0],until=nx?Math.round((nx.a-nm-10)/5)*5:0,sug=p.sugMin||0
    let h='<div class="f-seg s-mid s-modes">'+[['down','Countdown'],['up','Count up'],['rounds','Rounds']].map(x=>'<span class="'+(x[0]===m?'on':'')+'" onclick="sSetK(\\x27mode\\x27,\\x27'+x[0]+'\\x27)">'+x[1]+'</span>').join('')+'</div>'
    if(m==='down')h+='<div class="f-seg s-mid">'+[15,25,45,60,90].map(v=>'<span class="'+(v===p.min?'on':v===sug?'sug':'')+'" onclick="sSetK(\\x27min\\x27,'+v+')">'+v+'</span>').join('')+(until?'<span class="'+(until===p.min?'on':'')+'" onclick="sSetK(\\x27min\\x27,'+until+')">Until class</span>':'')+'</div>'
    if(m==='rounds')h+='<div class="f-seg s-mid">'+[2,3,4,6].map(v=>'<span class="'+(v===(p.rounds||4)?'on':'')+'" onclick="sSetK(\\x27rounds\\x27,'+v+')">'+v+' rounds</span>').join('')+'</div>'
    return h}
  function studyTick(){const r=sNow(),e=document.getElementById('sdt');if(!r||!e)return;const sec=(Date.now()-r.start)/1000;if(r.mode==='up')e.textContent=sClock(sec);else{const s0=Math.ceil(sLen(r)*60-sec);if(s0<=0){studyGrown();return}if(r.mode==='rounds'){const ph=sec%1800,i=Math.floor(sec/1800),foc=ph<1500,m0=document.getElementById('sdm');e.textContent=sClock(Math.ceil(foc?1500-ph:1800-ph));if(m0)m0.textContent=foc?'Round '+(i+1)+' of '+r.rounds:'Break, round '+(i+2)+' next'}else e.textContent=sClock(s0)}const k=sStage(r);if(k!==window.SSTG){window.SSTG=k;document.getElementById('sdtree').innerHTML=treeSvg(r.tree,k)}}
  setInterval(studyTick,1000)
  function studySay(v){const was=SPICK&&SPICK.kind==='q'?SPICK:null;SPICK=was||Object.assign({topic:'',course:'Other',ref:'',min:25,tree:'random',kind:'q'},sLast());const p=SPICK;B=[];open_('<div class="f-sh" style="text-align:center"><div class="s-prev" id="sdp" style="transform:scale('+sScale(p.min)+')">'+(p.tree==='random'?'<div class="s-q">?</div>':treeSvg(p.tree,4))+'</div><div class="s-gl">'+sGl(p)+'</div><h3>Start studying</h3><p class="sub">Say what, in your own words, or just start. Claude sorts it out while the tree grows.</p><textarea class="f-in" id="sdin" rows="3" placeholder="Chapter 3 notes, then the week one exercises"></textarea>'+sTimerUI(p)+''+'<div class="s-kinds"><div class="s-rand'+(p.tree==='random'?' on':'')+'" onclick="studySet(\\x27tree\\x27,\\x27random\\x27)">?</div>'+Object.keys(STREES).map(k=>'<div class="'+(k===p.tree?'on':'')+'" onclick="studySet(\\x27tree\\x27,\\x27'+k+'\\x27)">'+treeSvg(k,4)+'</div>').join('')+'</div>'+'<div class="f-cta" onclick="studyGo()">Start</div></div>');const t=document.getElementById('sdin');t.value=v||'';if(v===undefined)t.focus()}
  function studyQ(k,v){const t=fv('sdin');SPICK[k]=v;studySay(t)}
  function studyGo(){const v=fv('sdin'),L=v?sParse(v):[],a=L[0];if(a){SPICK.topic=a.topic;SPICK.course=a.course;fls('studyPlan',L.slice(1).map(x=>Object.assign(x,{from:1})).concat(fls('studyPlan')).slice(0,6))}else SPICK.topic='Study session';studyPlant();if(v){const r=sNow();r.ai=1;sSet(r);setTimeout(()=>{nav('board://studyai?id='+r.id+'&t='+encodeURIComponent(v))},450)}}
  // Claude's reading of what you said: better names and the right course, for the running tree or one already logged
  let STAI=${J(m.studyAi?.results || [])}
  function studyAiDone(o){if(!o||!(o.items||[]).length)return;const a=o.items[0],r=sNow();a.course=cKey(a.course);if(r&&r.id===o.id&&r.ai){r.topic=a.topic;r.course=a.course;r.ai=0;sSet(r);drawStudy()}const x=(STUDY.sessions||[]).find(z=>z.id===o.id);if(x){x.topic=a.topic;x.course=a.course}fls('studyPlan',o.items.slice(1).map((y,i)=>({id:o.id+i,topic:y.topic,course:y.course,min:y.minutes||sGuess(y.topic)})).concat(fls('studyPlan').filter(y=>!y.from)).slice(0,6));drawStudy();drawToday()}
  function studyAiBoot(){const r=sNow();if(r&&r.ai){const o=STAI.find(z=>z.id===r.id);if(o)studyAiDone(o)}}
  function studyNo(kind,i){if(kind==='p'){const p=fls('studyPlan');p.splice(i,1);fls('studyPlan',p)}else{const x=window.SSUG[i];if(x)fls('studyNope',fls('studyNope').concat([{r:x.ref,t:Date.now()}]))}drawStudy();drawToday()}
  function studyPick(kind,i){const x=kind==='p'?fls('studyPlan')[i]:(window.SSUG||sSuggest())[i];if(!x)return;SPICK={topic:x.topic,course:x.course,ref:x.ref||'',min:x.min||sGuess(x.topic),sugMin:x.min||sGuess(x.topic),mode:'down',tree:'random',kind,i};studySheet()}
  function studySheet(){const p=SPICK;B=[];open_('<div class="f-sh" style="text-align:center"><div class="s-prev" id="sdp" style="transform:scale('+sScale(p.min)+')">'+(p.tree==='random'?'<div class="s-q">?</div>':treeSvg(p.tree,4))+'</div><div class="s-gl">'+sGl(p)+'</div><h3>'+H(p.topic)+'</h3>'+sSeg(p.course,'studyCourse')+sTimerUI(p)+''+'<div class="s-kinds"><div class="s-rand'+(p.tree==='random'?' on':'')+'" onclick="studySet(\\x27tree\\x27,\\x27random\\x27)">?</div>'+Object.keys(STREES).map(k=>'<div class="'+(k===p.tree?'on':'')+'" onclick="studySet(\\x27tree\\x27,\\x27'+k+'\\x27)">'+treeSvg(k,4)+'</div>').join('')+'</div>'+'<div class="f-cta" onclick="studyPlant()">Plant it</div><div class="f-sec" onclick="shx()">Not now</div></div>')}
  function studySet(k,v){SPICK[k]=v;studySheet()}
  function studyCourse(c){studySet('course',c)}
  function studyPlant(){const p=SPICK,id=Date.now().toString(36)+'s',start=Date.now();if(p.tree==='random'){const ks=Object.keys(STREES);p.tree=ks[Math.floor(Math.random()*ks.length)]}const r={id,start,mode:p.mode||'down',min:p.min,rounds:p.rounds||4,course:p.course,topic:p.topic,ref:p.ref,tree:p.tree};sSet(r);try{localStorage.setItem('studyLast',JSON.stringify({mode:r.mode,min:r.min,rounds:r.rounds}))}catch(e){}if(p.kind==='p'){const a=fls('studyPlan');a.splice(p.i,1);fls('studyPlan',a)}window.SSTG=-1;shx();tg('study');drawStudy();drawToday();const N=sNotes(r);if(N.length)nav('board://notify?j='+encodeURIComponent(JSON.stringify(N)))}
  function studyLog(r,minutes,status,msg){const s={src:r.ai!==undefined?'voice':'timer',mode:r.mode||'down',planned:r.mode==='up'?0:sLen(r),away:Math.round((r.away||0)/6e4),end:fhm(),ref:r.ref||'',id:r.id,date:loc(new Date(r.start)).slice(0,10),start:new Date(r.start).toTimeString().slice(0,5),minutes,course:r.course,topic:r.topic,tree:r.tree,status};STUDY.sessions=(STUDY.sessions||[]).concat([s]);fls('studyAdd',fls('studyAdd').concat([{t:Date.now(),s}]));sSet(null);act({study_add:[s]},'',msg);return s}
  function studyGrown(){const r=sNow();if(!r)return;const m=r.mode==='rounds'?r.rounds*25:r.min;studyLog(r,m,'grown','Logged '+m+' min'+sOf(r.course));drawStudy();drawToday();studyDoneSheet(r,m)}
  function studyEarly(){const r=sNow();if(!r)return;const mins=Math.max(1,Math.round(sFocusMin(r)));studyLog(r,mins,r.mode==='up'&&mins<20?'short':'grown','Logged '+mins+' min'+sOf(r.course));setTimeout(()=>{nav('board://notifyoff?id='+sNoteIds(r))},350);drawStudy();drawToday();studyDoneSheet(r,mins)}
  function studyGiveUp(){const r=sNow();if(!r)return;B=[];open_('<div class="f-sh" style="text-align:center"><div class="s-prev">'+treeSvg(r.tree,2)+'</div><h3>Stop here?</h3><p class="sub">Your time counts and this stays in your forest as a sapling.</p><div class="f-cta" onclick="studyKill()">Keep growing</div><div class="f-sec" onclick="studyKill(1)">Stop here</div><div class="f-sec red" onclick="studyScrap()">Scrap it, log nothing</div></div>')}
  function studyKill(y){if(!y){shx();return}const r=sNow();if(!r)return;const mins=Math.max(0,Math.round(sFocusMin(r)));studyLog(r,mins,'short',mins+' min logged');setTimeout(()=>{nav('board://notifyoff?id='+sNoteIds(r))},350);drawStudy();drawToday()}
  function studyDoneSheet(r,mins){burst();B=[];window.SREF=r.ref||'';open_('<div class="f-sh" style="text-align:center"><div class="s-prev">'+treeSvg(r.tree,4)+'</div><h3>You grew a '+H(STREES[r.tree][0].toLowerCase())+'</h3><p class="sub">'+H(r.topic)+', '+sFmt(mins)+'</p>'+(r.ref?'<div class="f-cta" onclick="studyTaskDone()">I finished this task</div><div class="f-sec" onclick="shx()">Not finished yet</div>':'<div class="f-cta" onclick="shx()">Nice</div>')+'</div>')}
  function studyTaskDone(){act({coursework_done:[window.SREF]},'','Task ticked off');fls('studyDone',fls('studyDone').concat([window.SREF]).slice(-60));drawStudy();drawToday()}
  function studySess(id){const x=(STUDY.sessions||[]).find(s=>s.id===id);if(!x)return;B=[];open_('<div class="f-sh" style="text-align:center"><div class="s-prev">'+treeSvg(x.tree,x.status==='short'?2:4)+'</div><h3>'+H(x.topic)+'</h3><p class="sub">'+H(x.course)+', '+sFmt(+x.minutes||0)+', '+H(x.date)+'</p><div class="f-sec red" onclick="logRm(\\x27study\\x27,\\x27'+fq(x.id)+'\\x27)">Remove</div></div>')}
  // away from the app for a while: you might have locked the phone to study, so you decide, nothing dies by itself
  let SHID=0;document.addEventListener('visibilitychange',()=>{if(document.hidden){SHID=Date.now();return}const r=sNow();if(!r)return;const aw=SHID?Date.now()-SHID:0;SHID=0;if(aw){r.away=(r.away||0)+aw;sSet(r)}if(r.start+sLen(r)*6e4<=Date.now()){drawStudy();return}studyTick();if(aw>6e4){B=[];open_('<div class="f-sh" style="text-align:center"><div class="s-prev">'+treeSvg(r.tree,sStage(r))+'</div><h3>Welcome back</h3><p class="sub">You were away for '+Math.round(aw/6e4)+' min. Still studying?</p><div class="f-cta" onclick="shx()">Yes, keep growing</div><div class="f-sec" onclick="studyKill(1)">Stop here</div><div class="f-sec red" onclick="studyScrap()">Scrap it, log nothing</div></div>')}})
  // Today: the rest of your day at a glance
  const TD=${J({ tasks: todos.length, top: todos[0]?.title || "", msgs: mn, due: d0 ? { what: d0.what, when: until(d0.w) } : null })}
  function drawToday(){const el=document.getElementById('tdy');if(!el)return;el.innerHTML=dayQuick()+dayLine();drawIsland();drawNudge()}
  const META=src=>{const d=new Date();return {ts:d.toISOString(),tz:-d.getTimezoneOffset(),dow:d.toLocaleDateString('en-GB',{weekday:'short'}),hour:d.getHours(),dev:/Android/.test(navigator.userAgent)?'Android':/iPad/.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&innerWidth>700)?'iPad':'iPhone',src:src||'tap'}}
  // the day: one tap when something happens, one timeline with everything, a journal Claude rates, charts over all of it
  let DLOG=${J(m.dayLog || { events: [] })},JR=${J(m.journal || { entries: [] })},STR=7
  let GLOGD=${J((Array.isArray(m.glog) ? m.glog : m.glog?.items || []).slice(-90))}.map(glMap)
  ;(()=>{const t=Date.now(),a=fls('dayAdd').filter(x=>t-x.t<9e5),r=fls('dayDel').filter(x=>t-x.t<9e5);fls('dayAdd',a);fls('dayDel',r);DLOG.events=DLOG.events||[];const ids=new Set(DLOG.events.map(x=>x.id));DLOG.events=DLOG.events.concat(a.filter(x=>!ids.has(x.e.id)).map(x=>x.e)).filter(x=>!r.some(y=>y.id===x.id))})()
  const DKINDS=[['badday','Rough day'],['wake','Woke up'],['sleep','Bed'],['train','Trained'],['contact','Saw someone'],['outbound','Messaged someone'],['making','Made something']]
  function dayQuick(){const ev=(DLOG.events||[]).filter(x=>x.date===sDay(0));return '<div class="d-q">'+DKINDS.map(k=>'<span class="'+(ev.some(x=>x.kind===k[0])?'on':'')+'" onclick="dayTap(\\x27'+k[0]+'\\x27,\\x27'+k[1]+'\\x27)">'+k[1]+'</span>').join('')+'<span onclick="SPICK=null;studySay()">Study</span><span onclick="tg(\\x27food\\x27)">Ate</span>'+(MEALS.length?'<span onclick="mealLog()">Plan meal</span>':'')+'<span onclick="tg(\\x27body\\x27)">Weight</span><span onclick="gAllSheet()">More</span></div>'}
  function dayTap(k,l,v,at){const was=gDay(sDay(0)).floor;const e={id:Date.now().toString(36)+'d',date:sDay(0),at:at||fhm(),kind:k,label:l,src:'tap'};if(v!==undefined)e.value=v;DLOG.events=(DLOG.events||[]).concat([e]);fls('dayAdd',fls('dayAdd').concat([{t:Date.now(),e}]));act({day_add:[e]},'',k==='badday'?'Logged. That counts.':l+' at '+e.at);drawToday();drawGame();if(!was&&gDay(sDay(0)).floor){burst();toast('Floor cleared')}if(ASK[k])dayAsk(e)}
  function dayRm(id){logRm('day',id)}
  function dayItem(id){const x=(DLOG.events||[]).find(e=>e.id===id);if(!x)return;B=[];open_('<div class="f-sh"><h3>'+H(x.label)+'</h3><p class="sub">Today at '+H(x.at)+'</p><div class="f-sec red" onclick="dayRm(\\x27'+fq(id)+'\\x27)">Remove</div></div>')}
  // journal: your words plus everything the app knows goes to Claude, the read comes back here
  function drawJournal(){const el=document.getElementById('jr');if(!el)return;const w=fls('jrWait').filter(x=>Date.now()-x.t<6e5),L=(JR.entries||[]).slice().reverse().slice(0,30);let dr='';try{dr=localStorage.getItem('jrDraft')||''}catch(e){}
    el.innerHTML='<div class="m-title">Journal</div><div class="card" style="padding:16px"><textarea class="f-in" id="jrt" rows="5" placeholder="Talk about your day. What you did, how it felt, what got in the way." oninput="jrKeep(this.value)"></textarea><div class="f-cta" style="margin-top:10px" onclick="jrSend()">Read my day</div><p class="dim small" style="margin:10px 2px 0">Claude reads this with your study, gym, food, classes, tasks and last days. It never scores what you say here, logging it is what counts. Saved in your private repo.</p></div>'
      +(w.length?'<div class="f-ai wait"><div class="f-spin"></div><div><b>Reading your day</b><small>Usually about a minute</small></div></div>':'')
      +L.map(x=>'<div class="j-c" onclick="jrOpen(\\x27'+fq(x.id)+'\\x27)"><div class="j-s">'+H(String(x.date).slice(8))+'</div><div><small>'+H(x.date)+'</small><b>'+H(x.summary||x.text||'')+'</b></div></div>').join('');document.getElementById('jrt').value=dr}
  function jrKeep(v){try{localStorage.setItem('jrDraft',v)}catch(e){}}
  function jrSend(){const v=fv('jrt'),id=Date.now().toString(36)+'j';window.JTXT=v;jrKeep('');fls('jrWait',fls('jrWait').concat([{id,t:Date.now()}]));drawJournal();nav('board://journal?id='+id+'&date='+sDay(0))}
  function jrFail(id,why){fls('jrWait',fls('jrWait').filter(x=>x.id!==id));jrKeep(window.JTXT||'');toast(why);drawJournal()}
  function jrDone(o){fls('jrWait',fls('jrWait').filter(x=>x.id!==o.id));JR.entries=(JR.entries||[]).filter(x=>x.id!==o.id).concat([o]);drawJournal();drawToday();drawStats();jrOpen(o.id)}
  function jrOpen(id){const x=(JR.entries||[]).find(e=>e.id===id);if(!x)return;B=[];const li=(t,a)=>(a||[]).length?'<div class="f-lab">'+t+'</div>'+a.map(y=>'<div class="j-l">'+H(y)+'</div>').join(''):''
    open_('<div class="f-sh"><h3>'+['Logged','Floor day','Standard day','Full day'][gDay(x.date).type]+'</h3><small>'+H(x.date)+'</small><p class="sub" style="color:var(--ink);font-size:15.5px;margin-top:6px">'+H(x.summary||'')+'</p>'+li('WENT WELL',x.wins)+li('GOT IN THE WAY',x.misses)+(x.compare?'<div class="f-lab">COMPARED</div><div class="j-l">'+H(x.compare)+'</div>':'')+(x.tomorrow?'<div class="f-lab">TOMORROW</div><div class="j-l">'+H(x.tomorrow)+'</div>':'')+(x.text?'<div class="f-lab">WHAT YOU SAID</div><div class="j-l">'+H(x.text)+'</div>':'')+'<div class="f-sec red" onclick="logRm(\\x27journal\\x27,\\x27'+fq(x.id)+'\\x27)">Remove</div></div>')}
  function jrBoot(){const t=Date.now(),w=fls('jrWait').filter(x=>t-x.t<6e5&&!(JR.entries||[]).some(e=>e.id===x.id));fls('jrWait',w);if(w.length)setTimeout(()=>{nav('board://jrpoll?id='+w[w.length-1].id)},700)}
  // stats: each chart answers one question, tap a bar for its number
  const SC=CALL.map(c=>[c,sVar(c)])
  function stDays(){const a=[];for(let o=-(STR-1);o<=0;o++)a.push(sDay(o));return a}
  function stLab(d,i,n){const x=new Date(d+'T12:00');return n<=7?x.toLocaleDateString('en-GB',{weekday:'short'}).slice(0,2):(i%7===(n-1)%7?x.getDate()+'.'+(x.getMonth()+1):'')}
  // bars share one scale; a goal is one dashed line; series is [[name,var,values]]
  function stChart(title,series,opt){opt=opt||{};const D=stDays(),n=D.length,tot=D.map((_,i)=>series.reduce((a,s)=>a+(s[2][i]||0),0)),mx=Math.max(1,opt.goal||0,...tot)*1.08,fmt=opt.fmt||(v=>Math.round(v)),tid='st'+Math.random().toString(36).slice(2,8)
    const bars=D.map((d,i)=>'<div class="c-col" data-tip="'+fq(d.slice(8)+'.'+d.slice(5,7)+': '+(series.length>1?series.filter(s=>s[2][i]).map(s=>s[0]+' '+fmt(s[2][i])).join(', ')||'nothing':fmt(tot[i])))+'" onclick="stTip(this,\\x27'+tid+'\\x27)"><div class="c-bar">'+series.map(s=>s[2][i]?'<i style="height:'+s[2][i]/mx*100+'%;background:var('+s[1]+')"></i>':'').reverse().join('')+'</div><small>'+stLab(d,i,n)+'</small></div>').join('')
    const v=tot.filter(Boolean),avg=v.length?v.reduce((a,b)=>a+b,0)/v.length:0
    return '<div class="card c-card"><div class="c-h"><h3>'+title+'</h3><b>'+(v.length?fmt(avg)+(opt.unit||'')+' <small>avg</small>':'<small>no data yet</small>')+'</b></div><div class="c-tip" id="'+tid+'">Tap a bar</div><div class="c-plot">'+(opt.goal?'<div class="c-goal" style="bottom:calc(18px + (100% - 18px)*'+opt.goal/mx+')"><span>'+fmt(opt.goal)+'</span></div>':'')+bars+'</div>'+(series.length>1?'<div class="c-leg">'+series.filter(s=>s[2].some(Boolean)).map(s=>'<span><i style="background:var('+s[1]+')"></i>'+s[0]+'</span>').join('')+'</div>':'')+'</div>'}
  function stTip(el,id){document.querySelectorAll('.c-col.on').forEach(x=>x.classList.remove('on'));el.classList.add('on');const t=document.getElementById(id);if(t)t.textContent=el.dataset.tip}
  function stRange(n){STR=n;drawStats()}
  function stOpt(t,S,o){return S[0][2].some(Boolean)?stChart(t,S,o):''}
  function drawStats(){const el=document.getElementById('st');if(!el||!tabOn('stats'))return;const D=stDays(),by=(arr,f,k)=>D.map(d=>arr.filter(x=>x.date===d&&(!f||f(x))).reduce((a,x)=>a+(+x[k]||0),0)),F=FOOD.items||[],S=STUDY.sessions||[],g=FOOD.goal||{},J=JR.entries||[],wake=D.map(d=>{const e=(DLOG.events||[]).find(x=>x.date===d&&x.kind==='wake');if(!e)return 0;const p=e.at.split(':');return +p[0]+(+p[1])/60})
    const study=SC.map(c=>[c[0],c[1],by(S,x=>cKey(x.course)===c[0]&&x.status!=='dead','minutes').map(m=>m/60)]),hrs=study.reduce((a,s)=>a+s[2].reduce((p,q)=>p+q,0),0),sets=by(GLOGD,null,'sets'),gymD=sets.filter(Boolean).length,kc=by(F,null,'kcal'),pr=by(F,null,'protein'),ate=kc.filter(Boolean),last=J.filter(x=>x.summary).slice(-1)[0],hm0=v=>Math.floor(v)+':'+String(Math.round(v%1*60)).padStart(2,'0')
    const tile=(a,b)=>'<div class="t-tile"><b>'+a+'</b><span>'+b+'</span></div>'
    el.innerHTML='<div class="f-top"><div><small>Everything you log</small><h2>Stats</h2></div></div><div class="f-seg" style="margin-bottom:14px">'+[7,30,90].map(n=>'<span class="'+(n===STR?'on':'')+'" onclick="stRange('+n+')">'+n+' days</span>').join('')+'</div>'
      +'<div class="t-grid" style="margin-bottom:14px">'+tile(D.filter(d=>gDay(d).floor).length+' / '+STR,'floor days')+tile(hrs.toFixed(1)+' h','studied')+tile(ate.length?Math.round(ate.reduce((a,b)=>a+b,0)/ate.length):'-','kcal a logged day')+tile(gymD,gymD===1?'gym day':'gym days')+'</div>'
      +(last?'<div class="card c-ai" onclick="jrOpen(\\x27'+fq(last.id)+'\\x27)"><small>Claude on '+H(last.date)+'</small><b>'+H(last.summary)+'</b></div>':'')
      +stHeat()+stPat()+lifeLists()+stChart('Study hours',study,{fmt:v=>v.toFixed(1),unit:' h'})+stChart('Calories',[['kcal','--c2',kc]],{goal:g.kcal})+stChart('Protein',[['g','--c1',pr]],{goal:g.protein,unit:' g'})+stChart('Gym sets',[['Sets','--c5',sets]])+stChart('Wake-up time',[['Woke','--c4',wake]],{fmt:hm0})+stChart('Bodyweight',[['kg','--c1',D.map(d=>{const e=(DLOG.events||[]).filter(x=>x.date===d&&x.kind==='weight').slice(-1)[0];return e?+e.value:0})]],{fmt:v=>v.toFixed(1),unit:' kg'})+stOpt('Steps',[['Steps','--c3',D.map(d=>{const h=hDay(d);return h?+h.steps||0:0})]],{})+stOpt('Sleep from Health',[['Hours','--c1',D.map(d=>{const h=hDay(d);return h?+h.sleep||0:0})]],{fmt:v=>v.toFixed(1),unit:' h'})}
  // the game: floors, areas, quests, bosses. Rules in SETUP.md. Points can only be added, nothing here subtracts
  const GAREAS=[['STUDY','Study',40,.26],['BODY','Body',30,.19],['SLEEP','Sleep',25,.22],['PEOPLE','People',25,.14],['ADMIN','Money',20,.1],['MAKING','Making',25,.09]]
  let QST=${J(m.quests || { oneoff: [], bosses: [], cfg: {} })}
  ;(()=>{QST.oneoff=QST.oneoff||[];QST.bosses=QST.bosses||[];QST.cfg=QST.cfg||{};const t=Date.now(),L=fls('qLocal').filter(x=>t-x.t<9e5);fls('qLocal',L);L.forEach(x=>{if(x.add&&!QST.oneoff.some(q=>q.id===x.add.id))QST.oneoff.push(x.add);if(x.done){const q=QST.oneoff.find(y=>y.id===x.done);if(q)q.done=x.date}});if(L.some(x=>x.cfg))Object.assign(QST.cfg,L.filter(x=>x.cfg).slice(-1)[0].cfg)})()
  const gMin=s=>{const p=String(s||'').split(':');return p.length>1?(+p[0])*60+(+p[1]):null},gEv=(d,k)=>(DLOG.events||[]).filter(x=>x.date===d&&x.kind===k),gDR=r=>r<=1?r:r<=1.5?1+(r-1)*.5:1.25,gPlus=(d,n)=>{const x=new Date(d+'T12:00');x.setDate(x.getDate()+n);return loc(x).slice(0,10)},gMon=d=>{const x=new Date(d+'T12:00');return gPlus(d,-((x.getDay()+6)%7))}
  function gTrained(d){return gEv(d,'train').length>0||GLOGD.some(w=>w.date===d)||(d===sDay(0)&&!!G.started)}
  function gDay(d){const F=(FOOD.items||[]).filter(x=>x.date===d),S=(STUDY.sessions||[]).filter(x=>x.date===d&&x.status!=='dead'&&(+x.minutes||0)>=20),goal=(FOOD.goal||{}).kcal||0,pg=(FOOD.goal||{}).protein||0,fm=S.reduce((a,x)=>a+(+x.minutes||0),0),kc=F.reduce((a,x)=>a+(+x.kcal||0),0),pr=F.reduce((a,x)=>a+(+x.protein||0),0),gOff=kc<goal?goal-kc:Math.max(0,kc-fGoal(d)),A={}
    A.STUDY=Math.min(40,gDR(fm/STM)*32)
    let run=0;for(let i=1;i<=5;i++){if(gTrained(gPlus(d,-i)))run++;else break}
    const tr=gTrained(d),mon=gMon(d),restN=(DLOG.events||[]).filter(x=>x.kind==='rest'&&x.date>=mon&&x.date<=d).length,rest=gEv(d,'rest').length>0&&restN<=3,inBand=goal>0&&kc>0&&gOff<=150
    A.BODY=Math.min(30,((tr&&run<5)||rest?15:0)+(pg?gDR(pr/pg)*8:0)+(kc>0?(goal?7*Math.max(0,1-Math.max(0,gOff-150)/500):7):0));if(kc>0&&kc<Math.max(1200,goal*.6)&&d<sDay(0))A.BODY=0
    const w=gEv(d,'wake').map(x=>gMin(x.at)).sort((a,b)=>a-b)[0],from=gMin(QST.cfg.wakeFrom||APP.wake.from),to=gMin(QST.cfg.wakeTo||APP.wake.to),inWin=w!=null&&w>=from&&w<=to,beds=gEv(gPlus(d,-1),'sleep').map(x=>{const m0=gMin(x.at);return m0<720?m0:m0-1440}).concat(gEv(d,'sleep').map(x=>gMin(x.at)).filter(v=>v<720&&(w==null||v<w))),bed=beds.length?Math.max(...beds):null,dur=w!=null&&bed!=null?(w-bed)/60:(hDay(d)&&+hDay(d).sleep||null),dOk=dur!=null&&dur>=7&&dur<=9
    A.SLEEP=dur!=null&&dur<6?0:Math.min(25,(inWin?10:0)+(dOk?10:0)+(gEv(d,'phoneout').length?5:0))
    const ct=gEv(d,'contact').length,ob=gEv(d,'outbound').length,rc=gEv(d,'recurring').length
    A.PEOPLE=Math.min(25,ct*20+ob*5+rc*5)
    const ah=gEv(d,'adminhour').length+gEv(d,'bill').length+gEv(d,'moneycheck').length,ap=gEv(d,'application').length,od=QST.oneoff.filter(q=>q.done===d).length
    A.ADMIN=Math.min(20,ah*15+ap*5+od*10)
    const mk=gEv(d,'making').length,sp=gEv(d,'shipped').length
    A.MAKING=Math.min(25,mk*20+sp*5)
    const mins={STUDY:fm>=Math.min(60,STM),BODY:(tr||rest||(pg&&pr>=pg)||inBand)&&A.BODY>0,SLEEP:(inWin||dOk)&&A.SLEEP>0,PEOPLE:ct+ob>0,ADMIN:ah+ap+od>0,MAKING:mk>0},n=Object.values(mins).filter(Boolean).length,bad=gEv(d,'badday').length>0,logged=(DLOG.events||[]).some(x=>x.date===d)||F.length>0||S.length>0||(JR.entries||[]).some(x=>x.date===d)||tr
    const f={dur,w,win:inWin,focus50:S.some(x=>+x.minutes>=50),tr,prot:pg?pr>=pg:F.length>0,mk:mk>0,ob:ob>0},qd=gToday(d).some(k=>GQD[k][2](f)),floor=bad||((inWin||logged)&&n>=1),type=n>=5&&qd?3:n>=3?2:floor?1:0
    return {A,n,bad,floor,type,f}}
  // daily quests: three, rotating by date
  const GQD=[['Wake inside your window',f=>f.win,()=>dayTap('wake','Woke up')],['One focus block of 50 min',f=>f.focus50,()=>{SPICK=null;tg('study');studySay()}],['One training session',f=>f.tr,()=>tg('gym')],[(FOOD.goal||{}).protein?'Protein at target':'Log what you eat',f=>f.prot,()=>tg('food')],['Make something for 30 min',f=>f.mk,()=>dayTap('making','Made something, 30+ min')],['Message someone first',f=>f.ob,()=>dayTap('outbound','Messaged someone')]].map(x=>[x[0],x[2],x[1]])
  function gToday(d){const i=Math.floor(new Date(d+'T12:00').getTime()/864e5)%6;return [i,(i+2)%6,(i+4)%6]}
  function gWeek(mon){const days=[];for(let i=0;i<7;i++){const d=gPlus(mon,i);if(d<=sDay(0))days.push(gDay(d))}const tot={},top={};GAREAS.forEach(a=>{tot[a[0]]=0;top[a[0]]=0});let floors=0;days.forEach(x=>{if(x.floor)floors++;const v=GAREAS.map(a=>[a[0],x.A[a[0]]]).sort((p,q)=>q[1]-p[1]);if(v[0][1]>0){top[v[0][0]]++;if(top[v[0][0]]>4)x.A[v[0][0]]=v[1][1]}GAREAS.forEach(a=>tot[a[0]]+=x.A[a[0]]+(x.bad?15/GAREAS.length:0))});const score=Math.round(100*GAREAS.reduce((s,a)=>s+a[3]*Math.min(1,tot[a[0]]/(a[2]*5)),0));return {floors,tot,score}}
  const gFirst=()=>{const ds=[...(DLOG.events||[]),...(FOOD.items||[]),...(STUDY.sessions||[]),...GLOGD].map(x=>x.date).filter(Boolean).sort();return ds[0]||sDay(0)}
  function gStreak(){let s=0,miss=[];const today=sDay(0);for(let d=gFirst(),i=0;d<=today&&i<500;d=gPlus(d,1),i++){if(gDay(d).floor){s++;continue}if(d===today)continue;miss=miss.filter(x=>x>gPlus(d,-14));if(miss.length<2)miss.push(d);else{s=Math.floor(s*.8);miss=[]}}return s}
  function gLevel(x){const T=[0,300,705,1247,1983,2977,4319];let i=T.length-1;while(i>0&&x<T[i])i--;if(i<T.length-1)return {l:i+1,into:x-T[i],need:T[i+1]-T[i]};let l=7,t=4319,step=1342*1.35;while(x>=t+step){t+=step;step*=1.35;l++}return {l,into:x-t,need:step}}
  function gXp(){const X={};GAREAS.forEach(a=>X[a[0]]=0);const today=sDay(0);for(let d=gFirst(),i=0;d<=today&&i<500;d=gPlus(d,1),i++){const z=gDay(d);GAREAS.forEach(a=>X[a[0]]+=z.A[a[0]]+(z.bad?15/GAREAS.length:0))}return X}
  // the morning: one number and three quests, nothing else
  function gMorning(){let was='';try{was=localStorage.getItem('mornDay')||''}catch(e){}if(was===sDay(0))return;try{localStorage.setItem('mornDay',sDay(0))}catch(e){}const w=gWeek(gMon(sDay(0))),f=gDay(sDay(0)).f,o=document.createElement('div');o.id='morn';o.innerHTML=fxArrow('mo-arrow')+'<small>Floors this week</small><div class="mo-n">'+w.floors+'<span> / 7</span></div><div class="mo-q">'+gToday(sDay(0)).map(k=>'<div class="'+(GQD[k][2](f)?'on':'')+'" onclick="gmGo('+k+')">'+H(GQD[k][0])+'</div>').join('')+'</div><div class="mo-x" onclick="gmClose()">Open</div>';document.body.appendChild(o)}
  function gmClose(){const o=document.getElementById('morn');if(o)o.remove()}
  function gmGo(k){gmClose();GQD[k][1]()}
  // all the one-tap logs, by area
  const GALL=[['Sleep',[['wake','Woke up'],['sleep','Bed'],['phoneout','Phone out of the bedroom']]],['Body',[['train','Trained'],['rest','Rest day']]],['People',[['contact','Saw someone, 30+ min'],['outbound','Messaged someone'],['recurring','Weekly thing with people']]],['Money',[['bill','Paid a bill'],['moneycheck','Checked my money'],['application','Sent an application']]],['Making',[['making','Made something, 30+ min'],['shipped','Shipped something']]],['Other',[['read','Read something'],['walk','Walk'],['break','Break'],['class','Class']]]]
  function gAllSheet(){B=[];open_('<div class="f-sh"><h3>Log something</h3><div class="f-lab">WEIGHT THIS MORNING</div><div class="f-g"><input class="f-in" id="gws" inputmode="decimal" placeholder="kg" onfocus="this.select()" value="'+fq(((DLOG.events||[]).filter(x=>x.kind==='weight').slice(-1)[0]||{}).value||'')+'"><div class="f-sec" style="margin:0;padding:14px" onclick="gWeigh(\\x27gws\\x27)">Save</div></div>'+GALL.map(g=>'<div class="f-lab">'+g[0].toUpperCase()+'</div><div class="f-seg g-wrap">'+g[1].map(k=>'<span onclick="shx();dayTap(\\x27'+k[0]+'\\x27,\\x27'+k[1]+'\\x27)">'+k[1]+'</span>').join('')+'</div>').join('')+'</div>')}
  function gWeigh(i){const v=fnum(fv(i||'gw'));if(!v){toast('Enter your weight');return}dayTap('weight',v+' kg',v);shx();drawBody()}
  // the game page
  function drawGame(){const el=document.getElementById('gm');if(!el)return;const today=sDay(0),w=gWeek(gMon(today)),X=gXp();let best={};try{best=JSON.parse(localStorage.getItem('gBest')||'{}')}catch(e){}const lv=GAREAS.map(a=>{const L=gLevel(X[a[0]]);best[a[0]]=Math.max(best[a[0]]||1,L.l);return [a,L,best[a[0]]]});try{localStorage.setItem('gBest',JSON.stringify(best))}catch(e){}const acc=Math.floor(lv.reduce((s,x)=>s+x[2],0)/GAREAS.length),wkS=[];for(let i=0;i<7;i++)wkS.push(gPlus(gMon(today),i));const cnt=k=>(DLOG.events||[]).filter(x=>x.kind===k&&wkS.includes(x.date)).length
    const WK=APP.game.weekly,wq=[['Money check',cnt('moneycheck'),+WK.moneycheck],['Saw people',cnt('contact'),+WK.contact],['Making sessions',cnt('making'),+WK.making],['Applications',cnt('application'),+WK.application]].filter(q=>q[2]>0)
    const mon=today.slice(0,7),mc=k=>(DLOG.events||[]).filter(x=>x.kind===k&&String(x.date).startsWith(mon)).length,open=QST.oneoff.filter(q=>!q.done)
    const boss=QST.bosses.map(b=>{const qs=(b.quests||[]).map(id=>QST.oneoff.find(q=>q.id===id)).filter(Boolean);let p=0;if(qs.length)p=qs.filter(q=>q.done).length/qs.length;else if(today>=b.prep_start){const a=GAREAS.find(z=>z[0]===b.area);let t=0,n=0;for(let d=b.prep_start;d<=b.prep_end;d=gPlus(d,1)){n++;if(d<=today)t+=gDay(d).A[b.area]}p=Math.min(1,t/(a[2]*n*.6))}return '<div class="g-b"><b>'+H(b.title)+'</b><small>'+H(today<b.prep_start?'Prep starts '+b.prep_start:b.when||'')+'</small><i><em style="width:'+Math.round(p*100)+'%"></em></i>'+qs.map(q=>'<div class="chk tap '+(q.done?'done':'')+'" onclick="gDone(\\x27'+fq(q.id)+'\\x27)"><i>'+(q.done?'✓':'')+'</i><span>'+H(q.title)+'</span></div>').join('')+'</div>'}).join('')
    const prep=new Set(QST.bosses.flatMap(b=>b.quests||[]))
    el.innerHTML='<div class="m-title">Game</div><div class="g-top"><div><b>'+w.floors+'<small> / 7</small></b><span>floors this week</span></div><div><b>'+w.score+'</b><span>weekly score</span></div><div><b>'+gStreak()+'</b><span>day streak</span></div><div><b>'+acc+'</b><span>level</span></div></div>'
      +'<div class="f-sec" style="margin:0 0 14px" onclick="gReview()">Weekly review</div><div class="card c-card"><h3 class="g-h">Your areas</h3>'+lv.map(x=>'<div class="g-a">'+gEl(x[0][0])+'<span>'+x[0][1]+'</span><i><em style="width:'+Math.round(x[1].into/x[1].need*100)+'%"></em></i><b>L'+x[2]+'</b></div>').join('')+'</div>'
      +'<div class="card c-card"><h3 class="g-h">This week</h3>'+wq.map(q=>'<div class="g-a"><span class="g-w">'+q[0]+'</span><i><em style="width:'+Math.min(100,q[1]/q[2]*100)+'%"></em></i><b>'+q[1]+'/'+q[2]+'</b></div>').join('')+'</div>'
      +'<div class="card c-card"><h3 class="g-h">Bosses</h3>'+boss+'<div class="g-b"><b>This month</b><small>'+Math.min(mc('shipped'),1)+'/1 shipped, '+Math.min(mc('contact'),4)+'/4 people, '+open.length+' open quests</small></div></div>'
      +'<div class="card c-card"><h3 class="g-h">One-off quests</h3>'+QST.oneoff.filter(q=>!prep.has(q.id)&&(!q.done||q.done===today)).map(q=>'<div class="chk tap '+(q.done?'done':'')+'" onclick="gDone(\\x27'+fq(q.id)+'\\x27)"><i>'+(q.done?'✓':'')+'</i><span>'+H(q.title)+'</span></div>').join('')+'<div class="f-g" style="margin-top:8px"><input class="f-in" id="gq" placeholder="Add a quest"><div class="f-sec" style="margin:0;padding:14px" onclick="gAdd()">Add</div></div></div>'
      +'<div class="card c-card"><h3 class="g-h">Wake window</h3><div class="f-g"><input class="f-in" id="gwf" type="time" value="'+fq(QST.cfg.wakeFrom||APP.wake.from)+'"><input class="f-in" id="gwt" type="time" value="'+fq(QST.cfg.wakeTo||APP.wake.to)+'"></div><div class="f-sec" onclick="gCfg()">Save</div></div>'}
  function gDone(id){const q=QST.oneoff.find(x=>x.id===id);if(!q||q.done)return;q.done=sDay(0);fls('qLocal',fls('qLocal').concat([{t:Date.now(),done:id,date:q.done}]));act({quest_done:[{id,date:q.done}]},'','Done');drawGame();drawToday()}
  function gAdd(){const v=fv('gq');if(!v)return;const q={id:Date.now().toString(36)+'q',title:v};QST.oneoff.push(q);fls('qLocal',fls('qLocal').concat([{t:Date.now(),add:q}]));act({quest_add:[q]},'','Added');drawGame()}
  function gCfg(){const c={wakeFrom:fv('gwf'),wakeTo:fv('gwt')};if(!c.wakeFrom||!c.wakeTo)return;Object.assign(QST.cfg,c);fls('qLocal',fls('qLocal').concat([{t:Date.now(),cfg:c}]));act({game_cfg:c},'','Saved');drawGame();drawToday()}
  // press, slide, release: one small engine, and every surface uses it in its own way. A plain tap still does what it always did
  const GS=[],gs=(sel,h)=>GS.push([sel,h]);let GA=null,GSKIP=0
  const under=(s,sel)=>{const e=document.elementFromPoint(s.x,s.y);return e&&e.closest?e.closest(sel):null}
  const hap=()=>{const l=document.getElementById('hapl');if(l)try{l.click()}catch(e){}}
  function hov(s,el){if(s.cur===el)return;if(s.cur)s.cur.classList.remove('hov');s.cur=el;if(el){el.classList.add('hov');hap()}}
  document.addEventListener('pointerdown',e=>{if(GA||!e.target.closest)return;for(const [sel,h] of GS){const el=e.target.closest(sel);if(!el)continue;const s={el,h,id:e.pointerId,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,dx:0,dy:0,moved:false,t:e.target};if(h.start&&h.start(s)===false)continue;GA=s;return}},true)
  window.addEventListener('pointermove',e=>{const s=GA;if(!s||e.pointerId!==s.id)return;s.x=e.clientX;s.y=e.clientY;s.dx=s.x-s.x0;s.dy=s.y-s.y0;if(!s.moved&&Math.hypot(s.dx,s.dy)>(s.h.slop||7))s.moved=true;if(s.moved&&s.h.move)s.h.move(s)})
  window.addEventListener('pointerup',e=>{const s=GA;if(!s||e.pointerId!==s.id)return;GA=null;if(s.h.end)s.h.end(s);if(s.cur)s.cur.classList.remove('hov');if(s.moved)GSKIP=Date.now()})
  window.addEventListener('pointercancel',e=>{const s=GA;if(!s||e.pointerId!==s.id)return;GA=null;if(s.h.cancel)s.h.cancel(s);if(s.cur)s.cur.classList.remove('hov')})
  document.addEventListener('click',e=>{if(Date.now()-GSKIP<350){e.preventDefault();e.stopPropagation();GSKIP=0}},true)
  // the fan: slide up from the tabs, or hold Say it, then release on what you just did
  const FAN=[['badday','Rough day','#E5803A'],['wake','Woke up','#E5A52E'],['sleep','Bed','#7C8BD9'],['train','Trained','#D98A1F'],['rest','Rest day','#8FA84A'],['contact','Saw someone','#E37FA0'],['outbound','Messaged someone','#C77FD0'],['making','Made something','#2FAD98'],['bill','Paid a bill','#6FA9B8'],['#study','Study','#3F9E60'],['#food','Ate','#EB6834'],['#say','Say it','#2A78D6']]
  function fanOpen(pos){if(document.getElementById('fan'))return;hap();const o=document.createElement('div');o.id='fan';o.className=pos||'';o.innerHTML='<div class="fan-g">'+FAN.map((k,i)=>'<div data-fan="'+i+'" style="animation-delay:'+i*16+'ms" onclick="fanRun('+i+')"><i style="background:'+k[2]+'"></i>'+k[1]+'</div>').join('')+'</div>';o.addEventListener('click',e=>{if(e.target===o)fanClose()});document.body.appendChild(o)}
  function fanClose(){const o=document.getElementById('fan');if(o)o.remove()}
  function fanRun(i){const k=FAN[i];fanClose();if(k[0]==='#study'){SPICK=null;studySay()}else if(k[0]==='#food')foodSay();else if(k[0]==='#say')sayOpen();else dayTap(k[0],k[1])}
  const fanEnd=s=>{const c=under(s,'[data-fan]');if(c){fanRun(+c.dataset.fan);GSKIP=Date.now();return true}if(s.moved)fanClose();return false}
  gs('#nav',{slop:4,start(s){const b=under(s,'#nav span');hov(s,b)},move(s){if(s.fan||s.dy<-46){s.fan=true;fanOpen();hov(s,under(s,'[data-fan]'));return}hov(s,under(s,'#nav span'))},end(s){if(s.fan){fanEnd(s);return}if(s.moved&&s.cur)tg(s.cur.dataset.p)},cancel(){fanClose()}})
  gs('.say',{slop:12,start(s){s.tm=setTimeout(()=>{s.fan=true;fanOpen('dn')},230)},move(s){if(s.fan)hov(s,under(s,'[data-fan]'))},end(s){clearTimeout(s.tm);if(s.fan){fanEnd(s);s.moved=true}},cancel(s){clearTimeout(s.tm);fanClose()}})
  // swipe a row: right says yes, left says no. Each surface picks its own yes and no
  function swipe(sel,c){gs(sel,{slop:10,start(s){if(s.t.closest('input,textarea,.s-btns span,.f-add,[data-done]'))return false;s.el.style.transition='none'},move(s){const dx=s.dx*(Math.abs(s.dx)>110?.75:1);s.el.style.transform='translateX('+dx+'px)';const side=dx>0?c.r:c.l;let lb=s.lb;if(!lb){lb=s.lb=document.createElement('div');lb.className='sw-l';document.body.appendChild(lb)}const r=s.el.getBoundingClientRect();lb.textContent=side||'';lb.style.top=(r.top+r.height/2-16)+'px';lb.style.left=dx>0?'22px':'auto';lb.style.right=dx>0?'auto':'22px';const on=Math.abs(s.dx)>84;lb.classList.toggle('on',on);if(on!==s.on){s.on=on;if(on)hap()}if(c.live)c.live(s)},end(s){if(s.lb)s.lb.remove();const el=s.el,go=s.moved&&Math.abs(s.dx)>84?(s.dx>0?c.right:c.left):null;el.style.transition='transform .22s cubic-bezier(.2,.9,.3,1.1)';el.style.transform=go?'translateX('+(s.dx>0?'110%':'-110%')+')':'';if(c.live&&!go)c.live({el,dx:0});if(go)setTimeout(()=>{go(el);el.style.transform=''},170)},cancel(s){if(s.lb)s.lb.remove();s.el.style.transition='transform .2s';s.el.style.transform='';if(c.live)c.live({el:s.el,dx:0})}})}
  swipe('.s-card',{r:'Plant',l:'Not now',live(s){const t=s.el.querySelector('.s-mini');if(t)t.style.transform=s.dx>0?'scale('+Math.min(1.45,1+s.dx/220)+')':''},right(el){const k=el.dataset.k,i=+el.dataset.i;studyPick(k,i);studyPlant()},left(el){studyNo(el.dataset.k,+el.dataset.i)}})
  swipe('.f-row',{r:'Again',l:'Remove',right(el){foodCopy(el.dataset.fid)},left(el){foodDel(el.dataset.fid)}})
  swipe('.chk[data-sh^="todo:"]',{r:'Done',l:'Later',right(el){const id=el.dataset.sh.slice(5);act({todos_done:[id]},'todo:'+id,'Done')},left(el){sh('todo',el.dataset.sh.slice(5))}})
  swipe('.chk[data-cw]:not(.done)',{r:'Done',l:'Later',right(el){el.classList.add('done');el.querySelector('i').textContent='✓';act({coursework_done:[el.dataset.cw]},'','Done')},left(el){cwMenu(el)}})
  swipe('.msg[data-sh]',{r:'Handled',l:'Open',right(el){const id=el.dataset.sh.slice(4);act({digest_done:[{id,state:'done'}]},'msg:'+id,'Handled')},left(el){sh('msg',el.dataset.sh.slice(4))}})
  // any row of choices: slide across, release on one
  gs('.f-seg,.qk',{slop:8,move(s){hov(s,under(s,'.f-seg span,.qk span'))},end(s){if(s.moved&&s.cur)s.cur.click()}})
  // charts: run a finger along the bars
  const stAt=(s)=>{const c=under(s,'.c-col');if(c&&c!==s.cur){hov(s,c);document.querySelectorAll('.c-col.on').forEach(x=>x.classList.remove('on'));c.classList.add('on');const t=c.closest('.c-card').querySelector('.c-tip');if(t)t.textContent=c.dataset.tip}}
  gs('.c-plot',{slop:3,start(s){stAt(s)},move:stAt})
  // the week strip: slide across days and the ring follows
  function foodPeek(o){const ds=fdateAt(o),L=(FOOD.items||[]).filter(x=>x.date===ds),kc=Math.round(L.reduce((a,x)=>a+(+x.kcal||0),0)),g=fGoal(ds),left=g-kc,n=document.querySelector('.f-num b'),sm=document.querySelector('.f-num small'),e=document.querySelector('.f-side b'),r=document.querySelector('.f-ring .fg'),C=2*Math.PI*76;if(n)n.textContent=g?Math.abs(left):kc;if(sm)sm.textContent=!g?'kcal eaten':left<0?'kcal over':'kcal left';if(e)e.textContent=kc;if(r)r.style.strokeDashoffset=C*(1-(g?Math.min(1,kc/g):0))}
  gs('.f-week',{slop:4,move(s){const c=under(s,'.f-day');if(c&&c!==s.cur){hov(s,c);const i=[...c.parentNode.children].indexOf(c);s.o=i-6;c.parentNode.querySelectorAll('.f-day').forEach(x=>x.classList.toggle('on',x===c));foodPeek(s.o)}},end(s){if(s.moved&&s.o!==undefined)foodDay(s.o)}})
  // the forest: slide across your trees, each one lifts and says what it was
  gs('.s-forest',{slop:5,move(s){const c=under(s,'.s-t');if(c&&c!==s.cur){hov(s,c);const x=(STUDY.sessions||[]).find(z=>z.id===c.dataset.sid);if(x)toast(x.topic+', '+(+x.minutes||0)+' min')}},end(s){if(s.moved&&s.cur)s.cur.dispatchEvent(new MouseEvent('click',{bubbles:true}))}})
  // planting: press the tree and slide up, it grows with the time you give it
  const sScale=m=>Math.min(1.2,.6+m/180*.6)
  gs('.s-prev',{slop:3,start(s){s.m0=(SPICK&&SPICK.min)||25},move(s){if(SPICK.mode&&SPICK.mode!=='down')return;const m=Math.max(5,Math.min(180,Math.round((s.m0-s.dy/1.8)/5)*5));if(m===s.m)return;s.m=m;SPICK.min=m;if(m%15===0)hap();s.el.style.transform='scale('+sScale(m)+')';const l=document.getElementById('sdpl');if(l)l.textContent=m+' min'},end(s){if(!s.moved)return;if(SPICK.kind==='q')studyQ('min',SPICK.min);else studySheet()}})
  // numbers: slide along one instead of typing. A tap still opens the keyboard
  gs('#fg,.f-ait input,#gw,#gk,#gp',{slop:9,start(s){s.v0=fnum(s.el.value)},move(s){const id=s.el.id,step=id==='gw'?.1:id==='gk'?25:id==='gp'?5:5,v=Math.max(0,Math.round((s.v0+Math.round(s.dx/7)*step)*10)/10);if(String(v)===s.el.value)return;s.el.value=v;s.el.dispatchEvent(new Event('input',{bubbles:true}));if(!id||Math.round(v/step)%5===0)hap()}})
  // the morning screen lifts away
  gs('#morn',{slop:10,start(s){if(s.t.closest('.mo-q,.mo-x'))return false},move(s){s.el.style.transform='translateY('+Math.min(0,s.dy)+'px)';s.el.style.opacity=1+Math.min(0,s.dy)/500},end(s){if(s.dy<-70)gmClose();else{s.el.style.transform='';s.el.style.opacity=''}},cancel(s){s.el.style.transform='';s.el.style.opacity=''}})
  // the day dial: 24 hours as a ring. Slide around it to read any moment, release to log something at that time
  const TDC=${J(m.today.map(c => ({ a: c.s.getHours() * 60 + c.s.getMinutes(), b: c.e.getHours() * 60 + c.e.getMinutes(), t: c.title })))}
  function dSpans(){const d=sDay(0),L=[],w=gEv(d,'wake').map(x=>gMin(x.at)).sort((a,b)=>a-b)[0],bed=gEv(gPlus(d,-1),'sleep').map(x=>gMin(x.at)).sort((a,b)=>b-a)[0];if(w!=null)L.push({a:bed!=null&&bed<720?bed:0,b:w,c:'#7C8BD9',t:'Asleep'});TDC.forEach(c=>L.push({a:c.a,b:c.b,c:'#E5A52E',t:c.t}));(STUDY.sessions||[]).filter(x=>x.date===d&&x.start).forEach(x=>{const a=gMin(x.start);L.push({a,b:a+(+x.minutes||0),c:'#1BAF7A',t:x.topic})});return L}
  function dDots(){const d=sDay(0);return (DLOG.events||[]).filter(x=>x.date===d&&x.kind!=='wake').map(x=>({m:gMin(x.at),c:'#2A78D6',t:x.label})).concat((FOOD.items||[]).filter(x=>x.date===d&&x.at).map(x=>({m:gMin(x.at),c:'#EB6834',t:x.name})))}
  // the day as one straight line, midnight to midnight. Slide along it to read any moment, let go to log something at that time
  function dialHtml(){const n=new Date(),nm=n.getHours()*60+n.getMinutes(),P=m=>(m/14.4).toFixed(2)+'%';return '<div class="ds" id="dial"><div class="ds-r"><b id="dialT">'+fhm()+'</b><small id="dialS">Slide along the line, let go to log at that time</small></div><div class="ds-b"><span class="ds-p" style="width:'+P(nm)+'"></span>'+dSpans().map(x=>'<i style="left:'+P(x.a)+';width:'+P(Math.max(x.b-x.a,8))+';background:'+x.c+'"></i>').join('')+dDots().map(x=>'<u style="left:'+P(x.m)+';background:'+x.c+'"></u>').join('')+'<s id="dialN" style="left:'+P(nm)+'"></s></div><div class="ds-h"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div><div class="dial-lg">'+[['#7C8BD9','Sleep'],['#E5A52E','Class'],['#1BAF7A','Study'],['#EB6834','Food'],['#2A78D6','Logged']].map(x=>'<span><i style="background:'+x[0]+'"></i>'+x[1]+'</span>').join('')+'</div></div>'}
  function dialAt(s){const r=s.el.querySelector('.ds-b').getBoundingClientRect(),m=Math.max(0,Math.min(1435,Math.round((s.x-r.left)/r.width*1440/5)*5)),h=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');s.m=m;s.h0=h;document.getElementById('dialN').style.left=(m/14.4)+'%';document.getElementById('dialT').textContent=h;const hit=dSpans().find(x=>m>=x.a&&m<=x.b)||dDots().find(x=>Math.abs(x.m-m)<=10),nm=new Date().getHours()*60+new Date().getMinutes();document.getElementById('dialS').textContent=hit?hit.t:m>nm?'Later today':'Let go to log something at '+h;if(hit!==s.hit){s.hit=hit;hap()}}
  gs('#dial',{slop:5,move:dialAt,end(s){if(!s.moved||s.m==null)return;const n=new Date(),nm=n.getHours()*60+n.getMinutes();if(s.m>nm){drawToday();return}B=[];window.DAT=s.h0;open_('<div class="f-sh"><h3>Log at '+s.h0+'</h3><p class="sub">Slide across and let go, or tap.</p><div class="f-seg g-wrap">'+FAN.filter(k=>k[0][0]!=='#').map(k=>'<span onclick="shx();dayTap(\\x27'+k[0]+'\\x27,\\x27'+k[1]+'\\x27,undefined,window.DAT)">'+k[1]+'</span>').join('')+'</div></div>');drawToday()},cancel(){drawToday()}})
  // falling leaves when something grows
  function burst(){const C=['#5DB56F','#A9CF62','#F2A04A','#F5A9C0','#3F9E60'];for(let i=0;i<22;i++){const l=document.createElement('i');l.className='leaf';l.style.cssText='left:'+Math.random()*100+'vw;background:'+C[i%5]+';animation-delay:'+Math.random()*.35+'s;--dx:'+(Math.random()*80-40)+'px;--r:'+Math.random()*540+'deg';document.body.appendChild(l);setTimeout(()=>l.remove(),2100)}}
  // the sky over Today follows the actual time of day
  function fxSky(){const h=new Date().getHours(),dk=document.documentElement.dataset.theme==='dark',S=h<6||h>=21?['#16203A','#27345A','#EEF1FA','#F5F1D8']:dk?(h<9?['#3B2A2E','#4A3B36','#F8EADD','#F7B267']:h<17?['#183444','#1E3D34','#E8F4EE','#FFD568']:['#3A2940','#4B3050','#F4E8F2','#F08A5D']):h<9?['#FCE1CB','#F9EED3','#4A3222','#F7B267']:h<17?['#CFE8F5','#E6F3DC','#23402F','#FFD568']:['#F6CDB8','#D9C6E8','#43304F','#F08A5D'],R=document.documentElement.style;R.setProperty('--s1',S[0]);R.setProperty('--s2',S[1]);R.setProperty('--st',S[2]);R.setProperty('--sun',S[3]);const p=h<6||h>=21?.8:Math.min(1,Math.max(0,(h-6)/15));R.setProperty('--sx',(8+p*76)+'%');R.setProperty('--sy',(34-Math.sin(p*Math.PI)*26)+'px')}
  function fxHelp(){B=[];open_('<div class="f-sh"><h3>Slide on everything</h3><p class="sub">Press, slide, release. A plain tap still works.</p>'+[['Tabs','Slide along them to switch'],['Tabs, then up','Opens the fan, release on what you just did'],['Say it','Hold for the same fan'],['Day dial','Slide around 24 hours, release to log at that time'],['Study cards','Right plants, left is not now'],['Tree when planting','Slide up and it grows with the minutes'],['Food rows','Right adds again, left removes'],['Week strip','Slide across days, the ring follows'],['Numbers','Slide along grams, weight or goals'],['Charts','Run a finger along the bars'],['Forest','Slide across your trees'],['Tasks and Week','Right is done, left is later'],['Messages','Right is handled, left opens'],['Heads up','Right says I did it, left is not now'],['Any choices','Slide across and let go']].map(x=>'<div class="f-rec"><b style="font-weight:700">'+x[0]+'</b><span style="text-align:right">'+x[1]+'</span></div>').join('')+'</div>')}
  function fxBoot(){fxSky();fxAir();if(/Android/.test(navigator.userAgent)){const e=document.getElementById('shr');if(e)e.style.display='none'}{const e=document.getElementById('thm');if(e)e.textContent=document.documentElement.dataset.theme==='dark'?'Dark':'Light'}setInterval(fxSky,6e5);const c=document.getElementById('cls');if(c&&!c.querySelector('.h-hill')){c.insertAdjacentHTML('beforeend',fxArrow('h-arrow'));const v=document.createElementNS('http://www.w3.org/2000/svg','svg');v.setAttribute('viewBox','0 0 400 70');v.setAttribute('preserveAspectRatio','none');v.setAttribute('class','h-hill');v.innerHTML='<path d="M0 44C70 14 130 18 210 42S340 62 400 26V70H0z" fill="currentColor" opacity=".07"/><path d="M0 58C90 34 170 56 250 54S360 38 400 50V70H0z" fill="currentColor" opacity=".08"/>';c.appendChild(v)}const w=document.createElement('div');w.style.cssText='position:fixed;width:0;height:0;overflow:hidden';w.innerHTML='<input type="checkbox" switch id="hapc"><label id="hapl" for="hapc"></label>';document.body.appendChild(w)}
  // the island: one card, six lenses. It opens on what matters right now; slide along the rings or swipe the card to change lens, tap it to go there
  const ISN=${x ? (m.cur ? x.e : x.s).getTime() : 0},ISLS=['next','study','food','gym','floors','ahead'];let ISLK='',ISLN=''
  function islVals(){const d=sDay(0),N=Date.now(),hl=ISN?(ISN-N)/36e5:0,sm=sMins(x=>x.date===d&&x.status!=='dead'),F=(FOOD.items||[]).filter(x=>x.date===d),kc=Math.round(F.reduce((a,x)=>a+(+x.kcal||0),0)),g=fGoal(d),lw=${J(lastWorkout(m))},gd=gTrained(d)?0:lw?Math.round((new Date(d)-new Date(lw.date))/864e5):null,fl=gWeek(gMon(d)).floors,nd=(D.dls||[]).map(q=>({t:q.what,w:new Date(q.when)})).filter(q=>q.w>N)[0],ex=(D.exams||[]).map(e=>({t:e.name,w:new Date(e.start)})).filter(e=>e.w>N)[0],soon=nd&&ex?(nd.w<ex.w?nd:ex):nd||ex,ad=soon?Math.ceil((soon.w-N)/864e5):null
    return {hl,sm,kc,g,left:g-kc,pr:Math.round(F.reduce((a,x)=>a+(+x.protein||0),0)),lw,gd,fl,nd,ex,ad,run:sNow(),f:gDay(d).f}}
  function islAuto(v){if(v.run)return 'study';if(ISN&&v.hl<1.5)return 'next';if(v.nd&&(v.nd.w-Date.now())<864e5)return 'ahead';return 'next'}
  function islRing(k,lab,val,p){const C=2*Math.PI*16;return '<div class="isl-k'+(k===ISLK?' on':'')+'" data-k="'+k+'" onclick="islSet(\\x27'+k+'\\x27)"><div class="isl-rg"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="b"/><circle cx="20" cy="20" r="16" class="f" stroke-dasharray="'+C+'" stroke-dashoffset="'+C*(1-Math.max(.02,Math.min(1,p)))+'"/></svg><b>'+val+'</b></div><small>'+lab+'</small></div>'}
  function islFace(k,v){const kick=t=>'<div class="kick">'+H(t)+'</div>',big=(a,b)=>'<div class="big">'+H(a)+(b?' <span class="dim">'+H(b)+'</span>':'')+'</div>',sub=t=>'<div class="sub">'+H(t)+'</div>'
    if(k==='next')return window.ISN0||''
    if(k==='study'){if(v.run)return kick('Growing now, '+v.run.course)+big(v.run.topic)+'<div class="count" id="islT"></div>';const s=sSuggest()[0];if(!s)return kick('Study')+big('Nothing waiting')+'<span class="isl-b" onclick="event.stopPropagation();SPICK=null;studySay()">Start studying</span>';return kick('Study next, '+s.course)+big(s.topic)+(s.why?sub(s.why):'')+'<span class="isl-b" onclick="event.stopPropagation();studyPick(\\x27s\\x27,0);studyPlant()">Plant</span>'}
    if(k==='food'){const pg=(FOOD.goal||{}).protein||0;return kick('Food')+(v.g?big(String(Math.abs(v.left)),v.left<0?'kcal over':'kcal left'):big(String(v.kc),'kcal eaten'))+sub(pg?v.pr+' of '+pg+' g protein':v.pr+' g protein')}
    if(k==='gym'){const sh=String(SUG||'').replace(/^Day [0-9]+:[ ]*/,'').split(' and ').join(' + ');return kick('Gym')+big(sh||'Pick anything',sh?'suggested':'')+sub(v.gd===0?'Trained today':v.lw?(v.gd===1?'Last trained yesterday':'Last trained '+v.gd+' days ago'):'Nothing logged yet')}
    if(k==='floors'){const q=gToday(sDay(0)).map(i=>GQD[i]).filter(x=>!x[2](v.f));return kick('This week')+big(v.fl+' / 7','floors')+sub(q.length?'Next: '+q[0][0]:'All three quests done')}
    const L=[];if(v.nd)L.push(v.nd.t+', '+Math.ceil((v.nd.w-Date.now())/864e5)+' d');if(v.ex)L.push(v.ex.t+', '+Math.ceil((v.ex.w-Date.now())/864e5)+' d');if(TD.msgs)L.push(TD.msgs+(TD.msgs===1?' message needs you':' messages need you'));if(TD.tasks)L.push(TD.tasks+(TD.tasks===1?' task open':' tasks open'));return kick('Ahead')+(L.length?big(L[0])+'<div class="isl-l">'+L.slice(1).map(t=>'<div>'+H(t)+'</div>').join('')+'</div>':big('Nothing coming up'))}
  function drawIsland(anim){const F=document.getElementById('islF'),R=document.getElementById('islR');if(!F||!R)return;if(window.ISN0===undefined)window.ISN0=F.innerHTML;const v=islVals();if(!ISLK)ISLK=islAuto(v);if(anim||ISLN!==ISLK){F.innerHTML=islFace(ISLK,v);F.classList.remove('in');void F.offsetWidth;F.classList.add('in');ISLN=ISLK}else if(ISLK!=='next')F.innerHTML=islFace(ISLK,v);if(ISLK==='next')tick();islTick()
    const hl=v.hl;R.innerHTML=islRing('next','Next',ISN?(hl<1?Math.max(1,Math.round(hl*60))+'m':hl<48?Math.round(hl)+'h':Math.round(hl/24)+'d'):'-',ISN?1-hl/24:0)+islRing('study','Study',v.sm>=60?(v.sm/60).toFixed(1)+'h':v.sm+'m',v.sm/STM)+islRing('food','Food',(()=>{const n=v.g?Math.abs(v.left):v.kc;return n>=1000?(n/1000).toFixed(1)+'k':n})(),v.g?v.kc/v.g:0)+islRing('gym','Gym',v.gd===null?'-':v.gd+'d',v.gd===null?0:1-v.gd/7)+islRing('floors','Floors',v.fl,v.fl/7)+islRing('ahead','Ahead',v.ad===null?'-':v.ad+'d',v.ad===null?0:1-v.ad/30)}
  function islSet(k){if(k===ISLK)return;ISLK=k;drawIsland(true)}
  function islOpen(){const p={next:'',study:'study',food:'food',gym:'gym',floors:'game',ahead:'more'}[ISLK];if(p)tg(p);else{const c=document.getElementById('clsl');if(c)c.scrollIntoView({behavior:'smooth',block:'start'})}}
  function islTick(){const e=document.getElementById('islT'),r=sNow();if(!e||!r)return;const sec=(Date.now()-r.start)/1000;e.textContent=r.mode==='up'?sClock(sec):sClock(Math.max(0,Math.ceil(sLen(r)*60-sec)))}
  setInterval(islTick,1000)
  gs('#islR',{slop:3,move(s){const c=under(s,'.isl-k');if(c&&c!==s.cur){hov(s,c);R0(c.dataset.k)}}})
  function R0(k){if(k===ISLK)return;ISLK=k;const F=document.getElementById('islF');F.innerHTML=islFace(k,islVals());F.classList.remove('in');void F.offsetWidth;F.classList.add('in');ISLN=k;if(k==='next')tick();islTick();document.querySelectorAll('.isl-k').forEach(x=>x.classList.toggle('on',x.dataset.k===k))}
  gs('#islF',{slop:9,start(s){if(s.t.closest('.isl-b'))return false;s.el.style.transition='none'},move(s){s.el.style.transform='translateX('+s.dx*.45+'px)';s.el.style.opacity=1-Math.min(.6,Math.abs(s.dx)/300)},end(s){const el=s.el;el.style.transition='';el.style.transform='';el.style.opacity='';if(s.moved&&Math.abs(s.dx)>40){const i=ISLS.indexOf(ISLK),n=(i+(s.dx<0?1:-1)+ISLS.length)%ISLS.length;hap();islSet(ISLS[n])}},cancel(s){s.el.style.transition='';s.el.style.transform='';s.el.style.opacity=''}})
  // the arrow and moving air: faint, only ever in the background
  function fxArrow(c){return '<svg class="'+c+'" viewBox="-42 -4 84 124" fill="currentColor" aria-hidden="true"><path d="M-14 2C-10-2 10-2 14 2L17 70H40L0 117-40 70H-17z"/></svg>'}
  function fxAir(){const v=document.createElementNS('http://www.w3.org/2000/svg','svg');v.id='bgair';v.setAttribute('viewBox','0 0 430 932');v.setAttribute('preserveAspectRatio','xMidYMid slice');const sw=(x,y,s,r)=>'<g transform="translate('+x+' '+y+') rotate('+r+') scale('+s+')"><path d="M-120 34C-74 36-42 28 0 4c26-15 58-6 58 20 0 19-24 30-39 17-11-10-4-26 10-24M-96 58c32 2 58-4 86-16"/></g>';v.innerHTML='<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">'+sw(310,120,1.25,-8)+sw(120,380,1.5,10)+sw(350,560,1.1,-14)+sw(100,800,1.35,6)+'</g>';document.body.insertBefore(v,document.body.firstChild)}
  // everything logged, in one list. Anything can be removed, and every removal can be undone for a few seconds
  function glMap(w){return {date:w.date,day:w.day,minutes:w.minutes,raw:w,ex:(w.exercises||[]).map(e=>e.name+', '+(e.sets||[]).length+' sets'),sets:(w.exercises||[]).reduce((a,e)=>a+(e.sets||[]).length,0)}}
  const glId=w=>w.date+'|'+w.day
  const LK={food:{get:()=>FOOD.items||[],set:v=>{FOOD.items=v},id:x=>x.id,rm:'food_remove',add:'food_add',ls:'foodAdd',f:'it'},day:{get:()=>DLOG.events||[],set:v=>{DLOG.events=v},id:x=>x.id,rm:'day_remove',add:'day_add',ls:'dayAdd',f:'e'},study:{get:()=>STUDY.sessions||[],set:v=>{STUDY.sessions=v},id:x=>x.id,rm:'study_remove',add:'study_add',ls:'studyAdd',f:'s'},journal:{get:()=>JR.entries||[],set:v=>{JR.entries=v},id:x=>x.id,rm:'journal_remove',add:'journal_restore'},gym:{get:()=>GLOGD,set:v=>{GLOGD=v},id:glId,rm:'gym_remove',add:'gym_restore'}}
  function ovlDel(){const t=Date.now(),D0=fls('del').filter(x=>t-x.t<9e5);fls('del',D0);for(const k in LK)LK[k].set(LK[k].get().filter(x=>!D0.some(y=>y.k===k&&y.id===LK[k].id(x))))}
  function drawAll(){drawMoney();drawBody();drawFood();drawStudy();drawToday();drawStats();drawJournal();drawGame();drawLog()}
  function logRm(k,id){const L=LK[k],x=L.get().find(y=>L.id(y)===id);if(!x)return;L.set(L.get().filter(y=>L.id(y)!==id));fls('del',fls('del').concat([{t:Date.now(),k,id}]));if(L.ls)fls(L.ls,fls(L.ls).filter(y=>y[L.f].id!==id));act({[L.rm]:[k==='gym'?{date:x.date,day:x.day}:id]},'','Removed');document.getElementById('toast').classList.remove('on');drawAll();logUndo(k,id,x)}
  function logUndo(k,id,x){let u=document.getElementById('undo');if(!u){u=document.createElement('div');u.id='undo';document.body.appendChild(u)}u.innerHTML='<span>Removed</span><b>Undo</b>';u.classList.add('on');clearTimeout(u._t);u._t=setTimeout(()=>u.classList.remove('on'),6000);u.onclick=()=>{u.classList.remove('on');const L=LK[k];fls('del',fls('del').filter(y=>!(y.k===k&&y.id===id)));L.set(L.get().concat([x]));act({[L.add]:[k==='gym'?x.raw:x]},'','Back again');drawAll()}}
  function setData(o){if(o.quests){QST=o.quests;QST.oneoff=QST.oneoff||[];QST.bosses=QST.bosses||[];QST.cfg=QST.cfg||{}}if(o.body)BODY=o.body;if(o.money)MONEY=o.money;if(o.health)HEALTH=o.health;if(o.degree)DEG=o.degree;if(o.food){FOOD=o.food;FOOD.items=FOOD.items||[];const ids=new Set(FOOD.items.map(x=>x.id));FOOD.items=FOOD.items.concat(fls('foodAdd').filter(x=>!ids.has(x.it.id)).map(x=>x.it))}if(o.study){STUDY=o.study;STUDY.sessions=STUDY.sessions||[];const ids=new Set(STUDY.sessions.map(x=>x.id));STUDY.sessions=STUDY.sessions.concat(fls('studyAdd').filter(x=>!ids.has(x.s.id)).map(x=>x.s))}if(o.day){DLOG=o.day;DLOG.events=DLOG.events||[];const ids=new Set(DLOG.events.map(x=>x.id));DLOG.events=DLOG.events.concat(fls('dayAdd').filter(x=>!ids.has(x.e.id)).map(x=>x.e))}if(o.journal)JR=o.journal;if(Array.isArray(o.glog))GLOGD=o.glog.slice(-90).map(glMap);ovlDel();drawAll()}
  let LF='all'
  function logItems(){const c=[];(DLOG.events||[]).forEach(x=>c.push({k:'day',id:x.id,date:x.date,at:x.at,t:x.label,s:x.kind==='move'?(+x.value||0)+' kcal burned':'',col:'#2A78D6'}));(FOOD.items||[]).forEach(x=>c.push({k:'food',id:x.id,date:x.date,at:x.at||'',t:x.name,s:Math.round(+x.kcal||0)+' kcal',col:'#EB6834'}));(MONEY.tx||[]).forEach(x=>c.push({k:'money',id:x.id,date:x.date,at:'',t:x.name,s:mny(x.amount),col:'#58BE7B'}));(BODY.entries||[]).forEach(x=>c.push({k:'body',id:x.id,date:x.date,at:'',t:'Body photo',s:x.kind||'',col:'#D98A1F'}));(STUDY.sessions||[]).forEach(x=>c.push({k:'study',id:x.id,date:x.date,at:x.start||'',t:x.topic,s:x.course+', '+(+x.minutes||0)+' min',col:'#1BAF7A'}));GLOGD.forEach(x=>c.push({k:'gym',id:glId(x),date:x.date,at:'',t:String(x.day||'Gym').replace(/^Day [0-9]+:[ ]*/,''),s:x.sets?x.sets+' sets':'',col:'#D98A1F'}));(JR.entries||[]).forEach(x=>c.push({k:'journal',id:x.id,date:x.date,at:x.at||'',t:'Journal',s:'',col:'#8D62CF'}));return c.sort((a,b)=>(b.date+b.at).localeCompare(a.date+a.at))}
  function drawLog(){const el=document.getElementById('lg');if(!el)return;const L=logItems().filter(x=>(LF==='all'&&x.k!=='money')||x.k===LF).slice(0,200);let h='<div class="m-title">Everything logged</div><div class="f-seg" style="margin-bottom:12px">'+[['all','All'],['food','Food'],['study','Study'],['gym','Gym'],['day','Day'],['money','Money'],['body','Body'],['journal','Journal']].map(x=>'<span class="'+(x[0]===LF?'on':'')+'" onclick="LF=\\x27'+x[0]+'\\x27;drawLog()">'+x[1]+'</span>').join('')+'</div>',last='';if(!L.length)h+='<p class="dim">Nothing here yet.</p>';L.forEach(x=>{if(x.date!==last){if(last)h+='</div>';last=x.date;const d0=new Date(x.date+'T12:00');h+='<h3 class="s-h" style="font-size:16px;margin:14px 2px 7px">'+(x.date===sDay(0)?'Today':x.date===sDay(-1)?'Yesterday':d0.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}))+'</h3><div class="card l-g">'}h+='<div class="l-r" data-t="'+x.k+'" data-id="'+fq(x.id)+'" onclick="logOpen(this.dataset.t,this.dataset.id)"><b>'+H(x.at)+'</b><i style="background:'+x.col+'"></i><span>'+H(x.t)+'</span><small>'+H(x.s)+'</small><em class="r-x" aria-label="Remove" onclick="event.stopPropagation();logRm(this.parentNode.dataset.t,this.parentNode.dataset.id)">&times;</em></div>'});if(last)h+='</div>';el.innerHTML=h+'<p class="dim small" style="margin:12px 2px">Swipe a row left to remove it, or just tell the chat on Home.</p>'}
  function logOpen(k,id){if(k==='food')foodItem(id);else if(k==='study')studySess(id);else if(k==='journal')jrOpen(id);else if(k==='day')dayItem(id);else if(k==='body')bodyOpen(id);else if(k==='money')moneyItem(id);else gymItem(id)}
  function gymItem(id){const x=GLOGD.find(w=>glId(w)===id);if(!x)return;B=[];window.GYMID=id;open_('<div class="f-sh"><h3>'+H(String(x.day||'Gym').replace(/^Day [0-9]+:[ ]*/,''))+'</h3><p class="sub">'+H(x.date)+(x.minutes?', '+x.minutes+' min':'')+'</p>'+x.ex.map(e=>'<div class="j-l">'+H(e)+'</div>').join('')+'<div class="f-sec red" onclick="logRm(\\x27gym\\x27,window.GYMID)">Remove</div></div>')}
  swipe('.d-r[data-t],.l-r',{l:'Remove',left(el){logRm(el.dataset.t,el.dataset.id)}})
  function dayLine(){const d=sDay(0),rows=logItems().filter(x=>x.date===d&&x.k!=='journal'&&x.k!=='money').sort((a,b)=>String(a.at||'99').localeCompare(String(b.at||'99'))),j=(JR.entries||[]).filter(x=>x.date===d).slice(-1)[0]
    return '<div class="card d-tl"><h3>Your day</h3>'+dialHtml()+(rows.length?rows.map(x=>'<div class="d-r" data-t="'+x.k+'" data-id="'+fq(x.id)+'" onclick="logOpen(this.dataset.t,this.dataset.id)"><b>'+H(x.at)+'</b><i style="background:'+x.col+'"></i><span>'+H(x.t)+'</span><small>'+H(x.s)+'</small><em class="r-x" aria-label="Remove" onclick="event.stopPropagation();logRm(this.parentNode.dataset.t,this.parentNode.dataset.id)">&times;</em></div>').join(''):'<p>Tap what you do, or say it above. It all lands here.</p>')+'<div class="f-sec" onclick="tg(\\x27journal\\x27)">'+(j?'Read what Claude saw today':'How was your day?')+'</div></div>'}
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#chat-main .b');if(b){b.classList.toggle('open');COPEN[b.dataset.i]=b.classList.contains('open')}})
  // the chat lives on Home: Say it just puts you in the box, and any answer refreshes what the app shows

  let CHLAST=null
  function sayCheck(){const l=(CHAT.msgs||[]).filter(q=>q.role!=='user').slice(-1)[0],id=l?l.id:'';if(CHLAST===null){CHLAST=id;return}if(id!==CHLAST){CHLAST=id;nav('board://data')}}
  // floors over the last 13 weeks, darker means a fuller day
  function stHeat(){const today=sDay(0),mon=gMon(today),T=['Nothing logged','Floor','Standard day','Full day'];let h='';for(let w=12;w>=0;w--){h+='<div class="h-w">';for(let i=0;i<7;i++){const d=gPlus(mon,i-w*7);if(d>today){h+='<i class="h-c h-e"></i>';continue}const ty=gDay(d).type;h+='<i class="h-c h-'+ty+'" data-tip="'+d.slice(8)+'.'+d.slice(5,7)+': '+T[ty]+'"></i>'}h+='</div>'}return '<div class="card c-card hmc"><div class="c-h"><h3>Your weeks</h3></div><div class="c-tip">Slide across the days</div><div class="hm">'+h+'</div><div class="c-leg"><span><i class="h-1"></i>Floor</span><span><i class="h-2"></i>Standard</span><span><i class="h-3"></i>Full</span></div></div>'}
  const hmAt=s=>{const c=under(s,'.h-c[data-tip]');if(c&&c!==s.cur){hov(s,c);const t=c.closest('.hmc').querySelector('.c-tip');if(t)t.textContent=c.dataset.tip}}
  gs('.hm',{slop:2,start(s){hmAt(s)},move:hmAt})
  // dark is the default, light is one tap away
  function fxTheme(){const n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.setItem('theme',n)}catch(e){}fxSky();const e=document.getElementById('thm');if(e)e.textContent=n==='dark'?'Dark':'Light'}
  // Heads up on Home: reads everything logged and says plainly what has not happened lately. Plain rules, no AI usage, so it is instant. Wrong? "I did it" fixes it. Facts only, never a comparison with other people, never a push to eat less. Off with nudges: false
  const NGRP=[['Legs','legs',['quads','hamstrings','glutes','calves']],['Back','back',['lats','upper_back','lower_back']],['Chest','chest',['chest']],['Shoulders','shoulders',['front_delts','side_delts','rear_delts']],['Arms','arms',['biceps','triceps','forearms']]]
  const NC={study:'#1BAF7A',task:'#E5A52E',gym:'#D98A1F',food:'#EB6834',sleep:'#7C8BD9',people:'#E37FA0',admin:'#6FA9B8',make:'#2FAD98',exam:'#2A78D6',msg:'#8D62CF'}
  function ndDays(f){const ds=f().filter(Boolean).sort(),l=ds[ds.length-1];return l?Math.round((new Date(sDay(0))-new Date(l))/864e5):null}
  function ndWord(n,w){return n===null?'No '+w+' logged yet':n===0?'':n===1?'No '+w+' since yesterday':'No '+w+' in '+n+' days'}
  function nudgesAll(){if(!APP.nudges)return [];const N=[],today=sDay(0),now=new Date(),hr=now.getHours(),S=(STUDY.sessions||[]).filter(x=>x.status!=='dead'),add=(id,p,c,t,s,go,did)=>N.push({id,p,c,t,s,go,did})
    // study overall, then the course left furthest behind
    const sd=ndDays(()=>S.map(x=>x.date));if(sd===null||sd>=2||(sd===1&&hr>=16))add('study',sd===null?85:70+sd*3,NC.study,ndWord(sd,'study session'),sd===null?'Nothing in your log. Already studied? Tell me.':'Start one now, or log what you did.','study','study')
    const cs=CN.map(c=>({c,d:ndDays(()=>S.filter(x=>x.course===c).map(x=>x.date))}));if(sd!==null){const w=cs.filter(x=>x.d===null||x.d>=4).sort((a,b)=>(b.d===null?999:b.d)-(a.d===null?999:a.d))[0];if(w)add('c-'+w.c,64+(w.d===null?12:w.d),NC.study,w.d===null?'No '+w.c+' logged yet':'No '+w.c+' in '+w.d+' days','Pick it up whenever it suits you.','study','study:'+w.c)}
    // tasks past or near their deadline
    SGRP.forEach(g=>g.items.forEach(i=>{if(!i.due||fls('studyDone').includes(i.ref))return;const dd=Math.ceil((new Date(i.due)-now)/864e5);if(dd<=2)add('t-'+i.ref,dd<0?88:82-dd,NC.task,i.label,g.c+', '+(dd<0?(-dd===1?'1 day':-dd+' days')+' past due':dd===0?'due today':dd===1?'due tomorrow':'due in 2 days'),'task:'+i.ref,'task:'+i.ref)}))
    // the muscle group left longest
    const mus=(D.mus||[]).concat([]),gy=NGRP.map(g=>{const M=mus.filter(m=>g[2].includes(m.key)),ds=M.map(m=>m.days);return {g,d:ds.length?Math.min(...ds):null}}).filter(x=>x.d!==null).sort((a,b)=>b.d-a.d)[0];if(gy&&gy.d>=7)add('g-'+gy.g[1],60+Math.min(25,gy.d>=999?20:gy.d),NC.gym,gy.d>=999?'No '+gy.g[1]+' logged yet':'No '+gy.g[1]+' in '+gy.d+' days',(gy.d>=999?'Never in your log. ':'')+'Next session, or tell me you did it.','gym','gym:'+gy.g[0])
    // exams next to how much went into that course
    ;(D.exams||[]).forEach(e=>{const dd=Math.ceil((new Date(e.start)-now)/864e5);if(dd<0||dd>35)return;const c0=sCourse(e.name),c=c0==='Other'?'':c0;const wk=c?S.filter(x=>x.course===c&&x.date>=gPlus(today,-6)).reduce((a,x)=>a+(+x.minutes||0),0):0;add('e-'+e.name,dd<=14?84:66,NC.exam,e.name+' in '+dd+' days',c?(wk?sFmt(wk):'Nothing')+' on '+c+' this week.':'Coming up.','study',null)})
    // today so far
    const F=(FOOD.items||[]).filter(x=>x.date===today),pr=Math.round(F.reduce((a,x)=>a+(+x.protein||0),0)),pg=(FOOD.goal||{}).protein||0;if(hr>=14&&!F.length)add('food',58,NC.food,'No food logged today','Snap it or say it, it takes seconds.','food','food');else if(pg&&hr>=18&&F.length&&pr<pg*.7)add('prot',52,NC.food,pr+' g protein so far','Your target is '+pg+' g.','food','food')
    const wd=ndDays(()=>(DLOG.events||[]).filter(x=>x.kind==='weight').map(x=>x.date));if(wd!==null&&wd>=3)add('weigh',54,NC.gym,'No weigh-in in '+wd+' days','Your real burn needs them. A photo of the scale works.','body',null)
    {const mm=hr*60+now.getMinutes(),open=MEALS.find(x=>x.days.includes(now.getDay())&&mm>=x.a&&mm<x.b);if(open&&!F.some(x=>(x.src==='plan'||x.name===open.name)&&x.at&&gMin(x.at)>=open.a))add('meal-'+open.name,86,NC.food,open.name+' is open until '+mHm(open.b),'Already paid for.',null,'meal')}
    if(hr<13&&!gEv(today,'wake').length)add('wake',50,NC.sleep,'When did you get up?','One tap, it keeps your sleep honest.',null,'wake')
    // people, admin, making: the ones that slip quietly
    const pd=ndDays(()=>(DLOG.events||[]).filter(x=>x.kind==='contact').map(x=>x.date));if(pd===null||pd>=5)add('people',pd===null?48:50+pd,NC.people,pd===null?'No time with people logged yet':'No time with people logged in '+pd+' days','Other than the people you always see. Even one coffee counts.',null,'contact')
    QST.bosses.forEach(b=>{const qs=(b.quests||[]).map(id=>QST.oneoff.find(q=>q.id===id)).filter(Boolean),dn=qs.filter(q=>q.done).length;if(!qs.length||dn===qs.length||b.prep_end<today)return;const dd=Math.round((new Date(b.prep_end)-new Date(today))/864e5);if(dd<=21)add('b-'+b.id,dd<=7?87:62,NC.admin,b.title+' in '+dd+' days',dn+' of '+qs.length+' ready.','game',null)})
    const ad=ndDays(()=>(DLOG.events||[]).filter(x=>x.kind==='moneycheck').map(x=>x.date));if(ad===null||ad>=7)add('admin',ad===null?44:46,NC.admin,ad===null?'Money not checked yet':'Money not checked in '+ad+' days','Add a statement and see where it went.','money','moneycheck')
    const md=ndDays(()=>(DLOG.events||[]).filter(x=>x.kind==='making').map(x=>x.date));if(md===null||md>=10)add('make',md===null?40:42,NC.make,md===null?'Nothing made yet':'Nothing made in '+md+' days','Music, a video, code. Not for points.',null,'making')
    if(TD.msgs)add('msgs',56,NC.msg,TD.msgs+(TD.msgs===1?' message needs':' messages need')+' you','Tap to see them.','msg',null)
    const no=fls('nudgeNo').filter(x=>Date.now()-x.t<864e5);fls('nudgeNo',no);return N.filter(x=>!no.some(y=>y.id===x.id)).sort((a,b)=>b.p-a.p)}
  // a rough day gets one nudge and no more
  function drawNudge(){const el=document.getElementById('nd');if(!el)return;const A=nudgesAll(),max=gEv(sDay(0),'badday').length?1:window.NDALL?A.length:3,L=A.slice(0,max);if(!L.length){el.innerHTML='';return}window.NDL=A
    el.innerHTML='<div class="card nd"><div class="nd-h"><h3>Heads up</h3>'+(A.length>max&&!gEv(sDay(0),'badday').length?'<span onclick="window.NDALL=1;drawNudge()">'+(A.length-max)+' more</span>':'')+'</div>'+L.map(x=>'<div class="nd-r" data-n="'+fq(x.id)+'"><i style="background:'+x.c+'"></i><div class="nd-t"'+(x.go?' onclick="ndGo(this.parentNode.dataset.n)"':'')+'><b>'+H(x.t)+'</b><small>'+H(x.s)+'</small></div>'+(x.did?'<span class="nd-d" onclick="ndDid(this.parentNode.dataset.n)">I did it</span>':'')+'</div>').join('')+'</div>'}
  function ndFind(id){return (window.NDL||[]).find(x=>x.id===id)}
  function ndGo(id){const x=ndFind(id);if(!x||!x.go)return;if(x.go.startsWith('task:')){const r=x.go.slice(5),s0=[];SGRP.forEach(g=>g.items.forEach(i=>{if(i.ref===r)s0.push({topic:i.label,course:g.c,ref:r})}));if(s0[0]){SPICK={topic:s0[0].topic,course:s0[0].course,ref:r,min:sGuess(s0[0].topic),sugMin:sGuess(s0[0].topic),mode:'down',tree:'random',kind:'s',i:0};studySheet()}return}if(x.go==='study'){SPICK=null;tg('study');studySay();return}tg(x.go)}
  function ndNo(id){fls('nudgeNo',fls('nudgeNo').concat([{id,t:Date.now()}]));drawNudge()}
  function ndDid(id){const x=ndFind(id);if(!x||!x.did)return;const v=x.did;if(v.startsWith('task:')){const r=v.slice(5);act({coursework_done:[r]},'','Got it, ticked off');fls('studyDone',fls('studyDone').concat([r]).slice(-60));drawAll();return}if(v==='study'||v.startsWith('study:')){ndStudy(v.split(':')[1]||CN[0]||'Other');return}if(v.startsWith('gym:')){ndGym(v.slice(4));return}if(v==='food'){foodSay();return}if(v==='meal'){mealLog();return}const k=GALL.flatMap(g=>g[1]).concat(DKINDS).find(q=>q[0]===v);dayTap(v,k?k[1]:v)}
  // "I did it": short answers, then it is in the log like anything else
  let NDS={}
  function ndStudy(c){NDS={c,m:60,o:0};ndStudyDraw()}
  function ndStudyDraw(){B=[];const seg=(L,cur,fn)=>'<div class="f-seg s-mid">'+L.map(x=>'<span class="'+(x[0]===cur?'on':'')+'" onclick="'+fn+'(\\x27'+x[0]+'\\x27)">'+x[1]+'</span>').join('')+'</div>';open_('<div class="f-sh" style="text-align:center"><h3>What did you do?</h3><p class="sub">It goes in your log and your forest.</p>'+(CN.length?seg(CALL.map(x=>[x,x]),NDS.c,'ndSc'):'')+seg([[30,'30 min'],[60,'1 h'],[120,'2 h'],[180,'3 h']].map(x=>[String(x[0]),x[1]]),String(NDS.m),'ndSm')+seg([['0','Today'],['1','Yesterday'],['2','2 days ago']],String(NDS.o),'ndSo')+'<input class="f-in" id="ndt" style="margin-top:10px" placeholder="What was it? Optional" value="'+fq(NDS.t||'')+'"><div class="f-cta" onclick="ndStudySave()">Log it</div></div>')}
  function ndKeep(){const v=fv('ndt');if(v!==undefined)NDS.t=v}
  function ndSc(v){ndKeep();NDS.c=v;ndStudyDraw()}
  function ndSm(v){ndKeep();NDS.m=+v;ndStudyDraw()}
  function ndSo(v){ndKeep();NDS.o=+v;ndStudyDraw()}
  function ndStudySave(){const ks=Object.keys(STREES),s={src:'said',id:Date.now().toString(36)+'s',date:sDay(-NDS.o),start:'',end:'',minutes:NDS.m,planned:0,away:0,mode:'said',ref:'',course:NDS.c,topic:fv('ndt')||(NDS.c==='Other'?'Studied':'Studied '+NDS.c),tree:ks[Math.floor(Math.random()*ks.length)],status:'grown'};STUDY.sessions=(STUDY.sessions||[]).concat([s]);fls('studyAdd',fls('studyAdd').concat([{t:Date.now(),s}]));act({study_add:[s]},'','Logged. '+sFmt(NDS.m)+sOf(NDS.c));drawAll()}
  function ndGym(name){B=[];window.NDG=name;open_('<div class="f-sh" style="text-align:center"><h3>When did you train '+H(name.toLowerCase())+'?</h3><p class="sub">Exercises can come later, just tell the chat.</p><div class="f-seg s-mid">'+[['0','Today'],['1','Yesterday'],['2','2 days ago'],['3','3 days ago']].map(x=>'<span onclick="ndGymSave('+x[0]+')">'+x[1]+'</span>').join('')+'</div></div>')}
  function ndGymSave(o){const name=window.NDG,g=NGRP.find(x=>x[0]===name);if(!g)return;const date=sDay(-o),e={id:Date.now().toString(36)+'d',date,at:o?'':fhm(),kind:'train',label:'Trained '+name.toLowerCase(),src:'said'};DLOG.events=(DLOG.events||[]).concat([e]);fls('dayAdd',fls('dayAdd').concat([{t:Date.now(),e}]));(D.mus||[]).forEach(m=>{if(g[2].includes(m.key)){m.last=date;m.days=o}});fls('musDid',fls('musDid').concat([{t:Date.now(),keys:g[2],date,o}]));act({day_add:[e],muscles:[{muscle:g[1],date,sets:0,detail:'trained '+g[1]}]},'','Logged '+name.toLowerCase());drawAll()}
  ;(()=>{const t=Date.now(),L=fls('musDid').filter(x=>t-x.t<9e5);fls('musDid',L);L.forEach(x=>(D.mus||[]).forEach(m=>{if(x.keys.includes(m.key)&&m.days>x.o){m.days=x.o;m.last=x.date}}))})()
  swipe('.nd-r',{r:'I did it',l:'Not now',right(el){const x=ndFind(el.dataset.n);if(x&&x.did)ndDid(x.id);else ndNo(el.dataset.n)},left(el){ndNo(el.dataset.n)}})
  // the four element marks, drawn here, very small, next to the areas
  const ELM={STUDY:['#7FB2D6','<path d="M12 12c0-2 3-2 3 0s-2 4-5 4-5-3-5-6 3-6 7-6 7 3 7 7" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>'],MAKING:['#E0613F','<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 2 3-4z" fill="currentColor"/>'],BODY:['#7FAE62','<path d="M4 19 8 7h8l4 12zM9.500 12h5" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linejoin="round" stroke-linecap="round"/>'],ADMIN:['#7FAE62','<path d="M4 19 8 7h8l4 12zM9.500 12h5" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linejoin="round" stroke-linecap="round"/>'],SLEEP:['#5A9BD8','<path d="M3 9c3-3 6-3 9 0s6 3 9 0M3 15c3-3 6-3 9 0s6 3 9 0" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>'],PEOPLE:['#5A9BD8','<path d="M3 9c3-3 6-3 9 0s6 3 9 0M3 15c3-3 6-3 9 0s6 3 9 0" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>']}
  function gEl(k){const e=ELM[k];return e?'<svg class="g-el" viewBox="0 0 24 24" style="color:'+e[0]+'">'+e[1]+'</svg>':''}
  // weekly review: your own process numbers only, never grades or weight, and nobody else's
  function cmpWeek(){const D7=[];for(let o=-6;o<=0;o++)D7.push(sDay(o));const Z=D7.map(gDay),S=(STUDY.sessions||[]).filter(x=>D7.includes(x.date)&&x.status!=='dead'&&(+x.minutes||0)>=20),focus=S.reduce((a,x)=>a+(+x.minutes||0),0)/60,pd=D7.map(d=>(FOOD.items||[]).filter(x=>x.date===d)).filter(L=>L.length).map(L=>L.reduce((a,x)=>a+(+x.protein||0),0)),wt=(DLOG.events||[]).filter(x=>x.kind==='weight').slice(-1)[0],kg=wt?+wt.value:75,ds=Z.map(z=>z.f.dur).filter(v=>v!=null),ws=Z.map(z=>z.f.w).filter(v=>v!=null),floors=Z.filter(z=>z.floor).length
    return {focus,sessions:S.length,train:Z.filter(z=>z.f.tr).length,prot:pd.length?pd.reduce((a,b)=>a+b,0)/pd.length/kg:null,sleep:ds.length?ds.reduce((a,b)=>a+b,0)/ds.length:null,spread:ws.length>=3?Math.max(...ws)-Math.min(...ws):null,floors,kg}}
  function gReview(){B=[];const w=cmpWeek(),gw=gWeek(gMon(sDay(0)))
    open_('<div class="f-sh"><h3>Weekly review</h3><p class="sub">Last 7 days</p><div class="f-tiles"><div><small>Floors</small><b>'+w.floors+' / 7</b></div><div><small>Studied</small><b>'+w.focus.toFixed(1)+' h</b></div><div><small>Trained</small><b>'+w.train+'</b></div></div><div class="f-lab">THIS WEEK BY AREA</div>'+GAREAS.map(a=>{const v=gw.tot[a[0]]||0;return '<div class="g-a">'+gEl(a[0])+'<span>'+a[1]+'</span><i><em style="width:'+Math.min(100,v/(a[2]*5)*100)+'%"></em></i><b>'+Math.round(v)+'</b></div>'}).join('')+'<div class="f-lab">HOW IS TODAY? NEVER SCORED</div><div class="f-seg">'+[[1,'Low'],[2,'Meh'],[3,'OK'],[4,'Good'],[5,'High']].map(x=>'<span class="'+((gEv(sDay(0),'mood').slice(-1)[0]||{}).value==x[0]?'on':'')+'" onclick="dayTap(\\x27mood\\x27,\\x27Mood: '+x[1]+'\\x27,'+x[0]+');gReview()">'+x[1]+'</span>').join('')+'</div></div>')}
  function sayOpen(){tg('cls');const t=document.getElementById('ta-main');if(!t)return;document.querySelector('.pg[data-p=cls]').scrollTo({top:0,behavior:'smooth'});t.focus()}
  // a running session: rename it, or scrap it and log nothing
  function studyEdit(){const r=sNow();if(!r)return;B=[];open_('<div class="f-sh"><h3>This session</h3><div class="f-lab">NAME</div><input class="f-in" id="sdname" value="'+fq(r.topic)+'">'+(CN.length?'<div class="f-lab">COURSE</div>'+sSeg(r.course,'studyEditC'):'')+'<div class="f-cta" onclick="studyEditSave()">Save</div><div class="f-sec red" onclick="studyScrap()">Scrap it, log nothing</div></div>')}
  function studyEditC(c){const r=sNow();if(!r)return;r.topic=fv('sdname')||r.topic;r.course=c;r.ai=0;sSet(r);studyEdit()}
  function studyEditSave(){const r=sNow();if(!r)return;r.topic=fv('sdname')||r.topic;r.ai=0;sSet(r);shx();drawStudy();drawToday()}
  function studyScrap(){const r=sNow();if(!r)return;sSet(null);shx();const n=sNoteIds(r);if(n)nav('board://notifyoff?id='+n);drawStudy();drawToday();toast('Scrapped, nothing logged')}
  // Body: weight, your real burn, and progress photos
  let BODY=${J(m.body || { entries: [] })},BTH={},BSEL=[]
  LK.body={get:()=>BODY.entries||[],set:v=>{BODY.entries=v},id:x=>x.id,rm:'body_remove',add:'body_restore'}
  const bW=()=>(DLOG.events||[]).filter(x=>x.kind==='weight'&&+x.value).sort((a,b)=>(a.date+a.at).localeCompare(b.date+b.at))
  function bTrend(){const W=bW();if(!W.length)return null;const avg=(from,to)=>{const L=W.filter(x=>x.date>from&&x.date<=to);return L.length?L.reduce((a,x)=>a+ +x.value,0)/L.length:null},t=sDay(0),now=avg(gPlus(t,-7),t),prev=avg(gPlus(t,-21),gPlus(t,-14)),last=+W[W.length-1].value;let burn=null,rate=null;if(now!=null&&prev!=null){rate=(now-prev)/2;const D=[];for(let o=-20;o<=0;o++)D.push(sDay(o));const day=D.map(d=>(FOOD.items||[]).filter(x=>x.date===d).reduce((a,x)=>a+(+x.kcal||0),0)).filter(v=>v>=800);if(day.length>=10)burn=Math.round(day.reduce((a,b)=>a+b,0)/day.length-rate*7700/7)}return {last,now:now==null?last:now,rate,burn,n:W.length}}
  function bodySpark(){const W=bW().slice(-60);if(W.length<2)return '<p class="dim small">Your line starts after two weigh-ins.</p>';const v=W.map(x=>+x.value),lo=Math.min(...v)-.4,hi=Math.max(...v)+.4,X=i=>8+i/(W.length-1)*304,Y=y=>84-(y-lo)/(hi-lo)*76,pts=W.map((x,i)=>X(i).toFixed(1)+','+Y(+x.value).toFixed(1)).join(' ');return '<svg viewBox="0 0 320 92" class="b-sp"><polyline points="'+pts+'" fill="none" stroke="var(--arrow)" stroke-width="2.500" stroke-linejoin="round" stroke-linecap="round"/><circle cx="'+X(W.length-1)+'" cy="'+Y(v[v.length-1])+'" r="4.500" fill="var(--green)"/></svg>'}
  // the weight a body fat goal means for you, from the lean mass in your last read. Only a rough guess, because the body fat read is one
  function bGoal(){const hi=(+APP.body.goal_bf||0)/100,E=(BODY.entries||[]).filter(x=>x.bf&&x.kg).slice(-1)[0];if(!hi||!E)return {};const m=String(E.bf).match(/([0-9]+)[^0-9]+([0-9]+)/);if(!m)return {};const bf=(+m[1]+ +m[2])/200;return {kg:Math.round(E.kg*(1-bf)/(1-hi))}}
  function drawBody(){const el=document.getElementById('bd');if(!el)return;const T=bTrend(),g=bGoal().kg||APP.body.goal_kg||0,gl=FOOD.goal||{},E=(BODY.entries||[]).slice().reverse(),left=T&&g?T.now-g:0,wk=T&&g&&left>0&&T.rate<-.05?Math.ceil(left/-T.rate):null
    el.innerHTML='<div class="m-title">Body</div><div class="card c-card"><div class="c-h"><h3>Weight</h3><b>'+(T?T.last.toFixed(1)+' kg':'Not logged')+'</b></div><div class="c-tip">'+(T?[APP.body.goal_bf?'Goal '+(APP.body.goal_bf_low?APP.body.goal_bf_low+' to ':'')+APP.body.goal_bf+'% body fat'+(bGoal().kg?', about '+bGoal().kg+' kg from your last read':''):g?'Goal '+g+' kg':'',T.rate!=null?(T.rate>0?'+':'')+T.rate.toFixed(2)+' kg a week'+(wk?', about '+wk+' weeks':''):''].filter(Boolean).join(', ')||'Your trend appears after a few weigh-ins':'Log your first weigh-in')+'</div>'+bodySpark()+'<div class="f-g" style="margin-top:8px"><input class="f-in" id="gw" inputmode="decimal" placeholder="kg" value="'+fq(T?T.last:'')+'"><div class="f-sec" style="margin:0;padding:14px" onclick="gWeigh()">Log weight</div></div></div>'
      +'<div class="card c-card"><h3 class="g-h">Your targets</h3><div class="f-tiles"><div><small>Calories</small><b>'+(gl.kcal||'-')+'</b></div><div><small>Protein</small><b>'+(gl.protein?gl.protein+' g':'-')+'</b></div><div><small>Burn</small><b>'+(T&&T.burn?T.burn:'-')+'</b></div></div><p class="dim small" style="margin:9px 0 0">'+(T&&T.burn?'Your real burn, from your weigh-ins and food: about what keeps your weight steady. Tell the chat to change your targets.':'Your real burn appears after about 3 weeks of weigh-ins and food. Tell the chat to change these any time.')+'</p></div>'
      +bLifts()+'<div class="card c-card"><h3 class="g-h">Photos</h3><div class="b-add">'+[['pre','Pre workout'],['post','Post workout'],['check','Check-in']].map(k=>'<label class="f-sec">'+k[1]+'<input type="file" accept="image/*" style="display:none" onchange="bodyPic(this,\\x27'+k[0]+'\\x27)"></label>').join('')+'<label class="f-sec">Scale<input type="file" accept="image/*" style="display:none" onchange="bodyScale(this)"></label></div><p class="dim small" style="margin:8px 0 0">Claude reads each one. For a fair comparison use the same spot, light and pose. Photos stay on this phone, but the copy sent for reading stays in your private repo history.</p>'+bodyCompare(E)+'</div>'
      +(fls('bodyWait').length?'<div class="f-ai wait"><div class="f-spin"></div><div><b>Claude is looking</b><small>Usually about a minute</small></div></div>':'')+E.slice(0,30).map(x=>'<div class="b-e" data-id="'+fq(x.id)+'" onclick="bodyOpen(this.dataset.id)">'+(BTH[x.id]?'<img src="'+fq(BTH[x.id])+'">':'<div class="b-ph"></div>')+'<div><small>'+H(x.date)+', '+H({pre:'pre workout',post:'post workout',check:'check-in'}[x.kind]||'')+'</small><b>'+H(x.summary||'')+'</b></div></div>').join('')}
  // two photos on top of each other: slide across to see the change
  function bodyCompare(E){const P=E.filter(x=>BTH[x.id]);if(P.length<2)return '';const a=P[P.length-1],b=P[0];return '<div class="f-lab">THEN AND NOW, SLIDE ACROSS</div><div class="b-cmp" id="bcmp"><img src="'+fq(BTH[b.id])+'"><div class="b-top" id="bctop"><img src="'+fq(BTH[a.id])+'"></div><i id="bcbar"></i><small class="l">'+H(a.date)+'</small><small class="r">'+H(b.date)+'</small></div>'}
  gs('#bcmp',{slop:1,start(s){s.r=s.el.getBoundingClientRect();bcAt(s)},move:s=>bcAt(s)})
  function bcAt(s){const p=Math.max(0,Math.min(1,(s.x-s.r.left)/s.r.width))*100,t=document.getElementById('bctop'),b=document.getElementById('bcbar');t.style.clipPath='inset(0 '+(100-p)+'% 0 0)';b.style.left=p+'%'}
  function bodyPic(inp,kind){const f=inp.files&&inp.files[0];inp.value='';if(!f)return;const u=URL.createObjectURL(f),img=new Image();img.onload=()=>{const out=(mx,qq)=>{const m=Math.min(1,mx/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=img.naturalWidth*m;c.height=img.naturalHeight*m;c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',qq)},id=Date.now().toString(36)+'b',P=(BODY.entries||[]).filter(x=>BTH[x.id]).slice(-1)[0];window.BPH=out(1100,.74).split(',')[1];const th=out(420,.7);window.BTHS=th;window.BPV=P?BTH[P.id].split(',')[1]:'';BTH[id]=th;URL.revokeObjectURL(u);fls('bodyWait',fls('bodyWait').concat([{id,t:Date.now()}]));const T=bTrend();nav('board://bodyai?id='+id+'&kind='+kind+'&date='+sDay(0)+'&kg='+(T?T.last:'')+'&rate='+(T&&T.rate!=null?T.rate.toFixed(2):'')+'&burn='+(T&&T.burn?T.burn:''));drawBody()};img.onerror=()=>{URL.revokeObjectURL(u);toast('Could not open that photo')};img.src=u}
  function bodyDone(o){fls('bodyWait',fls('bodyWait').filter(x=>x.id!==o.id));BODY.entries=(BODY.entries||[]).filter(x=>x.id!==o.id).concat([o]);drawBody();bodyOpen(o.id);setTimeout(()=>{nav('board://data')},400)}
  function bodyFail(id,why){fls('bodyWait',fls('bodyWait').filter(x=>x.id!==id));toast(why);drawBody()}
  function bodyThumbs(o){BTH=Object.assign({},o,BTH);drawBody()}
  function bodyOpen(id){const x=(BODY.entries||[]).find(e=>e.id===id);if(!x)return;B=[];const li=(t,a)=>(a||[]).length?'<div class="f-lab">'+t+'</div>'+a.map(y=>'<div class="j-l">'+H(y)+'</div>').join(''):'';open_('<div class="f-sh">'+(BTH[id]?'<img class="f-pic" src="'+fq(BTH[id])+'">':'')+'<h3 style="margin-top:10px">'+H({pre:'Pre workout',post:'Post workout',check:'Check-in'}[x.kind]||'Photo')+'</h3><p class="sub">'+H(x.date)+(x.kg?', '+x.kg+' kg':'')+(x.bf?', body fat roughly '+H(x.bf)+', a visual guess':'')+'</p><p class="sub" style="color:var(--ink);font-size:15.5px">'+H(x.summary||'')+'</p>'+li('LOOKING GOOD',x.strong)+li('BRING UP NEXT',x.lagging)+(x.focus?'<div class="f-lab">NEXT STEP</div><div class="j-l">'+H(x.focus)+'</div>':'')+(x.changed?'<div class="f-lab">CHANGED YOUR TARGET</div><div class="j-l">'+H(x.changed)+'</div>':'')+'<div class="f-sec red" onclick="logRm(\\x27body\\x27,\\x27'+fq(id)+'\\x27)">Remove</div></div>')}
  // patterns across everything logged. They show what goes together, not what causes what
  function stPat(){const D=[];for(let o=-59;o<=0;o++)D.push(sDay(o));const R=D.map(d=>{const z=gDay(d),mins=(STUDY.sessions||[]).filter(x=>x.date===d&&x.status!=='dead').reduce((a,x)=>a+(+x.minutes||0),0);return {d,mins,dur:z.f.dur,w:z.f.w,tr:z.f.tr,log:(DLOG.events||[]).some(x=>x.date===d)||mins>0}}).filter(x=>x.log),cmp=(ok,a,b)=>{const A=R.filter(x=>ok(x)===true),B0=R.filter(x=>ok(x)===false);if(A.length<4||B0.length<4)return '';const m=L=>L.reduce((s,x)=>s+x.mins,0)/L.length/60,p=m(A),q0=m(B0);return Math.abs(p-q0)<.2?'':'<div class="j-l">'+a+' you study '+p.toFixed(1)+' h, '+b+' '+q0.toFixed(1)+' h.</div>'},S=(STUDY.sessions||[]).filter(x=>x.start&&+x.minutes>=20);let L=cmp(x=>x.dur==null?null:x.dur>=7,'After 7+ h of sleep','after less')+cmp(x=>x.tr,'On gym days','on other days')+cmp(x=>x.w==null?null:x.w<540,'When you are up before 9','when later');if(S.length>=8){const by={};S.forEach(x=>{const h=+String(x.start).split(':')[0],k=h<12?'morning':h<17?'afternoon':'evening';by[k]=(by[k]||0)+(+x.minutes||0)});const top=Object.keys(by).sort((a,b)=>by[b]-by[a])[0];L+='<div class="j-l">Most of your studying happens in the '+top+'.</div>'}const pl={};(STUDY.sessions||[]).forEach(x=>{const p=x.meta&&x.meta.loc&&x.meta.loc.place;if(p)pl[p]=(pl[p]||0)+(+x.minutes||0)});const pk=Object.keys(pl).sort((a,b)=>pl[b]-pl[a])[0];if(pk&&pl[pk]>=120)L+='<div class="j-l">You study most at '+H(pk)+', '+sFmt(pl[pk])+' so far.</div>';return '<div class="card c-card"><h3 class="g-h">Patterns</h3>'+(L||'<p class="dim small" style="margin:0">These show up after about two weeks of logging.</p>')+'</div>'}
  // anything in the chat: photos are sent small, videos as a few frames, PDFs as they are
  const ATT={'':[],gym:[]},ATTMAX=10*1048576
  const attId=ch=>'att-'+(ch||'main')
  function attDraw(ch){const el=document.getElementById(attId(ch));if(!el)return;const L=ATT[ch||'']||[];el.innerHTML=L.map((a,i)=>'<span class="att-c">'+(a.th?'<img src="'+fq(a.th)+'">':'<b>'+(a.code?'EAN':'PDF')+'</b>')+'<small>'+H(a.label)+'</small><i onclick="attRm(\\x27'+(ch||'')+'\\x27,'+i+')">&times;</i></span>').join('')+(L.some(a=>a.ext==='pdf')?'<p class="dim small" style="margin:4px 0 0;width:100%">This goes to your private GitHub and Claude.</p>':'');const ta=document.getElementById('ta-'+K(ch));if(ta){if(!ta.dataset.ph)ta.dataset.ph=ta.placeholder;ta.placeholder=L.some(a=>a.code)?'How much of each? Leave it empty and Claude estimates':ta.dataset.ph}}
  function attRm(ch,i){ATT[ch].splice(i,1);attDraw(ch)}
  function attImg(src,mx,qq){return new Promise((ok,no)=>{const img=new Image();img.onload=()=>{const m=Math.min(1,mx/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=img.naturalWidth*m;c.height=img.naturalHeight*m;c.getContext('2d').drawImage(img,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',qq))};img.onerror=no;img.src=src})}
  function attFrames(u){return new Promise((ok,no)=>{const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=u;const out=[];let times=[];const grab=()=>{const m=Math.min(1,960/Math.max(v.videoWidth,v.videoHeight)),c=document.createElement('canvas');c.width=v.videoWidth*m;c.height=v.videoHeight*m;c.getContext('2d').drawImage(v,0,0,c.width,c.height);out.push(c.toDataURL('image/jpeg',.7));if(times.length)v.currentTime=times.shift();else ok(out)};v.onseeked=grab;v.onerror=no;v.onloadedmetadata=()=>{const d=v.duration||1,n=Math.max(2,Math.min(6,Math.ceil(d/8)+1));for(let i=0;i<n;i++)times.push(d*(i+.5)/n);v.currentTime=times.shift()};v.load();setTimeout(()=>no(new Error('timeout')),30000)})}
  async function attAdd(ch,files){for(const f of files){const L=ATT[ch],t=f.type||'',nm=f.name||'file';try{if(t.startsWith('image/')){const u=URL.createObjectURL(f),d=await attImg(u,2000,.8),a={name:nm,ext:'jpg',label:'Reading',busy:1,th:d,b64:d.split(',')[1]};L.push(a);attDraw(ch);BCQ=BCQ.then(()=>bcPhoto(ch,a,u))}else if(t.startsWith('video/')){const u=URL.createObjectURL(f),F=await attFrames(u);URL.revokeObjectURL(u);F.forEach((d,i)=>L.push({name:nm+' frame '+(i+1),ext:'jpg',label:'Video '+(i+1)+'/'+F.length,th:d,b64:d.split(',')[1]}))}else if(t==='application/pdf'||/[.]pdf$/i.test(nm)){if(f.size>ATTMAX){toast('That PDF is over 10 MB');continue}const b=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f)});L.push({name:nm,ext:'pdf',label:nm.slice(0,16),b64:b})}else toast('Photos, videos and PDFs only')}catch(e){toast('Could not open '+nm)}}attDraw(ch)}
  // barcodes for the chat: several in one photo, several photos, or the live camera. The photo stays home once its codes are read
  let BCQ=Promise.resolve()
  function bcLib(){return window.ZXing?Promise.resolve(true):new Promise(ok=>{window.LIBW=ok;nav('board://foodlib');setTimeout(()=>{if(window.LIBW===ok){window.LIBW=null;ok(false)}},15e3)})}
  // find a code, paint over it, look again; small codes get a second pass in smaller pieces
  async function bcSweep(rd,c,out){const x=c.getContext('2d');for(let k=0;k<12;k++){let r=null;try{r=rd.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c))))}catch(e){}finally{try{rd.reset()}catch(e){}}await new Promise(z=>setTimeout(z));if(!r)return;if(foodValid(r.getText()))out.add(r.getText());const P=r.getResultPoints()||[];if(!P.length)return;const X=P.map(p=>p.getX()),Y=P.map(p=>p.getY()),x0=Math.min(...X),x1=Math.max(...X),y0=Math.min(...Y),y1=Math.max(...Y),wide=x1-x0>=y1-y0,w=Math.max(x1-x0,y1-y0,40),hx=wide?w*.55:w*.5,hy=wide?w*.5:w*.55;x.fillStyle='#fff';x.fillRect((x0+x1)/2-hx,(y0+y1)/2-hy,hx*2,hy*2)}}
  async function bcIn(u){if(!await bcLib())return [];const img=await imgLoad(u);const W=img.naturalWidth,Hh=img.naturalHeight,rd=new ZXing.MultiFormatReader(),out=new Set(),c=document.createElement('canvas');rd.setHints(foodHints(true))
    const part=(sx,sy,sw,sh)=>{const m=Math.min(1,1600/Math.max(sw,sh));c.width=sw*m;c.height=sh*m;c.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);return c}
    await bcSweep(rd,part(0,0,W,Hh),out)
    for(const q of [[0,0],[.5,0],[0,.5],[.5,.5],[.25,.25]])await bcSweep(rd,part(q[0]*W,q[1]*Hh,W/2,Hh/2),out)
    return [...out]}
  async function bcPhoto(ch,a,u){let C=[];try{C=await bcIn(u)}catch(e){}URL.revokeObjectURL(u);a.busy=0;a.label='Photo';const L=ATT[ch];if(C.length&&L.includes(a)){L.splice(L.indexOf(a),1);bcAdd(ch,C);toast(C.length+' barcode'+(C.length>1?'s':'')+' found')}else attDraw(ch)}
  function bcAdd(ch,codes){const L=ATT[ch],N=codes.filter(c=>!L.some(a=>a.code===c));if(!N.length){attDraw(ch);return}N.forEach(c=>{const a={code:c,ext:'code',label:'Looking up',busy:1};L.push(a);setTimeout(()=>{if(a.busy){a.busy=0;a.label=c;attDraw(ch)}},2e4)});attDraw(ch);nav('board://bclook?ch='+encodeURIComponent(ch)+'&c='+N.join(','))}
  function bcFound(ch,list){(list||[]).forEach(r=>{const a=(ATT[ch]||[]).find(x=>x.code===r.c);if(!a)return;const old=(FOOD.items||[]).slice().reverse().find(x=>x.code===r.c);a.busy=0;a.p=r.p;a.name=r.p?r.p.name:r.nm||(old?old.name:'');a.label=a.name||r.c;a.th=r.p&&r.p.img||''});attDraw(ch)}
  function bcScan(ch){window.BCCH=ch;window.BCL='';foodScan();const e=document.querySelector('#scan .sc-x');if(e)e.textContent='Done';const t=document.querySelector('#scan .sc-bs span');if(t)t.style.display='none'}
  function attPick(inp,ch){const F=[...(inp.files||[])];inp.value='';if(F.length)attAdd(ch||'',F)}
  function bodyScale(inp){const F=[...(inp.files||[])];inp.value='';if(!F.length)return;attAdd('',F).then(()=>{const t=document.getElementById('ta-main');t.value='This is my scale. Log my weight.';send('');tg('cls')})}
  // a tap can take one short answer: who, where, what got in the way. It is always optional
  const ASK={badday:['What got in the way?',['Scrolling','Tired','Worry','Lonely','No reason']],contact:['Who was it?',[]],application:['Where did you apply?',[]],making:['What did you make?',['Music','A video','Code']],shipped:['What did you ship?',[]],read:['What did you read?',[]]}
  function dayAsk(e){const a=ASK[e.kind];if(!a)return;const rec=[...new Set((DLOG.events||[]).filter(x=>x.kind===e.kind&&x.label.includes(': ')).map(x=>x.label.split(': ').slice(1).join(': ')))].slice(-6),opts=[...new Set(a[1].concat(rec))];B=[];window.ASKE=e;open_('<div class="f-sh"><h3>'+H(a[0])+'</h3><p class="sub">Optional. It helps later, and it is never scored.</p>'+(opts.length?'<div class="f-seg g-wrap">'+opts.map(o=>'<span data-v="'+fq(o)+'" onclick="dayEdit(this.dataset.v)">'+H(o)+'</span>').join('')+'</div>':'')+'<input class="f-in" id="askv" style="margin-top:10px" placeholder="Or type it"><div class="f-cta" onclick="dayEdit(fv(\\x27askv\\x27))">Save</div><div class="f-sec" onclick="shx()">Skip</div></div>')}
  function dayEdit(v){const e=window.ASKE;if(!e||!v){shx();return}e.label=e.label.split(': ')[0]+': '+v;const o=fls('dayAdd').map(x=>{if(x.e.id===e.id)x.e.label=e.label;return x});fls('dayAdd',o);act({day_edit:[{id:e.id,label:e.label}]},'','Saved');drawAll()}
  // a meal you already paid for (meals in app-config.json): the one open now, else the first
  function mealLog(){const n=new Date(),mm=n.getHours()*60+n.getMinutes(),x=MEALS.find(y=>y.days.includes(n.getDay())&&mm>=y.a&&mm<y.b)||MEALS[0];if(!x)return;FMEAL='';if(!x.kcal){foodAddSheet('',x.name);return}foodPut({src:'plan',name:x.name,kcal:x.kcal,protein:x.protein,carbs:x.carbs,fat:x.fat,grams:0});drawToday()}
  // Money: everything you spend, from your statements, photos and the chat
  let MONEY=${J(m.money || { tx: [], runs: [] })},MMON=0
  LK.money={get:()=>MONEY.tx||[],set:v=>{MONEY.tx=v},id:x=>x.id,rm:'money_remove',add:'money_add'}
  const NOSPEND=['Income','Transfers']
  function mnMonth(off){const d=new Date(),x=new Date(d.getFullYear(),d.getMonth()+off,1);return loc(x).slice(0,7)}
  function mnStats(){const T=MONEY.tx||[],ym=mnMonth(MMON),R=T.filter(x=>String(x.date).startsWith(ym)),sp=R.filter(x=>x.amount<0&&!NOSPEND.includes(x.cat)),tot=-sp.reduce((a,x)=>a+x.amount,0),inc=R.filter(x=>x.amount>0&&x.cat==='Income').reduce((a,x)=>a+x.amount,0),cats={},shops={};sp.forEach(x=>{cats[x.cat||'Other']=(cats[x.cat||'Other']||0)-x.amount;shops[x.name]=(shops[x.name]||0)-x.amount});const last=T.filter(x=>x.amount<0&&!NOSPEND.includes(x.cat)).map(x=>x.date).sort(),from=last.length?last[Math.max(0,last.length-1)]:null;const t=sDay(0),d30=T.filter(x=>x.amount<0&&!NOSPEND.includes(x.cat)&&x.date>gPlus(t,-30)).reduce((a,x)=>a-x.amount,0);return {ym,tot,inc,cats,shops,wk:d30/30*7,R}}
  function drawMoney(){const el=document.getElementById('mn');if(!el)return;const S=mnStats(),bal=MONEY.bal,top=Object.entries(S.cats).sort((a,b)=>b[1]-a[1]),mx=top.length?top[0][1]:1,sh=Object.entries(S.shops).sort((a,b)=>b[1]-a[1]).slice(0,5),wait=fls('mnWait').filter(x=>Date.now()-x.t<6e5),run=bal!=null&&S.wk>0?Math.floor(bal/S.wk):null,lb=new Date(S.ym+'-15T12:00').toLocaleDateString('en-GB',{month:'long'})
    el.innerHTML='<div class="m-title">Money</div><div class="t-grid" style="margin-bottom:14px"><div class="t-tile"><b>'+(bal!=null?mny(bal):'-')+'</b><span>'+(MONEY.balDate?'balance, '+H(MONEY.balDate):'balance')+'</span></div><div class="t-tile"><b>'+(run!=null?run+' wk':'-')+'</b><span>at your last 30 days</span></div></div>'
      +'<div class="card c-card"><h3 class="g-h">Add a statement</h3><div class="b-add"><label class="f-sec">Bank CSV<input type="file" accept=".csv,text/csv,text/comma-separated-values" style="display:none" onchange="mnFile(this)"></label><label class="f-sec">PDF<input type="file" accept="application/pdf,.pdf" style="display:none" onchange="mnFile(this)"></label></div><p class="dim small" style="margin:8px 0 0">Use the CSV if you can: your phone reads it and only sends dates, shops and amounts. A PDF goes whole to your private GitHub and Claude, and stays in its history. The export from your bank needs a date, a description and an amount column. Receipts: send a photo in the chat.</p></div>'
      +(wait.length?'<div class="f-ai wait"><div class="f-spin"></div><div><b>Sorting your spending</b><small>Usually about a minute</small></div></div>':'')
      +'<div class="card c-card"><div class="c-h"><h3>'+H(lb)+'</h3><b>'+mny(S.tot)+'</b></div><div class="c-tip">spent'+(S.inc?', '+mny(S.inc)+' came in':'')+'</div><div class="f-seg" style="margin-bottom:8px">'+[[0,'This month'],[-1,'Last month'],[-2,'Before']].map(x=>'<span class="'+(x[0]===MMON?'on':'')+'" onclick="MMON='+x[0]+';drawMoney()">'+x[1]+'</span>').join('')+'</div>'+(top.length?top.map(c=>'<div class="g-a"><span class="g-w">'+H(c[0])+'</span><i><em style="width:'+Math.round(c[1]/mx*100)+'%"></em></i><b class="mn-b">'+mny(c[1])+'</b></div>').join(''):'<p class="dim small" style="margin:0">Nothing here yet. Add a statement, or tell the chat what you spent.</p>')+'</div>'
      +(sh.length?'<div class="card c-card"><h3 class="g-h">Where it went</h3>'+sh.map(x=>'<div class="f-rec"><b style="font-weight:600">'+H(x[0])+'</b><span>'+mny(x[1])+'</span></div>').join('')+'</div>':'')
      +(S.R.length?'<div class="card l-g" style="padding-top:6px"><h3 class="g-h" style="margin:8px 0 2px">Everything, '+H(lb)+'</h3>'+S.R.slice().sort((a,b)=>String(b.date).localeCompare(a.date)).slice(0,60).map(x=>'<div class="l-r" data-t="money" data-id="'+fq(x.id)+'"><b>'+H(String(x.date).slice(8))+'.</b><span>'+H(x.name)+'</span><small>'+mny(x.amount)+'</small><em class="r-x" onclick="event.stopPropagation();logRm(\\x27money\\x27,this.parentNode.dataset.id)">&times;</em></div>').join('')+'</div>':'')}
  // numbers and dates as banks write them: 1,234.56 or 1.234,56, and 2027-03-01, 01.03.2027 or 01/03/2027 (month first only with a US locale)
  function mnNum(s){let t=String(s==null?'':s).replace(/[^0-9,.+-]/g,'');const c=t.lastIndexOf(','),d=t.lastIndexOf('.');t=c>d?t.split('.').join('').replace(',','.'):t.split(',').join('');return t===''?NaN:parseFloat(t)}
  function mnDate(s){s=String(s||'').trim();let m0=s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);if(m0)return m0[1]+'-'+m0[2]+'-'+m0[3];m0=s.match(/^([0-9]{1,2})[.\\/-]([0-9]{1,2})[.\\/-]([0-9]{2,4})/);if(!m0)return '';const us=s.includes('/')&&/^en-US/.test(APP.locale),dd=us?m0[2]:m0[1],mo=us?m0[1]:m0[2];return (m0[3].length===2?'20'+m0[3]:m0[3])+'-'+mo.padStart(2,'0')+'-'+dd.padStart(2,'0')}
  // any bank's CSV: the separator is worked out from the first line, the columns from the usual header names
  function mnCsv(txt){txt=String(txt).replace(/^\\uFEFF/,'');const l0=txt.split(/\\r?\\n/)[0]||'',sep=[';','\\t',','].map(x=>[x,l0.split(x).length]).sort((a,b)=>b[1]-a[1])[0][0],rows=[];let cur=[],f='',q0=false;for(let i=0;i<txt.length;i++){const c=txt[i];if(q0){if(c==='"'&&txt[i+1]==='"'){f+='"';i++}else if(c==='"')q0=false;else f+=c}else if(c==='"')q0=true;else if(c===sep){cur.push(f);f=''}else if(c==='\\n'||c==='\\r'){if(f||cur.length){cur.push(f);rows.push(cur);cur=[];f=''}}else f+=c}if(f||cur.length){cur.push(f);rows.push(cur)}if(rows.length<2)return null;const h=rows[0].map(x=>x.trim().toLowerCase()),ix=(...n)=>h.findIndex(x=>n.includes(x)),dI=ix('completed date','date completed (utc)','booking date','posted date','posting date','transaction date','value date','date','buchungstag','valutadatum','datum'),sI=ix('started date'),nI=ix('description','merchant','payee','name','details','memo','text','beschreibung','verwendungszweck','empfänger'),aI=ix('amount','value','betrag','umsatz'),oI=ix('debit','paid out','money out'),iI=ix('credit','paid in','money in'),stI=ix('state','status'),bI=ix('balance','saldo'),cI=ix('currency','währung');if(nI<0||(aI<0&&oI<0&&iI<0)||(dI<0&&sI<0))return null;const out=[];let bal=null,balD='';for(const r of rows.slice(1)){const st=stI>=0?String(r[stI]||'').toUpperCase():'';if(st&&/PENDING|REVERTED|DECLINED|FAILED|CANCEL/.test(st))continue;const d=mnDate(r[dI>=0&&r[dI]?dI:sI]),a=aI>=0?mnNum(r[aI]):(mnNum(r[iI])||0)-Math.abs(mnNum(r[oI])||0);if(!d||!isFinite(a)||!a)continue;out.push({d,n:String(r[nI]||'').slice(0,60),a,c:cI>=0?r[cI]:''});if(bI>=0&&r[bI]!==''&&d>=balD){const b=mnNum(r[bI]);if(isFinite(b)){bal=b;balD=d}}}return {rows:out.slice(-3000),bal,balD}}
  function mnFile(inp){const f=inp.files&&inp.files[0];inp.value='';if(!f)return;const id=Date.now().toString(36)+'m',isPdf=f.type==='application/pdf'||/[.]pdf$/i.test(f.name),r=new FileReader();r.onerror=()=>toast('Could not open that file');r.onload=()=>{if(isPdf){if(f.size>ATTMAX){toast('That PDF is over 10 MB');return}window.MNJ=JSON.stringify({id,pdf:String(r.result).split(',')[1]})}else{const P=mnCsv(String(r.result));if(!P||!P.rows.length){toast('That CSV needs a date, a description and an amount column');return}window.MNJ=JSON.stringify({id,rows:P.rows,bal:P.bal,balDate:P.balD})}fls('mnWait',fls('mnWait').concat([{id,t:Date.now()}]));nav('board://moneyai?id='+id);drawMoney()};if(isPdf)r.readAsDataURL(f);else r.readAsText(f)}
  function mnDone(o){fls('mnWait',fls('mnWait').filter(x=>x.id!==o.id));toast(o.added+' payments added');dayTap('moneycheck','Checked my money');setTimeout(()=>{nav('board://data')},500)}
  function mnFail(id,why){fls('mnWait',fls('mnWait').filter(x=>x.id!==id));toast(why);drawMoney()}
  // health from the Shortcut, lift progress, degree and the lists you build up
  let HEALTH=${J(m.health || { days: [] })},DEG=${J(m.degree || { done: 0, total: 0, modules: [] })}
  const hDay=d=>(HEALTH.days||[]).find(x=>x.date===d)
  function bLifts(){const M={};GLOGD.forEach(w=>{((w.raw&&w.raw.exercises)||[]).forEach(e=>{const best=Math.max(0,...(e.sets||[]).map(s=>+s.kg||0));if(!best)return;(M[e.name]=M[e.name]||[]).push({d:w.date,kg:best})})});const R=Object.entries(M).map(([n,L])=>{L.sort((a,b)=>String(a.d).localeCompare(b.d));return {n,first:L[0].kg,last:L[L.length-1].kg,best:Math.max(...L.map(x=>x.kg)),when:L[L.length-1].d,c:L.length}}).sort((a,b)=>String(b.when).localeCompare(a.when)).slice(0,8);return '<div class="card c-card"><h3 class="g-h">Lifts</h3>'+(R.length?R.map(x=>'<div class="f-rec"><b style="font-weight:600">'+H(x.n)+'</b><span>'+x.last+' kg'+(x.c>1?', '+(x.last>=x.first?'+':'')+(Math.round((x.last-x.first)*10)/10)+' since first':'')+'</span></div>').join('')+'<p class="dim small" style="margin:8px 0 0">Your heaviest set each time, newest first.</p>':'<p class="dim small" style="margin:0">Your weights show up here once you log sets.</p>')+'</div>'}
  function degreeBlock(){const L=DEG.modules||[],done=+DEG.done||0,tot=+DEG.total||0;if(!tot)return '';return '<div class="card c-card" style="margin-top:12px"><div class="c-h"><h3>Degree</h3><b>'+done+' / '+tot+' credits</b></div><div class="bar" style="margin:8px 0"><div style="width:'+Math.min(100,done/tot*100)+'%"></div></div>'+L.map(x=>'<div class="f-rec"><b style="font-weight:600">'+H(x.name)+'</b><span>'+H(x.grade==null?(x.state||'open'):String(x.grade))+'</span></div>').join('')+'<p class="dim small" style="margin:8px 0 0">New grade? Tell the chat, or send it the transcript.</p></div>'}
  function lifeLists(){const t=sDay(0),from=gPlus(t,-30),E=(DLOG.events||[]).filter(x=>x.date>=from),who={};E.filter(x=>x.kind==='contact'&&x.label.includes(': ')).forEach(x=>{const n=x.label.split(': ')[1];who[n]=(who[n]||0)+1});const why={};E.filter(x=>x.kind==='badday'&&x.label.includes(': ')).forEach(x=>{const n=x.label.split(': ')[1];why[n]=(why[n]||0)+1});const list=k=>E.filter(x=>x.kind===k&&x.label.includes(': ')).map(x=>x.label.split(': ')[1]),line=(t0,L)=>L.length?'<div class="f-lab">'+t0+'</div><div class="j-l">'+H(L.join(', '))+'</div>':'',sorted=O=>Object.entries(O).sort((a,b)=>b[1]-a[1]).map(x=>x[0]+(x[1]>1?' '+x[1]+'x':'')),body=line('PEOPLE YOU SAW',sorted(who))+line('WHAT GOT IN THE WAY',sorted(why))+line('APPLIED TO',list('application'))+line('MADE AND SHIPPED',list('making').concat(list('shipped')))+line('READ',list('read'));return '<div class="card c-card"><h3 class="g-h">Last 30 days</h3>'+(body||'<p class="dim small" style="margin:0">Fills up as you answer the short questions after a tap.</p>')+'</div>'}
  function fxShort(){B=[];const st=(t,L)=>'<div class="f-lab">'+t+'</div>'+L.map((x,i)=>'<div class="sc-s"><b>'+(i+1)+'</b><span>'+x+'</span></div>').join('');open_('<div class="f-sh"><h3>iPhone shortcuts</h3><p class="sub">Two small Shortcuts send data here.</p>'+st('SCREENSHOT TO CLAUDE',['In Shortcuts, make a new shortcut.','Add <b>Take Screenshot</b>.','Add <b>Base64 Encode</b>. Line breaks: None.','Add <b>Dictionary</b> with the text key <b>image</b> set to the Base 64 Encoded result.','Add Scriptable <b>Run Script</b>: Widget Board, Parameter: the Dictionary. Turn off Run In App.','Settings, Accessibility, Touch, Back Tap: pick this shortcut for Double Tap.','Open the Fitness summary or anything else worth logging, double tap the back of the phone. Done.'])+st('HEALTH EVERY NIGHT',['Make a new shortcut. <b>Find Health Samples</b>: Steps, Start Date is today. Group by Day.','<b>Calculate Statistics</b>: Sum. Set Variable <b>steps</b>.','Do the same for Active Energy, variable <b>kcal</b>.','<b>Find Health Samples</b>: Sleep Analysis, last 1 day. Sum the Duration in hours. Variable <b>sleep</b>.','Add <b>Dictionary</b> with number keys <b>steps, kcal, sleep</b>.','Scriptable <b>Run Script</b>: Widget Board with that Dictionary. Turn off Run In App.','Automation, Time of Day 23:30, Run Immediately, run this shortcut.'])+'<p class="dim small" style="margin:10px 0 0">Sleep only exists if your iPhone or Watch tracks it.</p></div>')}
  function moneyItem(id){const x=(MONEY.tx||[]).find(y=>y.id===id);if(!x)return;B=[];open_('<div class="f-sh"><h3>'+H(x.name)+'</h3><p class="sub">'+H(x.date)+', '+H(x.cat||'Other')+'</p><div class="f-big"><b>'+mny(x.amount)+'</b></div><div class="f-sec red" onclick="logRm(\\x27money\\x27,\\x27'+fq(id)+'\\x27)">Remove</div></div>')}
  // what is set in app-config.json, so you can see it. Changing it is one chat message away
  function fxSet(){B=[];const r=(a,b)=>'<div class="f-rec"><b style="font-weight:600">'+a+'</b><span style="text-align:right">'+H(b)+'</span></div>',g=FOOD.goal||{};open_('<div class="f-sh"><h3>Settings</h3><p class="sub">These live in app-config.json in your private data repo. Tell the chat what to change, or edit the file.</p>'+r('Name',APP.name||'not set')+r('Courses',CN.join(', ')||'none')+r('Calorie goal',g.kcal?g.kcal+' kcal':'not set')+r('Protein goal',g.protein?g.protein+' g':'not set')+r('Study target',Math.round(STM*APP.game.study_days/60)+' h a week')+r('Wake window',(QST.cfg.wakeFrom||APP.wake.from)+' to '+(QST.cfg.wakeTo||APP.wake.to))+r('Paid meals',MEALS.map(x=>x.name).join(', ')||'none')+r('Currency',APP.currency||'none')+r('Heads up',APP.nudges?'on':'off')+r('Location with logs',APP.location?'on':'off')+'</div>')}
  // a back button everywhere: it remembers where you came from
  var BK=[]
  function goBack(){const cu=PG[Math.round(PAGER.scrollLeft/PAGER.clientWidth)],id=cu?cu.dataset.p:'cls',main=['cls','study','gym','food','stats','more'].includes(id);let p=BK.pop();while(p===id)p=BK.pop();window.BKING=1;tg(p||(main?'cls':'more'));window.BKING=0}
  function tabOn(id){const cu=PG[Math.round(PAGER.scrollLeft/PAGER.clientWidth)];return cu&&cu.dataset.p===id}
  window.TOUCHED=0;document.addEventListener('touchstart',()=>{window.TOUCHED=1},{passive:true,capture:true});
  // pull down at the top of a page to fetch fresh data
  ;(()=>{const tip=document.createElement('div');tip.style.cssText='position:fixed;top:0;left:50%;transform:translate(-50%,-50px);z-index:50;background:#2A2A31;color:#fff;padding:8px 14px;border-radius:16px;font-size:13px;font-weight:600';document.body.appendChild(tip)
    let y0=null,pull=0,busy=false
    document.addEventListener('touchstart',e=>{if(busy)return;const t=e.target,pg=t.closest&&t.closest('.pg');y0=!t.closest||t.closest('.figs,.chat,input,textarea,#sheet,#scan,#dial,#fan,#morn,#nav')||(pg&&pg.scrollTop>0)?null:e.touches[0].clientY;pull=0},{passive:true})
    document.addEventListener('touchmove',e=>{if(y0===null||busy)return;pull=e.touches[0].clientY-y0;if(pull<=0){tip.style.transform='translate(-50%,-50px)';return}tip.textContent=pull>90?'Release to refresh':'Pull to refresh';tip.style.transform='translate(-50%,'+Math.min(pull/2,60)+'px)'},{passive:true})
    document.addEventListener('touchend',()=>{if(y0===null||busy)return;y0=null;if(pull>90){busy=true;tip.textContent='Refreshing...';tip.style.transform='translate(-50%,60px)';const cur=PG[Math.round(PAGER.scrollLeft/PAGER.clientWidth)];nav('board://refresh?p='+(cur?cur.dataset.p:''))}else tip.style.transform='translate(-50%,-50px)'},{passive:true})})()
  document.querySelectorAll('textarea[id^=ta-]').forEach(t=>{try{const v=localStorage.getItem('draft-'+t.id);if(v){t.value=v;taFit(t)}}catch(e){}})
  drawFood();drawStudy();drawToday();draw('');draw('gym');drawGym();foodAiBoot();studyAiBoot();drawJournal();drawStats();jrBoot();ovlDel();drawAll();sayCheck();fxBoot();gMorning();setTimeout(()=>{nav('board://bodylist')},900);{const t=Date.now(),w=fls('bodyWait').filter(x=>t-x.t<6e5);fls('bodyWait',w)}
  const OPEN=${J(open || "")};const I0=PG.findIndex(p=>p.dataset.p===OPEN);if(I0>0){PAGER.scrollLeft=I0*PAGER.clientWidth;setTimeout(()=>{PAGER.scrollLeft=I0*PAGER.clientWidth},60)}mark(I0>0?OPEN:(PG[0]&&PG[0].dataset.p))
  const KIND={body:'mus',tasks:'todo',msg:'msg',due:'due',ex:'exam',cls:'cls'}[OPEN];if(KIND&&ITEM!=='')setTimeout(()=>sh(KIND,ITEM),350);if(OPEN==='say')setTimeout(sayOpen,350)
  </script>
  </body></html>`
}
async function offProduct(c) {
  let p = null, nm = ""
  try { const r = new Request("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(c) + ".json?fields=product_name,brands,nutriments,serving_quantity,quantity,categories,image_front_small_url"); r.headers = { "User-Agent": "WidgetBoard/1.0" }; r.timeoutInterval = 15; const j = await r.loadJSON()
    const nu = j?.product?.nutriments, kc = nu?.["energy-kcal_100g"] ?? (nu?.energy_100g ? nu.energy_100g / 4.184 : null)
    nm = (j?.product?.product_name || "").split(c).join("").trim()
    if (j?.status === 1 && kc != null) p = { code: c, name: nm || "Product " + c, brand: (j.product.brands || "").split(",")[0], img: j.product.image_front_small_url || "", kcal100: +kc, prot100: +nu.proteins_100g || 0, carb100: +nu.carbohydrates_100g || 0, fat100: +nu.fat_100g || 0, grams: +j.product.serving_quantity || 100, pack: String(j.product.quantity || ""), kind: String(j.product.categories || "").slice(0, 120) } } catch (e) { }
  return { p, nm }
}
const outboxDir = fm.joinPath(cacheDir, "outbox")
function outboxSave(path, body) {
  try { if (!fm.fileExists(outboxDir)) fm.createDirectory(outboxDir); const f = fm.joinPath(outboxDir, path.replace(/\//g, "_")); fm.writeString(f, JSON.stringify({ path, body })); return f } catch (e) { return "" }
}
let boxBusy = false
async function flushOutbox() {
  if (boxBusy || !fm.fileExists(outboxDir)) return
  const token = Keychain.contains(KEY) ? Keychain.get(KEY) : ""; if (!token || !REPO) return
  boxBusy = true
  try {
    for (const n of fm.listContents(outboxDir).sort()) {
      const f = fm.joinPath(outboxDir, n); let b = null
      try { b = JSON.parse(fm.readString(f)) } catch (e) { try { fm.remove(f) } catch (e2) { } continue }
      const r = new Request(`https://api.github.com/repos/${REPO}/contents/${b.path}`)
      r.method = "PUT"; r.timeoutInterval = 20; r.body = b.body
      r.headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "WidgetBoard", "Content-Type": "application/json" }
      try { await r.loadString() } catch (e) { return }
      const sc = r.response?.statusCode
      if (sc === 200 || sc === 201 || sc === 422) fm.remove(f); else return
    }
  } finally { boxBusy = false }
}
async function sendSay(id, text, channel, files, barcodes) { return sendInbox(id, { source: "phone", say: text, id, channel: channel || "", ...(files && files.length ? { files } : {}), ...(barcodes && barcodes.length ? { barcodes } : {}) }, "ask") }
async function sendInbox(id, obj, dir) {
  if (HERE && !obj.loc) obj.loc = HERE
  const token = Keychain.contains(KEY) ? Keychain.get(KEY) : ""
  if (!token || !REPO) return "No GitHub token set."
  const z = n => String(n).padStart(2, "0"), t = new Date()
  const path = `${dir || "inbox"}/phone-${t.getFullYear()}${z(t.getMonth() + 1)}${z(t.getDate())}-${z(t.getHours())}${z(t.getMinutes())}${z(t.getSeconds())}-${id}.json`
  const r = new Request(`https://api.github.com/repos/${REPO}/contents/${path}`)
  r.method = "PUT"; r.timeoutInterval = obj.files || obj.body_ai || obj.money_ai ? 180 : 20
  r.headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "WidgetBoard", "Content-Type": "application/json" }
  r.body = JSON.stringify({ message: "phone: message to Claude", content: Data.fromString(JSON.stringify(obj, null, 2)).toBase64String() })
  const box = obj.actions || obj.gym_session ? outboxSave(path, r.body) : ""
  try { await r.loadString() } catch (e) { return box ? "" : "No connection, not sent." }
  const sc = r.response?.statusCode
  if (sc === 201 || sc === 200 || (box && sc === 422)) { if (box) { try { fm.remove(box) } catch (e) { } } return "" }
  if (box && sc !== 403 && sc !== 404) return ""
  if (sc === 403 || sc === 404) return "Your token can only read. Make one with Contents: Read and write, then try again."
  return `Not sent (GitHub ${sc}).`
}
// where you are when you log: off unless you set "location": true in app-config.json. Only in the app, never on a widget,
// and it goes to your private data repo only
let HERE = null
async function findHere() {
  try {
    Location.setAccuracyToHundredMeters()
    const c = await Location.current()
    HERE = { lat: Math.round(c.latitude * 1000) / 1000, lon: Math.round(c.longitude * 1000) / 1000 }
    try { const g = (await Geocoder.reverse(c.latitude, c.longitude))[0]; HERE.place = [g?.name, g?.subLocality, g?.locality].filter(Boolean).join(", ") } catch (e) { }
  } catch (e) { }
}
// what the iPhone Shortcuts send: a screenshot for Claude to read, or the day's Health numbers
async function fromShortcut(p0) {
  let p = p0; if (typeof p === "string") { try { p = JSON.parse(p) } catch (e) { p = { say: p } } }
  const id = Date.now().toString(36) + "s", z = n => String(n).padStart(2, "0"), n = new Date(), date = n.getFullYear() + "-" + z(n.getMonth() + 1) + "-" + z(n.getDate())
  if (p.image) { const err = await sendSay(id, "Here is a screenshot from my phone. Read it and log what it shows. [1 photo]", "", [{ name: "screenshot.jpg", ext: "jpg", b64: String(p.image).replace(/\s/g, "") }]); return err || "Sent" }
  if (p.say) { const err = await sendSay(id, String(p.say), ""); return err || "Sent" }
  const num = v => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : 0 }
  const err = await sendInbox(id, { source: "phone", actions: { health_add: [{ date, steps: Math.round(num(p.steps)), kcal: Math.round(num(p.kcal)), sleep: Math.round(num(p.sleep) * 10) / 10 }] } }, "ask")
  return err || "Sent"
}
const APP_BASE = "https://widget-board.invalid/"
async function fullView(m, chat, open, item) {
  if (m.app?.location === true) findHere()
  const wv = new WebView()
  const APP_FILES = ["phone.json", "digest.json", "digest-done.json", "hidden-tasks.json", "coursework.json", "gym-log.json", "food-log.json", "phone-chat.json", "food-ai.json", "study-log.json", "study-ai.json", "day-log.json", "journal.json", "quests.json", "body-log.json", "money-log.json", "health-log.json", "degree.json", "app-config.json", "gym-phone.json"]
  const loadAll = async () => {
    const [p2, g2, dd2, hid2, cw2, gl2, fd2, ch2, fa2, sd2, sa2, dl2, jn2, qs2, bo2, mo2, he2, dg2, ac2, gp2] = await Promise.all(APP_FILES.map(getFile))
    hideLater(p2, hid2)
    const keep = { bmap: m.bmap }
    Object.assign(m, model(p2, g2, loadGone(), dd2?.items || {}), keep, { cwj: cw2, glog: mergeGym(gl2, gp2), food: fd2, foodAi: fa2, study: sd2, studyAi: sa2, dayLog: dl2, journal: jn2, quests: qs2, body: bo2, money: mo2, health: he2, degree: dg2, app: ac2 })
    chat = ch2
  }
  let tokenAsk = false
  // answers from the cloud arrive through the repo: the app's repeating timer looks for them
  const POLLS = []
  const poll = (file, key, id, done, fail) => { if (!POLLS.some(p => p.id === id)) POLLS.push({ file, key, id, done, fail, t0: Date.now() }) }
  const runPolls = async () => {
    for (const p of POLLS.slice()) {
      const o = await getFile(p.file), r = (o?.[p.key] || []).find(x => x.id === p.id)
      try {
        if (r) { POLLS.splice(POLLS.indexOf(p), 1); await wv.evaluateJavaScript(`${p.done}(${JSON.stringify(r).replace(/</g, "\\u003c")})`, false) }
        else if (Date.now() - p.t0 > 6 * 60000) { POLLS.splice(POLLS.indexOf(p), 1); if (p.fail) await wv.evaluateJavaScript(`${p.fail}(${JSON.stringify(p.id)},"That took too long. Try again.")`, false) }
      } catch (e) { }
    }
  }
  const pollFoodAi = id => poll("food-ai.json", "results", id, "foodAiDone", "foodAiFail")
  wv.shouldAllowRequest = req => {
    const u = req.url || ""
    if (u.startsWith("board://say")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      ;(async () => { let files = null, codes = null; if (q.att === "1") { try { files = JSON.parse(await wv.evaluateJavaScript("window.ATTJ||'[]'", false)); codes = JSON.parse(await wv.evaluateJavaScript("window.ATTB||'[]'", false)) } catch (e) { } } return sendSay(q.id, q.t, q.ch, files, codes) })().then(async err => {
        if (err && err.startsWith("Your token") && !tokenAsk) { tokenAsk = true; await askToken(true) }
        await wv.evaluateJavaScript(err ? `sentFail(${JSON.stringify(q.id)}, ${JSON.stringify(err)})` : `sentOk(${JSON.stringify(q.id)})`, false)
      })
      return false
    }
    if (u.startsWith("board://gym")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      try { fm.writeString(gymLocalFile, JSON.stringify({ do: q.do, at: q.at, t: Date.now() })) } catch (e) { }
      sendInbox(Date.now().toString(36), { source: "phone", gym_session: q.do, at: q.at }, "ask").then(async err => { if (err) await wv.evaluateJavaScript(`FAIL.gym=${JSON.stringify(err)};draw('gym')`, false) })
      // the day you picked moves the plan rotation on (applied in the cloud without Claude)
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
    if (u.startsWith("board://foodcode")) {
      const c = decodeURIComponent(u.split("c=")[1] || "")
      ;(async () => { const { p, nm } = await offProduct(c)
        await wv.evaluateJavaScript("foodFound(" + JSON.stringify(p) + "," + JSON.stringify(c) + "," + JSON.stringify(nm) + ")", false) })()
      return false
    }
    if (u.startsWith("board://bclook")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      ;(async () => { const list = await Promise.all(q.c.split(",").map(async c => ({ c, ...(await offProduct(c)) })))
        await wv.evaluateJavaScript("bcFound(" + JSON.stringify(q.ch) + "," + JSON.stringify(list).replace(/</g, "\\u003c") + ")", false) })()
      return false
    }
    if (u.startsWith("board://foodlib")) {
      ;(async () => { try {
        const libFile = fm.joinPath(cacheDir, "zxing.js")
        let lib = fm.fileExists(libFile) ? fm.readString(libFile) : ""
        if (!lib) { lib = await new Request("https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js").loadString(); if (lib.length > 100000) fm.writeString(libFile, lib) }
        await wv.evaluateJavaScript(lib + ";0", false)
        await wv.evaluateJavaScript("foodLibReady()", false)
      } catch (e) { try { await wv.evaluateJavaScript("foodLibFail(" + JSON.stringify(String(e.message || e)) + ")", false) } catch (e2) { } } })()
      return false
    }
    if (u.startsWith("board://refresh")) {
      const pg = decodeURIComponent(u.split("p=")[1] || "")
      ;(async () => {
        await loadAll()
        await wv.loadHTML(pageHtml(m, chat, pg), APP_BASE)
      })()
      return false
    }
    if (u.startsWith("board://voice")) { fm.writeString(voiceFile, u.endsWith("on=1") ? "1" : "0"); return false }
    if (u.startsWith("board://foodai")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      ;(async () => {
        let photo = ""
        if (q.photo === "1") { try { photo = await wv.evaluateJavaScript("window.FAIP||''", false) } catch (e) { } }
        const err = await sendInbox(q.id, { source: "phone", food_ai: { id: q.id, say: q.t || "", date: q.date, meal: q.meal, prev: q.prev || "", photo } }, "ask")
        if (err) await wv.evaluateJavaScript(`foodAiFail(${JSON.stringify(q.id)},${JSON.stringify(err)})`, false)
        else pollFoodAi(q.id)
      })()
      return false
    }
    if (u.startsWith("board://studyai")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      ;(async () => {
        if (await sendInbox(q.id, { source: "phone", study_ai: { id: q.id, say: q.t || "" } }, "ask")) return
        poll("study-ai.json", "results", q.id, "studyAiDone")
      })()
      return false
    }
    if (u.startsWith("board://journal") || u.startsWith("board://jrpoll")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      ;(async () => {
        if (u.startsWith("board://journal")) {
          let t = ""; try { t = await wv.evaluateJavaScript("window.JTXT||''", false) } catch (e) { }
          const err = await sendInbox(q.id, { source: "phone", journal_ai: { id: q.id, date: q.date, text: t, device: Device.isPad() ? "iPad" : "iPhone" } }, "ask")
          if (err) { await wv.evaluateJavaScript(`jrFail(${JSON.stringify(q.id)},${JSON.stringify(err)})`, false); return }
        }
        poll("journal.json", "entries", q.id, "jrDone", "jrFail")
      })()
      return false
    }
    if (u.startsWith("board://data")) {
      ;(async () => {
        const [fd, sd, dl, jn, gl, qs, bo, mo, hl, dg, gp] = await Promise.all(["food-log.json", "study-log.json", "day-log.json", "journal.json", "gym-log.json", "quests.json", "body-log.json", "money-log.json", "health-log.json", "degree.json", "gym-phone.json"].map(getFile))
        try { await wv.evaluateJavaScript(`setData(${JSON.stringify({ food: fd, study: sd, day: dl, journal: jn, glog: mergeGym(gl, gp), quests: qs, body: bo, money: mo, health: hl, degree: dg }).replace(/</g, "\\u003c")})`, false) } catch (e) { }
      })()
      return false
    }
    if (u.startsWith("board://bodyai")) {
      const q = {}; for (const kv of u.split("?")[1].split("&")) { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v || "") }
      ;(async () => {
        let ph = "", th = "", pv = ""
        try { ph = await wv.evaluateJavaScript("window.BPH||''", false); th = await wv.evaluateJavaScript("window.BTHS||''", false); pv = await wv.evaluateJavaScript("window.BPV||''", false) } catch (e) { }
        try { fm.writeString(fm.joinPath(cacheDir, "body-" + q.id + ".txt"), th) } catch (e) { }
        const err = await sendInbox(q.id, { source: "phone", body_ai: { id: q.id, kind: q.kind, date: q.date, kg: q.kg, rate: q.rate, burn: q.burn, photo: ph, prev: pv } }, "ask")
        if (err) await wv.evaluateJavaScript(`bodyFail(${JSON.stringify(q.id)},${JSON.stringify(err)})`, false)
        else poll("body-log.json", "entries", q.id, "bodyDone", "bodyFail")
      })()
      return false
    }
    if (u.startsWith("board://bodylist")) {
      ;(async () => {
        const o = {}, keep = new Set((m.body?.entries || []).map(x => x.id))
        for (const n of fm.listContents(cacheDir).filter(x => /^body-.*[.]txt$/.test(x))) { const id = n.slice(5, -4), p = fm.joinPath(cacheDir, n); if (keep.has(id)) o[id] = fm.readString(p); else if (Date.now() - fm.modificationDate(p).getTime() > 864e5) fm.remove(p) }
        try { await wv.evaluateJavaScript(`bodyThumbs(${JSON.stringify(o)})`, false) } catch (e) { }
      })()
      return false
    }
    if (u.startsWith("board://moneyai")) {
      const id = decodeURIComponent(u.split("id=")[1] || "")
      ;(async () => {
        let body = null
        try { body = JSON.parse(await wv.evaluateJavaScript("window.MNJ||'null'", false)) } catch (e) { }
        const err = body ? await sendInbox(id, { source: "phone", money_ai: body }, "ask") : "Could not read that file."
        if (err) await wv.evaluateJavaScript(`mnFail(${JSON.stringify(id)},${JSON.stringify(err)})`, false)
        else poll("money-log.json", "runs", id, "mnDone", "mnFail")
      })()
      return false
    }
    if (u.startsWith("board://foodpoll")) { pollFoodAi(decodeURIComponent(u.split("id=")[1] || "")); return false }
    if (u.startsWith("board://notifyoff")) { Notification.removePending(decodeURIComponent(u.split("id=")[1] || "").split(",")); return false }
    if (u.startsWith("board://notify")) {
      const list = JSON.parse(decodeURIComponent(u.split("j=")[1] || "[]"))
      ;(async () => { for (const r of list) { const n = new Notification(); n.title = r.title; n.body = r.body || ""; if (r.id) n.identifier = r.id; n.setTriggerDate(new Date(r.at)); n.openURL = URLScheme.forRunningScript(); await n.schedule() } })()
      return false
    }
    if (u.startsWith(APP_BASE)) return true
    if (/^https?:/.test(u)) { Safari.open(u); return false }
    return true
  }
  await wv.loadHTML(pageHtml(m, chat, open, item), APP_BASE)
  const voiceOn = () => fm.fileExists(voiceFile) && fm.readString(voiceFile) === "1"   // off unless you switch it on
  try { await wv.evaluateJavaScript(`setVoice(${voiceOn()})`, false) } catch (e) { }
  const heard = new Set((chat?.msgs || []).map(q => q.id))
  // today's gym session comes straight from the repo, so it is current even when the PC is off
  const pushSess = async () => { const z = n => String(n).padStart(2, "0"), d = new Date(), t = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); const gs = await getFile("gym-session.json"); if (gs && gs.date === t) { try { await wv.evaluateJavaScript(`setGym(${JSON.stringify(gs)})`, false) } catch (e) { } } }
  pushSess().catch(() => { })
  // the page already shows what the phone had: fetch everything at once behind it and only touch the page if something really changed
  const refreshBehind = async () => {
    flushOutbox().catch(() => { })
    const headFile = fm.joinPath(cacheDir, "head.txt"); let head = ""
    try {
      const r = new Request(`https://api.github.com/repos/${REPO}/commits/main`); r.timeoutInterval = 8
      r.headers = { Authorization: `Bearer ${Keychain.get(KEY)}`, Accept: "application/vnd.github.sha", "User-Agent": "WidgetBoard", "Cache-Control": "no-cache" }
      head = String(await r.loadString()).trim(); if (r.response?.statusCode !== 200) head = ""
    } catch (e) { head = "" }
    if (head && fm.fileExists(headFile) && fm.readString(headFile) === head) return
    const raw = n => { const c = fm.joinPath(cacheDir, n.replace(/\//g, "_")); return fm.fileExists(c) ? fm.readString(c).replace(/"generated":\s*"[^"]*",?/, "") : "" }
    const before = APP_FILES.map(raw)
    await loadAll()
    if (head) { try { fm.writeString(headFile, head) } catch (e) { } }
    const changed = APP_FILES.filter((n, i) => raw(n) !== before[i])
    if (!changed.length) return
    const LIVE = ["food-log.json", "study-log.json", "day-log.json", "journal.json", "gym-log.json", "gym-phone.json", "quests.json", "body-log.json", "money-log.json", "health-log.json", "degree.json"], json = o => JSON.stringify(o).replace(/</g, "\\u003c")
    if (changed.includes("phone-chat.json") && chat) await wv.evaluateJavaScript(`setChat(${json(chat)})`, false)
    if (changed.some(n => LIVE.includes(n))) await wv.evaluateJavaScript(`setData(${json({ food: m.food, study: m.study, day: m.dayLog, journal: m.journal, glog: Array.isArray(m.glog) ? m.glog : m.glog?.items, quests: m.quests, body: m.body, money: m.money, health: m.health, degree: m.degree })})`, false)
    // the rest needs a redraw, which never happens under your finger or while you type; pull down or the next open gets it then
    if (changed.some(n => !LIVE.includes(n) && n !== "phone-chat.json")) {
      const busy = await wv.evaluateJavaScript("!!window.TOUCHED||/INPUT|TEXTAREA/.test((document.activeElement||{}).tagName||'')", false)
      if (!busy) { await wv.loadHTML(pageHtml(m, chat, open, item), APP_BASE); await wv.evaluateJavaScript(`setVoice(${voiceOn()})`, false) }
    }
  }
  refreshBehind().catch(() => { })
  // replies come back through the repo: check every 12 s while the view is open
  let tickN = 0, ticking = false
  const timer = Timer.schedule(3000, true, async () => {
    if (ticking) return
    let hurry = false; try { hurry = await wv.evaluateJavaScript("chatOpen()", false) } catch (e) { }
    if (!hurry && ++tickN % 3) return
    ticking = true; try { await tickNow() } finally { ticking = false }
  })
  const tickNow = async () => {
    flushOutbox().catch(() => { })
    await runPolls()
    const c = await getFile("phone-chat.json")
    if (c) {
      try { await wv.evaluateJavaScript(`setChat(${JSON.stringify(c)})`, false) } catch (e) { }
      // a new answer from Claude or the coach: read it out
      for (const q of c.msgs || []) if (!heard.has(q.id)) { heard.add(q.id); if (q.role !== "user" && voiceOn()) Speech.speak(String(q.text).replace(/\s*\(Updated .*?\)\s*$/, "")) }
    }
    await pushSess()
  }
  await wv.present(true)
  timer.invalidate()
}
async function upgradeLoader() {
  try {
    for (const mk of [() => FileManager.iCloud(), () => FileManager.local()]) {
      let fx; try { fx = mk() } catch (e) { continue }
      const path = fx.joinPath(fx.documentsDirectory(), Script.name() + ".js")
      if (!fx.fileExists(path)) continue
      if (fx.isFileStoredIniCloud(path) && !fx.isFileDownloaded(path)) return
      const now = fx.readString(path)
      if (!now.includes("board_token") || now.includes("opens-from-phone")) return
      const r = new Request(`https://raw.githubusercontent.com/${CODE}/main/phone/loader.js?t=${Date.now()}`)
      r.headers = { "Cache-Control": "no-cache" }
      const t = await r.loadString()
      if (r.response?.statusCode !== 200 || !t.includes("opens-from-phone") || !t.includes("Script.complete()")) return
      const head = []; for (const l of now.split("\n")) { if (/^\/\/ (Variables used by Scriptable|These must be at the very top|icon-)/.test(l)) head.push(l); else break }
      fx.writeString(path, (head.length ? head.join("\n") + "\n" : "") + t)
      return
    }
  } catch (e) { }
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
const openFast = config.runsInApp && !args.shortcutParameter
const [p, g, dgd, hid] = await Promise.all(["phone.json", "digest.json", "digest-done.json", "hidden-tasks.json", ...(openFast ? [] : ["gym-session.json"])].map(openFast ? fromPhone : getFile))
hideLater(p, hid)
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
  else if (fam === "accessoryRectangular") { if ((args.widgetParameter || "").trim().toLowerCase() === "day") m.wx = await getWeather(m.p?.meta); else { m.cwj = await getFile("coursework.json"); m.app = await getFile("app-config.json") } lockRect(w, m) }
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
} else if (args.shortcutParameter) {
  Script.setShortcutOutput(await fromShortcut(args.shortcutParameter))
} else {
  const qp = args.queryParameters || {}
  upgradeLoader()
  ;[m.app, m.cwj, m.glog, m.food, m.foodAi, m.study, m.studyAi, m.dayLog, m.journal, m.quests, m.body, m.money, m.health, m.degree, m.bmap] = await Promise.all(["app-config.json", "coursework.json", "gym-log.json", "food-log.json", "food-ai.json", "study-log.json", "study-ai.json", "day-log.json", "journal.json", "quests.json", "body-log.json", "money-log.json", "health-log.json", "degree.json", "assets/body-map.json"].map(fromPhone))
  m.glog = mergeGym(m.glog, await fromPhone("gym-phone.json"))
  await fullView(m, await fromPhone("phone-chat.json"), qp.open, qp.item)
}
Script.complete()
