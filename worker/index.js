/* =========================================================
   CLOUD-HELFER für das iPad-Dashboard (Cloudflare Worker)

   Hier liegen KEINE Passwörter. Die Microsoft-Anmeldung wird
   verschlüsselt im Cloudflare-Speicher (KV) abgelegt.
   ========================================================= */

// Nur das Dashboard darf den Helfer benutzen
const ERLAUBTE_HERKUNFT = [
  "https://leowu1008.github.io"
];

// Nur diese Seiten darf der Weiterleiter abrufen
const PROXY_ERLAUBT = [
  "www.tagesschau.de",
  "www.zdf.de"
];

// Microsoft (privates Konto)
const MS_LOGIN = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const MS_SCOPES = "offline_access User.Read Calendars.Read Tasks.ReadWrite";
const GRAPH = "https://graph.microsoft.com/v1.0";


/* ---------- Hilfsfunktionen ---------- */

function corsKopf(request) {
  const herkunft = request.headers.get("Origin") || "";
  const kopf = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (ERLAUBTE_HERKUNFT.includes(herkunft)) kopf["Access-Control-Allow-Origin"] = herkunft;
  return kopf;
}

function json(daten, request, status = 200) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsKopf(request) }
  });
}

class Fehler extends Error {
  constructor(status, text) { super(text); this.status = status; }
}

function zufall(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function formPost(url, felder) {
  const antwort = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(felder)
  });
  return { status: antwort.status, daten: await antwort.json() };
}


/* ---------- Nachrichten-Weiterleitung ---------- */

async function proxy(request, url) {
  const ziel = url.searchParams.get("url");
  let zielUrl;
  try { zielUrl = new URL(ziel); } catch { return json({ fehler: "Ungültige Adresse" }, request, 400); }
  if (zielUrl.protocol !== "https:" || !PROXY_ERLAUBT.includes(zielUrl.hostname)) {
    return json({ fehler: "Diese Adresse ist nicht erlaubt" }, request, 403);
  }
  const antwort = await fetch(zielUrl, { cf: { cacheTtl: 300, cacheEverything: true } });
  return new Response(antwort.body, {
    status: antwort.status,
    headers: { "Content-Type": antwort.headers.get("Content-Type") || "text/plain", ...corsKopf(request) }
  });
}


/* ---------- Microsoft-Anmeldung (Gerätecode) ---------- */

// 1. Dashboard fragt einen Code an
async function anmeldungStarten(env) {
  const { status, daten } = await formPost(MS_LOGIN + "/devicecode", {
    client_id: env.MS_CLIENT_ID,
    scope: MS_SCOPES
  });
  if (status !== 200) throw new Fehler(502, "Microsoft: " + (daten.error_description || daten.error));

  const vorgang = zufall(16);
  await env.SPEICHER.put("anmeldung:" + vorgang, daten.device_code, { expirationTtl: Math.max(60, daten.expires_in) });
  return {
    vorgang,
    code: daten.user_code,
    adresse: daten.verification_uri,
    intervall: daten.interval || 5,
    gueltig: daten.expires_in
  };
}

// 2. Dashboard fragt regelmäßig nach, ob du den Code eingegeben hast
async function anmeldungPruefen(env, vorgang) {
  const deviceCode = vorgang && await env.SPEICHER.get("anmeldung:" + vorgang);
  if (!deviceCode) return { status: "abgelaufen" };

  const { daten } = await formPost(MS_LOGIN + "/token", {
    client_id: env.MS_CLIENT_ID,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: deviceCode
  });

  if (daten.error === "authorization_pending" || daten.error === "slow_down") return { status: "wartet" };
  if (daten.error) {
    await env.SPEICHER.delete("anmeldung:" + vorgang);
    return { status: "fehler", text: daten.error_description || daten.error };
  }

  // Wer hat sich angemeldet?
  const ich = await (await fetch(GRAPH + "/me", { headers: { Authorization: "Bearer " + daten.access_token } })).json();

  // Nur der erste angemeldete Benutzer (du) darf das Dashboard benutzen
  const besitzer = await env.SPEICHER.get("ms:besitzer");
  if (besitzer && besitzer !== ich.id) {
    return { status: "fehler", text: "Dieses Dashboard ist bereits mit einem anderen Microsoft-Konto verbunden." };
  }

  await env.SPEICHER.put("ms:besitzer", ich.id);
  await env.SPEICHER.put("ms:refresh", daten.refresh_token);
  await env.SPEICHER.put("ms:access", JSON.stringify({
    token: daten.access_token,
    bis: Date.now() + (daten.expires_in - 300) * 1000
  }));
  await env.SPEICHER.delete("anmeldung:" + vorgang);

  // Sitzung für dieses iPad
  const sitzung = zufall(32);
  await env.SPEICHER.put("sitzung:" + await sha256(sitzung), new Date().toISOString());

  return { status: "ok", sitzung, name: ich.displayName || "" };
}

// Prüft, ob die Anfrage vom angemeldeten iPad kommt
async function sitzungPruefen(request, env) {
  const kopf = request.headers.get("Authorization") || "";
  const sitzung = kopf.startsWith("Bearer ") ? kopf.slice(7) : "";
  if (!sitzung || !(await env.SPEICHER.get("sitzung:" + await sha256(sitzung)))) {
    throw new Fehler(401, "Nicht angemeldet");
  }
}

// Gültigen Microsoft-Zugangsschlüssel holen (erneuert sich selbst)
async function msToken(env) {
  const gespeichert = JSON.parse(await env.SPEICHER.get("ms:access") || "null");
  if (gespeichert && gespeichert.bis > Date.now()) return gespeichert.token;

  const refresh = await env.SPEICHER.get("ms:refresh");
  if (!refresh) throw new Fehler(401, "Nicht mit Microsoft verbunden");

  const { daten } = await formPost(MS_LOGIN + "/token", {
    client_id: env.MS_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refresh,
    scope: MS_SCOPES
  });
  if (daten.error) throw new Fehler(401, "Microsoft-Anmeldung abgelaufen: " + daten.error);

  if (daten.refresh_token) await env.SPEICHER.put("ms:refresh", daten.refresh_token);
  await env.SPEICHER.put("ms:access", JSON.stringify({
    token: daten.access_token,
    bis: Date.now() + (daten.expires_in - 300) * 1000
  }));
  return daten.access_token;
}

async function graph(env, pfad, optionen = {}) {
  const token = await msToken(env);
  const antwort = await fetch(GRAPH + pfad, {
    ...optionen,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="Europe/Berlin"',
      ...(optionen.headers || {})
    }
  });
  if (antwort.status === 204) return null;
  const daten = await antwort.json();
  if (!antwort.ok) throw new Fehler(502, "Microsoft Graph: " + (daten.error?.message || antwort.status));
  return daten;
}


/* ---------- Kalender ---------- */

async function kalender(env, tage) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const ende = new Date(start.getTime() + tage * 86400000);

  const daten = await graph(env,
    `/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${ende.toISOString()}` +
    `&$select=subject,start,end,isAllDay,location,showAs&$orderby=start/dateTime&$top=100`);

  return (daten.value || []).map(t => ({
    titel: t.subject || "(ohne Titel)",
    start: t.start.dateTime,
    ende: t.end.dateTime,
    ganztaegig: t.isAllDay,
    ort: t.location?.displayName || ""
  }));
}


/* ---------- Microsoft To Do ---------- */

async function todoLaden(env) {
  const listen = (await graph(env, "/me/todo/lists")).value || [];
  // Standardliste ("Aufgaben") zuerst
  listen.sort((a, b) => (b.wellknownListName === "defaultList") - (a.wellknownListName === "defaultList"));

  const ergebnis = [];
  for (const liste of listen.slice(0, 10)) {
    const aufgaben = (await graph(env,
      `/me/todo/lists/${liste.id}/tasks?$filter=status ne 'completed'&$top=100`)).value || [];
    ergebnis.push({
      id: liste.id,
      name: liste.displayName,
      standard: liste.wellknownListName === "defaultList",
      aufgaben: aufgaben.map(a => ({
        id: a.id,
        titel: a.title,
        wichtig: a.importance === "high",
        faellig: a.dueDateTime?.dateTime || null
      }))
    });
  }
  return ergebnis;
}

async function todoErledigt(env, listeId, aufgabeId) {
  await graph(env, `/me/todo/lists/${encodeURIComponent(listeId)}/tasks/${encodeURIComponent(aufgabeId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" })
  });
  return { ok: true };
}

async function todoNeu(env, listeId, titel) {
  const a = await graph(env, `/me/todo/lists/${encodeURIComponent(listeId)}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: titel })
  });
  return { id: a.id, titel: a.title, wichtig: false, faellig: null };
}


/* ---------- Verteiler ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsKopf(request) });
    }

    try {
      const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

      switch (url.pathname) {
        case "/":
        case "/status":
          return json({ ok: true, name: "Dashboard Cloud-Helfer", zeit: new Date().toISOString() }, request);

        case "/proxy":
          return proxy(request, url);

        case "/auth/start":
          return json(await anmeldungStarten(env), request);

        case "/auth/pruefen":
          return json(await anmeldungPruefen(env, body.vorgang), request);

        case "/kalender":
          await sitzungPruefen(request, env);
          return json(await kalender(env, Math.min(31, Number(url.searchParams.get("tage")) || 7)), request);

        case "/todo":
          await sitzungPruefen(request, env);
          return json(await todoLaden(env), request);

        case "/todo/erledigt":
          await sitzungPruefen(request, env);
          return json(await todoErledigt(env, body.liste, body.aufgabe), request);

        case "/todo/neu":
          await sitzungPruefen(request, env);
          if (!body.titel || !body.liste) throw new Fehler(400, "Titel fehlt");
          return json(await todoNeu(env, body.liste, String(body.titel).slice(0, 255)), request);

        default:
          return json({ fehler: "Nicht gefunden" }, request, 404);
      }
    } catch (e) {
      return json({ fehler: e.message }, request, e.status || 500);
    }
  }
};
