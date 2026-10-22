# Übergabe an Claude: AR-Baukasten für Cadwork-Modelle

> **Für Claude (Claude Code o. ä.):** Diese Datei beschreibt vollständig, wie aus einem
> Cadwork-WebViewer-Export (eine große `.html`-Datei) eine **AR-Webapp** für Android/Chrome entsteht,
> mit der man ein Bauwerk 1:1 auf der Baustelle überblendet und über zwei Eckpunkte exakt am Bestand ausrichtet.
> Das Werkzeug liegt fertig im Ordner `tools/` (Python + eine HTML-Vorlage). **Du musst nichts neu entwickeln**,
> nur analysieren, konfigurieren, bauen, testen und veröffentlichen. Lies zuerst Abschnitt 1 und 2.

## 1. Was der Nutzer mitbringt und was du lieferst

| Eingabe | Beispiel |
|---|---|
| Export des Cadwork-WebViewers als **eine** HTML-Datei (5–50 MB) | `Projekt.html` |
| (optional) ein GitHub-Repository zum Veröffentlichen | `github.com/<org>/<repo>` |

**Ergebnis:** `index.html` (eine eigenständige Datei, ca. 5–10 MB, offlinefähig, three.js eingebettet) +
eine kurze Projekt-Konfiguration `tools/config/<projekt>.json`.

**Die App kann** (alles ist in `tools/app_template.html` bereits eingebaut):
- Vorschau mit Bauteil-Ebenen (einzeln schaltbar), Geschossen, Schnellvorgaben (z. B. „Tragwerk ohne Beplankung“),
  Seitenschnitt (Bauteile nur auf einer Seite wegnehmen), Höhenschnitt, Deckkraft, Kanten/Röntgen.
- **Schnellstart:** AR im Maßstab 1:1 oder 1:25 / 1:50 (Tisch), frei platzierbar und feinjustierbar.
- **Exakt einpassen:** Referenzwand des Bestands wählen (Anbauwand, Rückwand, Seitenwand links/rechts, mit Grundrisskarte),
  die zwei Außenecken (A, B) vor Ort anvisieren → das Modell sitzt maßgenau am Bestand. Anzeige der Abweichung in cm.
- **Tisch-Modus:** Kamerabild + Kreisel (ohne WebXR), für Geräte, auf denen WebXR nicht darstellt.
- Fotorealistische Texturen aus dem Export (Holz längs/Hirnholz, Ziegel, OSB, Beton, Lehm …).

## 2. Ablauf in 7 Schritten

```text
Arbeitsordner = Repo-Wurzel (enthält tools/, index.html, README.md …)
Python 3 mit: pip install numpy pillow          Node (nur für Tests): npm install playwright iwer
```

1. **Export ablegen**, nicht ins Repo committen (vertraulich, groß). Pfad merken, z. B. `~/export/Projekt.html`.
2. **Analysieren**
   ```bash
   python3 tools/build_app.py analyze ~/export/Projekt.html --write-config tools/config/projekt.json
   ```
   Ausgabe: Bauteilnamen, Anzahl, Geschosse, Medianmaße, verwendete Texturen, Ausdehnung (Warnung bei mm statt m).
   Der Entwurf schlägt `altbau_names` über Stichwörter vor (Ziegel, Mauer, Stein, Beton, Fundament, Bestand …).
3. **Mit dem Nutzer klären** (kurz, gesammelt per Frage, wenn nicht eindeutig):
   1. Welche Bauteile sind **Bestand** (`altbau_names`) und welche **Neubau**?
   2. Welche Bauteile sind **Verkleidung** (`cladding_names`, z. B. Beplankung/Schalung; für die Vorgabe „Tragwerk ohne …“)?
   3. Welche Bauteile sollen **einfarbig** bleiben (`plain_names`)? Standard: die Verkleidung.
   4. Welche Bauteile sind **Wände/Platten** (`wallmap_names`, Texturprojektion auf Weltachsen statt Faserrichtung)?
   5. Reihenfolge der Geschosse (`floor_order`) und Bezeichnungen (`labels.alt`, `labels.neu`, `title`).
   6. **Referenz** (`reference`): Welche Bauteile bilden die Außenwände des Bestands (`altbau_names`) und welche den
      Grundriss des Neubaus (`neubau_names`), jeweils in welchem Geschoss (`*_floor`, meist `"EG"`)?
4. **Konfiguration ausfüllen** (Schema in Abschnitt 4) und **bauen**
   ```bash
   python3 tools/build_app.py build ~/export/Projekt.html tools/config/projekt.json -o index.html
   ```
   Achte auf die Ausgabezeilen: Ebenen/Vertices/Texturen, `Referenz: {...}` (Rechteck des Bestands) und eine
   eventuelle **WARNUNG zum Projektnamen** (Anonymisierung, siehe 6).
5. **Testen** (Pflicht, ca. 1 Minute)
   ```bash
   cd tools/tests && npm install playwright iwer && node run_tests.js ../../index.html
   ```
   Alle Zeilen müssen `OK` sein. Prüft: Ebenen/Texturen, vier Referenzwände, Maßstab 1:1 (1 m = 1,000 m), Zwei-Punkt-Ausrichtung,
   Tisch-Modus, AR-Ablauf im simulierten WebXR, keine JS-Fehler. Eigene Sichtprüfung: Seite in Playwright öffnen, Screenshot
   ansehen (Ziegel sichtbar? Holz mit Maserung? Grundrisskarte plausibel, richtige Wand hervorgehoben?).
6. **Veröffentlichen** (nur mit Zustimmung des Nutzers, siehe 6): `index.html` ins Repo, GitHub Pages aktivieren
   (Settings → Pages → Deploy from branch → `main` / root). Danach den Link mit `?v=<Zahl>` ausgeben (umgeht den Browser-Cache).
7. **Bedienungsanleitung** (`BEDIENUNGSANLEITUNG.md`) an Projekt anpassen (Namen der Wände/Bauteile, Link) und ausgeben.

## 3. Entscheidungen, die du dem Nutzer nicht zumuten solltest (Standard verwenden)

- **Einheit/Achsen:** Meter, Y oben (Cadwork-WebViewer-Standard). `analyze` warnt bei auffälliger Ausdehnung.
- **Kachelgrößen** der Texturen: `tools/config/tiles_default.json` (bekannte Cadwork-Datenbank-Bilder `cwdbimg_*`),
  sonst `tile_default` = 1 m × 1 m. Wirkt eine Textur zu groß/klein, in `config.tiles` den Bildschlüssel mit `[u_m, v_m]` setzen.
- **Farben:** `colors[name]`, sonst Durchschnittsfarbe der Textur, sonst Standardfarbe.
- **Kompatibilitätsmodus** (AR-Zeichnen im DOM-Overlay) ist **Standard an**. Grund: Auf manchen Android-Geräten wurde die
  normale WebXR-Ebene nicht dargestellt (Ring/Würfel fehlten), das Overlay immer. Nicht ändern, ohne Gerätetest.
- **Maße der Eckpunkte:** Außenkanten der Bestandswände am Wandfuß (`ref.y` = tiefste Unterkante der EG-Wand).
- `?debug` an der URL zeigt Hilfsobjekte (Testwürfel, Mittelsäule) und Diagnosewerte.

## 4. Konfigurationsschema (`tools/config/<projekt>.json`)

```jsonc
{
  "title": "Holzbau AR",                      // Seitentitel (Browser-Tab), neutral halten
  "public_name": "Modell",                    // Name im Modell-JSON; NIE den echten Projektnamen verwenden
  "labels": { "alt": "Altbau", "neu": "Holzbau" },   // erscheinen in der Oberfläche
  "altbau_names": ["Vollziegel", "Lehmstein", "Wand-003"],  // Bestand; alles andere = Neubau
  "plain_names": ["Beplankung"],              // einfarbig statt Foto-Textur
  "cladding_names": ["Beplankung"],           // Vorgabe „Tragwerk (ohne …)“
  "wallmap_names": ["Vollziegel", "Lehmstein", "Wand-003", "Platte"],  // Projektion auf Weltachsen
  "floor_order": ["UG / Fundament", "EG", "Geschoss 1", "OG", "Dachboden"],
  "colors": { "Wandstiel": "#e0b060" },       // optional
  "tiles": { "cwdbimg_121": [1.2, 0.5] },     // optional, Meter pro Kachel
  "tile_default": [1.0, 1.0],
  "reference": { "altbau_names": ["Vollziegel"], "altbau_floor": "EG",
                 "neubau_names": ["Wandstiel"], "neubau_floor": "EG" },
  "texture_max_px": 512                       // Bildgröße der eingebetteten Fotos (Größe der Seite!)
}
```

Die Referenz bestimmt das **Rechteck des Bestands** (Außenwände) und den **Grundriss des Neubaus**. Die App erkennt
automatisch die „Anbauseite“ (dort ragt der Neubau am weitesten über den Bestand hinaus), benennt die vier Wände aus Sicht
vom Neubau (Anbauwand, Rückwand, Seitenwand links/rechts) und belegt A/B mit den beiden Außenecken (von außen gesehen A = links, B = rechts).
**Annahme:** Der Bestand ist ein achsparalleles Rechteck. Bei schräg gestellten oder L-förmigen Gebäuden muss die Referenz
angepasst werden (siehe 7).

## 5. Technik in Kürze (für Fehlersuche)

- `tools/build_app.py` liest die Export-Datei (Format im Kopf des Skripts), schreibt je (Typ, Geschoss, Bauteil, Textur-ID)
  eine **Ebene** (Positionen, Indizes, UVs, Kanten) als Base64 in ein JSON und setzt dies samt `vendor/three.min.js`
  (three.js r160, MIT-Lizenz in `vendor/three.LICENSE`) in `app_template.html` ein.
- UV-Berechnung: Holz = Hauptachsenanalyse (Faser = längste Achse), Fläche je nach Normale in eine der drei Ebenen projiziert;
  Wände = Weltachsen. Textur-ID steht in `materialRefs[4]` jedes Teilkörpers (Längs- und Hirnholz sind getrennte Teilkörper).
- `tools/app_template.html`: eine Datei mit CSS/JS. Wichtige Bereiche: Laden, Ebenen-UI, Referenzwände, Fixpunkte,
  Ausrichtung (`applyAlignment`), AR (`startAR`, `ovlFrame`, `arTick`), Tisch-Modus, Hauptschleife.
- **Ausrichtung:** Aus Modellpunkten A,B und Realpunkten a,b: Drehung um die Hochachse = Winkel(a→b) − Winkel(A→B),
  Verschiebung so, dass A auf a liegt; Maßstab nur wenn „Maßstab aus Punkten“ aktiv. Höhe von A wird auf die Höhe von a gesetzt.

## 6. Fallstricke, die wir schon gelöst haben (nicht wieder hineinlaufen)

1. **Cache:** Android-Chrome zeigt gern alte Versionen. Immer `?v=<n>` an den Link hängen; die Seite zeigt „Version N“ in der Statuszeile.
2. **WebXR-Ebene unsichtbar** auf manchen Geräten → Kompatibilitätsmodus (Zeichnen im DOM-Overlay, WebXR nur fürs Tracking). Fadenkreuz
   und Canvas müssen **innerhalb** des DOM-Overlay-Elements `#ui` liegen, sonst unsichtbar.
3. **HTTPS-Pflicht** für WebXR/Kamera → GitHub Pages (öffentliches Repo oder bezahlter Plan) oder z. B. Netlify Drop. `localhost` per `adb reverse` geht auch.
4. **Anonymisierung:** Projektname/Auftraggeber/Autor-E-Mail stehen sonst in `<title>`, Modell-JSON, README und im Git-Autor.
   Vorgehen: neutrale `config.title/public_name`, Build-Warnung beachten, Commits mit neutralem Autor, und **vor** dem öffentlichen
   Schalten die Historie prüfen (`git log --format='%an <%ae>'`, `grep -ri <projektname>`). Das Original-HTML nie committen.
5. **Force-Push/Historie** nur nach ausdrücklicher Freigabe des Nutzers.
6. **Dunkelheit** verschlechtert ARCore-Tracking (kein Ring, Drift). Für Tests Licht an; auf der Baustelle ruhig und langsam schwenken.
7. **Größe:** Seite wird durch Texturen groß; `texture_max_px` senken (256) falls nötig. Mehr als ~100 Ebenen belasten ältere Handys (Zeichenaufrufe).
8. **Zielring unsichtbar trotz „Fläche erkannt“:** Die vom Gerät gelieferte Orientierung der Trefferfläche ist unzuverlässig (kann „auf dem Kopf“
   stehen → Ring wird bei einseitigem Material weggeschnitten). Deshalb nur die **Position** des Treffers verwenden, Ring waagerecht,
   `DoubleSide`, `frustumCulled = false`. Wirkung nie nur am Zustand (`reticle.visible`) prüfen, sondern an gezeichneten Pixeln (steht in `run_tests.js`).
   Außerdem: Jeder Frame im Overlay-Modus ist in `try/catch`, damit ein Fehler nicht das gesamte Zeichnen stoppt; Fehler erscheinen in der Statuszeile.
9. Reihenfolge der Dateien im Repo: `index.html` im Wurzelverzeichnis (Pages), `tools/` daneben.

## 7. Wenn das neue Modell nicht ins Schema passt

| Problem | Maßnahme |
|---|---|
| Ausdehnung wirkt wie Millimeter | Export in Metern erneut erzeugen lassen; sonst in `build_app.py` die Positionen mit 0.001 skalieren (Positionen, `ref`, Tests anpassen) |
| Bestand nicht rechteckig/schräg | `reference.altbau_names` auf die tatsächlich maßgebenden Außenwände einschränken; für beliebige Grundrisse in `app_template.html` die Funktion `buildWalls()` auf Polygonkanten erweitern |
| Neubau hat keine Texturen im Export | `plain_names` füllen oder `colors` setzen; die App funktioniert ohne Fotos |
| Zu viele Ebenen (Geschoss × Bauteil × Textur) | Geschosse in `floor_order` zusammenfassen ist nicht vorgesehen; stattdessen kleinere Bauteilmenge exportieren |
| Anderes Exportformat (IFC/OBJ) | Nicht Teil dieses Baukastens; `Export` in `build_app.py` ersetzen (liefert `elements`, `shapes`, `decode`) |

## 8. Abnahmekriterien („fertig“, wenn alle ✔)

- ✔ `run_tests.js` komplett grün; Screenshots der Vorschau und der Referenzkarte angesehen.
- ✔ Kein interner Projektname/keine private E-Mail in `index.html`, README, Konfiguration und Git-Historie.
- ✔ Link mit `?v=` ausgegeben, Nutzer weiß: Android + Chrome + ARCore + HTTPS.
- ✔ Bedienungsanleitung angepasst übergeben.
- ✔ Offen gebliebene Annahmen (Bestand/Neubau, Verkleidung, Referenzwände) dem Nutzer genannt.
