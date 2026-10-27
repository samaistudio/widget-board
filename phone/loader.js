// Widget Board loader for Scriptable (iPhone). Paste this ONCE as a new Scriptable script named "Widget Board".
// It runs the newest phone/widget.js from GitHub, so updates arrive on their own, and keeps the last good copy for when
// there is no connection. Your data repo and token stay in this phone's Keychain. See IPHONE-SETUP.md.
// CODE: where the app code comes from. Leave it, or point it at your own fork ("you/widget-board").
const CODE = "samzeidi/widget-board", LKEY = "board_token", LREPO = "board_repo"
const lfm = FileManager.local(), ldir = lfm.joinPath(lfm.documentsDirectory(), "widget-board"), lfile = lfm.joinPath(ldir, "widget.js")
if (!lfm.fileExists(ldir)) lfm.createDirectory(ldir)
// first run: your private data repo ("you/board-data") and a fine-grained token for it
if (config.runsInApp && (!Keychain.contains(LREPO) || !Keychain.contains(LKEY))) {
  const a = new Alert(); a.title = "Widget Board setup"
  a.message = "1. Your private data repo, as owner/name (for example you/board-data).\n2. A fine-grained GitHub token for that repo only, with Contents: Read and write.\nBoth stay in this phone's Keychain."
  a.addTextField("owner/name", Keychain.contains(LREPO) ? Keychain.get(LREPO) : "")
  a.addSecureTextField("github_pat_...", "")
  a.addAction("Save"); a.addCancelAction("Cancel")
  if (await a.present() === 0) {
    const r = a.textFieldValue(0).trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, ""), t = a.textFieldValue(1).trim()
    if (/^[\w.-]+\/[\w.-]+$/.test(r)) Keychain.set(LREPO, r)
    if (t) Keychain.set(LKEY, t)
  }
}
let lcode = ""
try {
  // the app code is public, so it needs no token; cache-buster so the lock screen never gets an old copy
  const r = new Request(`https://raw.githubusercontent.com/${CODE}/main/phone/widget.js?t=${Date.now()}`)
  r.headers = { "Cache-Control": "no-cache" }
  r.timeoutInterval = config.runsInApp ? 15 : 5
  const s = await r.loadString()
  if (r.response?.statusCode === 200 && s.length > 1000) { lcode = s; lfm.writeString(lfile, s) }
} catch (e) { }
if (!lcode && lfm.fileExists(lfile)) lcode = lfm.readString(lfile)
try {
  if (lcode) await new (Object.getPrototypeOf(async function () { }).constructor)(lcode)()
  else if (config.runsInWidget) { const w = new ListWidget(); w.addText("Open Widget Board once to set it up"); Script.setWidget(w) }
  else { const a = new Alert(); a.title = "Widget Board"; a.message = "Could not load the app. Check the connection, then run again."; a.addAction("OK"); await a.present() }
} catch (e) {
  // show the error instead of keeping the old picture
  if (config.runsInWidget) { const w = new ListWidget(); w.addText(`Widget Board error ${e.line || ""}: ${e.message}`); Script.setWidget(w) }
  else { const a = new Alert(); a.title = "Widget Board error"; a.message = `${e.line || ""}: ${e.message}`; a.addAction("OK"); await a.present() }
}
Script.complete()
