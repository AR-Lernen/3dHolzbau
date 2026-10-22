# 3dHolzbau – AR-Überblendung

`index.html` ist eine einzelne, offlinefähige Seite (three.js eingebettet). Sie zeigt das Holzbau-Modell (Altbau/Holzbau getrennt, nach Geschoss schaltbar) und blendet es per WebXR (Android, Chrome + ARCore) über die Baustelle.

**Nutzung:** Seite über HTTPS öffnen (GitHub Pages) → im Modell Fixpunkt A (und B) antippen → „AR starten“ → vor Ort die Punkte anvisieren und „setzen“ → Feinjustage.

`src/` enthält die Build-Skripte (`build_model.py` extrahiert die Geometrie aus dem Modell-Export, `build.py` erzeugt `index.html`).
