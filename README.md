# 3dHolzbau – AR-Viewer und AR-Baukasten

Eine **eigenständige Webseite** (`index.html`, three.js eingebettet) zeigt ein Cadwork-Modell (Bestand und Neubau getrennt, nach Bauteilen
und Geschossen schaltbar) und blendet es auf Android (Chrome + ARCore) im Maßstab 1:1 über die Baustelle. Über zwei Außenecken des Bestands
wird das Modell maßgenau ausgerichtet.

| Datei | Inhalt |
|---|---|
| `index.html` | die fertige App (per GitHub Pages / HTTPS öffnen) |
| `BEDIENUNGSANLEITUNG.md` | Anleitung für Anwender |
| `UEBERGABE_FUER_CLAUDE.md` | Übergabedatei: so entsteht dieselbe App aus einem anderen Cadwork-Export |
| `tools/` | Baukasten: `build_app.py`, `app_template.html`, `config/`, `vendor/three.min.js` (MIT), `tests/` |
| `AR-Baukasten.zip` | alles Wichtige als Paket zum Weitergeben |

**Neues Modell in drei Schritten:** `python3 tools/build_app.py analyze Export.html --write-config tools/config/neu.json` →
Konfiguration prüfen → `python3 tools/build_app.py build Export.html tools/config/neu.json -o index.html`.
Details und Prüfschritte: `UEBERGABE_FUER_CLAUDE.md`.
