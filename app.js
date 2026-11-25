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
  const termine = await helfer("/kalender?tage=" + KALENDER_TAGE);
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

    const zeit = document.createElement("div");
    zeit.className = "termin-zeit";
    zeit.innerHTML = t.ganztaegig ? "ganz&shy;tägig" : `${uhrzeit(start)}<br>${uhrzeit(ende)}`;

    const text = document.createElement("div");
    const titel = document.createElement("div");
    titel.className = "termin-titel";
    titel.textContent = t.titel;
    text.appendChild(titel);
    if (t.ort) {
      const ort = document.createElement("div");
      ort.className = "termin-ort";
      ort.textContent = "📍 " + t.ort;
      text.appendChild(ort);
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
  ladeKalender().catch(e => {
    if (e.message !== "nicht angemeldet")
      document.getElementById("kalender-inhalt").textContent = "⚠️ Kalender: " + e.message;
  });
  ladeTodo().catch(e => {
    if (e.message !== "nicht angemeldet")
      document.getElementById("todo-inhalt").textContent = "⚠️ To Do: " + e.message;
  });
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
