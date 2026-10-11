// Cœur de l'outil : aucune dépendance, fonctionne dans le navigateur ET dans Node.
// KML (Google My Maps, WGS-84) -> favoris Amap (pixels Web-Mercator zoom 20 sur GCJ-02)

// ---------------------------------------------------------------- MD5 (pur JS)
// WebCrypto n'a pas de MD5, et Amap l'utilise pour l'id des favoris.
export function md5(input) {
  const bytes = new TextEncoder().encode(input);
  const len = bytes.length;
  const total = (((len + 8) >>> 6) + 1) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, (len << 3) >>> 0, true);
  view.setUint32(total - 4, Math.floor(len / 2 ** 29), true);

  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const rotl = (x, s) => ((x << s) | (x >>> (32 - s))) >>> 0;

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[(i >> 4) * 4 + (i % 4)])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const hex = (n) => [0, 8, 16, 24].map((s) => ((n >>> s) & 0xff).toString(16).padStart(2, "0")).join("");
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

// ---------------------------------------------------------------- Coordonnées
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function transformLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return r;
}
function transformLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return r;
}

/** WGS-84 (Google/GPS) -> GCJ-02 (« Mars », utilisé par Amap). Hors Chine : identité. */
export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return { lng, lat };
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lng: lng + dLng, lat: lat + dLat };
}

/** lng/lat -> pixels Web-Mercator au zoom 20 (tuiles de 256 px), format point_x/point_y d'Amap. */
export function toAmapPixel(lng, lat) {
  const size = 256 * 2 ** 20;
  const clip = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const s = Math.sin((clip(lat, -85.0511287798, 85.0511287798) * PI) / 180);
  const x = ((clip(lng, -180, 180) + 180) / 360) * size;
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * PI)) * size;
  return { x: Math.round(clip(x, 0, size - 1)), y: Math.round(clip(y, 0, size - 1)) };
}

// ---------------------------------------------------------------- Parsing KML
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
function tagText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (cdata ? cdata[1] : decodeEntities(inner)).trim();
}
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li)>/gi, "\n")
      .replace(/<img[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extrait les repères ponctuels d'un KML (texte). Les lignes/polygones sont ignorés (listés dans `skipped`).
 * @returns {{places: {name, description, lng, lat, layer}[], skipped: {name, reason}[]}}
 */
export function parseKml(kmlText) {
  const places = [];
  const skipped = [];
  const stack = []; // noms de dossiers (couches My Maps) ; null pour <Document>
  const re = /<(Folder|Document)\b[^>]*>|<\/(Folder|Document)>|<Placemark\b[\s\S]*?<\/Placemark>/gi;
  let m;
  while ((m = re.exec(kmlText))) {
    const tok = m[0];
    if (tok.startsWith("</")) {
      stack.pop();
    } else if (/^<(Folder|Document)/i.test(tok)) {
      const head = kmlText.slice(re.lastIndex).split(/<(?:Placemark|Folder)\b/i)[0];
      stack.push(/^<Folder/i.test(tok) ? tagText(head, "name") || null : null);
    } else {
      const name = tagText(tok, "name");
      const point = tok.match(/<Point\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i);
      if (!point) {
        skipped.push({ name, reason: "pas un point (ligne ou polygone)" });
        continue;
      }
      const [lng, lat] = point[1].trim().split(/[,\s]+/).map(Number);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        skipped.push({ name, reason: "coordonnées illisibles" });
        continue;
      }
      const layer = [...stack].reverse().find(Boolean) || "";
      places.push({ name, description: htmlToText(tagText(tok, "description")), lng, lat, layer });
    }
  }
  return { places, skipped };
}

// ---------------------------------------------------------------- Conversion
/**
 * @param places sortie de parseKml
 * @param opts   { layers?: string[] } — ne garder que ces couches (par défaut toutes)
 */
export function convertPlaces(places, opts = {}) {
  const wanted = opts.layers && opts.layers.length ? new Set(opts.layers) : null;
  const seen = new Set();
  const favorites = [];
  const skipped = [];
  for (const p of places) {
    if (wanted && !wanted.has(p.layer)) continue;
    const name = p.name || "(sans nom)";
    const gcj = wgs84ToGcj02(p.lng, p.lat);
    const px = toAmapPixel(gcj.lng, gcj.lat);
    const id = md5(`${px.x}+${px.y}+${name}`);
    if (seen.has(id)) {
      skipped.push({ name, reason: "doublon" });
      continue;
    }
    seen.add(id);
    const now = Date.now() / 1000;
    favorites.push({
      id,
      type: 101,
      // Format observé sur un favori « épingle » réel (ditu.amap.com/ssr, oct. 2026)
      data: {
        item_id: id, poiid: "", name, custom_name: name, address: "", custom_address: "",
        type: "", classification: "8", version: "1", markerType: "marker-fav",
        point_x: String(px.x), point_y: String(px.y), x: px.x, y: px.y,
        lon: +gcj.lng.toFixed(14), lat: +gcj.lat.toFixed(14),
        cityCode: "", city_code: "", cityName: "", city_name: "", adcode: "",
        tag: p.layer, comment: p.description.slice(0, 500),
        phone_numbers: "", custom_phone_numbers: "", top_time: "",
        create_time: now.toFixed(3), parentID: "", childType: "", new_type: "", poiType: "",
        industry: "", floor: "", atag_cid: "", f_nona: "", towards_angle: "", end_poi_extension: "",
        entranceList: [], entrance_list: [],
      },
      source: { wgs_lng: p.lng, wgs_lat: p.lat, gcj_lng: +gcj.lng.toFixed(8), gcj_lat: +gcj.lat.toFixed(8) },
    });
  }
  return { favorites, skipped };
}

// ---------------------------------------------------------------- Script console
/**
 * Script à coller dans la console de https://ditu.amap.com/ssr/faves (connecté).
 * API observée en oct. 2026 : lecture GET /service/fav/getFav? ; écriture POST amap-pc-ssr.amap.com/ssr/api/cloudSync
 * avec { data:[{id,type:101,act:"c",data,ts}], ver } — synchro incrémentale (seuls les ajouts sont envoyés).
 */
export function buildConsoleScript(favorites) {
  const payload = favorites.map(({ id, type, data }) => ({ id, type, data }));
  return `(async () => {
  // ---- réglages ----
  const DRY_RUN = false;   // true = ne rien envoyer, juste vérifier. Passe à false pour importer pour de bon.
  const LIMIT = 0;        // nombre de favoris à traiter (0 = tous). Teste avec 2, puis mets 0.
  const CHUNK = 50;       // taille des lots envoyés
  // -------------------
  const all = ${JSON.stringify(payload)};
  const todo = LIMIT > 0 ? all.slice(0, LIMIT) : all;
  const SYNC_URL = "https://amap-pc-ssr.amap.com/ssr/api/cloudSync";

  const cookie = (n) => { const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : ""; };
  const findAdiu = () => {
    for (const st of [localStorage, sessionStorage]) for (let i = 0; i < st.length; i++) {
      const m = (st.getItem(st.key(i)) || "").match(/ssr[0-9a-f]{32}/); if (m) return m[0];
    }
    const m = document.cookie.match(/ssr[0-9a-f]{32}/); return m ? m[0] : "";
  };
  const csrf = cookie("x-csrf-token");
  const adiu = findAdiu();
  console.log("[import] csrf:", csrf ? "ok" : "ABSENT", "| x-adiu:", adiu ? "ok" : "ABSENT", "| à traiter:", todo.length, "/", all.length);

  const getVer = async () => {
    const r = await (await fetch("/service/fav/getFav?", { credentials: "include" })).json();
    if (String(r.status) !== "1") throw new Error("Lecture des favoris impossible (connecté ?) " + JSON.stringify(r).slice(0, 300));
    return { ver: r.data.ver, ids: new Set((r.data.items || []).map((i) => i.id)), n: (r.data.items || []).length, done: r.data.done };
  };

  let cur = await getVer();
  console.log("[import] favoris lus :", cur.n, "(done=" + cur.done + ") ver:", cur.ver);
  if (DRY_RUN) { console.log("[import] DRY_RUN : rien envoyé. Premier favori prêt :", JSON.stringify(todo[0]).slice(0, 600)); return; }

  const headers = { "content-type": "application/json", "accept": "application/json, text/plain, */*" };
  if (csrf) headers["x-csrf-token"] = csrf;
  if (adiu) headers["x-adiu"] = adiu;

  let sent = 0;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const ts = Math.floor(Date.now() / 1000);
    const data = todo.slice(i, i + CHUNK).map((f) => ({ id: f.id, type: 101, act: "c", data: f.data, ts }));
    const res = await fetch(SYNC_URL, { method: "POST", credentials: "include", headers, body: JSON.stringify({ data, ver: cur.ver }) });
    const text = await res.text();
    console.log("[import] lot", i / CHUNK + 1, "→ HTTP", res.status, text.slice(0, 300));
    if (!res.ok) throw new Error("Échec HTTP " + res.status);
    let j; try { j = JSON.parse(text); } catch { j = null; }
    if (j && j.status !== undefined && String(j.status) !== "1") throw new Error("Réponse d'erreur : " + text.slice(0, 500));
    sent += data.length;
    cur = await getVer(); // version fraîche pour le lot suivant
  }
  const found = todo.filter((f) => cur.ids.has(f.id)).length;
  console.log("[import] terminé. Envoyés:", sent, "| retrouvés dans la 1re page du serveur:", found, "(recharge la page pour voir)");
})().catch((e) => console.error("[import] ÉCHEC", e));`;
}

/** Raccourci : KML texte -> tout le résultat. */
export function kmlToAmap(kmlText, opts = {}) {
  const { places, skipped: notPoints } = parseKml(kmlText);
  const { favorites, skipped } = convertPlaces(places, opts);
  return {
    favorites,
    script: buildConsoleScript(favorites),
    skipped: [...notPoints, ...skipped],
    layers: [...new Set(places.map((p) => p.layer))],
  };
}
