/* =========================================================
   3D-ZIMMER
   Interaktives Modell von Leos Zimmer (Three.js).
   - Tippen auf eine LED: Licht schalten / einstellen
   - Tippen auf das iPad am Raumteiler: Dashboard öffnen

   Maße in Metern. Koordinaten:
     x = von West (Dachschräge, Bett) nach Ost (Kleiderschrank)
     n = von Süd (Fensterwand, Schreibtisch) nach Nord (schwarze Wand)
     y = Höhe
   Alle Maße sind aus Fotos geschätzt und können unten angepasst werden.
   ========================================================= */
import * as THREE from "./lib/three.module.min.js";
import { OrbitControls } from "./lib/OrbitControls.js";

/* ---------- Raummaße ---------- */
const RAUM = {
  breite: 4.4,        // West → Ost
  laenge: 5.2,        // Süd → Nord
  hoehe: 2.45,        // Deckenhöhe (flacher Teil)
  kniestock: 1.0,     // Höhe der niedrigen Wand unter der Schräge
  schraegeWest: 1.5,  // so weit ragt die Schräge auf der Westseite in den Raum
  schraegeOst: 1.5,   // Schräge auf der Ostseite (nur im Süden, über dem Regal)
  schraegeOstBis: 1.7 // bis hierhin (von Süden) reicht die Ostschräge
};

/* ---------- Farben ---------- */
const FARBE = {
  boden: 0xb8b1a6,
  wand: 0xf1f1f3,
  schwarzeWand: 0x1d2320,
  weiss: 0xf4f4f4,
  holzGrau: 0x6f6862,
  nussbaum: 0x9a6a3c,
  matratze: 0x8d9095,
  teppich: 0x4a4c52,
  metallSchwarz: 0x1f1f22,
  bildschirm: 0x0c0c12,
  glas: 0x26324a
};

/* ---------- LEDs ----------
   govee:      Name des Lichts in der Govee-App
   kurzbefehl: Bluetooth-Licht, wird über den Kurzbefehl geschaltet      */
const LEDS = [
  { id: "neon",    name: "LED Band",       govee: "LED Band" },
  { id: "desk",    name: "Schreibtisch",   govee: "Schreibtisch" },
  { id: "bulb",    name: "Nachttisch",     govee: "Smart LED Bulb" },
  { id: "bett",    name: "Bett",           kurzbefehl: true },
  { id: "schrank", name: "Raumteiler",     kurzbefehl: true }
];

/* =========================================================
   Hilfsfunktionen
   ========================================================= */
const W = RAUM.breite, L = RAUM.laenge, H = RAUM.hoehe, K = RAUM.kniestock;

// Raum-Koordinate (x, y, n) → Three.js (n zeigt nach -z, damit Norden oben ist)
const P = (x, y, n) => new THREE.Vector3(x, y, -n);

const materialCache = {};
function mat(farbe, extra = {}) {
  const schluessel = farbe + JSON.stringify(extra);
  if (!materialCache[schluessel]) {
    materialCache[schluessel] = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.85, metalness: 0, ...extra });
  }
  return materialCache[schluessel];
}

// Quader von (x0, y0, n0) bis (x1, y1, n1)
function quader(gruppe, x0, x1, y0, y1, n0, n1, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, n1 - n0), material);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, -(n0 + n1) / 2);
  gruppe.add(m);
  return m;
}

function zylinder(gruppe, x, y, n, radiusOben, radiusUnten, hoehe, material, segmente = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radiusOben, radiusUnten, hoehe, segmente), material);
  m.position.set(x, y, -n);
  gruppe.add(m);
  return m;
}

// Fläche aus beliebigen Eckpunkten (konvex, im Uhrzeigersinn egal)
function flaeche(gruppe, punkte, material) {
  const g = new THREE.BufferGeometry();
  const v = [];
  for (let i = 1; i < punkte.length - 1; i++) v.push(...punkte[0].toArray(), ...punkte[i].toArray(), ...punkte[i + 1].toArray());
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  gruppe.add(m);
  return m;
}

// Wand mit Fensteröffnungen, als Umriss in der x/y-Ebene; liegt bei n (Süd/Nord)
function giebelwand(gruppe, umriss, loecher, n, material) {
  const form = new THREE.Shape(umriss.map(([x, y]) => new THREE.Vector2(x, y)));
  loecher.forEach(([x0, x1, y0, y1]) => {
    form.holes.push(new THREE.Path([new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1)]));
  });
  const m = new THREE.Mesh(new THREE.ShapeGeometry(form), material);
  m.position.z = -n;
  gruppe.add(m);
  return m;
}

// Weicher Lichtschein (für LEDs)
let leuchtTextur;
function leuchtSprite(gruppe, x, y, n, groesse) {
  if (!leuchtTextur) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const verlauf = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    verlauf.addColorStop(0, "rgba(255,255,255,1)");
    verlauf.addColorStop(0.25, "rgba(255,255,255,0.45)");
    verlauf.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = verlauf;
    g.fillRect(0, 0, 128, 128);
    leuchtTextur = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: leuchtTextur, color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  s.position.copy(P(x, y, n));
  s.scale.set(groesse, groesse, 1);
  gruppe.add(s);
  return s;
}

/* =========================================================
   Szene
   ========================================================= */
const container = document.getElementById("raum-3d");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const szene = new THREE.Scene();
szene.background = new THREE.Color(0x0f1115);

const kamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
const ziel = P(W / 2, 0.6, L / 2);
kamera.position.set(W / 2 + 0.6, 7.6, -L / 2 + 5.6);

const steuerung = new OrbitControls(kamera, renderer.domElement);
steuerung.target.copy(ziel);
steuerung.enableDamping = true;
steuerung.dampingFactor = 0.08;
steuerung.minDistance = 3;
steuerung.maxDistance = 13;
steuerung.maxPolarAngle = Math.PI * 0.42;   // nicht unter den Boden schauen
steuerung.enablePan = false;
steuerung.update();

// Grundlicht (gedämpft, damit die LEDs wirken)
szene.add(new THREE.HemisphereLight(0xdfe6f5, 0x3a3530, 0.95));
const sonne = new THREE.DirectionalLight(0xffffff, 0.6);
sonne.position.set(3, 8, 4);
szene.add(sonne);

const raum = new THREE.Group();
szene.add(raum);

/* ---------- Boden & Wände ---------- */
quader(raum, 0, W, -0.04, 0, 0, L, mat(FARBE.boden, { roughness: 0.7 }));

const wandMat = mat(FARBE.wand, { side: THREE.DoubleSide });
const schraegeMat = new THREE.MeshStandardMaterial({ color: FARBE.wand, side: THREE.DoubleSide, transparent: true, opacity: 0.09, depthWrite: false });

// Wände, die zur Kamera zeigen, werden durchsichtig (Puppenhaus-Ansicht)
const waende = [];
function wand(meshes, innen, punkt) {
  meshes.forEach(m => {
    m.material = m.material.clone();
    m.material.transparent = true;
  });
  waende.push({ meshes, innen, punkt });
}

const sw = RAUM.schraegeWest, so = RAUM.schraegeOst, soBis = RAUM.schraegeOstBis;

// Südwand (Fensterwand) mit drei Fenstern
const fensterSued = [
  [1.22, 1.68, 1.02, 1.56],   // kleines Fenster hinter dem Schreibtisch
  [2.45, 3.15, 0.95, 2.10],   // großes Fenster über der Heizung
  [3.35, 3.75, 1.00, 1.50]    // kleines Fenster unter der Ostschräge
];
const sued = giebelwand(raum, [[0, 0], [W, 0], [W, K], [W - so, H], [sw, H], [0, K]], fensterSued, 0, wandMat);
wand([sued], new THREE.Vector3(0, 0, -1), P(W / 2, 1, 0));

// Nordwand: links schwarz gestrichen, rechts weiß
const nordSchwarz = giebelwand(raum, [[0, 0], [2.75, 0], [2.75, H], [sw, H], [0, K]], [], L, mat(FARBE.schwarzeWand, { side: THREE.DoubleSide }));
const nordWeiss = giebelwand(raum, [[2.75, 0], [W, 0], [W, H], [2.75, H]], [], L, wandMat);
wand([nordSchwarz, nordWeiss], new THREE.Vector3(0, 0, 1), P(W / 2, 1, L));

// Westseite: Kniestock + Schräge
const kniestockWest = flaeche(raum, [P(0, 0, 0), P(0, 0, L), P(0, K, L), P(0, K, 0)], wandMat);
wand([kniestockWest], new THREE.Vector3(1, 0, 0), P(0, 0.5, L / 2));
flaeche(raum, [P(0, K, 0), P(0, K, L), P(sw, H, L), P(sw, H, 0)], schraegeMat);

// Ostseite: im Süden Kniestock + Schräge, sonst volle Wand (Gaube)
const kniestockOst = flaeche(raum, [P(W, 0, 0), P(W, 0, soBis), P(W, K, soBis), P(W, K, 0)], wandMat);
const ostWand = flaeche(raum, [P(W, 0, soBis), P(W, 0, L), P(W, H, L), P(W, H, soBis)], wandMat);
const ostGiebel = flaeche(raum, [P(W - so, H, soBis), P(W, H, soBis), P(W, K, soBis)], wandMat);
wand([kniestockOst, ostWand, ostGiebel], new THREE.Vector3(-1, 0, 0), P(W, 1, L / 2));
flaeche(raum, [P(W, K, 0), P(W, K, soBis), P(W - so, H, soBis), P(W - so, H, 0)], schraegeMat);

// Fenster (Rahmen + Glas)
fensterSued.forEach(([x0, x1, y0, y1]) => {
  quader(raum, x0 - 0.04, x1 + 0.04, y0 - 0.04, y1 + 0.04, -0.01, 0.02, mat(FARBE.weiss));
  quader(raum, x0, x1, y0, y1, 0.0, 0.025, mat(FARBE.glas, { roughness: 0.2, metalness: 0.3 }));
  quader(raum, x0 - 0.06, x1 + 0.06, y0 - 0.06, y0 - 0.03, 0.0, 0.12, mat(FARBE.weiss)); // Fensterbank
});

// Heizung unter dem großen Fenster
quader(raum, 2.25, 3.35, 0.15, 0.75, 0.03, 0.12, mat(FARBE.weiss, { roughness: 0.5 }));
for (let x = 2.3; x < 3.33; x += 0.06) quader(raum, x, x + 0.025, 0.17, 0.73, 0.11, 0.13, mat(0xe2e2e2));

// Tür (Ostwand, nahe der schwarzen Wand)
quader(raum, W - 0.03, W, 0, 2.05, 3.95, 4.85, mat(FARBE.weiss, { roughness: 0.6 }));
quader(raum, W - 0.05, W - 0.03, 0.95, 1.0, 4.68, 4.78, mat(0x9a9a9a, { metalness: 0.8, roughness: 0.3 }));
// Lichtschalter neben der Tür
quader(raum, W - 0.02, W, 1.0, 1.25, 4.9, 4.98, mat(FARBE.weiss));

// Weltkarte an der schwarzen Wand
for (let i = 0; i < 5; i++) quader(raum, 0.75 + i * 0.27, 0.99 + i * 0.27, 1.45, 1.78, L - 0.03, L - 0.01, mat(0xe8e2d6));

// Teppich
quader(raum, 2.35, 3.65, 0.0, 0.02, 2.1, 3.8, mat(FARBE.teppich, { roughness: 1 }));

// Pinnwand am Kniestock hinter dem Schreibtischstuhl
quader(raum, 0.0, 0.02, 0.3, 0.85, 1.35, 2.05, mat(0xf6f6f6));
[[1.45, 0.7, 0x8fbf6a], [1.62, 0.55, 0xe86a6a], [1.8, 0.72, 0x5ea7e8], [1.92, 0.45, 0xf0c060]].forEach(([n, y, f]) =>
  quader(raum, 0.02, 0.025, y - 0.08, y + 0.08, n - 0.06, n + 0.06, mat(f)));

/* ---------- Schreibtisch ---------- */
const desk = new THREE.Group();
raum.add(desk);
quader(desk, 0.5, 2.1, 0.72, 0.75, 0.12, 0.92, mat(FARBE.weiss, { roughness: 0.5 }));          // Platte
[0.6, 2.0].forEach(x => {
  quader(desk, x - 0.03, x + 0.03, 0, 0.72, 0.45, 0.55, mat(FARBE.weiss));                       // Säule
  quader(desk, x - 0.035, x + 0.035, 0, 0.03, 0.15, 0.88, mat(FARBE.weiss));                     // Fuß
});
// Monitore (zeigen nach Norden zum Stuhl)
const monitorMat = mat(0x222226);
const screenMat = mat(0x2a2050, { emissive: 0x6a3aa0, emissiveIntensity: 0.6, roughness: 0.3 });
quader(desk, 1.12, 1.92, 0.93, 1.33, 0.3, 0.33, monitorMat);       // Breitbild
quader(desk, 1.14, 1.90, 0.95, 1.31, 0.331, 0.335, screenMat);
quader(desk, 1.5, 1.54, 0.75, 0.95, 0.24, 0.28, monitorMat);       // Fuß
quader(desk, 1.98, 2.08, 0.82, 1.48, 0.22, 0.42, monitorMat);      // Hochkant-Monitor (gedreht)
quader(desk, 0.72, 1.06, 0.76, 0.78, 0.25, 0.48, mat(0x3a3a3e));   // Laptop
quader(desk, 0.72, 1.06, 0.78, 1.0, 0.24, 0.26, monitorMat);
quader(desk, 0.74, 1.04, 0.8, 0.98, 0.261, 0.265, screenMat);
quader(desk, 1.2, 1.62, 0.75, 0.77, 0.55, 0.68, mat(0x18181b));    // Tastatur
quader(desk, 1.75, 1.97, 0.75, 0.755, 0.52, 0.7, mat(0x111114));   // Mauspad
zylinder(desk, 1.0, 0.8, 0.82, 0.05, 0.05, 0.1, mat(0x2f4a2a));     // Pflanze (Topf)

// Schreibtischstuhl
const stuhl = new THREE.Group();
raum.add(stuhl);
zylinder(stuhl, 1.45, 0.06, 1.35, 0.3, 0.3, 0.03, mat(0x777a80, { metalness: 0.6 }), 5);
zylinder(stuhl, 1.45, 0.26, 1.35, 0.03, 0.03, 0.4, mat(0x777a80, { metalness: 0.6 }));
quader(stuhl, 1.22, 1.68, 0.44, 0.54, 1.12, 1.58, mat(0x2b2b30));
quader(stuhl, 1.24, 1.66, 0.54, 1.25, 1.52, 1.62, mat(0x2b2b30));

/* ---------- Raumteiler (mit iPad & Fernseher) ---------- */
const teiler = new THREE.Group();
raum.add(teiler);
const T = { x0: 0.45, x1: 1.65, n0: 2.35, n1: 2.75, h: 1.45 };
quader(teiler, T.x0, T.x1, 0, T.h, T.n0, T.n1, mat(FARBE.holzGrau));
// Fronten (Süd) – weiße Türen und offene Fächer
quader(teiler, T.x0 + 0.03, T.x0 + 0.55, 0.05, 0.98, T.n0 - 0.01, T.n0, mat(FARBE.weiss));
quader(teiler, T.x0 + 0.58, T.x1 - 0.03, 0.98, 1.42, T.n0 - 0.01, T.n0, mat(FARBE.weiss));
quader(teiler, T.x0 + 0.58, T.x1 - 0.03, 0.05, 0.42, T.n0 - 0.01, T.n0, mat(FARBE.weiss));
quader(teiler, T.x0 + 0.03, T.x0 + 0.55, 1.01, 1.42, T.n0 - 0.005, T.n0, mat(0x3c3834));
quader(teiler, T.x0 + 0.58, T.x1 - 0.03, 0.45, 0.95, T.n0 - 0.005, T.n0, mat(0x3c3834));
// Bilderrahmen „GT3 RS“ obendrauf
quader(teiler, 0.55, 0.85, T.h, T.h + 0.38, 2.5, 2.52, mat(0x111111));
quader(teiler, 0.57, 0.83, T.h + 0.02, T.h + 0.36, 2.495, 2.5, mat(0xf2f2f2));

// Fernseher an der Nordseite, Richtung Bett
quader(teiler, 1.62, 1.66, 0.9, 1.25, T.n1, T.n1 + 0.12, mat(0x2a2a2a));
const tv = quader(teiler, 1.3, 2.25, 0.88, 1.42, T.n1 + 0.12, T.n1 + 0.16, mat(0x101012));
quader(teiler, 1.32, 2.23, 0.9, 1.4, T.n1 + 0.161, T.n1 + 0.163, mat(0x1d2433, { emissive: 0x1d3a66, emissiveIntensity: 0.35 }));

// iPad an der Ostseite des Raumteilers (anklickbar!)
function ipadTextur() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 360;
  const g = c.getContext("2d");
  g.fillStyle = "#0f1115"; g.fillRect(0, 0, 512, 360);
  const kachel = (x, y, w, h, f) => { g.fillStyle = f; g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill(); };
  kachel(14, 14, 160, 90, "#1a1d24"); kachel(14, 114, 160, 160, "#1a1d24");
  kachel(184, 14, 152, 170, "#1a1d24"); kachel(346, 14, 152, 170, "#1a1d24");
  kachel(184, 194, 152, 120, "#1a1d24"); kachel(346, 194, 152, 120, "#1a1d24");
  kachel(14, 326, 484, 22, "#1a1d24");
  g.fillStyle = "#f2f3f5"; g.font = "300 54px -apple-system, Helvetica, sans-serif"; g.fillText("12:00", 26, 78);
  g.fillStyle = "#ffb547"; g.fillRect(196, 40, 4, 40); g.fillRect(196, 92, 4, 40);
  g.fillStyle = "#34c759"; g.beginPath(); g.roundRect(440, 214, 40, 22, 11); g.fill();
  g.fillStyle = "#ffffff"; g.font = "600 30px -apple-system, Helvetica, sans-serif"; g.fillText("☁️ 4°", 30, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ipad = new THREE.Group();
raum.add(ipad);
quader(ipad, T.x1, T.x1 + 0.03, 0.98, 1.24, 2.4, 2.72, mat(0x2a2a2e));                       // Halterung
const ipadScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.21),
  new THREE.MeshBasicMaterial({ map: ipadTextur(), toneMapped: false }));
ipadScreen.position.copy(P(T.x1 + 0.032, 1.11, 2.56));
ipadScreen.rotation.y = Math.PI / 2;
ipad.add(ipadScreen);
const ipadRahmen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.34),
  new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
ipadRahmen.position.copy(P(T.x1 + 0.031, 1.11, 2.56));
ipadRahmen.rotation.y = Math.PI / 2;
ipad.add(ipadRahmen);

/* ---------- Bett ---------- */
const bett = new THREE.Group();
raum.add(bett);
const B = { x0: 0.25, x1: 1.87, n0: 3.0, n1: 5.15 };
quader(bett, B.x0, B.x1, 0.12, 0.38, B.n0, B.n1 - 0.05, mat(FARBE.weiss, { roughness: 0.5 }));                 // Rahmen
[[B.x0, B.n0], [B.x1 - 0.06, B.n0], [B.x0, B.n1 - 0.11], [B.x1 - 0.06, B.n1 - 0.11]].forEach(([x, n]) =>
  quader(bett, x, x + 0.06, 0, 0.12, n, n + 0.06, mat(FARBE.weiss)));
quader(bett, B.x0 + 0.05, B.x1 - 0.05, 0.38, 0.58, B.n0 + 0.05, B.n1 - 0.08, mat(FARBE.matratze));            // Matratze
quader(bett, B.x0, B.x1, 0.12, 0.92, B.n1 - 0.05, B.n1, mat(FARBE.weiss, { roughness: 0.5 }));                 // Kopfteil
quader(bett, B.x0 + 0.1, B.x0 + 0.72, 0.58, 0.72, B.n1 - 0.55, B.n1 - 0.12, mat(0x9a9ca2));                    // Kissen
quader(bett, B.x1 - 0.72, B.x1 - 0.1, 0.58, 0.72, B.n1 - 0.55, B.n1 - 0.12, mat(0xb8b2a6));
quader(bett, B.x0 + 0.08, B.x1 - 0.08, 0.58, 0.66, B.n0 + 0.25, B.n1 - 0.6, mat(0xe9e9e4));                   // Decke (ordentlich)
for (let n = B.n0 + 0.3; n < B.n1 - 0.65; n += 0.16) quader(bett, B.x0 + 0.08, B.x1 - 0.08, 0.66, 0.661, n, n + 0.07, mat(0xcfd2c8));

/* ---------- Nachttisch mit Lampe ---------- */
const nacht = new THREE.Group();
raum.add(nacht);
quader(nacht, 1.95, 2.45, 0, 0.5, 4.75, 5.17, mat(FARBE.weiss));
quader(nacht, 1.95, 2.45, 0.5, 0.53, 4.75, 5.17, mat(FARBE.nussbaum));
quader(nacht, 1.94, 1.95, 0.03, 0.5, 4.75, 5.17, mat(FARBE.nussbaum));
quader(nacht, 2.45, 2.46, 0.03, 0.5, 4.75, 5.17, mat(FARBE.nussbaum));
quader(nacht, 2.08, 2.32, 0.34, 0.36, 4.745, 4.75, mat(0xa0a0a0, { metalness: 0.7 }));
quader(nacht, 2.08, 2.32, 0.14, 0.16, 4.745, 4.75, mat(0xa0a0a0, { metalness: 0.7 }));
zylinder(nacht, 2.27, 0.545, 4.98, 0.06, 0.07, 0.03, mat(0x1a1a1a));
zylinder(nacht, 2.27, 0.66, 4.98, 0.012, 0.012, 0.22, mat(0x1a1a1a));
const schirmMat = new THREE.MeshStandardMaterial({ color: 0x8a7b70, roughness: 0.9, emissive: 0x000000, transparent: true, opacity: 0.92 });
zylinder(nacht, 2.27, 0.85, 4.98, 0.12, 0.12, 0.2, schirmMat, 32);
quader(nacht, 2.0, 2.08, 0.53, 0.66, 4.85, 4.93, mat(0xd8d8d8));   // Ladestation

/* ---------- Kleiderschrank (Ostwand) ---------- */
const schrank = new THREE.Group();
raum.add(schrank);
const S = { x0: W - 0.6, x1: W - 0.02, n0: 1.75, n1: 3.75, h: 2.05 };
quader(schrank, S.x0, S.x1, 0, S.h, S.n0, S.n1, mat(FARBE.holzGrau));
quader(schrank, S.x0 - 0.01, S.x0, 0.06, S.h - 0.05, 2.45, 3.08, mat(FARBE.weiss));      // Türen
quader(schrank, S.x0 - 0.01, S.x0, 0.06, S.h - 0.05, 3.1, 3.71, mat(FARBE.weiss));
quader(schrank, S.x0 - 0.01, S.x0, 1.15, S.h - 0.05, 1.79, 2.42, mat(FARBE.weiss));      // Seitenteil oben
quader(schrank, S.x0 - 0.01, S.x0, 0.06, 0.4, 1.79, 2.42, mat(FARBE.weiss));             // Schubladen
quader(schrank, S.x0 - 0.01, S.x0, 0.43, 0.75, 1.79, 2.42, mat(FARBE.weiss));
[[0.98, 2.95, 3.25], [0.98, 2.7, 3.0], [1.6, 2.0, 2.3], [0.6, 2.0, 2.3], [0.25, 2.0, 2.3]].forEach(([y, n0, n1]) =>
  quader(schrank, S.x0 - 0.025, S.x0 - 0.01, y, y + 0.025, n0, n1, mat(0x2a2a2a)));     // Griffe
// beleuchtete Vitrine mit LEGO-Schloss
quader(schrank, S.x0 - 0.005, S.x0, 0.78, 1.12, 1.79, 2.42, mat(0xdfe8f5, { emissive: 0xb8cde8, emissiveIntensity: 0.5 }));
quader(schrank, S.x0 + 0.05, S.x0 + 0.35, 0.8, 1.0, 1.9, 2.3, mat(0xb9a98e));

/* ---------- Metallregal (Südost-Ecke) ---------- */
const regal = new THREE.Group();
raum.add(regal);
const R = { x0: W - 0.4, x1: W - 0.03, n0: 0.5, n1: 1.6 };
[[R.x0, R.n0], [R.x1 - 0.03, R.n0], [R.x0, R.n1 - 0.03], [R.x1 - 0.03, R.n1 - 0.03]].forEach(([x, n]) =>
  quader(regal, x, x + 0.03, 0, 0.9, n, n + 0.03, mat(FARBE.metallSchwarz, { metalness: 0.6 })));
[0.88, 0.5].forEach(y => quader(regal, R.x0, R.x1, y, y + 0.03, R.n0, R.n1, mat(FARBE.nussbaum)));
quader(regal, R.x0 + 0.01, R.x1 - 0.01, 0.06, 0.48, R.n0 + 0.03, R.n1 - 0.03, mat(0x2a2a2d, { metalness: 0.4 }));
for (let i = 0; i < 7; i++) quader(regal, R.x0 + 0.04, R.x1 - 0.04, 0.53, 0.83, 1.0 + i * 0.075, 1.06 + i * 0.075, mat(0x222222)); // Ordner
quader(regal, R.x0 + 0.04, R.x1 - 0.04, 0.53, 0.78, 0.55, 0.92, mat(0x333336));                                                // Box
zylinder(regal, W - 0.2, 0.98, 0.7, 0.07, 0.07, 0.17, mat(0xf0f0f0));                                                           // Router

/* =========================================================
   LEDs
   ========================================================= */
const ledObjekte = {};   // id → { meshes, sprites, licht, trefferflaechen }

function ledMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x000000, emissiveIntensity: 1, roughness: 0.4, toneMapped: false });
}
function trefferflaeche(gruppe, geometrie, position) {
  const m = new THREE.Mesh(geometrie, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.position.copy(position);
  gruppe.add(m);
  return m;
}
function punktlicht(x, y, n, reichweite) {
  const l = new THREE.PointLight(0xffffff, 0, reichweite, 2);
  l.position.copy(P(x, y, n));
  raum.add(l);
  return l;
}

// 1) Neon-Welle an der Fensterwand (Govee „LED Band“)
{
  const punkte = [[2.35, 2.36], [2.22, 2.12], [2.38, 1.92], [2.12, 1.78], [1.88, 1.95], [1.66, 1.86], [1.74, 1.68], [1.52, 1.62], [1.32, 1.7]]
    .map(([x, y]) => P(x, y, 0.035));
  const kurve = new THREE.CatmullRomCurve3(punkte);
  const m = new THREE.Mesh(new THREE.TubeGeometry(kurve, 120, 0.014, 8), ledMaterial());
  raum.add(m);
  const sprites = kurve.getSpacedPoints(8).map(p => { const s = leuchtSprite(raum, p.x, p.y, -p.z + 0.03, 0.55); return s; });
  ledObjekte.neon = {
    meshes: [m], sprites, licht: punktlicht(1.85, 1.9, 0.35, 3.2),
    treffer: [trefferflaeche(raum, new THREE.BoxGeometry(1.2, 0.85, 0.15), P(1.85, 1.95, 0.08))],
    anker: P(1.85, 2.45, 0.05)
  };
}

// 2) Streifen hinter den Monitoren (Govee „Schreibtisch“)
{
  const m1 = quader(raum, 0.55, 2.05, 0.78, 0.8, 0.13, 0.145, ledMaterial());
  const m2 = quader(raum, 2.085, 2.1, 0.84, 1.46, 0.24, 0.4, ledMaterial());
  const sprites = [0.8, 1.3, 1.8].map(x => leuchtSprite(raum, x, 0.95, 0.08, 0.7));
  sprites.push(leuchtSprite(raum, 2.12, 1.15, 0.32, 0.6));
  ledObjekte.desk = {
    meshes: [m1, m2], sprites, licht: punktlicht(1.4, 1.0, 0.2, 2.5),
    treffer: [trefferflaeche(raum, new THREE.BoxGeometry(1.7, 0.8, 0.5), P(1.3, 1.05, 0.3))],
    anker: P(1.3, 1.6, 0.3)
  };
}

// 3) Glühbirne in der Nachttischlampe (Govee „Smart LED Bulb“)
{
  const m = zylinder(raum, 2.27, 0.83, 4.98, 0.04, 0.04, 0.08, ledMaterial(), 16);
  const sprites = [leuchtSprite(raum, 2.27, 0.86, 4.98, 0.75)];
  ledObjekte.bulb = {
    meshes: [m], sprites, licht: punktlicht(2.27, 0.9, 4.9, 3.0), schirm: schirmMat,
    treffer: [trefferflaeche(raum, new THREE.BoxGeometry(0.4, 0.6, 0.4), P(2.27, 0.75, 4.98))],
    anker: P(2.27, 1.15, 4.98)
  };
}

// 4) Streifen unter dem Bett (Bluetooth, H613A)
{
  const y = 0.1;
  const ms = [
    quader(raum, B.x0 + 0.08, B.x1 - 0.08, y, y + 0.015, B.n0 + 0.08, B.n0 + 0.1, ledMaterial()),
    quader(raum, B.x0 + 0.08, B.x1 - 0.08, y, y + 0.015, B.n1 - 0.2, B.n1 - 0.18, ledMaterial()),
    quader(raum, B.x0 + 0.08, B.x0 + 0.1, y, y + 0.015, B.n0 + 0.08, B.n1 - 0.18, ledMaterial()),
    quader(raum, B.x1 - 0.1, B.x1 - 0.08, y, y + 0.015, B.n0 + 0.08, B.n1 - 0.18, ledMaterial())
  ];
  const sprites = [];
  for (let n = B.n0 + 0.1; n <= B.n1 - 0.1; n += 0.5) {
    sprites.push(leuchtSprite(raum, B.x1 + 0.08, 0.04, n, 0.7));
  }
  [0.5, 1.05, 1.6].forEach(x => sprites.push(leuchtSprite(raum, x, 0.04, B.n0 - 0.08, 0.7)));
  ledObjekte.bett = {
    meshes: ms, sprites, licht: punktlicht(B.x1 + 0.1, 0.15, 4.0, 2.2),
    treffer: [trefferflaeche(raum, new THREE.BoxGeometry(B.x1 - B.x0 + 0.3, 0.3, B.n1 - B.n0 + 0.3), P((B.x0 + B.x1) / 2, 0.15, (B.n0 + B.n1) / 2))],
    anker: P(B.x1 + 0.2, 0.45, 4.35)
  };
}

// 5) Streifen an der Rückseite des Raumteilers (Bluetooth, H6125)
{
  const m = quader(raum, T.x0 + 0.03, T.x1 - 0.03, T.h - 0.04, T.h - 0.02, T.n1, T.n1 + 0.015, ledMaterial());
  const m2 = quader(raum, T.x0 + 0.01, T.x0 + 0.03, 0.1, T.h - 0.04, T.n1, T.n1 + 0.015, ledMaterial());
  const sprites = [0.65, 1.05, 1.45].map(x => leuchtSprite(raum, x, T.h + 0.05, T.n1 + 0.05, 0.6));
  sprites.push(leuchtSprite(raum, T.x0, 0.75, T.n1 + 0.05, 0.6));
  ledObjekte.schrank = {
    meshes: [m, m2], sprites, licht: punktlicht(1.05, 1.5, T.n1 + 0.25, 2.2),
    treffer: [trefferflaeche(raum, new THREE.BoxGeometry(T.x1 - T.x0, 0.5, 0.3), P((T.x0 + T.x1) / 2, T.h - 0.1, T.n1 + 0.1))],
    anker: P(0.85, T.h + 0.3, (T.n0 + T.n1) / 2)
  };
}

/* =========================================================
   Zustand der Lichter → Darstellung
   ========================================================= */
function btAn() { try { return localStorage.getItem("bt-licht") === "an"; } catch { return false; } }
function btSetzen(an) { try { localStorage.setItem("bt-licht", an ? "an" : "aus"); } catch {} }

function goveeLicht(name) {
  return (typeof lichter !== "undefined" ? lichter : []).find(l => l.name === name);
}

function ledZustand(led) {
  if (led.kurzbefehl) return { an: btAn(), farbe: "#ff9a5c", helligkeit: 100, bekannt: true };
  const l = goveeLicht(led.govee);
  if (!l) return { an: false, farbe: "#ffd27a", helligkeit: 0, bekannt: false };
  return {
    an: !!l.an && l.online !== false,
    farbe: typeof lichtFarbe === "function" ? lichtFarbe(l) : "#ffd27a",
    helligkeit: l.helligkeit || 100,
    bekannt: true, licht: l
  };
}

function aktualisiereLeds() {
  LEDS.forEach(led => {
    const o = ledObjekte[led.id];
    if (!o) return;
    const z = ledZustand(led);
    const farbe = new THREE.Color(z.farbe);
    const staerke = z.an ? 0.35 + 0.65 * (z.helligkeit / 100) : 0;
    o.meshes.forEach(m => {
      m.material.emissive.copy(z.an ? farbe : new THREE.Color(0x000000));
      m.material.emissiveIntensity = z.an ? 1.2 + staerke : 0;
      m.material.color.set(z.an ? farbe : 0x3a3a3a);
    });
    o.sprites.forEach(s => { s.material.color.copy(farbe); s.material.opacity = z.an ? 0.75 * staerke : 0; });
    o.licht.color.copy(farbe);
    o.licht.intensity = z.an ? 2.4 * staerke : 0;
    if (o.schirm) { o.schirm.emissive.copy(z.an ? farbe : new THREE.Color(0)); o.schirm.emissiveIntensity = z.an ? 0.55 * staerke : 0; }
    if (o.label) {
      o.label.classList.toggle("an", z.an);
      o.label.style.setProperty("--led-farbe", z.an ? z.farbe : "#555");
      o.label.querySelector(".raum-label-status").textContent = !z.bekannt ? "–" : z.an ? "an" : "aus";
    }
  });
}
window.raumAktualisieren = aktualisiereLeds;

/* =========================================================
   Beschriftungen (HTML über der 3D-Ansicht)
   ========================================================= */
const labelEbene = document.getElementById("raum-labels");
LEDS.forEach(led => {
  const el = document.createElement("button");
  el.className = "raum-label";
  el.innerHTML = `<span class="raum-label-punkt"></span><span class="raum-label-name"></span><span class="raum-label-status"></span>`;
  el.querySelector(".raum-label-name").textContent = led.name;
  el.addEventListener("click", e => { e.stopPropagation(); zeigePopup(led, e.clientX, e.clientY); });
  labelEbene.appendChild(el);
  ledObjekte[led.id].label = el;
});
const ipadLabel = document.createElement("button");
ipadLabel.className = "raum-label raum-label-ipad";
ipadLabel.innerHTML = `<span>📱 Dashboard</span>`;
ipadLabel.addEventListener("click", e => { e.stopPropagation(); zeigeDashboard(); });
labelEbene.appendChild(ipadLabel);
const ipadAnker = P(T.x1 + 0.45, 1.25, 2.4);

const hilfsVektor = new THREE.Vector3();
function positioniereLabel(el, anker) {
  hilfsVektor.copy(anker).project(kamera);
  const sichtbar = hilfsVektor.z < 1;
  const breite = container.clientWidth, hoehe = container.clientHeight;
  el.style.display = sichtbar ? "" : "none";
  el.style.transform = `translate(-50%, -100%) translate(${(hilfsVektor.x + 1) / 2 * breite}px, ${(1 - hilfsVektor.y) / 2 * hoehe}px)`;
}

/* =========================================================
   Antippen
   ========================================================= */
const strahl = new THREE.Raycaster();
const zeiger = new THREE.Vector2();
let druckStart = null;

renderer.domElement.addEventListener("pointerdown", e => { druckStart = { x: e.clientX, y: e.clientY, t: Date.now() }; });
renderer.domElement.addEventListener("pointerup", e => {
  if (!druckStart) return;
  const bewegt = Math.hypot(e.clientX - druckStart.x, e.clientY - druckStart.y);
  const dauer = Date.now() - druckStart.t;
  druckStart = null;
  if (bewegt > 10 || dauer > 600) return;   // war ein Drehen/Zoomen

  const rechteck = renderer.domElement.getBoundingClientRect();
  zeiger.x = ((e.clientX - rechteck.left) / rechteck.width) * 2 - 1;
  zeiger.y = -((e.clientY - rechteck.top) / rechteck.height) * 2 + 1;
  strahl.setFromCamera(zeiger, kamera);

  const ziele = [ipadScreen, ipadRahmen];
  LEDS.forEach(led => ziele.push(...ledObjekte[led.id].treffer));
  const treffer = strahl.intersectObjects(ziele, false)[0];
  if (!treffer) { versteckePopup(); return; }

  if (treffer.object === ipadScreen || treffer.object === ipadRahmen) { zeigeDashboard(); return; }
  const led = LEDS.find(l => ledObjekte[l.id].treffer.includes(treffer.object));
  if (led) zeigePopup(led, e.clientX, e.clientY);
});

/* ---------- Popup zum Schalten ---------- */
const popup = document.getElementById("raum-popup");
let popupLed = null;

function zeigePopup(led, x, y) {
  popupLed = led;
  const z = ledZustand(led);
  popup.querySelector(".raum-popup-name").textContent = led.name;
  popup.querySelector(".raum-popup-info").textContent =
    led.kurzbefehl ? "Bluetooth · Bett & Raumteiler zusammen"
    : !z.bekannt ? "Govee nicht verbunden"
    : z.licht.online === false ? "offline"
    : z.an ? `an · ${z.helligkeit} %` : "aus";
  popup.querySelector("[data-aktion=einstellen]").hidden = !!led.kurzbefehl || !z.bekannt;
  popup.hidden = false;
  const r = container.getBoundingClientRect();
  const pw = popup.offsetWidth, ph = popup.offsetHeight;
  popup.style.left = Math.min(Math.max(10, x - r.left - pw / 2), r.width - pw - 10) + "px";
  popup.style.top = Math.min(Math.max(10, y - r.top - ph - 20), r.height - ph - 10) + "px";
}
function versteckePopup() { popup.hidden = true; popupLed = null; }

popup.addEventListener("click", e => {
  const aktion = e.target.closest("[data-aktion]")?.dataset.aktion;
  if (!aktion || !popupLed) return;
  const led = popupLed;

  if (aktion === "einstellen") {
    const l = goveeLicht(led.govee);
    if (l && typeof oeffneLicht === "function") oeffneLicht(l);
    versteckePopup();
    return;
  }
  const an = aktion === "an";
  if (led.kurzbefehl) {
    btSetzen(an);
    aktualisiereLeds();
    const k = (typeof KURZBEFEHL_LICHTER !== "undefined" ? KURZBEFEHL_LICHTER : [])[0];
    if (k && typeof kurzbefehlStarten === "function") kurzbefehlStarten(an ? k.an : k.aus);
  } else {
    const l = goveeLicht(led.govee);
    if (l && typeof schalteLicht === "function") schalteLicht(l, "an", an);
  }
  versteckePopup();
  setTimeout(aktualisiereLeds, 50);
});

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
  aktualisiereLeds();
  if (!laeuft) { laeuft = true; renderer.setAnimationLoop(zeichnen); }
}
window.zeigeRaum = zeigeRaum;
window.zeigeDashboard = zeigeDashboard;
document.getElementById("zum-raum")?.addEventListener("click", zeigeRaum);
document.getElementById("zum-dashboard")?.addEventListener("click", zeigeDashboard);

/* ---------- Zeichnen ---------- */
const kameraRichtung = new THREE.Vector3();
function zeichnen(zeit) {
  steuerung.update();

  // Wände zwischen Kamera und Raum ausblenden
  waende.forEach(w => {
    kameraRichtung.copy(kamera.position).sub(w.punkt);
    const davor = kameraRichtung.dot(w.innen) < 0;
    const ziel = davor ? 0.12 : 1;
    w.meshes.forEach(m => {
      m.material.opacity += (ziel - m.material.opacity) * 0.15;
      m.material.depthWrite = m.material.opacity > 0.9;
    });
  });

  // iPad pulsiert leicht, damit man sieht, dass man draufdrücken kann
  ipadRahmen.material.opacity = 0.25 + 0.2 * Math.sin(zeit / 500);

  LEDS.forEach(led => positioniereLabel(ledObjekte[led.id].label, ledObjekte[led.id].anker));
  positioniereLabel(ipadLabel, ipadAnker);

  renderer.render(szene, kamera);
}

function groesseAnpassen() {
  const b = container.clientWidth, h = container.clientHeight;
  if (!b || !h) return;
  renderer.setSize(b, h, false);
  kamera.aspect = b / h;
  // Im Hochformat etwas weiter weg, damit der ganze Raum passt
  kamera.fov = b < h ? 55 : 42;
  kamera.updateProjectionMatrix();
}
window.addEventListener("resize", groesseAnpassen);

// Start: 3D-Zimmer anzeigen
zeigeRaum();
setInterval(() => { if (laeuft) aktualisiereLeds(); }, 5000);
