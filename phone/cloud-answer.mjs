// The phone companion's cloud side. Copy this file to phone/cloud-answer.mjs in YOUR private data repo, together with
// phone/workflow-phone.yml as .github/workflows/phone.yml. It runs in GitHub Actions whenever the phone (iPhone or
// Android) pushes a note into ask/, so taps and chats work while the PC is off.
// Notes: {"say": "...", "id": "...", "channel": ""|"gym"}, {"gym_session": "start"|"end"|"delete", "at": "..."} or
// {"actions": {...}}. Taps are applied without Claude (no usage). Only "say" notes call Claude, through the
// CLAUDE_CODE_OAUTH_TOKEN secret (from `claude setup-token`). Replies go to phone-chat.json, the gym coach's log to
// gym-session.json, and every change is also forwarded to inbox/ for the PC board, which applies it when it is on.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const ROOT = process.cwd()
const P = f => path.join(ROOT, f)
const read = (f, def) => { try { return JSON.parse(fs.readFileSync(P(f), "utf8")) } catch { return def } }
// inbox/ is not in git while empty, so create folders on the way
const write = (f, o) => { fs.mkdirSync(path.dirname(P(f)), { recursive: true }); fs.writeFileSync(P(f), JSON.stringify(o, null, 2) + "\n") }
const text = (f, max = 6000) => { try { const s = fs.readFileSync(P(f), "utf8"); return s.length > max ? s.slice(-max) : s } catch { return "" } }
// the runner clock is set to your time zone (TZ in the workflow), so timestamps match the PC's local "yyyy-MM-ddTHH:mm:ss"
const z = n => String(n).padStart(2, "0")
const stamp = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`
const today = () => stamp().slice(0, 10)

function loadChat() { const c = read("phone-chat.json", {}); return Array.isArray(c.msgs) ? c.msgs : [] }
function saveChat(msgs, busy) { write("phone-chat.json", { updated: stamp(), busy, msgs: msgs.slice(-60) }) }
function loadSess() {
  const s = read("gym-session.json", null)
  if (!s || s.date !== today()) return { date: today(), started: "", ended: "", entries: [] }
  return { date: s.date, started: s.started || "", ended: s.ended || "", entries: Array.isArray(s.entries) ? s.entries : [] }
}
function inboxNote(name, actions) {
  if (!actions || !Object.keys(actions).length) return
  fs.mkdirSync(P("inbox"), { recursive: true })
  write(`inbox/${stamp().replace(/[-:]/g, "").replace("T", "-")}-${name}.json`, { source: "phone-cloud", actions })
}
// Apply a change to the user's day right away, PC off or on: phone.json (what the phone shows), digest-done.json and
// deadlines.json. The same note also goes to inbox/ for the PC board, which applies it when it is on; every action is
// safe to apply twice there (ticks are idempotent, todos_add skips titles that already exist).
const MUSCLE_WORDS = { back: ["lats", "upper_back"], legs: ["quads", "hamstrings", "glutes", "calves"], shoulders: ["front_delts", "side_delts"], arms: ["biceps", "triceps"], delts: ["side_delts"] }
function applyActions(a, name) {
  if (!a || typeof a !== "object" || !Object.keys(a).length) return 0
  const ph = read("phone.json", null); let n = 0
  const arr = v => Array.isArray(v) ? v : v ? [v] : []
  if (ph) {
    const todos = ph.todos = arr(ph.todos)
    for (const id of arr(a.todos_done)) { const i = todos.findIndex(t => t.id === String(id)); if (i >= 0) { todos.splice(i, 1); n++ } }
    for (const x of arr(a.todos_move)) { const t = todos.find(t => x && t.id === String(x.id)); if (t) { t.start = String(x.start || ""); n++ } }
    for (const x of arr(a.todos_add)) {
      if (!x || !x.title || todos.some(t => t.title === String(x.title))) continue
      const st = String(x.start || "")
      todos.unshift({ id: "c" + Date.now().toString(36) + n, title: String(x.title), start: st, list: "", kind: st.length > 10 ? "event" : "task" }); n++
    }
    for (const x of arr(a.deadlines_done)) { const k = arr(ph.deadlines).findIndex(d => x && d.what === String(x.what) && String(d.when).slice(0, 16) === String(x.when).slice(0, 16)); if (k >= 0) { ph.deadlines.splice(k, 1); n++ } }
    for (const r of arr(a.coursework_done)) for (const g of arr(ph.coursework)) for (const it of arr(g.items)) if (it.ref === String(r) && !it.done) { it.done = true; n++ }
    for (const m of arr(a.muscles)) {
      if (!m || !m.muscle) continue
      const w = String(m.muscle).toLowerCase().replace(/\s+/g, "_"), keys = MUSCLE_WORDS[w] || [w], date = String(m.date || today()).slice(0, 10)
      for (const k of keys) {
        const e = arr(ph.muscles).find(x => x.key === k); if (!e) continue
        if (!e.last || date > e.last) e.last = date
        if ((new Date(today()) - new Date(date)) / 864e5 < 7) e.sets7 = (+e.sets7 || 0) + (+m.sets || 0)
        e.recent = [`${date}: ${m.detail || "trained"}${m.sets ? " (" + m.sets + " sets)" : ""}`].concat(arr(e.recent)).slice(0, 3); n++
      }
    }
    if (a.gym_done && ph.gym) {
      if (!ph.gym.done_today) ph.gym.prev_next = ph.gym.next
      ph.gym.done_today = true
      const days = arr(ph.gym.plan), want = String(a.gym_day || ph.gym.next || "").toLowerCase()
      let i = days.findIndex(d => d.title.toLowerCase() === want); if (i < 0) i = days.findIndex(d => want && d.title.toLowerCase().includes(want.replace(/\s*day$/, "")))
      if (i >= 0) { const nx = days[(i + 1) % days.length]; ph.gym.next = nx.title; ph.gym.exercises = arr(nx.exercises).map(e => ({ name: e.name, sets: e.sets })) }
      n++
    }
    write("phone.json", ph)
  }
  if (arr(a.digest_done).length) {
    const dd = read("digest-done.json", { items: {} }); dd.items = dd.items || {}
    for (const x of arr(a.digest_done)) if (x && x.id) { dd.items["msg:" + x.id] = { state: x.state || "done", ...(x.text ? { text: String(x.text) } : {}) }; n++ }
    write("digest-done.json", dd)
  }
  if (arr(a.deadlines_done).length) {
    const dj = read("deadlines.json", null)
    if (dj) { for (const x of arr(a.deadlines_done)) for (const it of arr(dj.items)) if (x && it.what === String(x.what) && String(it.when).slice(0, 16) === String(x.when).slice(0, 16)) it.done = true; write("deadlines.json", dj) }
  }
  // tasks ignored or put off on the phone: remembered in hidden-tasks.json (ref -> hidden until), read by the PC and the phone
  if (a.gym_session_delete) setSession("delete")
  if (arr(a.coursework_hide).length) {
    const hj = read("hidden-tasks.json", { items: {} }), now = new Date(); hj.items = hj.items || {}
    for (const x of arr(a.coursework_hide)) if (x && x.ref) { hj.items[String(x.ref)] = String(x.until || "2099-01-01T00:00"); n++ }
    for (const k of Object.keys(hj.items)) if (new Date(hj.items[k]) < now) delete hj.items[k]
    write("hidden-tasks.json", hj)
    const ph2 = read("phone.json", null)
    if (ph2) { for (const g of arr(ph2.coursework)) g.items = arr(g.items).filter(it => !(hj.items[it.ref] && new Date(hj.items[it.ref]) > now)); write("phone.json", ph2) }
  }
  inboxNote(name, a)
  return n
}
// the suggestion never stays on a rest day once a full day passed without a workout
function skipRest() {
  const ph = read("phone.json", null); if (!ph?.gym) return
  const days = Array.isArray(ph.gym.plan) ? ph.gym.plan : [], i = days.findIndex(d => d.title === ph.gym.next)
  if (i < 0 || !/rest/i.test(ph.gym.next)) return
  const log = read("gym-log.json", []), last = (Array.isArray(log) ? log : []).map(w => w && w.date).filter(Boolean).sort().pop()
  if (!last || (new Date(today()) - new Date(last)) / 864e5 < 2) return
  const nx = days[(i + 1) % days.length]; ph.gym.next = nx.title; ph.gym.exercises = (nx.exercises || []).map(e => ({ name: e.name, sets: e.sets })); ph.gym.focus = ""
  write("phone.json", ph)
}
function setSession(what, at) {
  const s = loadSess(), t = at || stamp()
  if (what === "start") { if (!s.started || s.ended) { s.started = t; s.ended = "" } }
  else if (what === "delete") {
    // it was a test or a mistake: forget today's session, undo the plan day it logged, tell the PC
    const ph = read("phone.json", null)
    if (ph?.gym) { if (ph.gym.done_today && ph.gym.prev_next) { ph.gym.next = ph.gym.prev_next; const d0 = (ph.gym.plan || []).find(x => x.title === ph.gym.next); if (d0) ph.gym.exercises = (d0.exercises || []).map(e => ({ name: e.name, sets: e.sets })) }
      ph.gym.done_today = false; delete ph.gym.prev_next; ph.gym.session = { date: today(), started: "", ended: "", entries: [] }; write("phone.json", ph) }
    write(`inbox/${stamp().replace(/[-:]/g, "").replace("T", "-")}-gym-delete.json`, { source: "phone-cloud", gym_session: "delete" })
    write("gym-session.json", { date: today(), started: "", ended: "", entries: [] })
    return
  }
  // a fresh start can sit next to an old end time; the session runs when it started after it last ended
  else if (what === "end" && s.started && (!s.ended || new Date(s.started) > new Date(s.ended))) {
    s.ended = t
    const mins = Math.max(0, Math.round((new Date(s.ended) - new Date(s.started)) / 60000))
    const kc = s.entries.reduce((a, e) => a + (+e.kcal || 0), 0)
    const names = [...new Set(s.entries.map(e => e.name).filter(Boolean))].join(", ")
    inboxNote("gym-end", { journal: [`Gym session ${mins} min${names ? ": " + names : ""}${kc ? `, about ${kc} kcal` : ""}`] })
  }
  write("gym-session.json", s)
}

function claude(prompt, tools) {
  const args = ["-p", "--model", "sonnet", "--output-format", "text"]
  if (tools) args.push("--allowedTools", "Read,Glob,Grep")   // the chat reads the data files; changes come back as actions
  const r = spawnSync("claude", args, { input: prompt, encoding: "utf8", cwd: ROOT, timeout: 240000, maxBuffer: 1 << 24 })
  if (r.status !== 0) console.error("claude failed", r.status, (r.stderr || "").slice(0, 2000), (r.stdout || "").slice(0, 600))
  return r.stdout || ""
}
// the last JSON object in the output that has a "reply"
function lastJson(out) {
  for (let i = out.lastIndexOf("{"); i >= 0; i = out.lastIndexOf("{", i - 1)) {
    for (let j = out.lastIndexOf("}"); j > i; j = out.lastIndexOf("}", j - 1)) {
      try { const o = JSON.parse(out.slice(i, j + 1)); if (o && typeof o === "object" && "reply" in o) return o } catch { }
    }
  }
  return null
}

const STYLE = "Reply like a text message: max 3 short sentences, direct, no emojis."
// optional: a short about-me.md in the data repo (goals, body weight, what you like); nothing else about you is read
const who = () => text("about-me.md", 5000) || "(no about-me.md in the data repo)"
const when = () => new Date().toLocaleString("en-GB", { weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })

function answer(q) {
  const msgs = loadChat(), ch = q.channel || ""
  if (msgs.some(m => m.id === q.id)) return
  msgs.push({ id: q.id, role: "user", text: q.say, at: stamp(), channel: ch })
  saveChat(msgs, true)
  pushAll("phone: message received")   // the phone sees it arrived and shows "typing"
  const hist = msgs.filter(m => (m.channel || "") === ch).slice(-12).map(m => `${m.role}: ${m.text}`).join("\n")
  let reply = "Could not process that, try again."
  if (ch === "gym") {
    const s = loadSess(), ph = read("phone.json", {}), plan = { days: ph.gym?.plan || [] }
    // next day in the rotation: the PC's pick, but a rest day counts as taken once a full day passed with no workout
    const days = plan.days || [], log = read("gym-log.json", []), lastDate = (Array.isArray(log) ? log : []).map(w => w && w.date).filter(Boolean).sort().pop() || ""
    const since = lastDate ? Math.round((new Date(today()) - new Date(lastDate)) / 864e5) : null
    let next = ph.gym?.next || "?"
    const ni = days.findIndex(d => d.title === next)
    if (ni >= 0 && /rest/i.test(next) && since !== null && since >= 2) next = days[(ni + 1) % days.length].title
    const planTxt = (plan.days || []).map(d => d.title + ": " + (d.exercises || []).map(e => `${e.name} (${e.sets})`).join("; ")).join("\n")
    const sessTxt = (s.started ? `started ${s.started}${s.ended ? ", ended " + s.ended : ", still running"}` : "not started") +
      "\nLOGGED SO FAR TODAY:\n" + s.entries.map(e => `- ${e.kind} ${e.name} ${e.detail || ""} ${e.sets || 0} sets ${e.minutes || 0} min ${e.kcal || 0} kcal`).join("\n")
    const prompt = "You are the user's gym coach, texting with them on their phone while they train. " +
      "Log what they tell you, answer questions, and give short concrete suggestions (next exercise, weights from their history, what muscle they are neglecting). Never change their plan; the plan day is only a suggestion and they pick what they train. If the log has a gap of several days, ask what they trained since then before you assume a rest day. " + STYLE + "\n" +
      'For every exercise or cardio they say they did, add one entry to session_log. Cardio: kind "cardio", minutes, and kcal estimated from their body weight (about-me.md, else about 75 kg) and the intensity; say the kcal in the reply. Lifts: kind "lift", sets, detail with weight x reps. ' +
      'Also put every lift into actions.muscles ({"muscle", "date": "' + today() + '", "sets", "detail"}; keys: chest, front_delts, side_delts, rear_delts, biceps, triceps, forearms, abs, traps, lats, upper_back, lower_back, glutes, quads, hamstrings, calves). ' +
      'If they start, set session to "start"; if they are done or leaving, set session to "end"; if the session was only a test, a mistake or should be deleted, set session to "delete". If they did a whole plan day, set actions.gym_done true and actions.gym_day to it.\n' +
      'Return at the end ONLY JSON: {"reply": "...", "session": "", "session_log": [{"kind": "lift|cardio|other", "name": "", "detail": "", "sets": 0, "minutes": 0, "kcal": 0}], "actions": {}}\n\n' +
      `NOW: ${when()}. SUGGESTED PLAN DAY: ${next}. LAST LOGGED WORKOUT: ${lastDate ? lastDate + " (" + since + " days ago)" : "none"}\nPLAN:\n${planTxt}\nSESSION: ${sessTxt}\n\nRECENT GYM LOG:\n${text("gym-log.json", 2500)}\n\nABOUT THEM:\n${who()}\n\nCHAT SO FAR:\n${hist}`
    const o = lastJson(claude(prompt, false))
    if (o) {
      reply = String(o.reply || reply)
      const log = (Array.isArray(o.session_log) ? o.session_log : []).filter(e => e && e.name)
      if (o.session === "start" || (log.length && !loadSess().started)) setSession("start")
      const s2 = loadSess(), n = v => Number.isFinite(+v) ? Math.round(+v) : 0
      for (const e of log) s2.entries.push({ at: stamp(), kind: String(e.kind || ""), name: String(e.name), detail: String(e.detail || ""), sets: n(e.sets), minutes: n(e.minutes), kcal: n(e.kcal) })
      write("gym-session.json", s2)
      if (o.session === "end") setSession("end")
      if (o.session === "delete") setSession("delete")
      applyActions(o.actions, "coach-" + q.id)
    }
  } else {
    const prompt = "You are Claude inside the user's widget board, running in the cloud on their private data repo (the PC may be off). They typed this on their phone. " +
      "Do what they ask. For things about their day return actions: journal [short facts], todos_add [{title, start}], todos_done [ids], todos_move [{id, start}], coursework_done [refs], deadlines_done [{what, when}], gym_done, gym_day, gym_session_delete (true when today's gym session was only a test or should be deleted), muscles [{muscle, date, sets, detail}]. They are applied for you; do not write inbox files. " +
      "phone.json is what the phone shows (classes, tasks, deadlines, exams, gym); read it to answer questions. Do not edit files, do not commit or push. " +
      STYLE + " Say what you changed.\n" +
      'Return at the end ONLY JSON: {"reply": "...", "actions": {}}\n\n' +
      `NOW: ${when()}\n\nABOUT THEM:\n${who()}\n\nCHAT SO FAR:\n${hist}`
    const o = lastJson(claude(prompt, true))
    if (o) { reply = String(o.reply || reply); applyActions(o.actions, "chat-" + q.id) }
  }
  const after = loadChat()
  after.push({ id: q.id + "-r", role: "claude", text: reply, at: stamp(), channel: ch })
  saveChat(after, false)
}

function git(...a) { const r = spawnSync("git", a, { cwd: ROOT, encoding: "utf8" }); return (r.stdout || "") + (r.stderr || "") }
function pushAll(msg) {
  git("add", "-A")
  if (!git("status", "--porcelain").trim()) return
  git("commit", "-q", "-m", msg)
  for (let i = 0; i < 4; i++) {
    if (!/rejected|error|fatal/i.test(git("push", "-q", "origin", "HEAD:main"))) return
    git("pull", "--rebase", "-X", "theirs", "-q", "origin", "main")
  }
}

try { skipRest() } catch (e) { console.error(e) }
// oldest note first; keep going until ask/ is empty (notes can arrive while Claude is thinking)
for (let round = 0; round < 10; round++) {
  git("pull", "--rebase", "-q", "origin", "main")
  const dir = P("ask")
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort() : []
  if (!files.length) break
  for (const f of files) {
    let q = null; try { q = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) } catch { }
    fs.rmSync(path.join(dir, f), { force: true })
    try {
      if (q?.gym_session) setSession(String(q.gym_session), q.at ? String(q.at).slice(0, 19) : "")
      else if (q?.actions) applyActions(q.actions, "phone-" + f.replace(/.json$/, ""))
      else if (q?.say) answer({ say: String(q.say).trim(), id: String(q.id || Date.now().toString(36)), channel: String(q.channel || "") })
    } catch (e) { console.error(f, e) }
    pushAll("phone: answered in the cloud")
  }
}
