# Dashboard

Ein Smart-Home-Dashboard für das iPad: Uhr, Wetter, Kalender, To Do, Nachrichten, Musik, Licht und Steckdose.

- `index.html`: der Aufbau (welche Kacheln es gibt)
- `style.css`: das Aussehen (Farben, Abstände und Rundungen stehen ganz oben)
- `app.js`: die Logik (Einstellungen stehen ganz oben)

**Wichtig:** Dieses Repository ist öffentlich. Hier kommen nie Passwörter oder API-Schlüssel hinein.

## Cloud-Helfer (`worker/`)

Ein kleiner Cloudflare Worker unter `https://dashboard-helfer.leowu1008.workers.dev`.
Er ruft Dienste ab, die der Browser nicht direkt erreichen darf. Hochladen mit `worker/deploy.sh`.

## 3D-Zimmer (`raum.js`)

Startansicht des Dashboards: ein 3D-Modell des Zimmers (Three.js, liegt in `lib/`).
Antippen einer LED schaltet sie, Antippen des iPads öffnet das Dashboard.
Raummaße, Möbel und LED-Positionen stehen oben in `raum.js` und können angepasst werden.
