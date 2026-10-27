// Runs phone/widget.js (written for Scriptable on iPhone) in a normal browser, so Android gets the same app.
// It provides the few Scriptable objects the app part uses, on top of web APIs:
//   Keychain and FileManager  -> localStorage on this phone (your token never leaves the browser except to GitHub)
//   Request                   -> fetch
//   WebView                   -> a full-screen iframe; links like widget://... come back through postMessage
//   Notification              -> a web notification while the app is open (browsers cannot schedule reliably)
// Nothing here is sent anywhere except api.github.com (your data repo) and api.open-meteo.com (weather).
(function () {
  const LS = window.localStorage
  const KP = "wb.kc.", FP = "wb.fs."

  const Keychain = {
    contains: k => LS.getItem(KP + k) !== null,
    get: k => { const v = LS.getItem(KP + k); if (v === null) throw new Error("Keychain: no " + k); return v },
    set: (k, v) => LS.setItem(KP + k, String(v)),
    remove: k => LS.removeItem(KP + k)
  }

  // a tiny file system in localStorage (only small JSON caches are written)
  const FileManager = {
    local: () => FileManager, iCloud: () => FileManager,
    documentsDirectory: () => "/docs",
    joinPath: (a, b) => (String(a).replace(/\/$/, "") + "/" + String(b).replace(/^\//, "")),
    fileExists: p => LS.getItem(FP + p) !== null || LS.getItem(FP + p + "/") !== null,
    createDirectory: p => LS.setItem(FP + p + "/", "dir"),
    readString: p => { const v = LS.getItem(FP + p); if (v === null) throw new Error("no file " + p); return v },
    writeString: (p, s) => { try { LS.setItem(FP + p, String(s)); LS.setItem(FP + p + "#t", String(Date.now())) } catch (e) { } },
    remove: p => { LS.removeItem(FP + p); LS.removeItem(FP + p + "#t") },
    modificationDate: p => new Date(Number(LS.getItem(FP + p + "#t") || 0))
  }

  class Request {
    constructor(url) { this.url = url; this.method = "GET"; this.headers = {}; this.body = undefined; this.timeoutInterval = 30; this.response = null }
    async _go() {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), this.timeoutInterval * 1000)
      try {
        const res = await fetch(this.url, { method: this.method, headers: this.headers, body: this.body, signal: ctl.signal, cache: "no-store" })
        this.response = { statusCode: res.status }
        return await res.text()
      } finally { clearTimeout(t) }
    }
    async loadString() { return this._go() }
    async loadJSON() { return JSON.parse(await this._go()) }
  }

  const Data = { fromString: s => ({ toBase64String: () => btoa(unescape(encodeURIComponent(s))) }) }

  class Alert {
    constructor() { this.title = ""; this.message = ""; this.fields = []; this.actions = []; this.values = [] }
    addTextField(ph, v) { this.fields.push({ ph, v: v || "", secure: false }) }
    addSecureTextField(ph, v) { this.fields.push({ ph, v: v || "", secure: true }) }
    addAction(t) { this.actions.push(t) }
    addCancelAction(t) { this.cancel = t }
    textFieldValue(i) { return this.values[i] || "" }
    // a small form on top of the app (setup: data repo and token)
    present() {
      return new Promise(done => {
        const box = document.createElement("div")
        box.style.cssText = "position:fixed;inset:0;z-index:9;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:20px"
        const card = document.createElement("form")
        card.style.cssText = "background:#1C1C21;color:#F2F2F7;border-radius:16px;padding:18px;max-width:380px;width:100%;font:15px system-ui,sans-serif"
        const h = document.createElement("b"); h.textContent = this.title; card.appendChild(h)
        const p = document.createElement("p"); p.textContent = this.message; p.style.cssText = "color:#A1A1AA;white-space:pre-wrap;font-size:13px"; card.appendChild(p)
        const ins = this.fields.map(f => { const i = document.createElement("input"); i.type = f.secure ? "password" : "text"; i.placeholder = f.ph || ""; i.value = f.v
          i.autocomplete = "off"; i.style.cssText = "display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:10px;border-radius:10px;border:0;background:#2A2A31;color:#F2F2F7;font:inherit"; card.appendChild(i); return i })
        const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:8px"; card.appendChild(row)
        const close = r => { this.values = ins.map(i => i.value); box.remove(); done(r) }
        const mk = (t, r, main) => { const b = document.createElement("button"); b.type = main ? "submit" : "button"; b.textContent = t
          b.style.cssText = "border:0;border-radius:10px;padding:9px 14px;font:inherit;" + (main ? "background:#4CCF7A;color:#000;font-weight:700" : "background:#2A2A31;color:#F2F2F7"); if (!main) b.onclick = () => close(r); row.appendChild(b) }
        if (this.cancel) mk(this.cancel, -1, false)
        this.actions.forEach((t, i) => i ? mk(t, i, false) : null)
        mk(this.actions[0] || "OK", 0, true)
        card.onsubmit = e => { e.preventDefault(); close(0) }
        box.appendChild(card); document.body.appendChild(box); if (ins[0]) ins[0].focus()
      })
    }
  }

  // the app page lives in an iframe; its links (widget://...) are handed to shouldAllowRequest like in Scriptable
  class WebView {
    constructor() {
      this.shouldAllowRequest = null
      this.frame = document.getElementById("app")
      window.addEventListener("message", e => {
        if (e.source !== this.frame.contentWindow || !e.data || typeof e.data.nav !== "string") return
        const u = e.data.nav
        const ok = this.shouldAllowRequest ? this.shouldAllowRequest({ url: u }) : true
        if (ok !== false && /^https?:/.test(u)) window.open(u, "_blank", "noopener")
      })
    }
    async loadHTML(html) {
      // links in the page go through nav(); here nav() posts them to this window instead of navigating
      html = String(html).replace("function nav(u){location.href=u}", "function nav(u){parent.postMessage({nav:u},'*')}")
      await new Promise(res => { this.frame.onload = () => res(); this.frame.srcdoc = html })
    }
    async evaluateJavaScript(js) { return this.frame.contentWindow.eval(js) }
    async present() { document.getElementById("boot").style.display = "none"; return new Promise(() => { }) }
  }

  class WebNotification {
    constructor() { this.title = ""; this.body = ""; this.at = null; this.openURL = "" }
    setTriggerDate(d) { this.at = d }
    async schedule() {
      // only works while the app stays open: browsers have no reliable scheduled notifications
      const show = () => { try { if (window.Notification && window.Notification.permission === "granted") new window.Notification(this.title, { body: this.body }) } catch (e) { } }
      try { if (window.Notification && window.Notification.permission === "default") await window.Notification.requestPermission() } catch (e) { }
      const ms = this.at ? this.at - Date.now() : 0
      if (ms < 2147483647) setTimeout(show, Math.max(0, ms))
    }
  }

  // widget drawing classes: only needed so the shared code loads; the Android app never draws Scriptable widgets
  class Color { constructor(hex, a) { this.hex = hex; this.alpha = a } static white() { return new Color("#FFFFFF") } static black() { return new Color("#000000") } }
  const Font = new Proxy({}, { get: () => size => ({ size }) })
  class Size { constructor(w, h) { this.width = w; this.height = h } }
  class Point { constructor(x, y) { this.x = x; this.y = y } }
  class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }) } }
  const params = Object.fromEntries(new URLSearchParams(location.search))
  window.ScriptableShim = {
    Keychain, FileManager, Request, Data, Alert, WebView, Notification: WebNotification, Color, Font, Size, Point, Rect,
    config: { runsInApp: true, runsInWidget: false, runsInAccessoryWidget: false, widgetFamily: null },
    args: { widgetParameter: null, queryParameters: params },
    Script: { complete() { }, setWidget() { } },
    URLScheme: { forRunningScript: () => location.origin + location.pathname },
    Timer: { schedule: (ms, repeat, fn) => { const id = repeat ? setInterval(fn, ms) : setTimeout(fn, ms); return { invalidate: () => repeat ? clearInterval(id) : clearTimeout(id) } } },
    Pasteboard: { paste: () => "" },
    Safari: { open: u => window.open(u, "_blank", "noopener") },
    Speech: { speak: t => { try { speechSynthesis.speak(new SpeechSynthesisUtterance(t)) } catch (e) { } } },
    Device: { screenSize: () => ({ width: window.innerWidth, height: window.innerHeight }) }
  }
})()
