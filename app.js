/* =========================================================
   EINSTELLUNGEN
   ========================================================= */
const ORT = {
  name: "Wietmarschen",
  breite: 52.52,   // Breitengrad
  laenge: 7.13     // Längengrad
};

const WETTER_AKTUALISIEREN_MINUTEN = 15;
const NACHRICHTEN_AKTUALISIEREN_MINUTEN = 10;

// Adresse des Cloud-Helfers (kommt später). Solange leer, wird direkt abgerufen.
const CLOUD_HELFER = "";


/* =========================================================
   UHR & DATUM
   ========================================================= */
function aktualisiereUhr() {
  const jetzt = new Date();

  document.getElementById("uhrzeit").textContent =
    jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  document.getElementById("datum").textContent =
    jetzt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const stunde = jetzt.getHours();
  let gruss = "Gute Nacht";
  if (stunde >= 5 && stunde < 11)  gruss = "Guten Morgen";
  else if (stunde >= 11 && stunde < 17) gruss = "Schönen Tag";
  else if (stunde >= 17 && stunde < 22) gruss = "Guten Abend";
  document.getElementById("begruessung").textContent = gruss;
}


/* =========================================================
   WETTER (Open-Meteo, kostenlos, ohne Anmeldung)
   ========================================================= */

// Wettercodes → Symbol und deutscher Text
const WETTERCODES = {
  0:  ["☀️", "Klar"],
  1:  ["🌤️", "Überwiegend klar"],
  2:  ["⛅", "Teilweise bewölkt"],
  3:  ["☁️", "Bedeckt"],
  45: ["🌫️", "Nebel"],
  48: ["🌫️", "Reifnebel"],
  51: ["🌦️", "Leichter Nieselregen"],
  53: ["🌦️", "Nieselregen"],
  55: ["🌧️", "Starker Nieselregen"],
  56: ["🌧️", "Gefrierender Niesel"],
  57: ["🌧️", "Gefrierender Niesel"],
  61: ["🌦️", "Leichter Regen"],
  63: ["🌧️", "Regen"],
  65: ["🌧️", "Starker Regen"],
  66: ["🌧️", "Gefrierender Regen"],
  67: ["🌧️", "Gefrierender Regen"],
  71: ["🌨️", "Leichter Schneefall"],
  73: ["🌨️", "Schneefall"],
  75: ["❄️", "Starker Schneefall"],
  77: ["🌨️", "Schneegriesel"],
  80: ["🌦️", "Leichte Schauer"],
  81: ["🌧️", "Schauer"],
  82: ["⛈️", "Heftige Schauer"],
  85: ["🌨️", "Schneeschauer"],
  86: ["❄️", "Starke Schneeschauer"],
  95: ["⛈️", "Gewitter"],
  96: ["⛈️", "Gewitter mit Hagel"],
  99: ["⛈️", "Starkes Gewitter mit Hagel"]
};

function wetterInfo(code, istTag = true) {
  const [symbol, text] = WETTERCODES[code] || ["❔", "Unbekannt"];
  // Nachts Mond statt Sonne
  if (!istTag && (code === 0 || code === 1)) return ["🌙", text];
  return [symbol, text];
}

async function ladeWetter() {
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${ORT.breite}&longitude=${ORT.laenge}`
    + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    + "&timezone=Europe%2FBerlin&forecast_days=5";

  try {
    const antwort = await fetch(url);
    if (!antwort.ok) throw new Error("HTTP " + antwort.status);
    const daten = await antwort.json();
    zeigeWetter(daten);
  } catch (fehler) {
    console.error("Wetter konnte nicht geladen werden:", fehler);
    document.getElementById("wetter-text").textContent = "Wetter nicht verfügbar";
    document.getElementById("wetter-symbol").textContent = "⚠️";
  }
}

function zeigeWetter(daten) {
  const c = daten.current;
  const [symbol, text] = wetterInfo(c.weather_code, c.is_day === 1);

  document.getElementById("wetter-symbol").textContent = symbol;
  document.getElementById("wetter-temp").textContent = Math.round(c.temperature_2m) + "°";
  document.getElementById("wetter-text").textContent = text;
  document.getElementById("wetter-details").textContent =
    `Gefühlt ${Math.round(c.apparent_temperature)}° · Wind ${Math.round(c.wind_speed_10m)} km/h · ${c.relative_humidity_2m}% Luftfeuchte`;

  // 5-Tage-Vorschau
  const d = daten.daily;
  const container = document.getElementById("wetter-tage");
  container.innerHTML = "";

  d.time.forEach((datum, i) => {
    const tagName = i === 0
      ? "Heute"
      : new Date(datum + "T12:00").toLocaleDateString("de-DE", { weekday: "short" });
    const [tagSymbol] = wetterInfo(d.weather_code[i]);

    const el = document.createElement("div");
    el.className = "tag";
    el.innerHTML = `
      <div class="tag-name">${tagName}</div>
      <div class="tag-symbol">${tagSymbol}</div>
      <div class="tag-max">${Math.round(d.temperature_2m_max[i])}°</div>
      <div class="tag-min">${Math.round(d.temperature_2m_min[i])}°</div>
      <div class="tag-regen">💧 ${d.precipitation_probability_max[i] ?? 0}%</div>
    `;
    container.appendChild(el);
  });
}


/* =========================================================
   NACHRICHTEN (ARD Tagesschau + ZDF heute)
   ========================================================= */
const NACHRICHTEN_QUELLEN = {
  ARD: "https://www.tagesschau.de/api2u/homepage/",
  ZDF: "https://www.zdf.de/rss/zdf/nachrichten"
};

let alleNachrichten = [];
let nachrichtenFehler = [];
let gewaehlteQuelle = "alle";

// Holt eine Adresse – erst direkt, sonst über den Cloud-Helfer
async function holeText(url) {
  try {
    const antwort = await fetch(url);
    if (antwort.ok) return await antwort.text();
  } catch (e) { /* direkt nicht erlaubt, weiter mit Cloud-Helfer */ }

  if (CLOUD_HELFER) {
    const antwort = await fetch(CLOUD_HELFER + "/proxy?url=" + encodeURIComponent(url));
    if (antwort.ok) return await antwort.text();
  }
  throw new Error("nicht erreichbar");
}

async function ladeARD() {
  const daten = JSON.parse(await holeText(NACHRICHTEN_QUELLEN.ARD));
  return (daten.news || [])
    .filter(n => n.title && n.shareURL)
    .map(n => ({ quelle: "ARD", titel: n.title, link: n.shareURL, zeit: new Date(n.date) }));
}

async function ladeZDF() {
  const xml = new DOMParser().parseFromString(await holeText(NACHRICHTEN_QUELLEN.ZDF), "text/xml");
  return [...xml.querySelectorAll("item")].map(item => ({
    quelle: "ZDF",
    titel: item.querySelector("title")?.textContent.trim(),
    link: item.querySelector("link")?.textContent.trim(),
    zeit: new Date(item.querySelector("pubDate")?.textContent)
  })).filter(n => n.titel && n.link);
}

async function ladeNachrichten() {
  const ergebnisse = await Promise.allSettled([ladeARD(), ladeZDF()]);
  const namen = ["ARD", "ZDF"];

  alleNachrichten = [];
  nachrichtenFehler = [];
  ergebnisse.forEach((e, i) => {
    if (e.status === "fulfilled") alleNachrichten.push(...e.value);
    else nachrichtenFehler.push(namen[i]);
  });

  // Neueste zuerst
  alleNachrichten.sort((a, b) => (b.zeit || 0) - (a.zeit || 0));

  document.getElementById("nachrichten-stand").textContent =
    "Stand " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  zeigeNachrichten();
}

function zeigeNachrichten() {
  const liste = document.getElementById("nachrichten-liste");
  liste.innerHTML = "";

  const auswahl = alleNachrichten
    .filter(n => gewaehlteQuelle === "alle" || n.quelle === gewaehlteQuelle)
    .slice(0, 30);

  auswahl.forEach(n => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = n.link;
    a.target = "_blank";
    a.rel = "noopener";

    const sender = document.createElement("span");
    sender.className = "sender " + n.quelle;
    sender.textContent = n.quelle;

    const titel = document.createElement("span");
    titel.className = "schlagzeile";
    titel.textContent = n.titel;

    const zeit = document.createElement("span");
    zeit.className = "zeit";
    if (n.zeit && !isNaN(n.zeit)) {
      zeit.textContent = n.zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    }

    a.append(sender, titel, zeit);
    li.appendChild(a);
    liste.appendChild(li);
  });

  // Hinweis, falls eine Quelle nicht geladen werden konnte
  nachrichtenFehler
    .filter(q => gewaehlteQuelle === "alle" || q === gewaehlteQuelle)
    .forEach(q => {
      const li = document.createElement("li");
      li.className = "leise";
      li.textContent = `⚠️ ${q} konnte nicht geladen werden${CLOUD_HELFER ? "" : " (braucht den Cloud-Helfer)"}.`;
      liste.appendChild(li);
    });
}

// Knöpfe Alle / ARD / ZDF
document.querySelectorAll(".quelle").forEach(knopf => {
  knopf.addEventListener("click", () => {
    document.querySelectorAll(".quelle").forEach(k => k.classList.remove("aktiv"));
    knopf.classList.add("aktiv");
    gewaehlteQuelle = knopf.dataset.quelle;
    zeigeNachrichten();
  });
});


/* =========================================================
   START
   ========================================================= */
aktualisiereUhr();
setInterval(aktualisiereUhr, 1000);

ladeWetter();
setInterval(ladeWetter, WETTER_AKTUALISIEREN_MINUTEN * 60 * 1000);

ladeNachrichten();
setInterval(ladeNachrichten, NACHRICHTEN_AKTUALISIEREN_MINUTEN * 60 * 1000);
