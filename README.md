# My Maps → Amap favorites

Converts a **KML** export of a Google My Maps map into a script you paste into the console of `ditu.amap.com/ssr/faves`, adding your places to your Amap (Gaode) favorites.

**Live page (no install needed):** https://rimaxime.github.io/kml-to-amap-favorites-script/

Everything runs in your browser: your KML file is never uploaded anywhere.

## Usage

### Option 1 — Web page (easiest)

1. Export your map from My Maps: ⋮ next to the map title → *Export to KML/KMZ* → tick “Export to a .KML file instead” (zipped KMZ is not supported).
2. Open https://rimaxime.github.io/kml-to-amap-favorites-script/, drop the `.kml` file, pick the layers you want, and click **Generate script**.
3. Click **Copy** (or **Download .js**).
4. Follow the import steps below.

### Option 2 — Command line (Node ≥ 18, no dependencies)

```bash
node bin/kml-to-amap.js my_map.kml -o dist/amap_import_console.js
node bin/kml-to-amap.js my_map.kml --layers "Restaurants,Hikes"   # only some layers
```

To run the web page locally: `npx serve docs` (opening `index.html` directly does not work, browsers block ES modules from `file://`).

## Importing into Amap

1. Open https://ditu.amap.com/ssr/faves and sign in.
2. Open the browser console (`F12`, or `Ctrl/Cmd+Shift+J`).
3. If pasting is blocked, type `allow pasting` and press Enter.
4. Paste the script and press Enter. It starts as a **dry run** (`DRY_RUN = true`, `LIMIT = 2`): nothing is sent, it only checks that it can read your favorites and shows the first item it would create.
5. Set `DRY_RUN = false` (keeping `LIMIT = 2`) to import 2 favorites, and check them in Amap.
6. Set `LIMIT = 0` to import everything, then reload the page.

## Details

- Each My Maps layer becomes the favorite's `tag`; the placemark description goes into the comment.
- Only point placemarks are imported (lines and polygons are ignored). Duplicates (same name and position) are skipped.
- Coordinates: WGS-84 → GCJ-02 (no shift outside China) → Web-Mercator pixels at zoom 20, the format Amap uses for `point_x` / `point_y`. Favorite ids are `md5(point_x + "+" + point_y + "+" + name)`; both were checked against real Amap favorites.
- Favorites are sent in batches to `amap-pc-ssr.amap.com/ssr/api/cloudSync`. The sync is incremental: only the new favorites are sent, your existing ones are not touched.
- My Maps has no address field, so the address of imported favorites stays empty.

## Caveats

- This relies on Amap's **internal web API** (observed in October 2026), which is undocumented and may change or stop working at any time.
- The favorite format was modeled on a custom pin created in the Amap web app; always run the dry run and the 2-favorite test first.
- Use at your own risk, on your own account.

## Development

```bash
npm test
```

Runs the tests: MD5, coordinate conversion, KML parsing, and execution of the generated script against a mocked Amap page.

The core logic lives in `docs/core.js` (no dependencies, works in the browser and in Node); the CLI (`bin/`) and the web page (`docs/index.html`) both use it. GitHub Pages is served from the `/docs` folder.