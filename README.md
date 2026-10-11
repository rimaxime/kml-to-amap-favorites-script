# My Maps → favoris Amap

Convertit l'export **KML** d'une carte Google My Maps en un script à coller dans la console de `ditu.amap.com/faves`.

## Utilisation

**En ligne de commande** (Node ≥ 18, aucune dépendance) :

```bash
node bin/kml-to-amap.js ma_carte.kml -o dist/amap_import_console.js
node bin/kml-to-amap.js ma_carte.kml --layers "Restos,Randos"   # seulement certaines couches
```

**Dans le navigateur** : ouvrir `docs/index.html` via un petit serveur (`npx serve docs`), ou activer GitHub Pages sur le dossier `/docs`.

Puis : ouvrir https://ditu.amap.com/ssr/faves (connecté) → console (F12) → `allow pasting` si besoin → coller le script.
Le script démarre en **DRY_RUN** (rien n'est envoyé) avec `LIMIT = 2` : lance-le, vérifie, puis passe `DRY_RUN = false` pour tester 2 favoris, vérifie-les dans Amap, et enfin `LIMIT = 0` pour tout importer.

## Détails

- Export My Maps : ⋮ → *Exporter au format KML/KMZ* → cocher « Exporter vers un fichier .KML » (le KMZ zippé n'est pas géré).
- Chaque couche My Maps devient l'étiquette (`tag`) du favori ; la description va dans le commentaire.
- Seuls les repères ponctuels sont importés (lignes et polygones ignorés).
- Coordonnées : WGS-84 → GCJ-02 (hors Chine, aucun décalage) → pixels Web-Mercator zoom 20.
- Envoi par lots vers `amap-pc-ssr.amap.com/ssr/api/cloudSync` (synchro incrémentale : seuls les ajouts sont envoyés, tes favoris existants ne sont pas touchés). API interne observée en oct. 2026, susceptible de changer.
- Les favoris Amap n'ont pas de champ d'adresse issu de My Maps : l'adresse reste vide.

`npm test` lance les tests (MD5, conversion, parsing, et exécution du script généré dans un faux contexte Amap).
