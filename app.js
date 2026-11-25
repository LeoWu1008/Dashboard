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
const CLOUD_HELFER = "https://dashboard-helfer.leowu1008.workers.dev";


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
  if (!istTag) {
    const nacht = { "☀️": "🌙", "🌤️": "🌙", "⛅": "☁️", "🌦️": "🌧️" };
    return [nacht[symbol] || symbol, text];
  }
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
   MICROSOFT: Anmeldung über den Cloud-Helfer
   ========================================================= */
const KALENDER_TAGE = 7;
// Kalender, die NICHT angezeigt werden sollen, z. B. ["Geburtstage", "Arbeiten"]
const KALENDER_AUSBLENDEN = [];
const MICROSOFT_AKTUALISIEREN_MINUTEN = 5;

function sitzung() {
  try { return localStorage.getItem("ms-sitzung"); } catch { return null; }
}

// Anfrage an den Cloud-Helfer mit Anmeldung
async function helfer(pfad, daten) {
  const optionen = { headers: { Authorization: "Bearer " + (sitzung() || "") } };
  if (daten) {
    optionen.method = "POST";
    optionen.headers["Content-Type"] = "application/json";
    optionen.body = JSON.stringify(daten);
  }
  const antwort = await fetch(CLOUD_HELFER + pfad, optionen);
  if (antwort.status === 401) {
    try { localStorage.removeItem("ms-sitzung"); } catch {}
    zeigeVerbinden();
    throw new Error("nicht angemeldet");
  }
  if (!antwort.ok) throw new Error((await antwort.json().catch(() => ({}))).fehler || "Fehler " + antwort.status);
  return antwort.json();
}

function zeigeVerbinden() {
  const knopf = `<div class="verbinden">
      <span>Noch nicht mit deinem Microsoft-Konto verbunden.</span>
      <button class="knopf" onclick="anmeldungStarten()">Mit Microsoft verbinden</button>
    </div>`;
  document.getElementById("kalender-inhalt").innerHTML = knopf;
  document.getElementById("todo-inhalt").innerHTML = `<li class="leise">Verbinde zuerst dein Microsoft-Konto (Kalender-Kachel).</li>`;
  document.getElementById("todo-formular").hidden = true;
  document.getElementById("todo-liste").hidden = true;
}

let anmeldungTimer = null;

async function anmeldungStarten() {
  const fenster = document.getElementById("anmeldung");
  const status = document.getElementById("anmeldung-status");
  fenster.hidden = false;
  status.textContent = "Hole Code …";

  try {
    const r = await (await fetch(CLOUD_HELFER + "/auth/start", { method: "POST" })).json();
    if (!r.code) throw new Error(r.fehler || "Kein Code erhalten");

    document.getElementById("anmeldung-code").textContent = r.code;
    const link = document.getElementById("anmeldung-link");
    link.href = r.adresse;
    link.textContent = r.adresse.replace("https://", "").replace("www.", "");
    status.textContent = "Warte auf deine Anmeldung …";

    clearInterval(anmeldungTimer);
    anmeldungTimer = setInterval(async () => {
      const p = await (await fetch(CLOUD_HELFER + "/auth/pruefen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vorgang: r.vorgang })
      })).json();

      if (p.status === "ok") {
        clearInterval(anmeldungTimer);
        try { localStorage.setItem("ms-sitzung", p.sitzung); } catch {}
        status.textContent = "✅ Verbunden" + (p.name ? " als " + p.name : "") + "!";
        setTimeout(() => { fenster.hidden = true; }, 1500);
        ladeMicrosoft();
        ladeLichter();
      } else if (p.status === "abgelaufen") {
        clearInterval(anmeldungTimer);
        status.textContent = "Der Code ist abgelaufen. Bitte abbrechen und neu starten.";
      } else if (p.status === "fehler") {
        clearInterval(anmeldungTimer);
        status.textContent = "⚠️ " + p.text;
      }
    }, (r.intervall || 5) * 1000);
  } catch (e) {
    status.textContent = "⚠️ " + e.message;
  }
}

document.getElementById("anmeldung-abbrechen").addEventListener("click", () => {
  clearInterval(anmeldungTimer);
  document.getElementById("anmeldung").hidden = true;
});

document.getElementById("anmeldung-kopieren").addEventListener("click", async () => {
  const code = document.getElementById("anmeldung-code").textContent;
  try {
    await navigator.clipboard.writeText(code);
    document.getElementById("anmeldung-kopieren").textContent = "Kopiert ✓";
  } catch {}
});


/* =========================================================
   KALENDER
   ========================================================= */
function tagesName(datum) {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const tag = new Date(datum); tag.setHours(0, 0, 0, 0);
  const diff = Math.round((tag - heute) / 86400000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  return tag.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

function uhrzeit(datum) {
  return datum.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

async function ladeKalender() {
  const termine = (await helfer("/kalender?tage=" + KALENDER_TAGE))
    .filter(t => !KALENDER_AUSBLENDEN.includes(t.kalender));
  const box = document.getElementById("kalender-inhalt");
  box.innerHTML = "";

  if (termine.length === 0) {
    box.innerHTML = `<p class="leise">Keine Termine in den nächsten ${KALENDER_TAGE} Tagen 🎉</p>`;
    return;
  }

  const jetzt = new Date();
  let letzterTag = "";

  termine.forEach(t => {
    // Graph liefert Ortszeit ohne Zeitzone, z. B. "2026-11-25T14:00:00.0000000"
    const start = new Date(t.start.slice(0, 19));
    const ende = new Date(t.ende.slice(0, 19));

    const tag = tagesName(start);
    if (tag !== letzterTag) {
      const kopf = document.createElement("div");
      kopf.className = "tag-titel";
      kopf.textContent = tag;
      box.appendChild(kopf);
      letzterTag = tag;
    }

    const el = document.createElement("div");
    el.className = "termin" + (ende < jetzt ? " vorbei" : "");
    if (t.farbe) el.style.borderLeftColor = t.farbe;

    const zeit = document.createElement("div");
    zeit.className = "termin-zeit";
    zeit.innerHTML = t.ganztaegig ? "ganz&shy;tägig" : `${uhrzeit(start)}<br>${uhrzeit(ende)}`;

    const text = document.createElement("div");
    const titel = document.createElement("div");
    titel.className = "termin-titel";
    titel.textContent = t.titel;
    text.appendChild(titel);
    const info = [t.kalender, t.ort ? "📍 " + t.ort : ""].filter(Boolean).join(" · ");
    if (info) {
      const zeile = document.createElement("div");
      zeile.className = "termin-ort";
      zeile.textContent = info;
      text.appendChild(zeile);
    }

    el.append(zeit, text);
    box.appendChild(el);
  });
}


/* =========================================================
   MICROSOFT TO DO
   ========================================================= */
let todoListen = [];
let gewaehlteListe = null;

async function ladeTodo() {
  todoListen = await helfer("/todo");
  const auswahl = document.getElementById("todo-liste");

  if (!gewaehlteListe || !todoListen.find(l => l.id === gewaehlteListe)) {
    let gemerkt = null;
    try { gemerkt = localStorage.getItem("todo-liste"); } catch {}
    gewaehlteListe = (todoListen.find(l => l.id === gemerkt) || todoListen[0] || {}).id;
  }

  auswahl.innerHTML = "";
  todoListen.forEach(l => {
    const option = document.createElement("option");
    option.value = l.id;
    option.textContent = `${l.name} (${l.aufgaben.length})`;
    auswahl.appendChild(option);
  });
  auswahl.value = gewaehlteListe;
  auswahl.hidden = todoListen.length < 2;
  document.getElementById("todo-formular").hidden = !gewaehlteListe;

  zeigeTodo();
}

function zeigeTodo() {
  const box = document.getElementById("todo-inhalt");
  box.innerHTML = "";
  const liste = todoListen.find(l => l.id === gewaehlteListe);

  if (!liste || liste.aufgaben.length === 0) {
    box.innerHTML = `<li class="leise">Alles erledigt 🎉</li>`;
    return;
  }

  const heute = new Date(); heute.setHours(0, 0, 0, 0);

  // Wichtige zuerst
  [...liste.aufgaben].sort((a, b) => b.wichtig - a.wichtig).forEach(a => {
    const li = document.createElement("li");
    li.className = "aufgabe";

    const haken = document.createElement("button");
    haken.className = "haken";
    haken.textContent = "✓";
    haken.setAttribute("aria-label", "Erledigt");
    haken.addEventListener("click", () => abhaken(liste, a, li));

    const text = document.createElement("div");
    const titel = document.createElement("div");
    titel.className = "aufgabe-titel";
    titel.textContent = a.titel;
    if (a.wichtig) titel.insertAdjacentHTML("afterbegin", '<span class="stern">★ </span>');
    text.appendChild(titel);

    if (a.faellig) {
      const f = new Date(a.faellig.slice(0, 10) + "T00:00");
      const info = document.createElement("div");
      info.className = "aufgabe-info" + (f < heute ? " ueberfaellig" : "");
      info.textContent = "Fällig: " + tagesName(f);
      text.appendChild(info);
    }

    li.append(haken, text);
    box.appendChild(li);
  });
}

async function abhaken(liste, aufgabe, li) {
  li.classList.add("erledigt");
  try {
    await helfer("/todo/erledigt", { liste: liste.id, aufgabe: aufgabe.id });
    setTimeout(() => {
      liste.aufgaben = liste.aufgaben.filter(a => a.id !== aufgabe.id);
      ladeTodo().catch(() => zeigeTodo());
    }, 800);
  } catch (e) {
    li.classList.remove("erledigt");
    alert("Konnte nicht abgehakt werden: " + e.message);
  }
}

document.getElementById("todo-liste").addEventListener("change", e => {
  gewaehlteListe = e.target.value;
  try { localStorage.setItem("todo-liste", gewaehlteListe); } catch {}
  zeigeTodo();
});

document.getElementById("todo-formular").addEventListener("submit", async e => {
  e.preventDefault();
  const eingabe = document.getElementById("todo-eingabe");
  const titel = eingabe.value.trim();
  if (!titel || !gewaehlteListe) return;

  eingabe.value = "";
  eingabe.blur();
  try {
    const neu = await helfer("/todo/neu", { liste: gewaehlteListe, titel });
    todoListen.find(l => l.id === gewaehlteListe).aufgaben.unshift(neu);
    zeigeTodo();
  } catch (fehler) {
    eingabe.value = titel;
    alert("Aufgabe konnte nicht angelegt werden: " + fehler.message);
  }
});


async function ladeMicrosoft() {
  if (!sitzung()) { zeigeVerbinden(); return; }
  // Nacheinander laden – Microsoft mag keine vielen gleichzeitigen Anfragen
  await ladeKalender().catch(e => {
    if (e.message !== "nicht angemeldet")
      document.getElementById("kalender-inhalt").textContent = "⚠️ Kalender: " + e.message;
  });
  await ladeTodo().catch(e => {
    if (e.message !== "nicht angemeldet")
      document.getElementById("todo-inhalt").textContent = "⚠️ To Do: " + e.message;
  });
}


/* =========================================================
   LICHT (Govee über den Cloud-Helfer)
   ========================================================= */
const LICHT_AKTUALISIEREN_MINUTEN = 2;   // Govee erlaubt nur begrenzt viele Anfragen pro Tag

const WEISSTOENE = [
  { name: "Warm",    kelvin: 2700, farbe: "#ffc27a" },
  { name: "Neutral", kelvin: 4000, farbe: "#ffe4c2" },
  { name: "Kalt",    kelvin: 6500, farbe: "#e6efff" }
];
const FARBEN = ["#ff2a2a", "#ff7a00", "#ffd000", "#3ddc5a", "#00c8ff", "#2a5bff", "#8a2aff", "#ff2ab8"];

// Bluetooth-Lichter, die über Kurzbefehle (Kurzbefehle-App) geschaltet werden.
// Die Namen müssen GENAU so heißen wie die Kurzbefehle in der Kurzbefehle-App.
const KURZBEFEHL_LICHTER = [
  { name: "Bett",    an: "Bett an",    aus: "Bett aus" },
  { name: "Schrank", an: "Schrank an", aus: "Schrank aus" }
];

let lichter = [];
let offenesLicht = null;

function kurzbefehlStarten(name) {
  window.location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(name);
}

function zeigeKurzbefehlLichter(liste) {
  KURZBEFEHL_LICHTER.forEach(k => {
    const li = document.createElement("li");
    li.className = "licht";

    const punkt = document.createElement("div");
    punkt.className = "licht-punkt";
    punkt.textContent = "💡";

    const text = document.createElement("div");
    text.className = "licht-text";
    text.innerHTML = `<div class="licht-name"></div><div class="licht-info">Bluetooth</div>`;
    text.querySelector(".licht-name").textContent = k.name;

    const knoepfe = document.createElement("div");
    knoepfe.className = "kurzbefehl-knoepfe";
    [["An", k.an], ["Aus", k.aus]].forEach(([beschriftung, kurzbefehl]) => {
      const b = document.createElement("button");
      b.className = "mini-knopf";
      b.textContent = beschriftung;
      b.addEventListener("click", () => kurzbefehlStarten(kurzbefehl));
      knoepfe.appendChild(b);
    });

    li.append(punkt, text, knoepfe);
    liste.appendChild(li);
  });
}

function rgbZuHex(wert) { return "#" + Number(wert).toString(16).padStart(6, "0"); }
function hexZuRgb(hex) { return parseInt(hex.slice(1), 16); }

function lichtFarbe(l) {
  if (l.farbe && l.farbe > 0 && !l.temperatur) return rgbZuHex(l.farbe);
  if (l.temperatur) return l.temperatur < 3500 ? "#ffc27a" : l.temperatur < 5000 ? "#ffe4c2" : "#e6efff";
  if (l.farbe && l.farbe > 0) return rgbZuHex(l.farbe);
  return "#ffd27a";
}

async function ladeLichter(neu = false) {
  if (!sitzung()) {
    document.getElementById("licht-liste").innerHTML = `<li class="leise">Verbinde zuerst dein Microsoft-Konto (Kalender-Kachel).</li>`;
    return;
  }
  try {
    const r = await helfer("/govee/lichter" + (neu ? "?neu=1" : ""));
    if (!r.verbunden) { zeigeGoveeVerbinden(); return; }
    lichter = r.lichter;
    zeigeLichter();
  } catch (e) {
    if (e.message === "Govee-Schlüssel ungültig") { zeigeGoveeVerbinden(e.message); return; }
    if (e.message !== "nicht angemeldet") document.getElementById("licht-liste").textContent = "⚠️ " + e.message;
  }
}

function zeigeGoveeVerbinden(hinweis) {
  document.getElementById("alle-knoepfe").hidden = true;
  const liste = document.getElementById("licht-liste");
  liste.innerHTML = `<li class="verbinden"><span></span><button class="knopf">Govee verbinden</button></li>`;
  liste.querySelector("span").textContent = hinweis ? "⚠️ " + hinweis : "Govee ist noch nicht verbunden.";
  liste.querySelector("button").addEventListener("click", () => {
    document.getElementById("govee-status").textContent = "";
    document.getElementById("govee-fenster").hidden = false;
    document.getElementById("govee-eingabe").focus();
  });
}

function zeigeLichter() {
  const liste = document.getElementById("licht-liste");
  liste.innerHTML = "";
  document.getElementById("alle-knoepfe").hidden = lichter.length < 2;

  if (lichter.length === 0 && KURZBEFEHL_LICHTER.length === 0) {
    liste.innerHTML = `<li class="leise">Keine steuerbaren Govee-Lichter gefunden.</li>`;
    return;
  }

  lichter.forEach(l => {
    const li = document.createElement("li");
    li.className = "licht" + (l.an ? " an" : "") + (l.online === false ? " offline" : "");
    li.style.setProperty("--licht-farbe", lichtFarbe(l));

    const punkt = document.createElement("div");
    punkt.className = "licht-punkt";
    punkt.textContent = "💡";

    const text = document.createElement("button");
    text.className = "licht-text";
    const name = document.createElement("div");
    name.className = "licht-name";
    name.textContent = l.name;
    const info = document.createElement("div");
    info.className = "licht-info";
    info.textContent = l.online === false ? "offline"
      : l.fehler ? "⚠️ Status unbekannt"
      : l.an ? (l.helligkeit ? l.helligkeit + " %" : "an") + " · Tippen zum Einstellen"
      : "aus";
    text.append(name, info);
    text.addEventListener("click", () => oeffneLicht(l));

    const schalter = document.createElement("label");
    schalter.className = "schalter";
    schalter.innerHTML = `<input type="checkbox"><span></span>`;
    const box = schalter.querySelector("input");
    box.checked = !!l.an;
    box.addEventListener("change", () => schalteLicht(l, "an", box.checked));

    li.append(punkt, text, schalter);
    liste.appendChild(li);
  });

  zeigeKurzbefehlLichter(liste);
}

// Befehl an ein Licht schicken (Anzeige wird sofort angepasst)
async function schalteLicht(l, art, wert) {
  const vorher = { ...l };
  if (art === "an") l.an = wert;
  if (art === "helligkeit") { l.helligkeit = wert; l.an = true; }
  if (art === "farbe") { l.farbe = wert; l.temperatur = null; l.an = true; }
  if (art === "temperatur") { l.temperatur = wert; l.an = true; }
  zeigeLichter();
  if (offenesLicht === l) fuelleLichtFenster(l);

  try {
    // Wer eine Farbe wählt, während das Licht aus ist, schaltet es auch ein
    if (art !== "an" && !vorher.an) await helfer("/govee/schalten", { sku: l.sku, device: l.device, art: "an", wert: true });
    await helfer("/govee/schalten", { sku: l.sku, device: l.device, art, wert });
  } catch (e) {
    Object.assign(l, vorher);
    zeigeLichter();
    if (offenesLicht === l) fuelleLichtFenster(l);
    alert(l.name + ": " + e.message);
  }
}

function oeffneLicht(l) {
  offenesLicht = l;
  fuelleLichtFenster(l);
  document.getElementById("licht-fenster").hidden = false;
}

function fuelleLichtFenster(l) {
  document.getElementById("licht-name").textContent = l.name;
  document.getElementById("licht-an").checked = !!l.an;

  document.getElementById("licht-helligkeit-bereich").hidden = !l.kann.helligkeit;
  const regler = document.getElementById("licht-helligkeit");
  regler.value = l.helligkeit || 100;
  document.getElementById("licht-helligkeit-wert").textContent = (l.helligkeit || 100) + " %";

  const weiss = document.getElementById("licht-weiss");
  weiss.innerHTML = "";
  document.getElementById("licht-weiss-bereich").hidden = !l.kann.temperatur;
  WEISSTOENE.forEach(w => {
    const k = document.createElement("button");
    k.className = "farbe";
    k.style.background = w.farbe;
    k.textContent = w.name;
    const kelvin = Math.max(l.kann.temperatur?.min || 0, Math.min(l.kann.temperatur?.max || 99999, w.kelvin));
    k.addEventListener("click", () => schalteLicht(l, "temperatur", kelvin));
    weiss.appendChild(k);
  });

  const farben = document.getElementById("licht-farben");
  farben.innerHTML = "";
  document.getElementById("licht-farbe-bereich").hidden = !l.kann.farbe;
  FARBEN.forEach(f => {
    const k = document.createElement("button");
    k.className = "farbe";
    k.style.background = f;
    k.setAttribute("aria-label", f);
    k.addEventListener("click", () => schalteLicht(l, "farbe", hexZuRgb(f)));
    farben.appendChild(k);
  });
}

document.getElementById("licht-an").addEventListener("change", e => {
  if (offenesLicht) schalteLicht(offenesLicht, "an", e.target.checked);
});
document.getElementById("licht-helligkeit").addEventListener("input", e => {
  document.getElementById("licht-helligkeit-wert").textContent = e.target.value + " %";
});
// Erst beim Loslassen senden, damit Govee nicht mit Anfragen überflutet wird
document.getElementById("licht-helligkeit").addEventListener("change", e => {
  if (offenesLicht) schalteLicht(offenesLicht, "helligkeit", Number(e.target.value));
});
document.getElementById("licht-schliessen").addEventListener("click", () => {
  offenesLicht = null;
  document.getElementById("licht-fenster").hidden = true;
});

document.querySelectorAll("[data-alle]").forEach(k => {
  k.addEventListener("click", async () => {
    const an = k.dataset.alle === "an";
    lichter.forEach(l => { if (l.online !== false) l.an = an; });
    zeigeLichter();
    try { await helfer("/govee/alle", { an }); }
    catch (e) { alert(e.message); ladeLichter(); }
  });
});

// Govee-Schlüssel speichern
document.getElementById("govee-formular").addEventListener("submit", async e => {
  e.preventDefault();
  const status = document.getElementById("govee-status");
  const schluessel = document.getElementById("govee-eingabe").value.trim();
  if (!schluessel) return;
  status.textContent = "Prüfe Schlüssel …";
  try {
    const r = await helfer("/govee/schluessel", { schluessel });
    status.textContent = `✅ Verbunden! ${r.anzahl} Geräte gefunden.`;
    document.getElementById("govee-eingabe").value = "";
    setTimeout(() => { document.getElementById("govee-fenster").hidden = true; }, 1500);
    ladeLichter();
  } catch (fehler) {
    status.textContent = "⚠️ " + fehler.message;
  }
});
document.getElementById("govee-abbrechen").addEventListener("click", () => {
  document.getElementById("govee-fenster").hidden = true;
});


/* =========================================================
   BÖRSEN-LAUFBAND (Yahoo Finance über den Cloud-Helfer)
   ========================================================= */
// Symbole wie bei Yahoo Finance (finance.yahoo.com). Eigene Aktien einfach ergänzen,
// z. B. { symbol: "SAP.DE", name: "SAP" } oder { symbol: "AAPL", name: "Apple" }
const BOERSE = [
  { symbol: "^GDAXI",    name: "DAX" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50" },
  { symbol: "^DJI",      name: "Dow Jones" },
  { symbol: "^GSPC",     name: "S&P 500" },
  { symbol: "^IXIC",     name: "Nasdaq" },
  { symbol: "EURUSD=X",  name: "EUR/USD", stellen: 4 },
  { symbol: "GC=F",      name: "Gold" },
  { symbol: "BTC-EUR",   name: "Bitcoin" }
];
const BOERSE_AKTUALISIEREN_SEKUNDEN = 60;
const LAUFBAND_PIXEL_PRO_SEKUNDE = 45;

function zahl(wert, stellen = 2) {
  return wert.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

async function ladeBoerse() {
  try {
    const antwort = await fetch(CLOUD_HELFER + "/boerse?symbole=" + encodeURIComponent(BOERSE.map(b => b.symbol).join(",")));
    if (!antwort.ok) throw new Error("HTTP " + antwort.status);
    zeigeBoerse(await antwort.json());
  } catch (e) {
    console.error("Börse:", e);
  }
}

function boersenEintrag(b, k) {
  const el = document.createElement("span");
  el.className = "ticker-eintrag";
  const name = document.createElement("span");
  name.className = "ticker-name";
  name.textContent = b.name;
  el.appendChild(name);

  if (!k || k.fehler) {
    const f = document.createElement("span");
    f.className = "leise";
    f.textContent = "–";
    el.appendChild(f);
    return el;
  }

  const kurs = document.createElement("span");
  kurs.className = "ticker-kurs";
  kurs.textContent = zahl(k.kurs, b.stellen ?? 2) + (k.waehrung === "USD" && b.symbol !== "EURUSD=X" ? " $" : k.waehrung === "EUR" && !b.symbol.startsWith("^") ? " €" : "");
  el.appendChild(kurs);

  if (k.aenderung != null) {
    const a = document.createElement("span");
    a.className = k.aenderung >= 0 ? "ticker-plus" : "ticker-minus";
    a.textContent = (k.aenderung >= 0 ? "▲ +" : "▼ ") + zahl(k.aenderung) + " %";
    el.appendChild(a);
  }
  return el;
}

function zeigeBoerse(kurse) {
  const band = document.getElementById("ticker-band");
  const teil = document.createDocumentFragment();
  BOERSE.forEach((b, i) => {
    if (i > 0) {
      const t = document.createElement("span");
      t.className = "ticker-trenner";
      t.textContent = "•";
      teil.appendChild(t);
    }
    teil.appendChild(boersenEintrag(b, kurse.find(k => k.symbol === b.symbol)));
  });
  const ende = document.createElement("span");
  ende.className = "ticker-trenner";
  ende.textContent = "•";
  teil.appendChild(ende);

  // Inhalt doppelt, damit das Laufband nahtlos weiterläuft
  const erstesMal = !band.classList.contains("laeuft");
  band.innerHTML = "";
  band.appendChild(teil.cloneNode(true));
  band.appendChild(teil);

  if (erstesMal) {
    const breite = band.scrollWidth / 2;
    band.style.setProperty("--dauer", Math.max(20, breite / LAUFBAND_PIXEL_PRO_SEKUNDE) + "s");
    band.classList.add("laeuft");
  }
}


/* =========================================================
   START
   ========================================================= */
aktualisiereUhr();
setInterval(aktualisiereUhr, 1000);

ladeWetter();
setInterval(ladeWetter, WETTER_AKTUALISIEREN_MINUTEN * 60 * 1000);

ladeNachrichten();
setInterval(ladeNachrichten, NACHRICHTEN_AKTUALISIEREN_MINUTEN * 60 * 1000);

ladeMicrosoft();
setInterval(ladeMicrosoft, MICROSOFT_AKTUALISIEREN_MINUTEN * 60 * 1000);

ladeLichter();
setInterval(() => { if (!offenesLicht) ladeLichter(); }, LICHT_AKTUALISIEREN_MINUTEN * 60 * 1000);

ladeBoerse();
setInterval(ladeBoerse, BOERSE_AKTUALISIEREN_SEKUNDEN * 1000);
