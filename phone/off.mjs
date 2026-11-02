// Open Food Facts for the cloud chat, the only network the AI gets next to WebSearch when a photo arrives.
// node phone/off.mjs code 737628064502   or   node phone/off.mjs search mango protein drink
const [how, ...rest] = process.argv.slice(2), UA = { "User-Agent": "WidgetBoard/1.0" }
const FIELDS = "code,product_name,brands,quantity,serving_quantity,nutriments"
const slim = p => ({ code: p.code, name: p.product_name, brand: p.brands, pack: p.quantity, serving: p.serving_quantity, per100: { kcal: p.nutriments?.["energy-kcal_100g"], protein: p.nutriments?.proteins_100g, carbs: p.nutriments?.carbohydrates_100g, fat: p.nutriments?.fat_100g } })
const get = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json() }
try {
  if (how === "code") {
    const c = String(rest[0] || "").replace(/\D/g, ""), j = await get(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=${FIELDS}`)
    console.log(JSON.stringify(j.status === 1 ? slim({ code: c, ...j.product }) : { code: c, found: false }))
  } else if (how === "search") {
    const j = await get(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(rest.join(" "))}&search_simple=1&action=process&json=1&page_size=5&fields=${FIELDS}`)
    console.log(JSON.stringify((j.products || []).map(slim)))
  } else console.log("use: code DIGITS or search WORDS")
} catch (e) { console.log(JSON.stringify({ error: String(e.message || e) })) }
