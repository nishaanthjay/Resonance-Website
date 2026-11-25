import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => innerWidth < 760;

/* ---------- parts: file, explode offset (mm, y axis), look ---------- */
const PARTS = {
  label:     { off: -17, mat: { c: 0xe9e4d4, m: 0.0, r: 0.6 } },
  base:      { off: 0,   mat: { c: 0x20282b, m: 0.55, r: 0.38 } },
  striker:   { off: 14,  mat: { c: 0xff9f43, m: 0.15, r: 0.45 } },
  cartridge: { off: 30,  mat: { c: 0x2c3538, m: 0.5, r: 0.4 } },
  disk:      { off: 45,  mat: { c: 0xd6dde0, m: 1.0, r: 0.16 } },
  diskcap:   { off: 45,  z: 8, mat: { c: 0x8e9a9e, m: 1.0, r: 0.3 } },
  lid:       { off: 53,  mat: { c: 0x2a3437, m: 0.5, r: 0.28 }, glass: true },
  pin:       { off: 55,  mat: { c: 0xbfc8cb, m: 1.0, r: 0.22 } },
  tackcap:   { off: 65,  mat: { c: 0x1d9e75, m: 0.35, r: 0.35 } },
};
const GROUP = { pin: ['pin', 'tackcap'], striker: ['striker'], disk: ['disk', 'diskcap'], cartridge: ['cartridge'], label: ['label'] };

/* ---------- animated state; scroll timelines write here ---------- */
const S = {
  dist: 190, yaw: 0, pitch: 0, face: 0, shift: 0, lift: -0.06, scale: 1,
  explode: 0, glow: 0, plinth: 1, glass: 0, pinUp: 0, strike: 0, ring: 0, dim: 0, solid: 1,
  active: '', spin: 0,
};

/* ---------- three setup ---------- */
const canvas = $('#stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
catch { renderer = null; }

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, 1, 1, 2000);
const spin = new THREE.Group();  // yaw / scale about the scene origin
const tag = new THREE.Group();   // CAD frame (rotated Z-up -> Y-up)
spin.add(tag); scene.add(spin);
const nodes = {};                // name -> mesh
const mats = {};

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(60, 120, 90); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9f43, 3.0); rim.position.set(-90, 40, -60); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x35e0ff, .5); fill.position.set(80, -30, 40); scene.add(fill);

  // plinth: dark steel disc with a faint cyan edge, built in code
  const plinth = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(36, 40, 5, 96),
    new THREE.MeshStandardMaterial({ color: 0x0b1113, metalness: .9, roughness: .32 }));
  disc.position.y = -3;
  const edge = new THREE.Mesh(
    new THREE.TorusGeometry(36.1, .2, 8, 128),
    new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: .55 }));
  edge.rotation.x = Math.PI / 2;
  plinth.add(disc, edge);
  scene.add(plinth);
  scene.userData.plinth = plinth;

  // haze: big teal radial sprites behind the product
  const hz = document.createElement('canvas'); hz.width = hz.height = 256;
  const g = hz.getContext('2d').createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(29,158,117,.55)'); g.addColorStop(1, 'rgba(14,52,54,0)');
  hz.getContext('2d').fillStyle = g; hz.getContext('2d').fillRect(0, 0, 256, 256);
  const hazeTex = new THREE.CanvasTexture(hz);
  for (const [x, y, z, s] of [[0, 10, -60, 320], [-40, -10, -90, 420], [50, 30, -120, 380]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, y, z); sp.scale.setScalar(s); scene.add(sp);
  }

  // sound rings (cyan, camera-facing)
  var rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(m); return m;
  });
}

/* ---------- load CAD ---------- */
const loader = new STLLoader();
let loaded = 0, ready = false;
const names = Object.keys(PARTS);
if (renderer) {
  names.forEach((n) => loader.load(`/cad/${n}.stl`, (geo) => {
    geo = toCreasedNormals(geo, 0.55);               // smooth curves, crisp edges
    const p = PARTS[n];
    const mat = new THREE.MeshPhysicalMaterial({
      color: p.mat.c, metalness: p.mat.m, roughness: p.mat.r,
      clearcoat: p.glass ? 1 : 0, clearcoatRoughness: .08,
      emissive: 0x35e0ff, emissiveIntensity: 0,
    });
    mats[n] = mat;
    const mesh = new THREE.Mesh(geo, mat);
    nodes[n] = mesh; tag.add(mesh);
    if (++loaded === names.length) onLoaded();
  }, undefined, () => { canvas.remove(); endBoot(); }));
} else endBoot();

const bbox = new THREE.Box3();
let center = new THREE.Vector3();
function onLoaded() {
  // CAD is Z-up-ish per part; keep file orientation, centre the assembled body
  tag.rotation.x = -Math.PI / 2;   // Z-up CAD -> Y-up scene
  tag.updateMatrixWorld(true);
  names.forEach((n) => bbox.expandByObject(nodes[n]));
  bbox.getCenter(center);
  tag.position.copy(center).multiplyScalar(-1);
  spin.position.set(0, 0, 0);
  ready = true; endBoot();
}

/* ---------- boot ---------- */
let booted = false;
function endBoot() {
  if (booted) return; booted = true;
  $('#boot').classList.add('gone');
  document.body.style.overflow = '';
}
document.body.style.overflow = 'hidden';
$('#boot').addEventListener('click', endBoot);
setTimeout(() => { if (ready || !renderer) endBoot(); }, 1500);
const bootPoll = setInterval(() => { if (ready) { endBoot(); clearInterval(bootPoll); } }, 100);

/* ---------- per-frame ---------- */
const view = new THREE.Vector3(0.51, 0.24, 0.82).normalize();
const top = new THREE.Vector3(0.0, 0.04, 1).normalize(); // disk face normal is world z (CAD -y)
const dbox = new THREE.Box3(), dctr = new THREE.Vector3();
const tmp = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3();
let visible = false;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  if (renderer && ready) syncCanvas();
  if (!renderer || !ready || !visible) return;
  stepState();
  const t = clock.getElapsedTime();
  const w = innerWidth, h = innerHeight, asp = w / h;
  renderer.setSize(w, h, false);
  camera.aspect = asp;

  // y axis is the stack axis in the CAD; explode along it
  names.forEach((n) => {
    const p = PARTS[n], m = nodes[n];
    let y = p.off * S.explode;
    if (n === 'pin' || n === 'tackcap') y += S.pinUp * 14;
    if (n === 'striker') y += S.strike * 6;
    m.position.set(0, p.z ? -p.z * S.explode : 0, y); // STL frame is Z-up: stack axis = z, depth = -y
    const grp = Object.entries(GROUP).find(([, v]) => v.includes(n))?.[0];
    const hot = S.active && grp === S.active;
    mats[n].emissiveIntensity += ((hot ? 0.55 : n === 'disk' ? S.glow * 1.4 : 0) - mats[n].emissiveIntensity) * 0.15;
    const keep = n === 'disk' || n === 'diskcap' || n === 'cartridge';
    const base = n === 'lid' ? 1 - S.glass * 0.82 : 1;
    const o = base * (1 - S.dim * (keep ? 0 : 1));
    mats[n].opacity = o; mats[n].transparent = o < 0.995; mats[n].depthWrite = o > 0.5; m.visible = o > 0.03;
  });

  const pl = scene.userData.plinth;
  pl.visible = S.plinth > 0.02; pl.scale.setScalar(1);
  pl.children.forEach((c) => c.material.opacity !== undefined && c.material.transparent && (c.material.opacity = .55 * S.plinth));
  pl.position.y = bbox.min.y - center.y - 0.2 - S.explode * 17 * 0; // sits under the label/base

  spin.rotation.y = S.yaw + (reduce ? 0 : Math.sin(t * .4) * 0.04) + S.spin;
  spin.scale.setScalar(S.scale);

  // camera: fixed direction from the spec, blended toward top-down for the disk
  tmp.copy(view).lerp(top, S.face).normalize();
  const d = S.dist * (asp < 1 ? 1 + (1 / asp - 1) * 0.55 : 1);
  const mid = new THREE.Vector3(0, (S.explode * 22) * S.scale, 0);
  if (S.face > 0.01) { dbox.setFromObject(nodes.disk); dbox.getCenter(dctr); mid.lerp(dctr, S.face); }
  camera.position.copy(mid).addScaledVector(tmp, d);
  camera.lookAt(mid);
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  upv.setFromMatrixColumn(camera.matrixWorld, 1);
  const vh = 2 * d * Math.tan(THREE.MathUtils.degToRad(10)), vw = vh * asp;
  const sh = asp < 1 ? 0 : S.shift;
  const lf = S.lift - (asp < 1 ? 0.2 : 0); // phones: tag sits below the text
  camera.position.addScaledVector(right, -sh * vw).addScaledVector(upv, -lf * vh);
  mid.addScaledVector(right, -sh * vw).addScaledVector(upv, -lf * vh);
  camera.lookAt(mid);
  camera.updateProjectionMatrix();

  // rings expand from the disk
  const dp = nodes.disk.getWorldPosition(new THREE.Vector3());
  rings.forEach((r, i) => {
    const k = Math.min(1, Math.max(0, S.ring * 1.4 - i * 0.22));
    r.position.copy(dp); r.quaternion.copy(camera.quaternion);
    r.scale.setScalar(6 + k * (40 + i * 22));
    r.material.opacity = k > 0 && k < 1 ? (1 - k) * 0.9 : 0;
  });

  renderer.render(scene, camera);
}
frame();

/* ---------- DOM helpers ---------- */
// split headlines into words that brighten with scroll
$$('.words').forEach((el) => {
  el.innerHTML = el.textContent.split(' ').map((w) => `<span>${w}</span>`).join(' ');
});

// waveform path (illustrative decaying sine)
{
  let d = 'M0 40';
  for (let x = 0; x <= 800; x += 2) d += ` L${x} ${40 + Math.sin(x * 0.18) * 34 * Math.exp(-x / 330) * (0.6 + 0.4 * Math.sin(x * 0.05))}`;
  const p = $('#wavepath'); p.setAttribute('d', d);
  p.style.strokeDasharray = 1200; p.style.strokeDashoffset = 1200;
}
// spectrum bars
const HOT = [3, 7, 12, 15];
['#spec1', '#spec2'].forEach((id) => {
  const el = $(id); for (let i = 0; i < 28; i++) el.append(document.createElement('i'));
});
const bars = (id) => $$('i', $(id));
const heights = bars('#spec1').map((_, i) => 12 + 80 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));

/* ---------- scroll choreography ----------
   ScrollTrigger pins each scene and reports progress. The 3D state S is a pure
   function of those progresses (applied in scene order), so refresh order never
   leaves the tag in the wrong pose. */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;
const P = { hero: 0, inside: 0, ring: 0, code: 0, close: 0 };
const DEF = { dist: 235, yaw: 0, face: 0, shift: 0, lift: -0.2, scale: 1, explode: 0, plinth: 1, glass: 0, pinUp: 0, strike: 0, ring: 0, dim: 0, glow: 0 };
const keys = ['pin', 'striker', 'disk', 'cartridge', 'label'];
const to = (s, t, v) => { for (const k in v) s[k] = mix(s[k], v[k], t); };

function target() {
  const s = { ...DEF, active: '' };
  // 1 hero (1.5 screens): camera pushes in, tag grows 1 -> 1.15
  to(s, P.hero, { dist: 200, yaw: 0.6, lift: -0.1, scale: 1.15 });
  // 3 inside (3.5): 0-15 move right, 15-60 parts separate, 60-90 callouts, 90-100 reassembly starts
  let p = P.inside;
  to(s, seg(p, 0, .15), { shift: 0.2, dist: 330, plinth: 0, scale: 1, lift: 0 });
  to(s, seg(p, .15, .6), { explode: 1 });
  to(s, seg(p, .9, 1), { explode: 0.8 });
  if (p > .6 && p < .9) s.active = keys[Math.min(4, Math.floor(seg(p, .6, .9) * 5))];
  // 4 ring (2): 0-25 lid glassy, 25-50 pin lifts, 50-60 striker, 60-90 disk glows + rings
  p = P.ring;
  to(s, seg(p, 0, .25), { explode: 0, dist: 230, shift: 0, lift: -0.16, yaw: 0.6, glass: 1 });
  to(s, seg(p, .25, .5), { pinUp: 1 });
  to(s, Math.pow(seg(p, .5, .6), 3), { strike: 1 });
  to(s, seg(p, .6, .9), { glow: 1, ring: 1 });
  // 5 code (1.5): face-on to the disk, others fade, cartridge slides out and back
  p = P.code;
  to(s, seg(p, 0, .4), { face: 0.95, dim: 1, shift: 0.2, dist: 90, lift: 0, yaw: 0, explode: 1, glass: 0, pinUp: 0, strike: 0, glow: 0, ring: 0 });
  s.explode += 0.15 * Math.sin(Math.PI * seg(p, .4, .8));
  // 9 close: tag finishes assembling and rings once
  p = P.close;
  to(s, seg(p, 0, .6), { explode: 0, glass: 0, dim: 0, face: 0, shift: 0, pinUp: 0, strike: 0, plinth: 0, dist: 260, scale: .8, lift: -0.18, yaw: 0, glow: 0 });
  s.ring = seg(p, .6, 1);
  return s;
}

const mm = gsap.matchMedia();
const pinLen = (n) => (mobile() ? n / 2 : n);
const nav = $('nav');
const chips = $('.chips');

function track(id, len, extra = {}) {
  return ScrollTrigger.create({
    trigger: '#' + id, start: 'top top', end: len ? `+=${pinLen(len) * 100}%` : 'bottom 30%',
    pin: !!len, anticipatePin: 1,
    onUpdate: (self) => (P[id] = self.progress), onRefresh: (self) => (P[id] = self.progress), ...extra,
  });
}
// canvas visible only in the tag sections (derived from scene progress; pinned scenes outlast their element height)
let closeOn = false, shown = false;
function trackVisibility() {
  ScrollTrigger.create({ trigger: '#close', start: 'top 95%', end: 'bottom 5%', onToggle: (s) => (closeOn = s.isActive) });
}
function syncCanvas() {
  const v = smooth ? ((P.code < 1 && !(P.hero === 1 && P.inside === 0)) || closeOn) : true;
  visible = v;
  if (v !== shown) { shown = v; gsap.to(canvas, { opacity: v ? 1 : 0, duration: .5, overwrite: true }); }
}

const wordsReveal = (id) => gsap.to(id + ' .words span', { opacity: 1, stagger: .15, ease: 'none',
  scrollTrigger: { trigger: id, start: 'top 70%', end: 'top 25%', scrub: true } });
const cardsIn = () => $$('.card, .step').forEach((c, i) => gsap.from(c, { scale: .92, opacity: 0, duration: .9, ease: 'expo.out', delay: (i % 3) * .08,
  scrollTrigger: { trigger: c, start: 'top 88%' } }));
const lis = $$('.callouts li');
const countUp = () => ScrollTrigger.create({ trigger: '#problem .stats', start: 'top 80%', once: true, onEnter: () =>
  $$('.num').forEach((n) => { const o = { v: 0 }; gsap.to(o, { v: +n.dataset.to, duration: 1.2, ease: 'power2.out', onUpdate: () => (n.textContent = Math.round(o.v)) }); }) });
const lightBand = () => ScrollTrigger.create({ trigger: '#privacy .spectrum', start: 'top 85%', once: true, onEnter: () =>
  bars('#spec2').forEach((b, i) => { b.style.height = heights[i] + '%'; b.classList.toggle('hot', HOT.includes(i)); }) });

let smooth = false;
mm.add('(prefers-reduced-motion: no-preference)', () => {
  smooth = true;
  track('hero', 1.5); track('inside', 3.5); track('ring', 2); track('code', 1.5); track('close', 0, { start: 'top 90%', end: 'top 25%' });
  trackVisibility(); // after the pins, so spacer heights are already counted
  // hero copy lifts away; chips + rule fade
  gsap.to(['.hero-copy', '#hero .rule', chips], { y: -90, opacity: 0, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: `+=${pinLen(1.5) * 100}%`, scrub: true } });
  ScrollTrigger.create({ start: 40, onUpdate: (s) => nav.classList.toggle('small', s.scroll() > 40) });
  gsap.to('#chapbar', { width: '100%', ease: 'none', scrollTrigger: { trigger: '#inside', start: 'top top', end: `+=${pinLen(3.5) * 100}%`, scrub: true } });
  // waveform + spectrum follow their scene's progress
  ScrollTrigger.create({ trigger: '#ring', start: 'top top', end: `+=${pinLen(2) * 100}%`, scrub: true,
    onUpdate: (s) => ($('#wavepath').style.strokeDashoffset = 1200 * (1 - seg(s.progress, .6, .9))) });
  ScrollTrigger.create({ trigger: '#code', start: 'top top', end: `+=${pinLen(1.5) * 100}%`, scrub: true,
    onUpdate: (s) => { const t = seg(s.progress, .3, .9); bars('#spec1').forEach((b, i) => (b.style.height = heights[i] * t + 6 + '%')); } });
  ['#problem', '#science', '#layers', '#privacy', '#cost', '#roadmap'].forEach(wordsReveal);
  countUp(); lightBand(); cardsIn();
});

mm.add('(prefers-reduced-motion: reduce)', () => {
  // no pins, no scrub: static renders, simple fades
  visible = true; gsap.set(canvas, { opacity: 1 });
  $$('.num').forEach((n) => (n.textContent = n.dataset.to));
  bars('#spec2').forEach((b, i) => { b.style.height = heights[i] + '%'; b.classList.toggle('hot', HOT.includes(i)); });
  bars('#spec1').forEach((b, i) => (b.style.height = heights[i] + '%'));
  $('#wavepath').style.strokeDashoffset = 0;
  const preset = { hero: {}, inside: { explode: 1, shift: .2, plinth: 0, dist: 330, scale: 1, lift: 0 }, ring: { glass: 1, pinUp: 1, strike: 1, plinth: 0, dist: 200, shift: 0 }, code: { face: .95, dim: 1, explode: 1, shift: .2, dist: 90, lift: 0, yaw: 0 }, close: { scale: .8, lift: -.18, dist: 260 } };
  Object.entries(preset).forEach(([id, v]) => ScrollTrigger.create({ trigger: '#' + id, start: 'top 60%', end: 'bottom 40%',
    onToggle: (s) => s.isActive && gsap.to(S, { ...DEF, ...v, duration: .6 }) }));
  cardsIn();
});

// each frame: ease the live state toward the scroll-derived target
function stepState() {
  if (!smooth) return;
  const T = target();
  for (const k in DEF) S[k] += (T[k] - S[k]) * 0.14;
  S.active = T.active;
  lis.forEach((l, j) => l.classList.toggle('on', keys[j] === T.active));
}
addEventListener('load', () => ScrollTrigger.refresh());
if (import.meta.env.DEV) window.__dbg = { S, P, ScrollTrigger, get visible() { return visible; }, get ready() { return ready; } };
