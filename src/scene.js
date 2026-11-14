import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const FLOOR_H = 3.45;
export const FLOORS = 36;
export const PODIUM_H = 4 * FLOOR_H;          // floors 1–4 (mall, parking, fitness); terrace on level 5
const TOP_Y = FLOORS * FLOOR_H;               // 124.2 m + 3 m crown ≈ 127.3 m (info card)

const C = {
  terracotta: 0xb06e4b, terracottaDark: 0x8e5236, cream: 0xebe3d2, fiber: 0xe7dfd0,
  glass: 0x30343a, ground: 0xe4e0d3, site: 0xd9d6c4, grass: 0xb9c592, road: 0xa7a49c, foot: 0xd2cdbf,
  primary: 0x8a9b48, secondary: 0xe78e75, navy: 0x1c1322,
};
export const STATUS_COLOR = { available: 0x8a9b48, reserved: 0xe2a54b, queue: 0x4f6fa8, sold: 0xb5524a, nfs: 0x9a9a9a, unknown: 0x9a9a9a };

const rand = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const statusMaps = {};
function statusMap(status, hex) {
  const key = `${status}:${hex}`;
  if (statusMaps[key]) return statusMaps[key];
  const tex = canvasTex(64, 64, (g) => {
    g.fillStyle = `#${hex.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(28,19,34,.82)';
    g.fillStyle = 'rgba(28,19,34,.88)';
    g.lineWidth = 3;
    if (status === 'reserved') { for (let y = 6; y < 64; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); } }
    else if (status === 'queue') { for (let i = -64; i < 64; i += 10) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke(); } }
    else if (status === 'sold') { g.lineWidth = 5; g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.moveTo(50, 14); g.lineTo(14, 50); g.stroke(); }
    else if (status === 'nfs') { g.setLineDash([4, 5]); g.strokeRect(10, 10, 44, 44); }
    else { g.beginPath(); g.arc(32, 32, 9, 0, Math.PI * 2); g.fill(); }
  });
  tex.repeat.set(3, 2);
  statusMaps[key] = tex;
  return tex;
}

// 8×8 grid of window cells; one cell = one bay × one floor of a neighbouring building.
function windowTextures() {
  const lit = []; for (let i = 0; i < 64; i++) lit.push(rand() < 0.38);
  const day = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = '#b9bcc0'; g.fillRect(i * 32 + 9, j * 32 + 8, 14, 15); }
  });
  const night = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (lit[i * 8 + j]) { g.fillStyle = rand() < 0.7 ? '#ffd29a' : '#fff1d6'; g.fillRect(i * 32 + 9, j * 32 + 8, 14, 15); }
  });
  return { day, night };
}

// Tower facade: terracotta fins + cream slab edge + dark glazing. 16 bays × 8 floors per tile.
function facadeTextures() {
  const BW = 32, FH = 64, NB = 16, NF = 8;
  const lit = []; for (let i = 0; i < NB * NF; i++) lit.push(rand() < 0.45);
  const day = canvasTex(BW * NB, FH * NF, (g) => {
    for (let f = 0; f < NF; f++) for (let b = 0; b < NB; b++) {
      const x = b * BW, y = f * FH;
      g.fillStyle = '#2f3237'; g.fillRect(x, y, BW, FH);                // glazing
      g.fillStyle = '#4a4f57'; g.fillRect(x + 3, y + 8, BW - 18, FH - 26); // reflection hint
      g.fillStyle = '#b56f4a'; g.fillRect(x + BW - 11, y, 11, FH);       // vertical terracotta fin
      g.fillStyle = '#a7623f'; g.fillRect(x, y + FH - 22, BW, 14);       // terracotta balustrade
      g.fillStyle = '#ece4d3'; g.fillRect(x, y + FH - 8, BW, 8);         // fibre-cement slab edge
    }
  });
  const night = canvasTex(BW * NB, FH * NF, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, BW * NB, FH * NF);
    for (let f = 0; f < NF; f++) for (let b = 0; b < NB; b++) if (lit[f * NB + b]) {
      g.fillStyle = rand() < 0.6 ? '#ffcf8f' : '#ffe6bf'; g.fillRect(b * BW, f * FH + 2, BW - 11, FH - 24);
    }
  });
  return { day, night };
}

function archTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3936';
    g.beginPath(); g.moveTo(30, h); g.lineTo(30, 52); g.arc(128, 52, 98, Math.PI, 0); g.lineTo(226, h); g.closePath(); g.fill();
    g.fillStyle = '#5b5751'; g.fillRect(40, 70, 176, 4);
  });
}

// outline helpers (local x/z)
function ellipsePts(a, b, n = 96) { const p = []; for (let i = 0; i < n; i++) { const t = -i / n * Math.PI * 2; p.push([a * Math.cos(t), -b * Math.sin(t)]); } return p; }
function rrectPts(w, d, r, n = 12) {
  const p = []; const hw = w / 2 - r, hd = d / 2 - r;
  const corners = [[hw, -hd, 0], [-hw, -hd, Math.PI / 2], [-hw, hd, Math.PI], [hw, hd, Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; p.push([cx + r * Math.cos(a), cz - r * Math.sin(a)]); }
  return p;
}
function offsetPts(pts, d) { // offset a convex-ish closed outline outward by d
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + dx / l * d, z + dz / l * d]; });
}
function shapeFrom(pts) { return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))); }
function flatShapeGeo(pts, y) { const g = new THREE.ShapeGeometry(shapeFrom(pts)); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; }
function extrudeY(pts, y0, h, opts = {}) { const g = new THREE.ExtrudeGeometry(shapeFrom(pts), { depth: h, bevelEnabled: false, ...opts }); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g; }

// vertical strip around an outline with u = metres/uScale, v = metres/vScale
function stripGeo(pts, y0, y1, uScale, vScale) {
  const pos = [], uv = [], idx = []; let acc = 0; const n = pts.length;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n]; if (i > 0) { const q = pts[i - 1]; acc += Math.hypot(p[0] - q[0], p[1] - q[1]); }
    pos.push(p[0], y0, p[1], p[0], y1, p[1]); uv.push(acc / uScale, y0 / vScale, acc / uScale, y1 / vScale);
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // ensure outward normals
  const nrm = g.attributes.normal; const c = pts.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  if ((pts[0][0] - c[0]) * nrm.getX(0) + (pts[0][1] - c[1]) * nrm.getZ(0) < 0) { g.setIndex(idx.map((v, i) => idx[i - (i % 3) + (2 - (i % 3))])); g.computeVertexNormals(); }
  return g;
}

function mergeGeos(geos) {
  // minimal merge for non-indexed / indexed geometries with position, normal, (uv), (color)
  let total = 0; const parts = geos.map((g) => { const ng = g.index ? g.toNonIndexed() : g; total += ng.attributes.position.count; return ng; });
  const hasUv = parts.every((g) => g.attributes.uv), hasCol = parts.every((g) => g.attributes.color);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = hasUv ? new Float32Array(total * 2) : null, col = hasCol ? new Float32Array(total * 3) : null;
  let o = 0; for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (uv) uv.set(g.attributes.uv.array, o * 2); if (col) col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}

function pairs(flat) { const p = []; for (let i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]); return p; }
function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
function pointIn(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - zi) / (zj - zi) + xi) c = !c; } return c; }

async function buildNeighbourhood(ctx, yieldFn) {
  const wallPos = [], wallUv = [], wallCol = [], roofPos = [], roofCol = [];
  const palette = [0xe9e4d8, 0xdcd6c8, 0xe6dccb, 0xd1cdc4, 0xeae6df, 0xcfc6b4].map((c) => new THREE.Color(c));
  let tris = 0;
  let bi = 0;
  for (const b of ctx.buildings) {
    if (++bi % 250 === 0) await yieldFn();
    let p = pairs(b.p); if (p.length < 3) continue;
    const A = signedArea(p); const h = b.h; const col = palette[Math.floor(rand() * palette.length)];
    let acc = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const u0 = acc / 3.6 / 8, u1 = (acc + L) / 3.6 / 8, v1 = h / 3.2 / 8; acc += L;
      const q = A > 0 ? [[a, 0, u0, 0], [c, h, u1, v1], [c, 0, u1, 0], [a, 0, u0, 0], [a, h, u0, v1], [c, h, u1, v1]]
                      : [[a, 0, u0, 0], [c, 0, u1, 0], [c, h, u1, v1], [a, 0, u0, 0], [c, h, u1, v1], [a, h, u0, v1]];
      for (const [pt, y, u, v] of q) { wallPos.push(pt[0], y, pt[1]); wallUv.push(u, v); wallCol.push(col.r, col.g, col.b); }
    }
    const tr = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const rc = col.clone().multiplyScalar(0.86);
    for (const [i0, i1, i2] of tr) {
      const ord = A > 0 ? [i0, i1, i2] : [i0, i2, i1];
      for (const k of ord) { roofPos.push(p[k][0], h, p[k][1]); roofCol.push(rc.r, rc.g, rc.b); }
    }
    tris += p.length * 2 + tr.length;
  }
  const walls = new THREE.BufferGeometry(); walls.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3)); walls.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2)); walls.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3)); walls.computeVertexNormals();
  const roofs = new THREE.BufferGeometry(); roofs.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3)); roofs.setAttribute('color', new THREE.Float32BufferAttribute(roofCol, 3)); roofs.computeVertexNormals();
  // fix roof winding if pointing down
  const n = roofs.attributes.normal; let down = 0; for (let i = 0; i < n.count; i += 3) if (n.getY(i) < 0) down++;
  if (down > n.count / 6) { roofs.index = null; const pa = roofs.attributes.position.array; for (let i = 0; i < pa.length; i += 9) for (let k = 0; k < 3; k++) { const t = pa[i + 3 + k]; pa[i + 3 + k] = pa[i + 6 + k]; pa[i + 6 + k] = t; } roofs.computeVertexNormals(); }
  return { walls, roofs, tris };
}

function ribbon(line, w, y, color, out) {
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, z0] = line[i], [x1, z1] = line[i + 1]; const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1; const nx = -dz / L * w / 2, nz = dx / L * w / 2;
    const v = [[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]];
    for (const k of [0, 2, 1, 0, 3, 2]) { out.pos.push(v[k][0], y, v[k][1]); out.col.push(color.r, color.g, color.b); }
    // round joint cap
    const seg = 6; for (let s = 0; s < seg; s++) { const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2; for (const [x, z] of [[x1, z1], [x1 + Math.cos(a1) * w / 2, z1 + Math.sin(a1) * w / 2], [x1 + Math.cos(a0) * w / 2, z1 + Math.sin(a0) * w / 2]]) { out.pos.push(x, y, z); out.col.push(color.r, color.g, color.b); } }
  }
}

const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 120 }) : setTimeout(r, 0)));
export async function createScene(container, ctx, { weak = false, onPick, onHover, onProgress } = {}) {
  let _t = performance.now(); const DBG = location.search.includes('debug');
  const step = async (p) => { if (DBG) console.log('[hisni] step', p, Math.round(performance.now() - _t)); onProgress?.(p); await idle(); _t = performance.now(); };
  const renderer = new THREE.WebGLRenderer({ antialias: !weak, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, weak ? 1.25 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = !weak; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 2, 4000);
  { const k = container.clientWidth / container.clientHeight < 0.8 ? 1.75 : 1; camera.position.set(-330 * k, 260 * k, 420 * k); }
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 45, 10); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 40; controls.maxDistance = 1100; controls.maxPolarAngle = Math.PI * 0.47; controls.minPolarAngle = 0.05;
  controls.screenSpacePanning = false; controls.zoomToCursor = true;

  const hemi = new THREE.HemisphereLight(0xf4f1ea, 0x8b8577, 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.castShadow = !weak;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -380, right: 380, top: 380, bottom: -380, near: 10, far: 1600 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1600, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1 }));
  ground.receiveShadow = true; scene.add(ground);

  const layers = { buildings: new THREE.Group(), vegetation: new THREE.Group(), context: new THREE.Group(), project: new THREE.Group() };
  Object.values(layers).forEach((g) => scene.add(g));

  await step(0.1);
  // roads, green, rail
  const flat = { pos: [], col: [] };
  const roadW = { trunk: 16, trunk_link: 8, primary: 14, primary_link: 8, secondary: 11, secondary_link: 7, tertiary: 9, tertiary_link: 6, residential: 6.5, service: 4, construction: 5, footway: 2, path: 1.5, steps: 2, track: 3 };
  const roadCol = new THREE.Color(C.road), footCol = new THREE.Color(C.foot);
  const order = ['footway', 'path', 'steps', 'track', 'service', 'construction', 'residential', 'tertiary_link', 'tertiary', 'secondary_link', 'secondary', 'primary_link', 'primary', 'trunk_link', 'trunk'];
  order.forEach((k, i) => (ctx.roads[k] || []).forEach((l) => ribbon(pairs(l), roadW[k] || 4, 0.08 + i * 0.012, ['footway', 'path', 'steps', 'track'].includes(k) ? footCol : roadCol, flat)));
  (ctx.rail || []).forEach((l) => ribbon(pairs(l), 3, 0.3, new THREE.Color(0x8d8578), flat));
  const flatGeo = new THREE.BufferGeometry(); flatGeo.setAttribute('position', new THREE.Float32BufferAttribute(flat.pos, 3)); flatGeo.setAttribute('color', new THREE.Float32BufferAttribute(flat.col, 3)); flatGeo.computeVertexNormals();
  const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: 0x000000 });
  const roads = new THREE.Mesh(flatGeo, roadMat); roads.receiveShadow = true; layers.context.add(roads);

  const greens = []; const greenPolys = [];
  for (const g of ctx.green) { const p = pairs(g); if (p.length >= 3) { greens.push(flatShapeGeo(p, 0.05)); greenPolys.push(p); } }
  for (const g of ctx.pitches || []) { const p = pairs(g); if (p.length >= 3) greens.push(flatShapeGeo(p, 0.06)); }
  const greenMat = new THREE.MeshStandardMaterial({ color: C.grass, roughness: 1 });
  if (greens.length) { const gm = new THREE.Mesh(mergeGeos(greens), greenMat); gm.receiveShadow = true; layers.vegetation.add(gm); }

  await step(0.25);
  // neighbourhood buildings (2 draw calls)
  const wt = windowTextures();
  const nb = await buildNeighbourhood(ctx, idle);
  const bMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: wt.day, emissiveMap: wt.night, emissive: 0x000000, roughness: 0.92 });
  const rMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const walls = new THREE.Mesh(nb.walls, bMat), roofs = new THREE.Mesh(nb.roofs, rMat);
  [walls, roofs].forEach((m) => { m.castShadow = !weak; m.receiveShadow = true; layers.buildings.add(m); });

  await step(0.55);
  // project site
  const site = ctx.site; const sitePoly = site.boundary; const podPoly = site.podium;
  const siteMesh = new THREE.Mesh(flatShapeGeo(sitePoly, 0.12), new THREE.MeshStandardMaterial({ color: 0xc8cf9f, roughness: 1 })); siteMesh.receiveShadow = true; layers.project.add(siteMesh);
  const archT = archTexture(); archT.repeat.set(1 / 9, 1 / PODIUM_H);
  const podGeo = extrudeY(podPoly, 0, PODIUM_H);
  const podMats = [new THREE.MeshStandardMaterial({ color: 0xd9d4c2, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: archT, roughness: 0.8 })];
  const podium = new THREE.Mesh(podGeo, podMats); podium.castShadow = !weak; podium.receiveShadow = true; layers.project.add(podium);
  // terrace greens on podium (simple patches)
  const patches = [];
  for (let i = 0; i < 26; i++) { const x = -110 + rand() * 230, z = -20 + rand() * 80; if (pointIn([x, z], podPoly)) patches.push(new THREE.CircleGeometry(3 + rand() * 5, 12).rotateX(-Math.PI / 2).translate(x, PODIUM_H + 0.05, z)); }
  if (patches.length) layers.project.add(new THREE.Mesh(mergeGeos(patches), new THREE.MeshStandardMaterial({ color: 0x9fb06a, roughness: 1 })));

  // football pitch in the yard + padel courts on the terrace (positions from the master plan)
  const court = (x, z, w, d, rot, y, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 })); m.position.set(x, y, z); m.rotation.y = rot; m.receiveShadow = true; layers.project.add(m); };
  court(-38, -47, 40, 22, THREE.MathUtils.degToRad(5), 0.2, 0x6f9a52);
  court(64, -20, 20, 10, THREE.MathUtils.degToRad(-4), PODIUM_H + 0.1, 0x4f7db0);
  court(-71, 5, 20, 10, THREE.MathUtils.degToRad(-35), PODIUM_H + 0.1, 0x4f7db0);

  // towers
  const ft = facadeTextures();
  const towers = new Map();
  for (const T of ctx.towers) {
    const g = new THREE.Group(); g.position.set(T.x, 0, T.z); g.rotation.y = THREE.MathUtils.degToRad(T.rot);
    const outline = T.shape === 'ellipse' ? ellipsePts(T.a, T.b) : rrectPts(T.w, T.d, 13);
    const body = offsetPts(outline, -0.6);
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5), gclip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e5);
    const tex = ft.day.clone(); tex.repeat.set(1 / 16, 1 / 8); tex.needsUpdate = true; const ntex = ft.night.clone(); ntex.repeat.set(1 / 16, 1 / 8); ntex.needsUpdate = true;
    const bodyMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: ntex, emissive: 0x000000, roughness: 0.62, metalness: 0.05, clippingPlanes: [clip] });
    const bodyMesh = new THREE.Mesh(stripGeo(body, PODIUM_H, TOP_Y, 1.9, FLOOR_H), bodyMat); bodyMesh.castShadow = !weak; bodyMesh.receiveShadow = true;
    bodyMesh.userData = { kind: 'tower', id: T.id }; g.add(bodyMesh);
    // slabs (fibre-cement edges), one instanced mesh per tower
    const slabGeo = extrudeY(offsetPts(outline, 0.15), 0, 0.32, { curveSegments: 4 });
    const slabMat = new THREE.MeshStandardMaterial({ color: C.fiber, roughness: 0.85, clippingPlanes: [clip] });
    const nSl = FLOORS - 4; const slabs = new THREE.InstancedMesh(slabGeo, slabMat, nSl); const m4 = new THREE.Matrix4();
    for (let i = 0; i < nSl; i++) { m4.makeTranslation(0, PODIUM_H + i * FLOOR_H + FLOOR_H - 0.32, 0); slabs.setMatrixAt(i, m4); }
    slabs.castShadow = !weak; slabs.userData = { kind: 'tower', id: T.id }; g.add(slabs);
    // roof + crown
    const roofG = new THREE.Group();
    const roof = new THREE.Mesh(flatShapeGeo(outline, TOP_Y + 0.1), new THREE.MeshStandardMaterial({ color: 0x8f8a83, roughness: 0.9 })); roofG.add(roof);
    const crown = new THREE.Mesh(stripGeo(offsetPts(outline, 0.2), TOP_Y, TOP_Y + 3.1, 4, 4), new THREE.MeshStandardMaterial({ color: C.terracottaDark, roughness: 0.7, side: THREE.DoubleSide })); roofG.add(crown);
    const mech = new THREE.Mesh(new THREE.BoxGeometry(T.shape === 'ellipse' ? 16 : 14, 4.5, 7), new THREE.MeshStandardMaterial({ color: 0xdcd6c9, roughness: 0.9 })); mech.position.y = TOP_Y + 2.3; roofG.add(mech);
    roofG.traverse((o) => { if (o.isMesh) { o.castShadow = !weak; o.userData = { kind: 'tower', id: T.id }; } }); g.add(roofG);
    // ghost of the upper part when a floor is cut away
    const ghost = new THREE.Mesh(bodyMesh.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, clippingPlanes: [gclip] })); ghost.visible = false; g.add(ghost);
    // highlight outline ring (shown on hover/selection)
    const ring = new THREE.Mesh(stripGeo(offsetPts(outline, 1.2), PODIUM_H + 0.3, PODIUM_H + 1.2, 4, 4), new THREE.MeshBasicMaterial({ color: C.secondary, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    ring.visible = false; g.add(ring);
    layers.project.add(g);
    towers.set(T.id, { T, group: g, outline, bodyMat, slabMat, ring, ghost, roofG, clip, gclip, label: new THREE.Vector3(T.x, TOP_Y + 12, T.z) });
  }

  await step(0.75);
  // trees: OSM trees + scatter inside parks and the project yard
  const treePts = [...ctx.trees];
  for (const p of greenPolys) { const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]); const minx = Math.min(...xs), maxx = Math.max(...xs), minz = Math.min(...zs), maxz = Math.max(...zs); const area = Math.abs(signedArea(p)); const n = Math.min(60, Math.floor(area / 160)); for (let i = 0; i < n * 2 && treePts.length < 2600; i++) { const x = minx + rand() * (maxx - minx), z = minz + rand() * (maxz - minz); if (pointIn([x, z], p)) treePts.push([x, z]); } }
  const towerHit = (x, z) => [...towers.values()].some(({ T }) => Math.hypot(x - T.x, z - T.z) < 34);
  for (let i = 0; i < 900; i++) { const x = -135 + rand() * 300, z = -80 + rand() * 175; if (pointIn([x, z], sitePoly) && !pointIn([x, z], podPoly) && !towerHit(x, z) && !(Math.abs(x + 38) < 22 && Math.abs(z + 47) < 13)) treePts.push([x, z]); if (treePts.length > 2800) break; }
  // street trees along primary/trunk roads
  for (const k of ['primary', 'trunk', 'secondary']) for (const l of ctx.roads[k] || []) { const p = pairs(l); for (let i = 0; i < p.length - 1; i++) { const [x0, z0] = p[i], [x1, z1] = p[i + 1]; const L = Math.hypot(x1 - x0, z1 - z0); for (let s = 0; s < L; s += 14) { const t = s / L, nx = -(z1 - z0) / L, nz = (x1 - x0) / L; const off = (roadW[k] / 2 + 2.5) * (rand() < 0.5 ? 1 : -1); const x = x0 + (x1 - x0) * t + nx * off, z = z0 + (z1 - z0) * t + nz * off; if (Math.hypot(x, z) < 650 && !pointIn([x, z], podPoly)) treePts.push([x, z]); } } }
  const maxTrees = weak ? 1400 : 3200; const tp = treePts.slice(0, maxTrees);
  const crownGeo = new THREE.IcosahedronGeometry(1, weak ? 0 : 1); const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1, 5).translate(0, 0.5, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x7f9a52, roughness: 1, flatShading: true }), tp.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b5643, roughness: 1 }), tp.length);
  const tm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), cc = new THREE.Color();
  tp.forEach(([x, z], i) => { const s = 2.4 + rand() * 2.4; const h = 2 + rand() * 2; sc.set(s, s * (1.05 + rand() * 0.3), s); ps.set(x, h + s * 0.9, z); tm.compose(ps, q, sc); crowns.setMatrixAt(i, tm); cc.setHSL(0.22 + rand() * 0.06, 0.32 + rand() * 0.15, 0.36 + rand() * 0.12); crowns.setColorAt(i, cc); sc.set(1, h + s * 0.4, 1); ps.set(x, 0, z); tm.compose(ps, q, sc); trunks.setMatrixAt(i, tm); });
  crowns.castShadow = trunks.castShadow = !weak; crowns.receiveShadow = true; layers.vegetation.add(crowns, trunks);

  await step(0.9);
  // floor explorer group (block III)
  const floorGroup = new THREE.Group(); floorGroup.visible = false; layers.project.add(floorGroup);
  let aptMeshes = []; let activeTower = null;

  function buildFloor(towerId, floor, apts, colorFor) {
    floorGroup.clear(); aptMeshes = [];
    const tw = towers.get(towerId); const { T } = tw; floorGroup.position.copy(tw.group.position); floorGroup.rotation.copy(tw.group.rotation);
    const y0 = (floor - 1) * FLOOR_H;
    const slab = new THREE.Mesh(flatShapeGeo(offsetPts(tw.outline, 0.2), y0 + 0.02), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.9 })); slab.receiveShadow = true; floorGroup.add(slab);
    const slabSide = new THREE.Mesh(stripGeo(offsetPts(tw.outline, 0.2), y0 - 0.35, y0 + 0.02, 4, 4), new THREE.MeshStandardMaterial({ color: C.fiber })); floorGroup.add(slabSide);
    const A = (T.a ?? T.w / 2) - 0.9, B = (T.b ?? T.d / 2) - 0.9;
    const ai = A * 0.41, bi = B * 0.38;     // corridor outer edge (schematic)
    const core = new THREE.Mesh(extrudeY(ellipsePts(ai * 0.78, bi * 0.64, 48), y0, FLOOR_H * 0.82), new THREE.MeshStandardMaterial({ color: 0xbdb7ab, roughness: 0.9 })); core.castShadow = true; floorGroup.add(core);
    for (const a of apts) {
      const { from, to } = a.slotR; const gap = 0.0016; const th0 = -2 * Math.PI * (from + gap), th1 = -2 * Math.PI * (to - gap); const n = Math.max(4, Math.ceil((to - from) * 120));
      const pts = []; for (let i = 0; i <= n; i++) { const t = th0 + (th1 - th0) * i / n; pts.push([A * Math.cos(t), -B * Math.sin(t)]); }
      for (let i = n; i >= 0; i--) { const t = th0 + (th1 - th0) * i / n; pts.push([ai * Math.cos(t), -bi * Math.sin(t)]); }
      const geo = extrudeY(pts, y0 + 0.05, FLOOR_H * 0.62, { curveSegments: 1 });
      const base = colorFor(a);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: statusMap(a.status, base), roughness: 0.7, transparent: true, opacity: 0.93 });
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.userData = { kind: 'apt', id: a.id, status: a.status, base };
      floorGroup.add(m); aptMeshes.push(m);
    }
    // corridor ring floor
    floorGroup.visible = true;
    towers.forEach((o) => { o.clip.constant = 1e5; o.gclip.constant = -1e5; o.ghost.visible = false; o.roofG.visible = true; });
    tw.clip.constant = y0 + 0.01; tw.gclip.constant = -(y0 + 0.01); activeTower = tw;
    tw.ghost.visible = true;
    tw.roofG.visible = false;
    shadowsDirty();
    return new THREE.Vector3(T.x, y0, T.z);
  }
  function clearFloor() {
    floorGroup.visible = false; floorGroup.clear(); aptMeshes = []; activeTower = null;
    towers.forEach((tw) => { tw.clip.constant = 1e5; tw.gclip.constant = -1e5; tw.ghost.visible = false; tw.roofG.visible = true; }); shadowsDirty();
  }
  function recolorApts(colorFor, selectedId, dimIds) {
    for (const m of aptMeshes) {
      const a = m.userData.id; const base = colorFor(a);
      m.material.color.setHex(0xffffff); m.userData.base = base;
      m.material.map = statusMap(m.userData.status || 'unknown', base);
      m.material.opacity = dimIds && dimIds.has(a) ? 0.28 : 0.93;
      m.material.emissive.setHex(a === selectedId ? 0x553322 : 0x000000);
      m.scale.y = a === selectedId ? 1.25 : 1;
    }
    request();
  }

  // lighting presets
  const presets = {
    day: { bg: 0xe5e8e4, fog: 0xe5e8e4, sun: 0xfff6ea, si: 2.5, el: 52, az: 215, hemi: 1.15, hs: 0xf4f1ea, hg: 0x8b8577, exp: 1.0, night: 0 },
    golden: { bg: 0xf1cfa9, fog: 0xeec39b, sun: 0xffa45c, si: 2.6, el: 9, az: 255, hemi: 0.65, hs: 0xffd6ad, hg: 0x6b5545, exp: 1.05, night: 0.15 },
    night: { bg: 0x0e1322, fog: 0x0e1322, sun: 0x8fa2ff, si: 0.28, el: 40, az: 160, hemi: 0.22, hs: 0x5a6aa0, hg: 0x1a1a22, exp: 1.15, night: 1 },
  };
  let mode = 'day';
  function setLight(m) {
    mode = m; const p = presets[m];
    scene.background = new THREE.Color(p.bg); scene.fog = new THREE.Fog(p.fog, m === 'golden' ? 1000 : 900, m === 'golden' ? 2600 : 2400);
    const el = THREE.MathUtils.degToRad(p.el), az = THREE.MathUtils.degToRad(p.az);
    sun.position.set(Math.sin(az) * Math.cos(el) * 700, Math.sin(el) * 700, -Math.cos(az) * Math.cos(el) * 700); sun.target.position.set(0, 0, 0);
    sun.color.setHex(p.sun); sun.intensity = p.si; hemi.intensity = p.hemi; hemi.color.setHex(p.hs); hemi.groundColor.setHex(p.hg);
    renderer.toneMappingExposure = p.exp;
    const lit = p.night; bMat.emissive.setRGB(lit, lit * 0.9, lit * 0.75); bMat.emissiveIntensity = 1.1;
    towers.forEach((tw) => { tw.bodyMat.emissive.setRGB(lit, lit * 0.92, lit * 0.8); tw.bodyMat.emissiveIntensity = 1.4; });
    roadMat.emissive.setRGB(0.16 * lit, 0.12 * lit, 0.06 * lit);
    podMats[1].emissive = new THREE.Color(0.35 * lit, 0.28 * lit, 0.18 * lit);
    ground.material.color.setHex(m === 'night' ? 0x3a3c44 : C.ground);
    shadowsDirty(); request();
    // WebKit may draw the requested frame before the new shaders finish compiling.
    // Repaint only — label layout is not part of the shader warmup.
    if (renderer.compileAsync) renderer.compileAsync(scene, camera).then(() => { shadowsDirty(); requestPaint(); }).catch(() => {});
    let frames = 0;
    const pump = () => { requestPaint(); if (++frames < 12) requestAnimationFrame(pump); };
    requestAnimationFrame(pump);
  }

  // labels (HTML overlay)
  const labelItems = [];
  // priority: lower = more important. Towers 0, POIs 10+. Lower-priority labels are lifted on a
  // leader line or hidden when they would overlap a more important label or a tower silhouette.
  function addLabel(el, pos, priority = 50, isTower = false) { labelItems.push({ el, pos: new THREE.Vector3(pos.x, pos.y, pos.z), priority, isTower }); labelItems.sort((a, b) => a.priority - b.priority); request(); }
  const v3 = new THREE.Vector3();
  const corner = new THREE.Vector3();
  function towerRects(w, h) {
    const out = [];
    towers.forEach((tw) => {
      const { T } = tw; const R = T.shape === 'ellipse' ? T.a : Math.max(T.w, T.d) / 2 + 4;
      const top = tw.clip.constant < 1e4 ? Math.min(tw.clip.constant + 4, TOP_Y) : TOP_Y + 3;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, ok = false;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a);
        const lx = (T.shape === 'ellipse' ? T.a : T.w / 2) * ca, lz = (T.shape === 'ellipse' ? T.b : T.d / 2) * sa;
        const r = THREE.MathUtils.degToRad(T.rot); const wx = T.x + lx * Math.cos(r) + lz * Math.sin(r), wz = T.z - lx * Math.sin(r) + lz * Math.cos(r);
        for (const y of [PODIUM_H, top]) {
          corner.set(wx, y, wz).project(camera); if (corner.z >= 1) continue; ok = true;
          const sx = (corner.x * 0.5 + 0.5) * w, sy = (-corner.y * 0.5 + 0.5) * h;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
      }
      if (ok) { const sh = (x1 - x0) * 0.12; out.push([x0 + sh, y0, x1 - sh, y1]); } // ellipse is narrower than its bbox
      void R;
    });
    return out;
  }
  const LABEL_AVOID = '#intro, #explorer, .sheet, .layers, .tools, .place-card, .crumbs, .header, .map-meta, footer, #hint, #toast';
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  function updateLabels(precise) {
    const w = container.clientWidth, h = container.clientHeight;
    const tRects = towerRects(w, h); const placed = []; const ui = [];
    const cr = container.getBoundingClientRect();
    for (const el of document.querySelectorAll(LABEL_AVOID)) {
      if (el.hidden || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const box = [r.left - cr.left, r.top - cr.top, r.right - cr.left, r.bottom - cr.top];
      placed.push(box);
      ui.push({ l: box[0], t: box[1], r: box[2], b: box[3] });
    }
    const header = document.querySelector('.header');
    if (header) {
      const hb = header.getBoundingClientRect().bottom - cr.top + 8;
      ui.push({ l: 0, t: 0, r: w, b: hb });
      placed.push([0, 0, w, hb]);
    }
    // A wide breadcrumb row leaves gaps between chips. Fill the whole band so a tower label
    // cannot sit in one of those gaps, under the crumbs.
    const crumbs = document.querySelector('#crumbs');
    if (crumbs && !crumbs.hidden && crumbs.offsetParent !== null) {
      const r = crumbs.getBoundingClientRect();
      if (r.width > w * 0.55 && r.height > 2) {
        const top = r.top - cr.top, bot = r.bottom - cr.top + 10;
        ui.push({ l: 0, t: top, r: w, b: bot });
        placed.push([0, top, w, bot]);
      }
    }
    // read phase
    const items = labelItems.filter((it) => !it.el.hidden && it.el.style.display !== 'none').map((it) => {
      v3.copy(it.pos).project(camera);
      const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
      const onScreen = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
      const near = v3.z < 1 && Math.abs(v3.x) < 1.8 && Math.abs(v3.y) < 1.8;
      return { it, vis: (v3.z < 1 && it.isTower) || onScreen || (near && it.priority < 13), sx, sy, lw: it.el.offsetWidth, lh: it.el.offsetHeight || 30 };
    }).filter((o) => { if (o.lw > 0) return true; if (o.it.leader) o.it.leader.style.display = 'none'; return false; });
    // write phase: try positions above the anchor, then beside the blocking tower (leader line)
    for (const o of items) {
      const { it } = o; let lx = o.sx, lift = 0, show = o.vis;
      const PAD = 12;
      const rectAt = (x, d) => [x - o.lw / 2 - 4, o.sy - 14 - d - o.lh - 4, x + o.lw / 2 + 4, o.sy - 14 - d + 4];
      const clampX = (x) => Math.min(w - PAD - o.lw / 2 - 4, Math.max(PAD + o.lw / 2 + 4, x));
      const inside = (r) => r[1] >= PAD && r[0] >= PAD && r[2] <= w - PAD && r[3] <= h - PAD;
      const clearOf = (r, avoidTowers) => inside(r) && !placed.some((p) => hit(r, p)) && (!avoidTowers || !tRects.some((t) => hit(r, t)));
      if (show) {
        if (it.isTower) {
          let found = false;
          search: for (const d of [0, 32, 64, 96]) {
            for (const s of [0, 1, -1, 2, -2, 3, -3]) {
              const x = clampX(o.sx + s * (o.lw * 0.72 + 8));
              const r = rectAt(x, d);
              if (clearOf(r, false)) { lx = x; lift = d; placed.push(r); found = true; break search; }
            }
          }
          if (!found) { lx = clampX(o.sx); lift = 0; show = true; placed.push(rectAt(lx, 0)); }
          else show = true;
        } else {
          const cands = [];
          for (const d of [0, 36, 72]) {
            cands.push([clampX(o.sx), d]);
            for (const t of tRects) { cands.push([clampX(t[0] - o.lw / 2 - 10), d]); cands.push([clampX(t[2] + o.lw / 2 + 10), d]); }
          }
          cands.sort((p, q) => (Math.abs(p[0] - o.sx) + p[1] * 1.5) - (Math.abs(q[0] - o.sx) + q[1] * 1.5));
          show = false;
          for (const [x, d] of cands) { if (Math.abs(x - o.sx) > 280) continue; const r = rectAt(x, d); if (clearOf(r, true)) { lx = x; lift = d; show = true; placed.push(r); break; } }
          // Last resort stays inside the viewport and off other labels, even if it sits over a tower.
          if (!show && it.priority < 13) { lx = clampX(o.sx); show = true; placed.push(rectAt(lx, 0)); }
        }
      }
      it._sx = o.sx; it._lx = lx; it._sy = o.sy; it._lift = lift; it._lw = o.lw; it._lh = o.lh;
      const off = Math.abs(lx - o.sx) > 1;
      it.el.style.setProperty('--stem', off ? '0px' : `${14 + lift}px`);
      it.el.style.transform = off ? `translate(-50%,-100%) translate(${lx}px,${o.sy - 14 - lift}px)` : `translate(-50%,-100%) translate(${o.sx}px,${o.sy}px)`;
      it.el.classList.toggle('offset', off);
      it.el.style.opacity = show ? '' : '0'; it.el.style.pointerEvents = show ? '' : 'none';
      it.el.setAttribute('aria-hidden', show ? 'false' : 'true');
      if (!it.leader) { it.leader = document.createElement('i'); it.leader.className = 'leader'; it.el.parentNode?.appendChild(it.leader); }
      if (show && off) {
        const x1 = lx, y1 = o.sy - 14 - lift; const dx = x1 - o.sx, dy = y1 - o.sy; const len = Math.hypot(dx, dy);
        Object.assign(it.leader.style, { display: 'block', width: `${len}px`, transform: `translate(${o.sx}px,${o.sy}px) rotate(${Math.atan2(dy, dx)}rad)` });
      } else it.leader.style.display = 'none';
    }
    // Positions after this point are math on the sizes read above. No further layout reads —
    // getBoundingClientRect here used to force a reflow once per label per pass, every frame.
    const PAD = 12;
    const shown = items.filter((o) => o.it.el.style.opacity !== '0');
    const rectOf = (it) => {
      const off = Math.abs(it._lx - it._sx) > 1;
      const y = off ? it._sy - 14 - it._lift : it._sy;
      const l = it._lx - it._lw / 2, t = y - it._lh;
      return { l, t, r: l + it._lw, b: t + it._lh };
    };
    const overlap = (a, b) => {
      const iw = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const ih = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      return iw > 2 && ih > 2 ? { iw, ih } : null;
    };
    const clampItem = (it) => {
      const b = rectOf(it);
      if (b.l < PAD) it._lx += PAD - b.l;
      else if (b.r > w - PAD) it._lx += (w - PAD) - b.r;
      if (b.t < PAD) it._sy += PAD - b.t;
      else if (b.b > h - PAD) it._sy += (h - PAD) - b.b;
    };
    const pushUi = (it) => {
      for (let n = 0; n < 8; n++) {
        const b = rectOf(it);
        let worst = null;
        for (const p of ui) {
          const o = overlap(b, p);
          if (!o) continue;
          const area = o.iw * o.ih;
          if (!worst || area > worst.area) worst = { p, o, area };
        }
        if (!worst) break;
        const { p, o } = worst;
        if (o.iw < o.ih) it._lx += ((b.l + b.r) < (p.l + p.r) ? -1 : 1) * (o.iw + 6);
        else it._sy += ((b.t + b.b) < (p.t + p.b) ? -1 : 1) * (o.ih + 6);
        clampItem(it);
      }
    };
    const separate = (passes) => {
      for (let pass = 0; pass < passes; pass++) {
        let changed = false;
        for (let i = 0; i < shown.length; i++) {
          for (let j = i + 1; j < shown.length; j++) {
            const A = rectOf(shown[i].it), B = rectOf(shown[j].it);
            const o = overlap(A, B);
            if (!o) continue;
            const moveJ = shown[j].it.priority >= shown[i].it.priority;
            const mover = (moveJ ? shown[j] : shown[i]).it;
            const stay = moveJ ? shown[i].it : shown[j].it;
            const mine = moveJ ? B : A;
            const other = moveJ ? A : B;
            const towers = mover.isTower && stay.isTower;
            if (towers) {
              const dir = (mine.l + mine.r) >= (other.l + other.r) ? 1 : -1;
              const prevLx = mover._lx;
              const prevSy = mover._sy;
              mover._lx += dir * (o.iw + 8);
              clampItem(mover);
              if (overlap(rectOf(mover), rectOf(stay))) {
                mover._lx = prevLx;
                const vdir = (mine.t + mine.b) >= (other.t + other.b) ? 1 : -1;
                mover._sy += vdir * (o.ih + 12);
                clampItem(mover);
                const nb = rectOf(mover);
                if (overlap(nb, rectOf(stay)) || nb.t < PAD || nb.b > h - PAD) {
                  mover._lx = prevLx;
                  mover._sy = prevSy;
                }
              }
            } else {
              const below = (mine.t + mine.b) >= (other.t + other.b);
              const prevSy = mover._sy;
              mover._sy += below ? o.ih + 8 : -(o.ih + 8);
              clampItem(mover);
              if (overlap(rectOf(mover), rectOf(stay))) {
                mover._sy = prevSy;
                const dir = (mine.l + mine.r) >= (other.l + other.r) ? 1 : -1;
                mover._lx += dir * (o.iw + 8);
              }
            }
            clampItem(mover);
            changed = true;
          }
        }
        if (!changed) break;
      }
    };
    for (const o of shown) pushUi(o.it);
    separate(8);
    for (const o of shown) pushUi(o.it);
    separate(4);
    const commit = (it) => {
      const off = Math.abs(it._lx - it._sx) > 1;
      const y = off ? it._sy - 14 - it._lift : it._sy;
      it.el.style.setProperty('--stem', off ? '0px' : `${14 + it._lift}px`);
      it.el.style.transform = `translate(-50%,-100%) translate(${it._lx}px,${y}px)`;
      it.el.classList.toggle('offset', off);
      if (it.leader) {
        if (off && it.el.style.opacity !== '0') {
          const dx = it._lx - it._sx, dy = y - it._sy, len = Math.hypot(dx, dy);
          Object.assign(it.leader.style, { display: 'block', width: `${len}px`, transform: `translate(${it._sx}px,${it._sy}px) rotate(${Math.atan2(dy, dx)}rad)` });
        } else it.leader.style.display = 'none';
      }
    };
    for (const o of shown) commit(o.it);
    // One settling pass reads real boxes. Skipped while the camera is moving so orbit
    // frames stay on the math above and don't reflow the page.
    if (precise) {
      const live = () => shown.filter((o) => o.it.el.style.opacity !== '0').map((o) => {
        const r = o.it.el.getBoundingClientRect();
        return { it: o.it, l: r.left - cr.left, t: r.top - cr.top, r: r.right - cr.left, b: r.bottom - cr.top };
      });
      const fits = (b) => b.l >= PAD && b.t >= PAD && b.r <= w - PAD && b.b <= h - PAD;
      for (let pass = 0; pass < 10; pass++) {
        const boxes = live();
        let acted = false;
        pair: for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const o = overlap(boxes[i], boxes[j]);
            if (!o) continue;
            const bi = boxes[i], bj = boxes[j];
            const moveJ = bj.it.priority >= bi.it.priority;
            const mover = moveJ ? bj : bi;
            const other = moveJ ? bi : bj;
            const cands = mover.it.isTower && other.it.isTower
              ? [[o.iw + 8, 0], [-(o.iw + 8), 0], [0, -(o.ih + 8)], [0, o.ih + 8]]
              : [[0, o.ih + 8], [0, -(o.ih + 8)], [o.iw + 10, 0], [-(o.iw + 10), 0], [o.iw + 80, 0], [-(o.iw + 80), 0], [0, o.ih + 48], [0, -(o.ih + 48)]];
            let placedOk = false;
            for (const [dx, dy] of cands) {
              const nb = { l: mover.l + dx, t: mover.t + dy, r: mover.r + dx, b: mover.b + dy };
              if (!fits(nb)) continue;
              if (ui.some((p) => overlap(nb, p))) continue;
              if (boxes.some((b) => b.it !== mover.it && overlap(nb, b))) continue;
              mover.it._lx += dx; mover.it._sy += dy; commit(mover.it); placedOk = true; acted = true; break;
            }
            if (!placedOk && !mover.it.isTower) {
              const wdt = mover.r - mover.l, hgt = mover.b - mover.t;
              let found = null;
              scan: for (let y = PAD; y <= h - hgt - PAD; y += 24) {
                for (let x = PAD; x <= w - wdt - PAD; x += 24) {
                  const nb = { l: x, t: y, r: x + wdt, b: y + hgt };
                  if (ui.some((p) => overlap(nb, p))) continue;
                  if (boxes.some((b) => b.it !== mover.it && overlap(nb, b))) continue;
                  found = [x - mover.l, y - mover.t]; break scan;
                }
              }
              if (found) { mover.it._lx += found[0]; mover.it._sy += found[1]; commit(mover.it); }
              else { mover.it.el.style.opacity = '0'; mover.it.el.style.pointerEvents = 'none'; if (mover.it.leader) mover.it.leader.style.display = 'none'; }
              acted = true;
            }
            else if (!placedOk && mover.it.isTower && other.it.isTower) {
              const sign = mover.t >= other.t ? 1 : -1;
              let dy = sign * (o.ih + 12);
              const next = { l: mover.l, t: mover.t + dy, r: mover.r, b: mover.b + dy };
              if (next.t < PAD || next.b > h - PAD) dy = -dy;
              const alt = { l: mover.l, t: mover.t + dy, r: mover.r, b: mover.b + dy };
              if (alt.t >= PAD && alt.b <= h - PAD) {
                mover.it._sy += dy;
                commit(mover.it);
              }
              acted = true;
            }
            break pair;
          }
        }
        if (acted) continue;
        for (const b of boxes) {
          const p = ui.find((u) => overlap(b, u));
          if (!p) continue;
          const o = overlap(b, p);
          const dx = o.iw <= o.ih ? ((b.l + b.r) < (p.l + p.r) ? -1 : 1) * (o.iw + 6) : 0;
          const dy = dx ? 0 : ((b.t + b.b) < (p.t + p.b) ? -1 : 1) * (o.ih + 6);
          b.it._lx += dx; b.it._sy += dy; commit(b.it); acted = true; break;
        }
        if (!acted) break;
      }
    }
    packPhoneTowers();
    function packPhoneTowers() {
      if (w >= 520) return;
      const towers = shown.filter((o) => o.it.isTower && o.it.el.style.opacity !== '0');
      if (towers.length < 2) return;
      const rects = towers.map((o) => ({ o, b: rectOf(o.it) }));
      let rowTop = 8;
      for (const p of ui) {
        if (p.r - p.l > w * 0.7 && p.t < h * 0.4 && p.b < h * 0.55) rowTop = Math.max(rowTop, p.b + 4);
      }
      rects.sort((a, c) => a.o.it._sx - c.o.it._sx);
      const widths = rects.map((x) => Math.max(44, x.b.r - x.b.l));
      const raw = widths.reduce((s, v) => s + v, 0);
      const slots = Math.max(1, rects.length - 1);
      const gap = Math.max(2, Math.min(8, (w - 8 - raw) / slots));
      const total = raw + gap * slots;
      let x = Math.max(2, (w - total) / 2);
      for (let i = 0; i < rects.length; i++) {
        const it = rects[i].o.it;
        const cx = x + widths[i] / 2;
        it._lx = cx;
        it._lift = 0;
        const off = Math.abs(cx - it._sx) > 1;
        it._sy = rowTop + it._lh + (off ? 14 : 0);
        x += widths[i] + gap;
        commit(it);
      }
    }
  }

  // render-on-demand loop
  let needs = true, labelsDirty = true, anim = null, autoRotate = false;
  function request() { needs = true; labelsDirty = true; }
  function requestPaint() { needs = true; }
  let shadowNeeds = true; function shadowsDirty() { shadowNeeds = true; }
  controls.addEventListener('change', () => { clampTarget(); request(); });
  function clampTarget() { const t = controls.target; const r = Math.hypot(t.x, t.z); if (r > 520) { t.x *= 520 / r; t.z *= 520 / r; } t.y = THREE.MathUtils.clamp(t.y, 0, 150); }
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();
    if (anim) { anim.t = Math.min(1, anim.t + dt / anim.dur); const k = anim.t < 0.5 ? 4 * anim.t ** 3 : 1 - (-2 * anim.t + 2) ** 3 / 2; camera.position.lerpVectors(anim.p0, anim.p1, k); controls.target.lerpVectors(anim.t0, anim.t1, k); if (anim.t >= 1) anim = null; needs = true; labelsDirty = true; }
    if (autoRotate) { controls.autoRotate = true; controls.autoRotateSpeed = 0.6; } else controls.autoRotate = false;
    const moved = controls.update(dt);
    const moving = moved || !!anim || autoRotate;
    if (moving || needs) {
      if (shadowNeeds && renderer.shadowMap.enabled) { renderer.shadowMap.needsUpdate = true; shadowNeeds = false; }
      renderer.render(scene, camera);
      if (moving) { updateLabels(false); labelsDirty = true; }
      else if (labelsDirty) { updateLabels(true); labelsDirty = false; }
      needs = false;
      window.__hisniStats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, dpr: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled };
    } else if (labelsDirty) { updateLabels(true); labelsDirty = false; }
  }
  document.fonts?.ready?.then(() => request());
  setLight('day');
  await step(0.95);
  if (renderer.compileAsync) { try { await renderer.compileAsync(scene, camera); } catch (e) {} }
  await step(1);
  loop();

  function flyTo(pos, target, dur = 1.3) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) dur = 0.01;
    anim = { t: 0, dur, p0: camera.position.clone(), p1: pos.clone(), t0: controls.target.clone(), t1: target.clone() };
  }
  const views = {
    overview: () => { const k = camera.aspect < 0.8 ? 1.75 : 1; flyTo(new THREE.Vector3(-330 * k, 260 * k, 420 * k), new THREE.Vector3(0, 45, 10)); },
    towers: () => { const k = camera.aspect < 0.8 ? 1.6 : 1; flyTo(new THREE.Vector3(-150 * k, 210 * k, 260 * k), new THREE.Vector3(10, 60, 10)); },
    neighborhood: () => flyTo(new THREE.Vector3(-520, 620, 700), new THREE.Vector3(30, 0, 0)),
    map: () => flyTo(new THREE.Vector3(0.1, 980, 1), new THREE.Vector3(0, 0, 0)),
  };
  function focusTower(id) {
    const tw = towers.get(id); const p = tw.group.position; const dir = new THREE.Vector3(-0.55, 0, 1).normalize();
    flyTo(new THREE.Vector3(p.x + dir.x * 270, 175, p.z + dir.z * 270), new THREE.Vector3(p.x, 62, p.z));
  }
  function focusFloor(id, floor) {
    const tw = towers.get(id); const p = tw.group.position; const y = (floor - 1) * FLOOR_H;
    flyTo(new THREE.Vector3(p.x - 75, y + 78, p.z + 95), new THREE.Vector3(p.x, y + 4, p.z));
  }
  let highlighted = null;
  function highlightTower(id) { towers.forEach((tw, k) => { tw.ring.visible = k === id; }); highlighted = id; request(); }

  // picking
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (aptMeshes.length) { const h = ray.intersectObjects(aptMeshes, false)[0]; if (h) return h.object.userData; }
    const objs = []; towers.forEach((tw) => tw.group.traverse((o) => { if (o.isMesh && o.userData.kind === 'tower' && o.visible) objs.push(o); }));
    const hits = ray.intersectObjects(objs, false).filter((h) => !activeTower || h.object.userData.id !== activeTower.T.id || h.point.y <= activeTower.clip.constant + 0.1);
    return hits[0]?.object.userData || null;
  }
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; autoRotate = false; });
  renderer.domElement.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) onPick?.(pick(e)); down = null; });
  let hoverT = 0;
  renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || e.buttons) return; const now = performance.now(); if (now - hoverT < 60) return; hoverT = now; const h = pick(e); renderer.domElement.style.cursor = h ? 'pointer' : ''; onHover?.(h, e); });

  function frame() { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; if (w < 820) camera.setViewOffset(w, h, 0, h * 0.17, w, h); else camera.clearViewOffset(); camera.updateProjectionMatrix(); request(); }
  frame();
  const ro = new ResizeObserver(frame);
  ro.observe(container);

  return {
    renderer, camera, controls, setLight, views, focusTower, focusFloor, highlightTower, buildFloor, clearFloor, recolorApts, addLabel, request,
    setLayer(name, on) { if (name === 'labels') return; layers[name].visible = on; shadowsDirty(); request(); },
    zoom(f) { const d = camera.position.clone().sub(controls.target).multiplyScalar(f); if (d.length() > controls.minDistance && d.length() < controls.maxDistance) camera.position.copy(controls.target).add(d); request(); },
    nudge(dTheta, dPhi) {
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta += dTheta || 0;
      sph.phi = THREE.MathUtils.clamp(sph.phi + (dPhi || 0), 0.25, Math.PI / 2 - 0.08);
      offset.setFromSpherical(sph);
      camera.position.copy(controls.target).add(offset);
      request();
    },
    toggleRotate() { autoRotate = !autoRotate; return autoRotate; },
    stats: () => ({ ...window.__hisniStats, neighbourTris: nb.tris, trees: tp.length }),
    towerLabelPos: (id) => towers.get(id).label,
  };
}
