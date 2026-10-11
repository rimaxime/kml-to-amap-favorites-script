import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { md5, wgs84ToGcj02, toAmapPixel, kmlToAmap } from "../docs/core.js";

// MD5 identique à node:crypto (y compris UTF-8 et longueurs aux limites de bloc)
for (const s of ["", "a", "abc", "Café & Thé", "北京", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000)]) {
  assert.equal(md5(s), createHash("md5").update(s).digest("hex"), `md5(${s.slice(0, 10)})`);
}

// GCJ-02 : décalage connu à Pékin (~ +0.005° lng, +0.001° lat) ; identité hors de Chine
const bj = wgs84ToGcj02(116.3912757, 39.9075017);
assert.ok(Math.abs(bj.lng - 116.3912757 - 0.0053) < 0.001 && Math.abs(bj.lat - 39.9075017 - 0.0012) < 0.001, JSON.stringify(bj));
assert.deepEqual(wgs84ToGcj02(2.2945, 48.8584), { lng: 2.2945, lat: 48.8584 });

// Pixels : (0,0) lng/lat -> centre de la carte zoom 20
assert.deepEqual(toAmapPixel(0, 0), { x: 128 * 2 ** 20, y: 128 * 2 ** 20 });

// KML d'exemple
const kml = readFileSync(new URL("../examples/sample.kml", import.meta.url), "utf8");
const r = kmlToAmap(kml);
assert.deepEqual(r.layers, ["Pékin", "Paris"]);
assert.equal(r.favorites.length, 3); // 2 Pékin + 1 Paris (doublon et ligne ignorés)
assert.equal(r.skipped.length, 2);
const names = r.favorites.map((f) => f.data.name);
assert.ok(names.includes("Café & Thé"));
assert.equal(r.favorites.find((f) => f.data.name === "Tiananmen").data.comment, "Place centrale\nOuvert tous les jours");
assert.equal(kmlToAmap(kml, { layers: ["Paris"] }).favorites.length, 1);

// Exécution du script généré dans un faux contexte Amap (fetch + cookies + storage)
const sent = [];
const makeCtx = () => {
  const ctx = {
    console,
    document: { cookie: "a=1; x-csrf-token=abc%3Aet2" },
    localStorage: { length: 1, key: () => "k", getItem: () => "x ssr31acbea2d4e1dd4c9bdaab7da1dd2692" },
    sessionStorage: { length: 0 },
    Date, JSON, Math, Set, Promise, RegExp, decodeURIComponent, String, Error,
    fetch: async (url, init = {}) => {
      if (String(url).includes("getFav")) {
        const body = JSON.stringify({ status: 1, data: { ver: "v" + sent.length, done: true, items: [{ id: "old" }, ...sent.flatMap((b) => b.data.map((d) => ({ id: d.id })))] } });
        return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
      }
      sent.push({ url, init, ...JSON.parse(init.body) });
      return { ok: true, status: 200, text: async () => '{"status":1}' };
    },
  };
  return ctx;
};
// DRY_RUN par défaut : rien d'envoyé
await vm.runInNewContext(r.script, makeCtx());
assert.equal(sent.length, 0);
// Envoi réel (2 favoris, LIMIT=2 -> on passe à 0 pour tout envoyer), lots de 2
const live = r.script.replace("DRY_RUN = true", "DRY_RUN = false").replace("LIMIT = 2", "LIMIT = 0").replace("CHUNK = 50", "CHUNK = 2");
await vm.runInNewContext(live, makeCtx());
assert.equal(sent.length, 2); // 3 favoris en lots de 2
assert.equal(sent[0].url, "https://amap-pc-ssr.amap.com/ssr/api/cloudSync");
assert.equal(sent[0].init.headers["x-csrf-token"], "abc:et2");
assert.equal(sent[0].init.headers["x-adiu"], "ssr31acbea2d4e1dd4c9bdaab7da1dd2692");
assert.equal(sent[0].ver, "v0");
assert.equal(sent[1].ver, "v1"); // version rafraîchie entre les lots
assert.equal(sent[0].data[0].act, "c");
assert.equal(sent.flatMap((b) => b.data).length, 3);

// Cohérence avec de vrais favoris Amap (oct. 2026)
assert.deepEqual(toAmapPixel(116.565052, 40.431668), { x: 221134930, y: 101202553 });
assert.equal(md5("221134930+101202553+慕田峪长城"), "315d60e9d4c2b769ffa5a4aa5cafdaa6");

console.log("Tous les tests passent ✔");
