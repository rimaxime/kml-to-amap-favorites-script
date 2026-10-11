#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { kmlToAmap } from "../docs/core.js";

const USAGE = `Usage : node bin/kml-to-amap.js carte.kml [-o dist/amap_import_console.js] [--layers "Couche 1,Couche 2"]

  -o, --output   Script généré (défaut : amap_import_console.js)
  -l, --layers   Ne garder que ces couches My Maps (séparées par des virgules)
  -h, --help     Aide
`;

const args = process.argv.slice(2);
let input, output = "amap_import_console.js", layers = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") { console.log(USAGE); process.exit(0); }
  else if (a === "-o" || a === "--output") output = args[++i];
  else if (a === "-l" || a === "--layers") layers = (args[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
  else if (!input) input = a;
  else { console.error(`Argument inconnu : ${a}\n${USAGE}`); process.exit(1); }
}
if (!input) { console.error(USAGE); process.exit(1); }

const text = readFileSync(input, "utf8");
if (text.startsWith("PK")) {
  console.error("Ce fichier est un KMZ (zip). Dans My Maps : ⋮ → Exporter au format KML/KMZ → cocher « Exporter vers un fichier KML ».");
  process.exit(1);
}
const { favorites, script, skipped, layers: found } = kmlToAmap(text, { layers });
const out = resolve(output);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, script, "utf8");

console.log(`Couches trouvées : ${found.map((l) => l || "(sans nom)").join(", ") || "aucune"}`);
console.log(`${favorites.length} favoris convertis, ${skipped.length} ignorés → ${out}`);
for (const s of skipped.slice(0, 10)) console.log(`  - ${s.name || "(sans nom)"} : ${s.reason}`);
if (skipped.length > 10) console.log(`  … et ${skipped.length - 10} autres`);
