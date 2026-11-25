/* =========================================================
   3D-ZIMMER
   Interaktives Modell des Zimmers (Three.js).
   - Licht-Symbol antippen: Licht an/aus
   - Licht-Symbol gedrückt halten: Farbe & Helligkeit
   - iPad am Raumteiler antippen: Dashboard öffnen

   Maße in Metern. Koordinaten:
     x = von West (Dachschräge, Bett) nach Ost (Kleiderschrank)
     n = von Süd (Fensterwand, Schreibtisch) nach Nord (schwarze Wand)
     y = Höhe
   ========================================================= */
import * as THREE from "./lib/three.module.min.js";
import { OrbitControls } from "./lib/OrbitControls.js";
import { RoundedBoxGeometry } from "./lib/RoundedBoxGeometry.js";

/* ---------- Raummaße ---------- */
const W = 4.4;       // Breite West → Ost
const L = 5.2;       // Länge Süd → Nord
const H = 2.45;      // Deckenhöhe
const K = 1.0;       // Kniestock (niedrige Wand unter der Schräge, Westseite)
const SW = 1.5;      // so weit ragt die Westschräge in den Raum
const EC = 1.0;      // abgeschrägte Ecke mit der Tür (45°): Schenkellänge
const WS = 0.14;     // Wandstärke
const SOCKEL = 0.24; // Höhe der abgeschnittenen Wände zur Kamera hin

/* ---------- Lichter ----------
   govee:      Name des Lichts in der Govee-App
   kurzbefehl: Bluetooth-Licht, wird über den Kurzbefehl geschaltet      */
const LEDS = [
  { id: "neon",    name: "LED Band",       govee: "LED Band" },
  { id: "desk",    name: "Schreibtisch",   govee: "Schreibtisch" },
  { id: "bulb",    name: "Nachttisch",     govee: "Smart LED Bulb" },
  { id: "bett",    name: "Bett",           kurzbefehl: true },
  { id: "schrank", name: "Kleiderschrank", kurzbefehl: true }
];

/* =========================================================
   Grundlagen
   ========================================================= */
const P = (x, y, n) => new THREE.Vector3(x, y, -n);   // Norden zeigt nach -z
const container = document.getElementById("raum-3d");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const szene = new THREE.Scene();
szene.background = new THREE.Color(0x101216);
szene.fog = new THREE.Fog(0x101216, 14, 30);

const kamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const ziel = P(W / 2 - 0.3, 0.3, L / 2 - 0.15);
kamera.position.copy(P(W - 0.05, 8.6, L + 0.45));   // direkt über der Tür, steil in den Raum

const steuerung = new OrbitControls(kamera, renderer.domElement);
steuerung.target.copy(ziel);
steuerung.enableDamping = true;
steuerung.dampingFactor = 0.08;
steuerung.minDistance = 3.2;
steuerung.maxDistance = 13;
steuerung.minPolarAngle = 0.05;
steuerung.maxPolarAngle = Math.PI * 0.4;
steuerung.enablePan = false;
steuerung.rotateSpeed = 0.7;
steuerung.update();

const welt = new THREE.Group();
szene.add(welt);

/* ---------- Licht ---------- */
const himmel = new THREE.HemisphereLight(0xe8eefc, 0x4a443d, 1.0);
szene.add(himmel);
const sonne = new THREE.DirectionalLight(0xfff4e6, 1.6);
sonne.position.copy(P(-2.5, 8, -3.5));
sonne.target.position.copy(P(W / 2, 0, L / 2));
sonne.castShadow = true;
sonne.shadow.mapSize.set(2048, 2048);
sonne.shadow.camera.left = -5; sonne.shadow.camera.right = 5;
sonne.shadow.camera.top = 5; sonne.shadow.camera.bottom = -5;
sonne.shadow.camera.near = 1; sonne.shadow.camera.far = 20;
sonne.shadow.bias = -0.0004;
sonne.shadow.normalBias = 0.02;
sonne.shadow.radius = 5;
szene.add(sonne, sonne.target);

/* =========================================================
   Texturen (werden im Browser gezeichnet)
   ========================================================= */
function leinwand(b, h, zeichne) {
  const c = document.createElement("canvas");
  c.width = b; c.height = h;
  zeichne(c.getContext("2d"), b, h);
  return c;
}
function textur(canvas, wx = 1, wy = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(wx, wy);
  t.anisotropy = ANISO;
  return t;
}
const zufall = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// Laminat (helle graue Eiche), 2 × 2 m pro Kachel
const bodenTextur = textur(leinwand(1024, 1024, (g, b, h) => {
  const dielenBreite = b / 10;
  for (let i = 0; i < 10; i++) {
    let y = -zufall() * 600;
    while (y < h) {
      const laenge = 450 + zufall() * 200;
      const ton = 172 + zufall() * 22;
      g.fillStyle = `rgb(${ton + 6},${ton + 1},${ton - 7})`;
      g.fillRect(i * dielenBreite, y, dielenBreite, laenge);
      for (let k = 0; k < 14; k++) {                          // Maserung
        g.strokeStyle = `rgba(${zufall() < 0.5 ? "90,80,70" : "255,250,240"},${0.05 + zufall() * 0.07})`;
        g.lineWidth = 1 + zufall() * 2;
        const x = i * dielenBreite + zufall() * dielenBreite;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 6, y + laenge / 3, x - 6, y + laenge / 1.5, x + 3, y + laenge); g.stroke();
      }
      g.fillStyle = "rgba(60,52,45,0.35)";
      g.fillRect(i * dielenBreite, y + laenge - 2, dielenBreite, 2);
      y += laenge;
    }
    g.fillStyle = "rgba(60,52,45,0.4)";
    g.fillRect(i * dielenBreite, 0, 2, h);
  }
}));

// Grauer Beton-Holz-Dekor (Raumteiler, Kleiderschrank)
const dekorGrau = textur(leinwand(512, 512, (g, b, h) => {
  g.fillStyle = "#77706a"; g.fillRect(0, 0, b, h);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${zufall() < 0.5 ? "40,36,33" : "200,195,188"},${0.04 + zufall() * 0.08})`;
    g.fillRect(zufall() * b, zufall() * h, 2 + zufall() * 50, 1 + zufall() * 4);
  }
}));

// Nussbaum (Nachttisch, Regalböden)
const nussbaum = textur(leinwand(256, 256, (g, b, h) => {
  g.fillStyle = "#9b6a3e"; g.fillRect(0, 0, b, h);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${zufall() < 0.6 ? "70,40,20" : "200,150,100"},${0.15 + zufall() * 0.2})`;
    g.lineWidth = 1 + zufall() * 2;
    const y = zufall() * h;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(b / 3, y + 8, b / 1.5, y - 8, b, y + 3); g.stroke();
  }
}));

// Bettdecke: weiß-graue Diagonalstreifen
const deckenTextur = textur(leinwand(256, 256, (g, b, h) => {
  g.fillStyle = "#f1f1ec"; g.fillRect(0, 0, b, h);
  g.strokeStyle = "#c9ccc2"; g.lineWidth = 22;
  for (let i = -b; i < b * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
}), 2.5, 2.5);

// Hochflor-Teppich
const teppichTextur = textur(leinwand(256, 256, (g, b, h) => {
  g.fillStyle = "#4b4d53"; g.fillRect(0, 0, b, h);
  for (let i = 0; i < 6000; i++) {
    const v = 50 + zufall() * 50;
    g.fillStyle = `rgba(${v},${v + 2},${v + 8},0.6)`;
    g.fillRect(zufall() * b, zufall() * h, 1.5, 1.5);
  }
}), 2, 2);

// Weltkarte (5-teilig)
const weltkarte = textur(leinwand(1024, 256, (g, b, h) => {
  g.fillStyle = "#ece6da"; g.fillRect(0, 0, b, h);
  g.fillStyle = "#2c2c2c";
  const blob = (x, y, rx, ry, r = 0) => { g.beginPath(); g.ellipse(x * b, y * h, rx * b, ry * h, r, 0, Math.PI * 2); g.fill(); };
  blob(0.17, 0.32, 0.09, 0.2, 0.3); blob(0.26, 0.68, 0.04, 0.22, -0.2);          // Amerika
  blob(0.48, 0.28, 0.05, 0.12); blob(0.5, 0.62, 0.05, 0.22);                      // Europa, Afrika
  blob(0.68, 0.32, 0.15, 0.2); blob(0.74, 0.55, 0.04, 0.1);                       // Asien
  blob(0.85, 0.75, 0.05, 0.09);                                                   // Australien
  g.fillStyle = "#1d2320";
  for (let i = 1; i < 5; i++) g.fillRect(i * b / 5 - 3, 0, 6, h);
}));

// Poster „GT3 RS“
const gt3 = textur(leinwand(256, 320, (g, b, h) => {
  g.fillStyle = "#f6f6f6"; g.fillRect(0, 0, b, h);
  g.fillStyle = "#111"; g.font = "bold 34px Helvetica, Arial"; g.textAlign = "center"; g.fillText("GT3 RS", b / 2, 70);
  g.fillStyle = "#8d9096"; g.beginPath(); g.roundRect(40, 120, 176, 50, 22); g.fill();
  g.fillStyle = "#222"; g.beginPath(); g.arc(80, 172, 14, 0, 7); g.arc(180, 172, 14, 0, 7); g.fill();
  g.fillStyle = "#bbb"; for (let i = 0; i < 4; i++) g.fillRect(40, 220 + i * 18, 176, 4);
}));

// Pinnwand mit Fotos
const pinnwand = textur(leinwand(320, 256, (g, b, h) => {
  g.fillStyle = "#f4f4f4"; g.fillRect(0, 0, b, h);
  const farben = ["#7cb36b", "#e46f5f", "#5f9fe0", "#f2c14e", "#9b7bd4", "#58c4b8", "#e89b5b"];
  for (let i = 0; i < 11; i++) {
    g.save(); g.translate(20 + zufall() * 260, 20 + zufall() * 200); g.rotate((zufall() - 0.5) * 0.5);
    g.fillStyle = "#fff"; g.fillRect(-4, -4, 64, 52);
    g.fillStyle = farben[i % farben.length]; g.fillRect(0, 0, 56, 44);
    g.restore();
  }
}));

// Monitor-Hintergrundbild (bunte Blüte wie auf dem Foto)
const wallpaper = textur(leinwand(512, 256, (g, b, h) => {
  const v = g.createLinearGradient(0, 0, b, h); v.addColorStop(0, "#1c1036"); v.addColorStop(1, "#3a1d5c");
  g.fillStyle = v; g.fillRect(0, 0, b, h);
  [["#ff4f8b", 200, 150, 90], ["#ffc933", 280, 110, 80], ["#ff8a3d", 330, 160, 60], ["#7a5cff", 170, 90, 50]].forEach(([f, x, y, r]) => {
    g.fillStyle = f; g.beginPath(); g.ellipse(x, y, r, r * 0.55, -0.6, 0, 7); g.fill();
  });
}));

// Leuchtschein als „Abstandsfeld“: hell an der Form, weich auslaufend
function leuchtTextur(b, h, abstand, weichheit) {
  const c = document.createElement("canvas");
  c.width = b; c.height = h;
  const g = c.getContext("2d");
  const bild = g.createImageData(b, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
    const d = Math.max(0, abstand(x / b, 1 - y / h));
    const a = Math.exp(-(d * d) / (weichheit * weichheit));
    const i = (y * b + x) * 4;
    bild.data[i] = bild.data[i + 1] = bild.data[i + 2] = 255;
    bild.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(bild, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const abstandZurLinie = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const abstandZumRechteck = (px, py, x0, y0, x1, y1) =>
  Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1));

/* =========================================================
   Bausteine
   ========================================================= */
const matCache = new Map();
function mat(farbe, extra = {}) {
  const key = farbe + JSON.stringify(Object.keys(extra).map(k => [k, extra[k]?.uuid || extra[k]]));
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.8, ...extra }));
  return matCache.get(key);
}
const M = {
  weiss: mat(0xf3f3f1, { roughness: 0.55 }),
  wand: mat(0xf2f2f4, { roughness: 0.95 }),
  dekor: mat(0xffffff, { map: dekorGrau, roughness: 0.75 }),
  nuss: mat(0xffffff, { map: nussbaum, roughness: 0.6 }),
  schwarz: mat(0x1c1c1f, { roughness: 0.5 }),
  metall: mat(0x2a2a2e, { roughness: 0.35, metalness: 0.7 }),
  chrom: mat(0xb8b8bc, { roughness: 0.25, metalness: 0.9 }),
  griff: mat(0x2b2b2d, { roughness: 0.4, metalness: 0.4 })
};

function schatten(m, werfen = true, empfangen = true) { m.castShadow = werfen; m.receiveShadow = empfangen; return m; }

// Quader von (x0,y0,n0) bis (x1,y1,n1); radius > 0 → abgerundete Kanten
function quader(eltern, x0, x1, y0, y1, n0, n1, material, radius = 0) {
  const b = x1 - x0, h = y1 - y0, t = n1 - n0;
  const geo = radius > 0
    ? new RoundedBoxGeometry(b, h, t, 3, Math.min(radius, b / 2.01, h / 2.01, t / 2.01))
    : new THREE.BoxGeometry(b, h, t);
  const m = schatten(new THREE.Mesh(geo, material));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, -(n0 + n1) / 2);
  eltern.add(m);
  return m;
}
function zylinder(eltern, x, y, n, rOben, rUnten, h, material, seg = 32) {
  const m = schatten(new THREE.Mesh(new THREE.CylinderGeometry(rOben, rUnten, h, seg), material));
  m.position.set(x, y, -n);
  eltern.add(m);
  return m;
}
function gruppe(eltern = welt) { const g = new THREE.Group(); eltern.add(g); return g; }

/* =========================================================
   Wände (mit Wandstärke, zur Kamera hin abgeschnitten)
   ========================================================= */
const wandKante = mat(0x3b3e45, { roughness: 0.9 });
const schwarzeWand = mat(0x1e2421, { roughness: 0.95 });
const waende = [];

// Grundriss gegen den Uhrzeigersinn (x, n)
const ecken = { A: [0, 0], B: [W, 0], C: [W, L - EC], D: [W - EC, L], E: [0, L] };

/* Baut eine Wand von a nach b. profil: Umriss in (u = Länge, v = Höhe),
   loecher: [[u0,u1,v0,v1]]. Innen liegt links von a→b.                    */
function baueWand(a, b, profil, loecher, innenMaterial, name) {
  const dx = b[0] - a[0], dn = b[1] - a[1];
  const laenge = Math.hypot(dx, dn);
  const form = new THREE.Shape(profil.map(([u, v]) => new THREE.Vector2(u, v)));
  loecher.forEach(([u0, u1, v0, v1]) => form.holes.push(new THREE.Path([
    new THREE.Vector2(u0, v0), new THREE.Vector2(u1, v0), new THREE.Vector2(u1, v1), new THREE.Vector2(u0, v1)])));

  const richtung = new THREE.Vector3(dx, 0, -dn).normalize();
  const aussen = new THREE.Vector3().crossVectors(richtung, new THREE.Vector3(0, 1, 0));
  const basis = new THREE.Matrix4().makeBasis(richtung, new THREE.Vector3(0, 1, 0), aussen);
  const start = P(a[0], 0, a[1]);

  const voll = new THREE.Group();
  const m = schatten(new THREE.Mesh(new THREE.ExtrudeGeometry(form, { depth: WS, bevelEnabled: false }), [innenMaterial, wandKante]));
  m.applyMatrix4(basis);
  m.position.copy(start);
  voll.add(m);

  // niedrige Version (Sockel), Türöffnungen bleiben offen
  const niedrig = new THREE.Group();
  const tueren = loecher.filter(([, , v0]) => v0 < 0.05).sort((p, q) => p[0] - q[0]);
  let u = 0;
  [...tueren, [laenge, laenge]].forEach(([u0, u1]) => {
    if (u0 - u > 0.01) {
      const s = new THREE.Shape([new THREE.Vector2(u, 0), new THREE.Vector2(u0, 0), new THREE.Vector2(u0, SOCKEL), new THREE.Vector2(u, SOCKEL)]);
      const sm = schatten(new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: WS, bevelEnabled: false }), [innenMaterial, wandKante]));
      sm.applyMatrix4(basis);
      sm.position.copy(start);
      niedrig.add(sm);
    }
    u = u1;
  });
  niedrig.visible = false;
  welt.add(voll, niedrig);

  const w = { name, voll, niedrig, aussen, mitte: P(a[0] + dx / 2, 1, a[1] + dn / 2), extras: [] };
  waende.push(w);
  return w;
}

// Südwand (Fensterwand): Westschräge links oben
const FENSTER = [
  { u0: 1.22, u1: 1.68, v0: 1.02, v1: 1.56 },                  // kleines Fenster hinter dem Schreibtisch
  { u0: 2.5,  u1: 3.2,  v0: 0.95, v1: 2.12, kaempfer: 1.72 },  // großes Fenster über der Heizung
  { u0: 3.4,  u1: 3.8,  v0: 1.05, v1: 1.55 }                   // kleines Kippfenster
];
baueWand(ecken.A, ecken.B, [[0, 0], [W, 0], [W, H], [SW, H], [0, K]], FENSTER.map(f => [f.u0, f.u1, f.v0, f.v1]), M.wand, "Süd");
// Ostwand (Kleiderschrank)
const ost = baueWand(ecken.B, ecken.C, [[0, 0], [L - EC, 0], [L - EC, H], [0, H]], [], M.wand, "Ost");
// Abgeschrägte Türwand (45°)
const TUER = { u0: 0.3, u1: 1.16, h: 2.05 };
const diag = baueWand(ecken.C, ecken.D, [[0, 0], [EC * Math.SQRT2, 0], [EC * Math.SQRT2, H], [0, H]], [[TUER.u0, TUER.u1, 0, TUER.h]], M.wand, "Tür");
// Nordwand (schwarz): von D (Osten) nach E (Westen), Schräge am Westende
const nordLaenge = W - EC;
baueWand(ecken.D, ecken.E, [[0, 0], [nordLaenge, 0], [nordLaenge, K], [nordLaenge - SW, H], [0, H]], [], schwarzeWand, "Nord");
// Westseite: Kniestock
baueWand(ecken.E, ecken.A, [[0, 0], [L, 0], [L, K], [0, K]], [], M.wand, "West");

// Andeutung der Dachschräge
[[P(0, K, 0), P(0, K, L)], [P(SW, H, 0), P(SW, H, L)]].forEach(([a, b]) =>
  welt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: 0.25 }))));
welt.add(new THREE.Mesh(
  new THREE.BufferGeometry().setFromPoints([P(0, K, 0), P(SW, H, 0), P(SW, H, L), P(0, K, 0), P(SW, H, L), P(0, K, L)]),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false })));

/* ---------- Boden & Umgebung ---------- */
const bodenGeo = new THREE.ShapeGeometry(new THREE.Shape([
  new THREE.Vector2(0, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, L - EC), new THREE.Vector2(W - EC, L), new THREE.Vector2(0, L)]));
bodenGeo.rotateX(-Math.PI / 2);
const uv = bodenGeo.attributes.uv;
for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);   // 2 m pro Kachel
const boden = new THREE.Mesh(bodenGeo, mat(0xffffff, { map: bodenTextur, roughness: 0.55 }));
boden.receiveShadow = true;
welt.add(boden);

// Geschossplatte unter dem Raum
const platte = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([
  new THREE.Vector2(-WS, -WS), new THREE.Vector2(W + WS, -WS), new THREE.Vector2(W + WS, L - EC + 0.06),
  new THREE.Vector2(W - EC + 0.06, L + WS), new THREE.Vector2(-WS, L + WS)]), { depth: 0.18, bevelEnabled: false }), mat(0x2a2d33));
platte.rotation.x = Math.PI / 2;
platte.position.y = -0.001;
platte.receiveShadow = true;
welt.add(platte);

const umgebung = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 1 }));
umgebung.rotation.x = -Math.PI / 2;
umgebung.position.copy(P(W / 2, -0.2, L / 2));
umgebung.receiveShadow = true;
szene.add(umgebung);

/* =========================================================
   Fenster, Heizung, Tür, Wanddeko
   ========================================================= */
FENSTER.forEach(f => {
  const g = gruppe();
  const r = 0.05;
  quader(g, f.u0, f.u1, f.v0, f.v0 + r, 0.04, 0.1, M.weiss);
  quader(g, f.u0, f.u1, f.v1 - r, f.v1, 0.04, 0.1, M.weiss);
  quader(g, f.u0, f.u0 + r, f.v0, f.v1, 0.04, 0.1, M.weiss);
  quader(g, f.u1 - r, f.u1, f.v0, f.v1, 0.04, 0.1, M.weiss);
  if (f.kaempfer) {
    quader(g, f.u0, f.u1, f.kaempfer - 0.025, f.kaempfer + 0.025, 0.04, 0.1, M.weiss);
    quader(g, (f.u0 + f.u1) / 2 - 0.02, (f.u0 + f.u1) / 2 + 0.02, f.v0, f.kaempfer, 0.04, 0.1, M.weiss);
  }
  const glas = new THREE.Mesh(new THREE.PlaneGeometry(f.u1 - f.u0, f.v1 - f.v0),
    new THREE.MeshStandardMaterial({ color: 0x31415e, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 }));
  glas.position.copy(P((f.u0 + f.u1) / 2, (f.v0 + f.v1) / 2, 0.07));
  g.add(glas);
  quader(g, f.u0 - 0.05, f.u1 + 0.05, f.v0 - 0.035, f.v0, 0, 0.2, M.weiss, 0.008);                            // Fensterbank
  quader(g, f.u1 - 0.09, f.u1 - 0.07, (f.v0 + f.v1) / 2 - 0.06, (f.v0 + f.v1) / 2 + 0.01, 0.1, 0.13, M.chrom); // Griff
});

// Heizung unter dem großen Fenster
{
  const g = gruppe();
  quader(g, 2.3, 3.4, 0.14, 0.76, 0.05, 0.15, M.weiss, 0.015);
  for (let x = 2.33; x < 3.38; x += 0.045) quader(g, x, x + 0.022, 0.16, 0.74, 0.149, 0.162, mat(0xe6e6e4, { roughness: 0.5 }));
  zylinder(g, 3.36, 0.68, 0.12, 0.022, 0.022, 0.06, M.weiss);
}

// Tür in der abgeschrägten Wand
{
  const tuer = new THREE.Group();
  const mitteU = (TUER.u0 + TUER.u1) / 2, breite = TUER.u1 - TUER.u0;
  tuer.position.copy(P(ecken.C[0] - mitteU / Math.SQRT2, 0, ecken.C[1] + mitteU / Math.SQRT2));
  tuer.rotation.y = Math.PI * 0.75;
  diag.voll.add(tuer);
  const blatt = schatten(new THREE.Mesh(new RoundedBoxGeometry(breite - 0.02, TUER.h - 0.01, 0.04, 2, 0.006), M.weiss));
  blatt.position.set(0, TUER.h / 2, 0.05);
  tuer.add(blatt);
  [[-0.17, 1.45], [0.17, 1.45], [-0.17, 0.55], [0.17, 0.55]].forEach(([u, v]) => {          // Kassetten
    const k = schatten(new THREE.Mesh(new RoundedBoxGeometry(0.26, v > 1 ? 0.82 : 0.68, 0.012, 2, 0.004), mat(0xe9e9e7, { roughness: 0.6 })));
    k.position.set(u, v, 0.026);
    tuer.add(k);
  });
  const zarge = mat(0xf6f6f4, { roughness: 0.5 });
  [-1, 1].forEach(s => {
    const z = new THREE.Mesh(new THREE.BoxGeometry(0.06, TUER.h + 0.06, 0.03), zarge);
    z.position.set(s * (breite / 2 + 0.03), (TUER.h + 0.06) / 2, -0.012); tuer.add(z);
  });
  const sturz = new THREE.Mesh(new THREE.BoxGeometry(breite + 0.18, 0.07, 0.03), zarge); sturz.position.set(0, TUER.h + 0.03, -0.012); tuer.add(sturz);
  const klinke = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.03), M.chrom); klinke.position.set(breite / 2 - 0.12, 1.03, -0.02); tuer.add(klinke);
  const schild = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.008), M.chrom); schild.position.set(breite / 2 - 0.08, 0.98, -0.005); tuer.add(schild);
  // Lichtschalter und Thermostat rechts neben der Tür
  const schalter = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.09, 0.015, 2, 0.008), M.weiss); schalter.position.set(breite / 2 + 0.17, 1.1, -0.01); tuer.add(schalter);
  const thermo = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.09, 0.02, 2, 0.008), M.weiss); thermo.position.set(breite / 2 + 0.17, 0.98, -0.012); tuer.add(thermo);
}

// Weltkarte an der schwarzen Wand (über dem Bett)
{
  const karte = schatten(new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.38, 0.03),
    [M.weiss, M.weiss, M.weiss, M.weiss, mat(0xffffff, { map: weltkarte }), M.weiss]));
  karte.position.copy(P(1.25, 1.62, L - 0.02));
  karte.rotation.y = Math.PI;
  welt.add(karte);
}

// Pinnwand am Kniestock hinter dem Schreibtischstuhl
{
  const p = schatten(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.65),
    [mat(0xffffff, { map: pinnwand }), M.weiss, M.weiss, M.weiss, M.weiss, M.weiss]));
  p.position.copy(P(0.01, 0.62, 1.75));
  welt.add(p);
}

// Teppich (Hochflor)
quader(welt, 2.4, 3.65, 0, 0.025, 2.0, 3.9, mat(0xffffff, { map: teppichTextur, roughness: 1 }), 0.012);

/* =========================================================
   Schreibtisch
   ========================================================= */
{
  const g = gruppe();
  quader(g, 0.5, 2.15, 0.71, 0.745, 0.1, 0.9, M.weiss, 0.01);                              // Platte
  [0.62, 2.03].forEach(x => {
    quader(g, x - 0.04, x + 0.04, 0.03, 0.71, 0.44, 0.56, M.weiss, 0.01);                   // Hubsäule
    quader(g, x - 0.035, x + 0.035, 0, 0.035, 0.14, 0.86, M.weiss, 0.01);                  // Fuß
  });
  quader(g, 0.62, 2.03, 0.62, 0.66, 0.47, 0.53, M.weiss);                                   // Traverse
  quader(g, 1.85, 1.98, 0.70, 0.71, 0.82, 0.88, M.schwarz);                                  // Bedienteil

  // Hochkant-Monitor (links) mit Halterung
  quader(g, 2.0, 2.04, 0.75, 1.0, 0.3, 0.34, M.metall);
  quader(g, 1.94, 2.06, 0.8, 1.52, 0.22, 0.42, M.schwarz, 0.01);
  const hoch = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.69), new THREE.MeshBasicMaterial({ map: wallpaper, toneMapped: false }));
  hoch.position.copy(P(1.938, 1.16, 0.32)); hoch.rotation.y = -Math.PI / 2; g.add(hoch);

  // Ultrawide-Monitor
  quader(g, 1.5, 1.56, 0.745, 0.95, 0.24, 0.3, M.metall);
  quader(g, 1.43, 1.63, 0.745, 0.755, 0.18, 0.36, M.metall, 0.005);
  quader(g, 1.08, 1.92, 0.9, 1.3, 0.29, 0.32, M.schwarz, 0.008);
  const breit = new THREE.Mesh(new THREE.PlaneGeometry(0.81, 0.37), new THREE.MeshBasicMaterial({ map: wallpaper, toneMapped: false }));
  breit.position.copy(P(1.5, 1.1, 0.3215)); breit.rotation.y = Math.PI; g.add(breit);
  quader(g, 1.44, 1.56, 1.3, 1.36, 0.29, 0.33, M.schwarz, 0.01);                            // Webcam

  // Laptop auf Ständer
  const alu = mat(0x3a3a3e, { metalness: 0.5, roughness: 0.4 });
  quader(g, 0.68, 1.02, 0.745, 0.79, 0.3, 0.52, M.chrom, 0.005);
  quader(g, 0.68, 1.02, 0.79, 0.805, 0.3, 0.52, alu, 0.004);
  quader(g, 0.68, 1.02, 0.8, 1.03, 0.28, 0.295, alu, 0.004);
  const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ map: wallpaper, toneMapped: false }));
  lapScreen.position.copy(P(0.85, 0.915, 0.2955)); lapScreen.rotation.y = Math.PI; g.add(lapScreen);

  // RGB-Tastatur, Maus, Mauspad, Stream Deck
  quader(g, 1.18, 1.62, 0.745, 0.77, 0.55, 0.68, M.schwarz, 0.006);
  const rgb = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshBasicMaterial({ toneMapped: false, map: textur(leinwand(256, 64, (c, b, h) => {
    const v = c.createLinearGradient(0, 0, b, 0);
    ["#ff3b6b", "#ffb13b", "#f7ff3b", "#3bff86", "#3bd5ff", "#7a3bff", "#ff3bd2"].forEach((f, i, a) => v.addColorStop(i / (a.length - 1), f));
    c.fillStyle = v; c.fillRect(0, 0, b, h);
    c.fillStyle = "rgba(0,0,0,0.65)";
    for (let x = 0; x < b; x += 14) for (let y = 0; y < h; y += 14) { c.fillRect(x + 11, y, 3, 14); c.fillRect(x, y + 11, 14, 3); }
  })) }));
  rgb.rotation.x = -Math.PI / 2; rgb.position.copy(P(1.4, 0.771, 0.615)); g.add(rgb);
  quader(g, 1.7, 1.98, 0.745, 0.748, 0.5, 0.72, M.schwarz, 0.002);
  quader(g, 1.82, 1.88, 0.748, 0.77, 0.58, 0.66, M.schwarz, 0.02);
  quader(g, 1.98, 2.08, 0.745, 0.77, 0.66, 0.74, M.schwarz, 0.005);
  // Tablet, Bücher, Lautsprecher, Pflanze
  quader(g, 1.1, 1.38, 0.745, 0.76, 0.72, 0.88, mat(0x26282e), 0.006);
  quader(g, 0.62, 0.9, 0.745, 0.79, 0.62, 0.84, mat(0xf2f2f2), 0.004);
  quader(g, 2.0, 2.1, 0.745, 0.86, 0.75, 0.85, mat(0x3a3330), 0.01);
  zylinder(g, 1.95, 0.79, 0.25, 0.045, 0.04, 0.09, mat(0x2c2c2c));
  for (let i = 0; i < 9; i++) {
    const blatt = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.22, 4), mat(0x4d7a3c));
    blatt.position.copy(P(1.95 + (zufall() - 0.5) * 0.05, 0.92, 0.25 + (zufall() - 0.5) * 0.05));
    blatt.rotation.set((zufall() - 0.5) * 0.8, 0, (zufall() - 0.5) * 0.8);
    g.add(blatt);
  }
  // Kopfhörer am Tischbein
  const kh = schatten(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 24, Math.PI), M.schwarz));
  kh.position.copy(P(2.11, 0.55, 0.5)); kh.rotation.y = Math.PI / 2; g.add(kh);
}

// Schreibtischstuhl (Gaming-Stil)
{
  const g = gruppe();
  const sx = 1.45, sn = 1.32;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const bein = schatten(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.05), M.chrom));
    bein.position.copy(P(sx + Math.cos(a) * 0.16, 0.07, sn + Math.sin(a) * 0.16));
    bein.rotation.y = a; g.add(bein);
    zylinder(g, sx + Math.cos(a) * 0.31, 0.03, sn + Math.sin(a) * 0.31, 0.03, 0.03, 0.05, M.schwarz, 12);
  }
  zylinder(g, sx, 0.28, sn, 0.028, 0.028, 0.4, M.chrom);
  const leder = mat(0x2a2b30, { roughness: 0.6 });
  quader(g, sx - 0.25, sx + 0.25, 0.44, 0.54, sn - 0.24, sn + 0.24, leder, 0.05);
  quader(g, sx - 0.24, sx + 0.24, 0.55, 1.28, sn + 0.2, sn + 0.3, leder, 0.06);
  quader(g, sx - 0.09, sx + 0.09, 1.0, 1.2, sn + 0.195, sn + 0.2, mat(0x8a8d93));
  [-1, 1].forEach(s => quader(g, sx + s * 0.27 - 0.03, sx + s * 0.27 + 0.03, 0.62, 0.66, sn - 0.15, sn + 0.15, M.chrom, 0.015));
}

/* =========================================================
   Raumteiler mit iPad und Fernseher
   ========================================================= */
const T = { x0: 0.45, x1: 1.65, n0: 2.35, n1: 2.75, h: 1.45 };
let ipadScreen, ipadRahmen;
{
  const g = gruppe();
  quader(g, T.x0, T.x1, 0.02, T.h, T.n0, T.n1, M.dekor, 0.008);
  const front = (x0, x1, y0, y1) => quader(g, x0, x1, y0, y1, T.n0 - 0.012, T.n0 + 0.002, M.weiss, 0.004);
  const fach = (x0, x1, y0, y1) => quader(g, x0, x1, y0, y1, T.n0 + 0.002, T.n0 + 0.004, mat(0x3c3833));
  front(T.x0 + 0.03, T.x0 + 0.56, 0.06, 0.96); fach(T.x0 + 0.03, T.x0 + 0.56, 1.0, 1.42);
  front(T.x0 + 0.6, T.x1 - 0.03, 0.98, 1.42); fach(T.x0 + 0.6, T.x1 - 0.03, 0.44, 0.95);
  front(T.x0 + 0.6, T.x1 - 0.03, 0.06, 0.41);
  quader(g, T.x0 + 0.6, T.x1 - 0.03, 0.68, 0.7, T.n0, T.n0 + 0.3, M.dekor);
  [[T.x0 + 0.2, T.x0 + 0.4, 0.88], [T.x0 + 0.75, T.x0 + 0.95, 1.12], [T.x0 + 0.75, T.x0 + 0.95, 0.3]].forEach(([x0, x1, y]) =>
    quader(g, x0, x1, y, y + 0.02, T.n0 - 0.025, T.n0 - 0.012, M.griff, 0.008));
  // Modellflugzeuge, rotes Modellauto
  [[0.62, 1.16], [0.8, 1.3]].forEach(([x, y]) => {
    zylinder(g, x, y, T.n0 + 0.15, 0.012, 0.012, 0.16, M.weiss).rotation.z = Math.PI / 2;
    quader(g, x - 0.02, x + 0.02, y - 0.004, y + 0.004, T.n0 + 0.07, T.n0 + 0.23, M.weiss);
  });
  quader(g, 1.25, 1.4, 0.7, 0.76, T.n0 + 0.1, T.n0 + 0.2, mat(0xd8261f, { roughness: 0.3 }), 0.025);
  // Bild „GT3 RS“ obendrauf
  const rahmen = quader(g, 0.55, 0.88, T.h, T.h + 0.4, 2.52, 2.54, M.schwarz);
  rahmen.rotation.x = -0.12;
  const bild = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.36), mat(0xffffff, { map: gt3, roughness: 0.6 }));
  bild.position.copy(P(0.715, T.h + 0.2, 2.515)); bild.rotation.x = -0.12; g.add(bild);
  quader(g, 1.0, 1.4, T.h, T.h + 0.05, 2.45, 2.7, mat(0xe9eef2), 0.004);                    // Zeitschriften

  // Fernseher an Schwenkarm (Nordseite, Richtung Bett)
  quader(g, 1.6, 1.64, 0.95, 1.2, T.n1, T.n1 + 0.14, M.metall);
  quader(g, 1.25, 2.25, 0.86, 1.44, T.n1 + 0.14, T.n1 + 0.18, M.schwarz, 0.01);
  const tvBild = new THREE.Mesh(new THREE.PlaneGeometry(0.97, 0.55), new THREE.MeshBasicMaterial({ toneMapped: false,
    map: textur(leinwand(256, 144, (c, b, h) => {
      const v = c.createLinearGradient(0, 0, b, h); v.addColorStop(0, "#14304f"); v.addColorStop(1, "#0b1424");
      c.fillStyle = v; c.fillRect(0, 0, b, h);
      ["#e50914", "#113ccf", "#00a8e1", "#1ce783", "#f5c518"].forEach((f, i) => { c.fillStyle = f; c.fillRect(20 + i * 44, 100, 36, 24); });
    })) }));
  tvBild.position.copy(P(1.75, 1.15, T.n1 + 0.182)); g.add(tvBild);

  // iPad an der Ostseite (anklickbar)
  quader(g, T.x1, T.x1 + 0.02, 0.97, 1.25, 2.39, 2.73, M.schwarz, 0.006);
  ipadScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.215), new THREE.MeshBasicMaterial({ toneMapped: false, map: textur(leinwand(512, 360, c => {
    c.fillStyle = "#0f1115"; c.fillRect(0, 0, 512, 360);
    const k = (x, y, w, h) => { c.fillStyle = "#1a1d24"; c.beginPath(); c.roundRect(x, y, w, h, 12); c.fill(); };
    k(14, 14, 160, 90); k(14, 114, 160, 160); k(184, 14, 152, 170); k(346, 14, 152, 170); k(184, 194, 152, 120); k(346, 194, 152, 120); k(14, 326, 484, 22);
    c.fillStyle = "#f2f3f5"; c.font = "300 54px Helvetica, Arial"; c.fillText("12:00", 26, 78);
    c.fillStyle = "#5b8cff"; c.fillRect(196, 40, 4, 40); c.fillRect(196, 92, 4, 40);
    c.fillStyle = "#34c759"; c.beginPath(); c.roundRect(440, 214, 40, 22, 11); c.fill();
  })) }));
  ipadScreen.position.copy(P(T.x1 + 0.022, 1.11, 2.56)); ipadScreen.rotation.y = Math.PI / 2; g.add(ipadScreen);
  ipadRahmen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.38), new THREE.MeshBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0, depthWrite: false }));
  ipadRahmen.position.copy(P(T.x1 + 0.021, 1.11, 2.56)); ipadRahmen.rotation.y = Math.PI / 2; g.add(ipadRahmen);
}

/* =========================================================
   Bett
   ========================================================= */
const B = { x0: 0.22, x1: 1.88, n0: 3.0, n1: 5.17 };
{
  const g = gruppe();
  quader(g, B.x0, B.x1, 0.14, 0.36, B.n0, B.n1 - 0.06, M.weiss, 0.012);                     // Rahmen
  [[B.x0 + 0.04, B.n0 + 0.04], [B.x1 - 0.1, B.n0 + 0.04], [B.x0 + 0.04, B.n1 - 0.16], [B.x1 - 0.1, B.n1 - 0.16]]
    .forEach(([x, n]) => quader(g, x, x + 0.06, 0, 0.14, n, n + 0.06, M.weiss));
  quader(g, B.x0 - 0.01, B.x1 + 0.01, 0.14, 0.95, B.n1 - 0.06, B.n1, M.weiss, 0.012);       // Kopfteil
  quader(g, B.x0 + 0.04, B.x1 - 0.04, 0.36, 0.56, B.n0 + 0.04, B.n1 - 0.08, mat(0x878a90, { roughness: 1 }), 0.05); // Matratze
  quader(g, B.x0 + 0.1, B.x0 + 0.78, 0.55, 0.72, B.n1 - 0.6, B.n1 - 0.12, mat(0x8d9096, { roughness: 1 }), 0.07); // Kissen
  quader(g, B.x1 - 0.78, B.x1 - 0.1, 0.55, 0.7, B.n1 - 0.58, B.n1 - 0.14, mat(0xc6bba9, { roughness: 1 }), 0.07);
  quader(g, B.x1 - 0.6, B.x1 - 0.2, 0.6, 0.78, B.n1 - 0.35, B.n1 - 0.12, mat(0x55575c, { roughness: 1 }), 0.06);
  const decke = mat(0xffffff, { map: deckenTextur, roughness: 1 });
  quader(g, B.x0 + 0.02, B.x1 - 0.02, 0.5, 0.64, B.n0 + 0.12, B.n1 - 0.65, decke, 0.05);   // Decke
  quader(g, B.x0 + 0.02, B.x1 - 0.02, 0.5, 0.67, B.n1 - 0.85, B.n1 - 0.62, decke, 0.07);   // Umschlag
  quader(g, 1.35, 1.5, 0.64, 0.66, 3.7, 3.75, M.schwarz, 0.005);                             // Fernbedienung
}

/* =========================================================
   Nachttisch mit Lampe
   ========================================================= */
let schirmMaterial;
{
  const g = gruppe();
  const x0 = 1.97, x1 = 2.47, n0 = 4.75, n1 = 5.17;
  quader(g, x0, x1, 0.5, 0.535, n0, n1, M.nuss, 0.005);
  quader(g, x0, x0 + 0.03, 0.02, 0.5, n0, n1, M.nuss);
  quader(g, x1 - 0.03, x1, 0.02, 0.5, n0, n1, M.nuss);
  quader(g, x0 + 0.03, x1 - 0.03, 0.27, 0.49, n0 - 0.005, n1, M.weiss, 0.006);
  quader(g, x0 + 0.03, x1 - 0.03, 0.03, 0.25, n0 - 0.005, n1, M.weiss, 0.006);
  [0.38, 0.14].forEach(y => quader(g, x0 + 0.12, x1 - 0.12, y, y + 0.015, n0 - 0.02, n0 - 0.005, M.chrom, 0.006));
  zylinder(g, 2.3, 0.55, 4.98, 0.065, 0.075, 0.03, M.schwarz);
  zylinder(g, 2.3, 0.68, 4.98, 0.011, 0.011, 0.26, M.schwarz, 12);
  schirmMaterial = new THREE.MeshStandardMaterial({ color: 0x9b8a84, roughness: 1, side: THREE.DoubleSide, emissive: 0x000000 });
  const schirm = schatten(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.21, 40, 1, true), schirmMaterial));
  schirm.position.copy(P(2.3, 0.88, 4.98)); g.add(schirm);
  quader(g, 2.02, 2.1, 0.535, 0.66, 4.85, 4.93, mat(0xd6d6d6), 0.01);                        // MagSafe-Ständer
}

/* =========================================================
   Kleiderschrank (Ostwand) – steht 6 cm vor der Wand
   ========================================================= */
const S = { x0: W - 0.64, x1: W - 0.06, n0: 1.75, n1: 3.78, h: 2.06 };
{
  const g = gruppe();
  quader(g, S.x0, S.x1, 0.02, S.h, S.n0, S.n1, M.dekor, 0.006);
  const tuer = (n0, n1, y0, y1) => quader(g, S.x0 - 0.014, S.x0 + 0.002, y0, y1, n0, n1, M.weiss, 0.004);
  tuer(2.46, 3.1, 0.06, S.h - 0.04); tuer(3.12, 3.74, 0.06, S.h - 0.04);                       // große Türen
  tuer(1.79, 2.42, 1.16, S.h - 0.04);                                                           // oben rechts
  tuer(1.79, 2.42, 0.06, 0.38); tuer(1.79, 2.42, 0.41, 0.73);                                   // Schubladen
  const griff = (y, n0, n1) => quader(g, S.x0 - 0.03, S.x0 - 0.014, y, y + 0.022, n0, n1, M.griff, 0.009);
  griff(1.0, 2.95, 3.06); griff(1.0, 3.16, 3.27); griff(1.22, 1.98, 2.24); griff(0.6, 1.98, 2.24); griff(0.27, 1.98, 2.24);
  // beleuchtete Vitrine mit LEGO-Schloss + Fotos
  quader(g, S.x0 + 0.02, S.x1 - 0.02, 0.76, 1.13, 1.79, 2.42, mat(0xe9eef7, { emissive: 0xc9dbf2, emissiveIntensity: 0.55 }));
  quader(g, S.x0 - 0.002, S.x0 + 0.3, 0.78, 0.86, 1.86, 2.36, mat(0xa49478), 0.01);
  [[1.92, 0.98], [2.05, 1.03], [2.18, 0.95], [2.28, 1.0]].forEach(([n, y]) => zylinder(g, S.x0 + 0.1, (y + 0.86) / 2, n, 0.018, 0.026, y - 0.86, mat(0x8a7e6a), 8));
  quader(g, S.x0 + 0.02, S.x0 + 0.04, 0.6, 0.73, 1.85, 2.0, mat(0xc04f3a));
  quader(g, S.x0 + 0.02, S.x0 + 0.04, 0.6, 0.72, 2.05, 2.2, mat(0x5c8a4a));
}

/* =========================================================
   Metallregal (Südost-Ecke)
   ========================================================= */
{
  const g = gruppe();
  const R = { x0: W - 0.42, x1: W - 0.04, n0: 0.42, n1: 1.6 };
  [[R.x0, R.n0], [R.x1 - 0.03, R.n0], [R.x0, R.n1 - 0.03], [R.x1 - 0.03, R.n1 - 0.03], [R.x0, (R.n0 + R.n1) / 2], [R.x1 - 0.03, (R.n0 + R.n1) / 2]]
    .forEach(([x, n]) => quader(g, x, x + 0.03, 0, 0.92, n, n + 0.03, M.metall));
  [0.9, 0.5].forEach(y => quader(g, R.x0, R.x1, y, y + 0.03, R.n0, R.n1, M.nuss, 0.004));
  quader(g, R.x0 - 0.003, R.x0, 0.06, 0.47, R.n0 + 0.04, R.n1 - 0.04, mat(0x2b2b2e, { metalness: 0.5, roughness: 0.5 }));  // Gitterfronten
  for (let i = 0; i < 7; i++) quader(g, R.x0 + 0.05, R.x1 - 0.05, 0.53, 0.86, 0.98 + i * 0.075, 1.045 + i * 0.075, mat(0x232323), 0.004); // Ordner
  quader(g, R.x0 + 0.05, R.x1 - 0.04, 0.53, 0.8, 0.48, 0.9, mat(0x2f2f32), 0.008);                                                         // Box
  zylinder(g, W - 0.24, 1.02, 0.6, 0.075, 0.075, 0.18, mat(0xf4f4f4, { roughness: 0.4 }));                                                   // Router
  quader(g, W - 0.34, W - 0.1, 0.93, 0.96, 1.15, 1.5, M.schwarz);                                                                           // LEGO-Skyline
  [[1.22, 0.32], [1.3, 0.22], [1.4, 0.4]].forEach(([n, h]) => quader(g, W - 0.25, W - 0.19, 0.96, 0.96 + h, n, n + 0.05, mat(0xd8d4cc)));
  zylinder(g, W - 0.2, 1.0, 1.55, 0.05, 0.045, 0.1, mat(0x2c2c2c));
  const ny = quader(g, W - 0.08, W - 0.05, 0.93, 1.75, 0.55, 1.25, M.schwarz);                                                              // Poster New York
  ny.rotation.z = 0.08;
}

/* =========================================================
   LEDs
   ========================================================= */
const ledObjekte = {};

function ledMaterial() { return new THREE.MeshBasicMaterial({ color: 0x3a3a3a, toneMapped: false }); }
function leuchtFlaeche(tex, breite, hoehe, position, drehung) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(breite, hoehe), new THREE.MeshBasicMaterial({
    map: tex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  m.position.copy(position);
  if (drehung) m.rotation.set(drehung[0], drehung[1], drehung[2]);
  m.renderOrder = 2;
  welt.add(m);
  return m;
}
function punktlicht(pos, reichweite) {
  const l = new THREE.PointLight(0xffffff, 0, reichweite, 2);
  l.position.copy(pos);
  welt.add(l);
  return l;
}
function treffer(geo, pos) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.position.copy(pos);
  welt.add(m);
  return m;
}

// 1) „LED Band“: Neon-Schlauch in S-Form an der Fensterwand über dem Schreibtisch
{
  const punkte2d = [[2.32, 2.4], [2.24, 2.16], [2.36, 1.96], [2.17, 1.79], [1.88, 1.85], [1.7, 2.02], [1.52, 1.93], [1.47, 1.76], [1.3, 1.68]];
  const kurve = new THREE.CatmullRomCurve3(punkte2d.map(([x, y]) => P(x, y, 0.025)), false, "catmullrom", 0.5);
  const kern = new THREE.Mesh(new THREE.TubeGeometry(kurve, 160, 0.012, 10), ledMaterial());
  welt.add(kern);
  const halo = new THREE.Mesh(new THREE.TubeGeometry(kurve, 160, 0.03, 10), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  welt.add(halo);
  const fein = kurve.getSpacedPoints(80).map(p => [p.x, p.y]);
  const bx0 = 0.9, bx1 = 2.75, by0 = 1.2, by1 = 2.45;
  const glanz = leuchtTextur(240, 160, (u, v) => {
    const x = bx0 + u * (bx1 - bx0), y = by0 + v * (by1 - by0);
    let d = 9;
    for (let i = 1; i < fein.length; i++) d = Math.min(d, abstandZurLinie(x, y, fein[i - 1][0], fein[i - 1][1], fein[i][0], fein[i][1]));
    return d;
  }, 0.16);
  const wandSchein = leuchtFlaeche(glanz, bx1 - bx0, by1 - by0, P((bx0 + bx1) / 2, (by0 + by1) / 2, 0.012));
  ledObjekte.neon = {
    leuchtend: [kern], halos: [{ m: halo, staerke: 0.55 }], scheine: [{ m: wandSchein, staerke: 1.0 }],
    licht: punktlicht(P(1.85, 1.9, 0.4), 3.2),
    treffer: [treffer(new THREE.BoxGeometry(1.3, 0.9, 0.2), P(1.82, 1.98, 0.1))],
    anker: P(1.82, 2.25, 0.05)
  };
}

// 2) „Schreibtisch“: Streifen hinter den Monitoren, strahlt an die Wand
{
  const m1 = quader(welt, 0.62, 2.05, 0.76, 0.775, 0.12, 0.135, ledMaterial());
  const m2 = quader(welt, 2.065, 2.075, 0.84, 1.48, 0.24, 0.4, ledMaterial());
  m1.castShadow = m2.castShadow = false;
  const glanz = leuchtTextur(200, 100, (u, v) => {
    const x = 0.3 + u * 2.1, y = 0.7 + v * 1.0;
    return Math.min(abstandZurLinie(x, y, 0.75, 0.95, 2.0, 0.95), abstandZurLinie(x, y, 2.05, 0.9, 2.05, 1.45) * 0.8);
  }, 0.22);
  const wandSchein = leuchtFlaeche(glanz, 2.1, 1.0, P(1.35, 1.2, 0.012));
  const tischSchein = leuchtFlaeche(leuchtTextur(128, 64, (u, v) => abstandZumRechteck(u, v, 0.15, 0.6, 0.85, 1) * 0.6, 0.18),
    1.6, 0.8, P(1.33, 0.747, 0.5), [-Math.PI / 2, 0, 0]);
  ledObjekte.desk = {
    leuchtend: [m1, m2], halos: [], scheine: [{ m: wandSchein, staerke: 0.95 }, { m: tischSchein, staerke: 0.35 }],
    licht: punktlicht(P(1.4, 1.1, 0.2), 2.2), lichtStaerke: 0.9,
    treffer: [treffer(new THREE.BoxGeometry(1.7, 0.9, 0.5), P(1.32, 1.1, 0.3))],
    anker: P(1.32, 1.62, 0.25)
  };
}

// 3) „Smart LED Bulb“ in der Nachttischlampe
{
  const birne = zylinder(welt, 2.3, 0.86, 4.98, 0.035, 0.035, 0.07, ledMaterial(), 16);
  birne.castShadow = false;
  const kegel = leuchtTextur(128, 192, (u, v) => {
    const dx = Math.abs(u - 0.5), mitte = 0.42;
    const breite = 0.13 + Math.abs(v - mitte) * 0.55;
    return Math.max(0, dx - breite) + Math.abs(v - mitte) * 0.18;
  }, 0.12);
  const wandSchein = leuchtFlaeche(kegel, 1.2, 1.9, P(2.3, 1.05, L - 0.012), [0, Math.PI, 0]);
  const bodenSchein = leuchtFlaeche(leuchtTextur(64, 64, (u, v) => Math.hypot(u - 0.5, v - 0.5), 0.2), 0.7, 0.7, P(2.22, 0.54, 4.96), [-Math.PI / 2, 0, 0]);
  ledObjekte.bulb = {
    leuchtend: [birne], halos: [], scheine: [{ m: wandSchein, staerke: 0.9 }, { m: bodenSchein, staerke: 0.5 }], schirm: schirmMaterial,
    licht: punktlicht(P(2.3, 0.88, 4.9), 3.0),
    treffer: [treffer(new THREE.BoxGeometry(0.45, 0.6, 0.45), P(2.3, 0.8, 4.98))],
    anker: P(2.3, 1.12, 4.98)
  };
}

// 4) Bluetooth-Streifen unter dem Bett: weicher Lichtsaum auf dem Boden
{
  const ix0 = B.x0 + 0.12, ix1 = B.x1 - 0.12, in0 = B.n0 + 0.12, in1 = B.n1 - 0.2;
  const leiste = [
    quader(welt, ix0, ix1, 0.12, 0.13, in0, in0 + 0.012, ledMaterial()),
    quader(welt, ix0, ix1, 0.12, 0.13, in1 - 0.012, in1, ledMaterial()),
    quader(welt, ix0, ix0 + 0.012, 0.12, 0.13, in0, in1, ledMaterial()),
    quader(welt, ix1 - 0.012, ix1, 0.12, 0.13, in0, in1, ledMaterial())
  ];
  leiste.forEach(m => (m.castShadow = false));
  const rand = 0.55;
  const fx0 = B.x0 - rand, fx1 = B.x1 + rand, fn0 = B.n0 - rand, fn1 = B.n1;
  const saum = leuchtTextur(200, 256, (u, v) => {
    const x = fx0 + u * (fx1 - fx0), n = fn0 + v * (fn1 - fn0);
    return abstandZumRechteck(x, n, B.x0 + 0.02, B.n0 + 0.02, B.x1 - 0.02, B.n1);
  }, 0.24);
  const bodenSchein = leuchtFlaeche(saum, fx1 - fx0, fn1 - fn0, P((fx0 + fx1) / 2, 0.004, (fn0 + fn1) / 2), [-Math.PI / 2, 0, 0]);
  ledObjekte.bett = {
    leuchtend: leiste, halos: [], scheine: [{ m: bodenSchein, staerke: 1.0 }],
    licht: punktlicht(P((B.x0 + B.x1) / 2, 0.06, 4.0), 1.8), lichtStaerke: 0.5,
    treffer: [treffer(new THREE.BoxGeometry(B.x1 - B.x0 + 0.4, 0.4, B.n1 - B.n0 + 0.3), P((B.x0 + B.x1) / 2, 0.2, (B.n0 + B.n1) / 2))],
    anker: P(B.x1 + 0.25, 0.25, 3.25)
  };
}

// 5) Bluetooth-Streifen hinter dem Kleiderschrank: Lichtsaum an der Wand
{
  const leiste = [
    quader(welt, W - 0.055, W - 0.045, S.h - 0.03, S.h - 0.01, S.n0 + 0.03, S.n1 - 0.03, ledMaterial()),
    quader(welt, W - 0.055, W - 0.045, 0.3, S.h - 0.03, S.n0 + 0.03, S.n0 + 0.05, ledMaterial()),
    quader(welt, W - 0.055, W - 0.045, 0.3, S.h - 0.03, S.n1 - 0.05, S.n1 - 0.03, ledMaterial())
  ];
  leiste.forEach(m => (m.castShadow = false));
  const rand = 0.5;
  const sn0 = S.n0 - rand, sn1 = S.n1 + rand;
  const saum = leuchtTextur(256, 160, (u, v) => {
    const n = sn0 + u * (sn1 - sn0), y = 0.2 + v * (H - 0.2);
    return abstandZumRechteck(n, y, S.n0 + 0.06, 0.45, S.n1 - 0.06, S.h - 0.04);
  }, 0.2);
  const wandSchein = leuchtFlaeche(saum, sn1 - sn0, H - 0.2, P(W - 0.003, 0.2 + (H - 0.2) / 2, (sn0 + sn1) / 2), [0, -Math.PI / 2, 0]);
  ost.extras.push(wandSchein);
  ledObjekte.schrank = {
    leuchtend: leiste, halos: [], scheine: [{ m: wandSchein, staerke: 1.0 }],
    licht: punktlicht(P(W - 0.25, S.h + 0.2, (S.n0 + S.n1) / 2), 2.2),
    treffer: [treffer(new THREE.BoxGeometry(0.75, 0.5, S.n1 - S.n0), P(S.x0 + 0.3, S.h + 0.12, (S.n0 + S.n1) / 2))],
    anker: P(S.x0 + 0.3, S.h + 0.12, (S.n0 + S.n1) / 2)
  };
}

/* =========================================================
   Zustand der Lichter → Darstellung
   ========================================================= */
function btAn() { try { return localStorage.getItem("bt-licht") === "an"; } catch { return false; } }
function btSetzen(an) { try { localStorage.setItem("bt-licht", an ? "an" : "aus"); } catch {} }
function goveeLicht(name) { return (typeof lichter !== "undefined" ? lichter : []).find(l => l.name === name); }

function ledZustand(led) {
  if (led.kurzbefehl) return { an: btAn(), farbe: "#ff9b5e", helligkeit: 100, bekannt: true };
  const l = goveeLicht(led.govee);
  if (!l) return { an: false, farbe: "#ffd27a", helligkeit: 0, bekannt: false };
  return {
    an: !!l.an && l.online !== false,
    farbe: typeof lichtFarbe === "function" ? lichtFarbe(l) : "#ffd27a",
    helligkeit: l.helligkeit || 100, bekannt: true, licht: l
  };
}

const AUS = new THREE.Color(0x3a3a3c);
function aktualisiereLeds() {
  let anzahlAn = 0;
  LEDS.forEach(led => {
    const o = ledObjekte[led.id];
    const z = ledZustand(led);
    if (z.an) anzahlAn++;
    const farbe = new THREE.Color(z.farbe);
    const k = z.an ? 0.4 + 0.6 * (z.helligkeit / 100) : 0;
    o.leuchtend.forEach(m => m.material.color.copy(z.an ? farbe.clone().multiplyScalar(1.4) : AUS));
    o.halos.forEach(h => { h.m.material.color.copy(farbe); h.m.material.opacity = h.staerke * k; });
    o.scheine.forEach(s => { s.m.material.color.copy(farbe); s.m.material.opacity = s.staerke * k; });
    o.licht.color.copy(farbe);
    o.licht.intensity = (o.lichtStaerke ?? 1.2) * k;
    if (o.schirm) { o.schirm.emissive.copy(z.an ? farbe : new THREE.Color(0)); o.schirm.emissiveIntensity = 0.7 * k; }
    if (o.marker) {
      o.marker.classList.toggle("an", z.an);
      o.marker.classList.toggle("unbekannt", !z.bekannt);
      o.marker.style.setProperty("--led-farbe", z.farbe);
      o.marker.querySelector(".raum-marker-status").textContent = !z.bekannt ? "–" : z.an ? `${z.helligkeit} %` : "aus";
    }
  });
  const zahl = document.getElementById("raum-licht-zahl");
  if (zahl) zahl.textContent = anzahlAn === 0 ? "alle Lichter aus" : anzahlAn === 1 ? "1 Licht an" : `${anzahlAn} Lichter an`;
}
window.raumAktualisieren = aktualisiereLeds;

/* ---------- Tag/Nacht: abends gedimmt, damit die LEDs wirken ---------- */
function tageslicht() {
  const jetzt = new Date();
  const h = jetzt.getHours() + jetzt.getMinutes() / 60;
  const f = h >= 7.5 && h <= 17 ? 1 : (h > 6.5 && h < 7.5) || (h > 17 && h < 18) ? 0.6 : 0.3;
  himmel.intensity = 1.5 * f;
  sonne.intensity = 2.4 * f;
  renderer.toneMappingExposure = 0.9 + 0.2 * f;
}

/* =========================================================
   Licht-Symbole (HTML über der 3D-Ansicht)
   ========================================================= */
const ebene = document.getElementById("raum-labels");
const GLUEHBIRNE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Zm-2 18h4a1 1 0 0 1 0 2h-4a1 1 0 0 1 0-2Z"/></svg>`;
const TABLET = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v14h12V4H6Z"/></svg>`;

let langDruck = null;
LEDS.forEach(led => {
  const el = document.createElement("button");
  el.className = "raum-marker";
  el.innerHTML = `<span class="raum-marker-kreis">${GLUEHBIRNE}</span><span class="raum-marker-text"><b></b><span class="raum-marker-status"></span></span>`;
  el.querySelector("b").textContent = led.name;
  // Tippen = schalten, gedrückt halten = einstellen
  el.addEventListener("pointerdown", e => {
    e.stopPropagation();
    const x = e.clientX, y = e.clientY;
    langDruck = { led, ausgeloest: false, timer: setTimeout(() => { langDruck.ausgeloest = true; einstellen(led, x, y); }, 480) };
  });
  el.addEventListener("pointerup", e => {
    e.stopPropagation();
    if (!langDruck || langDruck.led !== led) return;
    clearTimeout(langDruck.timer);
    if (!langDruck.ausgeloest) umschalten(led);
    langDruck = null;
  });
  el.addEventListener("pointercancel", () => { if (langDruck) clearTimeout(langDruck.timer); langDruck = null; });
  el.addEventListener("contextmenu", e => e.preventDefault());
  ebene.appendChild(el);
  ledObjekte[led.id].marker = el;
});
const ipadMarker = document.createElement("button");
ipadMarker.className = "raum-marker raum-marker-ipad";
ipadMarker.innerHTML = `<span class="raum-marker-kreis">${TABLET}</span><span class="raum-marker-text"><b>Dashboard</b><span class="raum-marker-status">öffnen</span></span>`;
ipadMarker.addEventListener("click", e => { e.stopPropagation(); zeigeDashboard(); });
ebene.appendChild(ipadMarker);
const ipadAnker = P(T.x1 + 0.03, 1.38, 2.56);

const hv = new THREE.Vector3();
function setzeMarker(el, anker) {
  hv.copy(anker).project(kamera);
  el.style.display = hv.z < 1 ? "" : "none";
  el.style.transform = `translate(${(hv.x + 1) / 2 * container.clientWidth}px, ${(1 - hv.y) / 2 * container.clientHeight}px) translate(-20px, -50%)`;
}

/* ---------- Schalten ---------- */
function umschalten(led) {
  const z = ledZustand(led);
  if (!z.bekannt) { einstellen(led); return; }
  schalten(led, !z.an);
}
function schalten(led, an) {
  if (led.kurzbefehl) {
    btSetzen(an);
    aktualisiereLeds();
    const k = (typeof KURZBEFEHL_LICHTER !== "undefined" ? KURZBEFEHL_LICHTER : [])[0];
    if (k && typeof kurzbefehlStarten === "function") setTimeout(() => kurzbefehlStarten(an ? k.an : k.aus), 250);
  } else {
    const l = goveeLicht(led.govee);
    if (l && typeof schalteLicht === "function") schalteLicht(l, "an", an);
  }
  setTimeout(aktualisiereLeds, 30);
}

const popup = document.getElementById("raum-popup");
let popupLed = null;
function einstellen(led, x, y) {
  const l = led.govee && goveeLicht(led.govee);
  if (l && typeof oeffneLicht === "function") { oeffneLicht(l); return; }
  popupLed = led;
  popup.querySelector(".raum-popup-name").textContent = led.name;
  popup.querySelector(".raum-popup-info").textContent = led.kurzbefehl
    ? "Bluetooth · Bett & Kleiderschrank schalten gemeinsam"
    : "Govee ist noch nicht verbunden – verbinde es im Dashboard (Licht-Kachel).";
  popup.querySelectorAll("[data-aktion]").forEach(k => (k.hidden = !led.kurzbefehl));
  popup.hidden = false;
  const r = container.getBoundingClientRect();
  const px = x ?? r.width / 2, py = y ?? r.height / 2;
  popup.style.left = Math.min(Math.max(12, px - r.left - popup.offsetWidth / 2), r.width - popup.offsetWidth - 12) + "px";
  popup.style.top = Math.min(Math.max(70, py - r.top - popup.offsetHeight - 24), r.height - popup.offsetHeight - 90) + "px";
}
function versteckePopup() { popup.hidden = true; popupLed = null; }
popup.addEventListener("click", e => {
  const a = e.target.closest("[data-aktion]")?.dataset.aktion;
  if (a && popupLed) schalten(popupLed, a === "an");
  versteckePopup();
});

document.getElementById("raum-alle-aus")?.addEventListener("click", () => alle(false));
document.getElementById("raum-alle-an")?.addEventListener("click", () => alle(true));
async function alle(an) {
  if (typeof lichter !== "undefined") lichter.forEach(l => { if (l.online !== false) l.an = an; });
  aktualisiereLeds();
  try { if (typeof helfer === "function") await helfer("/govee/alle", { an }); } catch (e) { console.error(e); }
  if (typeof zeigeLichter === "function") zeigeLichter();
}

/* ---------- Antippen im 3D-Bild ---------- */
const strahl = new THREE.Raycaster();
const zeiger = new THREE.Vector2();
let druck = null;
renderer.domElement.addEventListener("pointerdown", e => { druck = { x: e.clientX, y: e.clientY, t: Date.now() }; });
renderer.domElement.addEventListener("pointerup", e => {
  if (!druck) return;
  const kurz = Math.hypot(e.clientX - druck.x, e.clientY - druck.y) < 10 && Date.now() - druck.t < 500;
  druck = null;
  if (!kurz) return;
  const r = renderer.domElement.getBoundingClientRect();
  zeiger.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  strahl.setFromCamera(zeiger, kamera);
  const ziele = [ipadScreen, ipadRahmen, ...LEDS.flatMap(l => ledObjekte[l.id].treffer)];
  const t = strahl.intersectObjects(ziele, false)[0];
  if (!t) { versteckePopup(); return; }
  if (t.object === ipadScreen || t.object === ipadRahmen) { zeigeDashboard(); return; }
  const led = LEDS.find(l => ledObjekte[l.id].treffer.includes(t.object));
  if (led) umschalten(led);
});

/* =========================================================
   Wetter unten rechts + Regen/Schnee-Effekt
   ========================================================= */
const effektCanvas = document.getElementById("raum-effekt");
const effekt = effektCanvas.getContext("2d");
let wetterArt = "";
let tropfen = [];
function wetterAktualisieren() {
  const text = document.getElementById("wetter-text")?.textContent || "";
  document.getElementById("raum-wetter-temp").textContent = document.getElementById("wetter-temp")?.textContent || "--°";
  document.getElementById("raum-wetter-text").textContent = text;
  document.getElementById("raum-wetter-details").textContent =
    (document.getElementById("wetter-details")?.textContent || "").split(" · ").slice(0, 2).join(" · ");
  const art = /Schnee/i.test(text) ? "schnee" : /Regen|Niesel|Schauer|Gewitter/i.test(text) ? "regen" : "";
  if (art !== wetterArt) {
    wetterArt = art;
    tropfen = Array.from({ length: art === "schnee" ? 90 : art === "regen" ? 140 : 0 },
      () => ({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6 }));
  }
}
function wetterZeichnen() {
  const b = effektCanvas.width, h = effektCanvas.height;
  effekt.clearRect(0, 0, b, h);
  if (!wetterArt) return;
  const dpr = window.devicePixelRatio || 1;
  effekt.strokeStyle = "rgba(190,205,230,0.22)";
  effekt.fillStyle = "rgba(255,255,255,0.55)";
  effekt.lineWidth = 1.2 * dpr;
  tropfen.forEach(t => {
    if (wetterArt === "regen") {
      t.y += 0.012 * t.v; t.x -= 0.002 * t.v;
      effekt.beginPath(); effekt.moveTo(t.x * b, t.y * h); effekt.lineTo(t.x * b + 6 * dpr, t.y * h - 26 * t.v * dpr); effekt.stroke();
    } else {
      t.y += 0.0015 * t.v; t.x += Math.sin(t.y * 20 + t.v * 5) * 0.0006;
      effekt.beginPath(); effekt.arc(t.x * b, t.y * h, 1.6 * t.v * dpr, 0, 7); effekt.fill();
    }
    if (t.y > 1.05) { t.y = -0.05; t.x = Math.random() * 1.1; }
  });
}

/* =========================================================
   Ansicht wechseln: 3D-Zimmer ↔ Dashboard
   ========================================================= */
const raumAnsicht = document.getElementById("raum");
let laeuft = false;
function zeigeDashboard() {
  versteckePopup();
  raumAnsicht.classList.add("weg");
  laeuft = false;
  renderer.setAnimationLoop(null);
}
function zeigeRaum() {
  raumAnsicht.classList.remove("weg");
  groesseAnpassen();
  tageslicht();
  aktualisiereLeds();
  wetterAktualisieren();
  if (!laeuft) { laeuft = true; renderer.setAnimationLoop(zeichnen); }
}
window.zeigeRaum = zeigeRaum;
window.zeigeDashboard = zeigeDashboard;
document.getElementById("zum-raum")?.addEventListener("click", zeigeRaum);
document.getElementById("zum-dashboard")?.addEventListener("click", zeigeDashboard);

const zuKamera = new THREE.Vector3();
function zeichnen(zeit) {
  steuerung.update();
  // Wände zwischen Kamera und Raum auf Sockelhöhe abschneiden
  waende.forEach(w => {
    zuKamera.copy(kamera.position).sub(w.mitte);
    const vorne = zuKamera.dot(w.aussen) > 0;
    w.voll.visible = !vorne;
    w.niedrig.visible = vorne;
    w.extras.forEach(e => (e.visible = !vorne));
  });
  ipadRahmen.material.opacity = 0.18 + 0.16 * Math.sin(zeit / 450);
  LEDS.forEach(l => setzeMarker(ledObjekte[l.id].marker, ledObjekte[l.id].anker));
  setzeMarker(ipadMarker, ipadAnker);
  renderer.render(szene, kamera);
  wetterZeichnen();
}

function groesseAnpassen() {
  const b = container.clientWidth, h = container.clientHeight;
  if (!b || !h) return;
  renderer.setSize(b, h, false);
  const dpr = window.devicePixelRatio || 1;
  effektCanvas.width = b * dpr; effektCanvas.height = h * dpr;
  kamera.aspect = b / h;
  kamera.fov = b < h ? 56 : 43;
  // Bild etwas nach unten schieben, damit oben Platz für die Statusleiste bleibt
  kamera.setViewOffset(b, h, 0, -h * (b < h ? 0.0 : 0.05), b, h);
  kamera.updateProjectionMatrix();
}
window.addEventListener("resize", groesseAnpassen);

// Hinweis beim ersten Start
const tipp = document.getElementById("raum-tipp");
try {
  if (!localStorage.getItem("raum-tipp-gesehen")) {
    tipp.hidden = false;
    setTimeout(() => { tipp.classList.add("weg"); localStorage.setItem("raum-tipp-gesehen", "1"); }, 7000);
  }
} catch {}

zeigeRaum();
setInterval(() => { if (laeuft) { aktualisiereLeds(); wetterAktualisieren(); tageslicht(); } }, 5000);
