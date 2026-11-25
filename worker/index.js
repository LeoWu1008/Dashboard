/* =========================================================
   CLOUD-HELFER für das iPad-Dashboard (Cloudflare Worker)

   Hier liegen KEINE Passwörter. Geheime Werte (z. B. Govee-
   Schlüssel) werden in Cloudflare als „Secrets“ gespeichert.
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
    headers: {
      "Content-Type": antwort.headers.get("Content-Type") || "text/plain",
      ...corsKopf(request)
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsKopf(request) });
    }

    switch (url.pathname) {
      case "/":
      case "/status":
        return json({ ok: true, name: "Dashboard Cloud-Helfer", zeit: new Date().toISOString() }, request);
      case "/proxy":
        return proxy(request, url);
      default:
        return json({ fehler: "Nicht gefunden" }, request, 404);
    }
  }
};
