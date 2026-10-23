# Bedienungsanleitung: AR-Viewer für Bestand und Neubau

Mit dem AR-Viewer legst du das 3D-Modell (Altbau und Holzbau) im Maßstab 1:1 über die echte Baustelle
und siehst es mit der Handykamera. Über zwei Eckpunkte am Bestand richtest du das Modell maßgenau aus.

**Du brauchst:** ein Android-Handy mit **Chrome** und **ARCore** (im Play Store „Google Play-Dienste für AR“ aktuell halten),
Kamerafreigabe und eine Internetverbindung beim ersten Laden. Die Daten bleiben im Browser, nichts wird hochgeladen.

> Wichtig: Der Viewer dient der **Visualisierung**, er ersetzt kein Aufmaß. ARCore-Tracking hat typischerweise Abweichungen
> von einigen Zentimetern. Prüfe Maße kritischer Anschlüsse immer am Bau.

---

## 1. Starten

1. Link in **Chrome** öffnen, z. B. `https://<organisation>.github.io/<repo>/?v=1`.
   Das `?v=…` verhindert, dass Chrome eine alte Version aus dem Zwischenspeicher zeigt. Oben steht „Version N“.
2. Beim ersten Mal erscheint die Kamerafrage → **Zulassen**.
3. Du siehst die 3D-Vorschau. **1 Finger** dreht das Modell, **2 Finger** zoomen und verschieben.

## 2. Ebenen: was wird gezeigt

Tippe oben rechts auf **Ebenen**.

| Bereich | Bedeutung |
|---|---|
| **Alles / Nur Holzbau / Tragwerk (ohne Beplankung) / Nur Altbau** | Schnellvorgaben |
| **Altbau, Holzbau** (Bauteilliste) | Jedes Bauteil einzeln ein-/ausblenden (Haken) |
| **✂** neben einem Bauteil | Dieses Bauteil wird auf der gewählten Seite aufgeschnitten (siehe unten) |
| **Geschosse** | EG, OG … ein- und ausblenden |
| **Seite aufschneiden** | Seite wählen (−X, +X, −Z, +Z) und mit **Tiefe** festlegen, wie weit der Schnitt reicht |
| **Deckkraft** | Wie durchsichtig die Flächen sind (60 % ist Standard) |
| **Schnitt oben** | Alles über einer Höhe ausblenden |
| **Kanten / Röntgen** | Kantenlinien an/aus; „Röntgen“ zeigt alle Kanten auch durch Bauteile |

**Beispiel „Beplankung auf einer Seite weg“:** ✂ bei *Beplankung* antippen → Seite wählen → Tiefe schieben.
Die Beplankung verschwindet nur dort, das Tragwerk bleibt sichtbar.

## 3. Schnellstart: Modell 1:1 ansehen

1. In der Vorschau **„Schnellstart: Modell 1:1 in AR ansehen“**. (Der Haken *Kompatibilitätsmodus* sollte an bleiben.)
2. Handy ein paar Sekunden **ruhig** halten, dann **langsam** schwenken, damit ARCore die Umgebung erkennt.
3. Das Modell steht im Maßstab 1:1 mit der Gebäudemitte an deinem Standort.
   - **Modell vor mich setzen** – stellt es einige Meter vor dich.
   - **Auf Fläche setzen** – tippen, dann den weißen **Ring** auf den Boden richten und **Hier absetzen** tippen.
   - Pfeile, **Höhe ▲▼**, **↺ ↻ drehen** – feinjustieren; die Mitteltaste (1 cm / 5 cm / 2 mm) wählt die Schrittweite.
4. **Maßstab:** *1:1*, *1:25*, *1:50* (z. B. Modell auf den Tisch). *−5 % / +5 %* nur zum Ausprobieren.

## 4. Exakt einpassen (maßgenau am Bestand)

Der Holzbau wird am Bestand ausgerichtet. Dazu misst du zwei Außenecken des Altbaus ein.

1. Im Schnellstart auf **„Exakt einpassen“**.
2. Es erscheint eine **Grundrisskarte**: Altbau (Rechteck), Holzbau (gestrichelt) und vier Wände:
   **Anbauwand** (hier setzt der Holzbau an), **Rückwand** (gegenüber), **Seitenwand links / rechts** (vom Holzbau aus gesehen).
3. **Wand wählen.** Für die beste Genauigkeit eine **lange Wand** nehmen (Anbauwand oder Rückwand). Je weiter A und B auseinanderliegen, desto genauer.
4. Die App sagt dir, wohin du zielen sollst, z. B. *„Punkt A · Anbauwand: Ecke Seitenwand links / Anbauwand – Außenecke am Boden (Wandfuß)“*.
   Eine kleine Karte oben zeigt A und B. **Von außen auf die Wand gesehen ist A die linke, B die rechte Ecke.**
5. Fadenkreuz und Ring genau auf die **Außenecke am Boden** richten → **„Punkt A am Bau setzen“**. Dann zur zweiten Ecke gehen → **„Punkt B am Bau setzen“**.
   - **Weißer Ring:** ARCore hat dort eine Fläche oder einen Punkt erkannt.
   - **Oranger Ring:** Dort ist noch nichts erkannt; die App verlängert den Zielstrahl bis zur bekannten Bodenhöhe („Boden geschätzt“).
     Das funktioniert auf ebenem Gelände gut. Am genauesten wird es, wenn du vorher kurz den Boden um dich herum abfährst und
     die Ecke aus 2–4 m Entfernung schräg von oben anvisierst. Bei Gefälle die Höhe danach mit **„Höhe ▲▼“** korrigieren.
6. Das Modell sitzt. Oben stehen *„Modell A–B … m · vor Ort … m · Δ … cm“*: Δ ist die Abweichung zwischen Modell- und gemessenem Abstand.
   Klein (wenige cm) = gut. Groß = Ecken nicht genau getroffen oder Tracking ungenau → **„Neu einpassen“**.
7. Feinjustage mit Pfeilen, Höhe und Drehen. Der Haken **„Maßstab aus Punkten“** passt die Größe an den gemessenen Abstand an (nur wenn du dem Messwert vertraust).

**Eigene Punkte:** Statt einer Referenzwand kannst du *„Eigene Punkte im Modell wählen“*. Dann zielst du erst auf eine Modellecke, dann auf die echte.
**Vorab am Schreibtisch:** In der Vorschau Referenzwand oder Punkte A/B wählen und danach **„Mit Fixpunkten starten“**; vor Ort setzt du nur noch die echten Punkte.

## 5. AR-Tisch 1:50 (fest auf dem Tisch)

Button **„AR-Tisch 1:50 – fest auf dem Tisch“**: Das Handy langsam über den Tisch bewegen, bis der weiße Ring erscheint,
dann **„Hier absetzen“**. Das Modell steht danach fest auf dem Tisch – du kannst um den Tisch herumgehen.
Mit *1:25* wird es größer.

**Gesten** (im Schnellstart und beim AR-Tisch): Mit dem Umschalter **Finger: ✋ Verschieben | ⟳ Drehen** wählst du, was ein Finger tut.
*Verschieben*: Finger auf dem Bild ziehen, das Modell folgt. *Drehen*: Finger um das Modell herumführen, es dreht sich mit.
Auch zwei Finger drehen das Modell. Sicher funktioniert immer der Regler **Drehung** (−180° … 180°); für kleine Korrekturen gibt es Pfeile und **↺ ↻**.

**🔒 Fixieren:** Steht das Modell richtig, tippe *Fixieren*. Danach lässt es sich weder verschieben noch drehen, und die Stellelemente verschwinden.
**🔓 Lösen** gibt es wieder frei.
Nach dem *Exakt einpassen* sind die Gesten gesperrt, damit das eingemessene Modell nicht verrutscht.

**Menü einklappen:** **Kurz auf den freien Bildschirm tippen** blendet die Bedienelemente aus, nochmal tippen holt sie zurück
(alternativ oben rechts **„Menü ▾ / ▴“**). Ist das Ebenen-Menü offen, schließt ein Tipp zuerst dieses. Ziehen bewegt weiterhin das Modell.

## 6. Hilfe bei Problemen

| Problem | Lösung |
|---|---|
| Seite zeigt alte Version | Link mit neuer Zahl `?v=…` öffnen; Chrome-Cache leeren |
| „AR starten“ grau | Chrome? ARCore („Google Play-Dienste für AR“) installiert? Seite per **https** geöffnet? |
| Kein Ring / „Fläche: keine“ | Handy zum Boden neigen (bei waagerechtem Blick gibt es keinen Bodenpunkt), mehr Licht, langsam hin und her bewegen |
| Oranger Ring („Boden geschätzt“) | Normal an Stellen, die ARCore noch nicht erfasst hat; Punkt kann gesetzt werden. Für mehr Genauigkeit den Boden vorher kurz abfahren |
| Modell wandert / driftet | Neu einpassen; nah an den Referenzpunkten bleiben; Tracking in hellen Räumen besser |
| Modell nicht sichtbar | „Modell vor mich setzen“; Blick vom Boden heben; Deckkraft erhöhen |
| Kamerabild, aber kein Modell | *Kompatibilitätsmodus* (Haken in der Vorschau) einschalten |
| Seite lädt langsam | Erste Ladung ~6 MB, danach schneller; WLAN nutzen |
| Statuszeile zeigt **Pose FEHLT** | Tracking hat noch keine Position: Handy ruhig halten, dann langsam schwenken; mehr Licht |
| Statuszeile zeigt **Draws 0** oder **3D-Ansicht abgestürzt** | AR beenden, Seite neu laden (Link mit neuer `?v=`-Zahl) |
| Fehlersuche | `?debug` an den Link: Testwürfel, Mittelmarke, Diagnosewerte. Screenshot der Statuszeile hilft bei der Fehlersuche |

**Weitergeben:** In der Vorschau **„🔗 Link teilen“** – öffnet das Teilen-Menü des Handys (oder kopiert den Link).

## 7. Kurzreferenz

- **Dreh/Zoom:** 1 Finger / 2 Finger · **Ebenen:** oben rechts
- **Schnellstart:** 1:1 → *Auf Fläche setzen* / *Vor mich setzen*
- **Genau:** *Exakt einpassen* → Wand → A → B → Δ prüfen → Feinjustage
- **Beenden:** *Beenden* (unten) oder Zurück-Geste des Handys
