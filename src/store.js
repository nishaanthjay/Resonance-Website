import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { gsap } from 'gsap';

/* In-store simulation. Tag geometry is the real CAD; layout, people and motion are illustrative.
   Story: three shoppers. A pays (tag comes off at checkout, no alarm). B pulls a tag at a rack (the
   listener hears the ring). C walks out with a tag still on (the exit gate reads the 58 kHz label). */
export function initStore() {
  const $ = (s, r = document) => r.querySelector(s);
  const canvas = $('#store'), wrap = $('.stage');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { wrap.classList.add('nogl'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0x9fb0b3, 0x0a1012, 0.4));
  const key = new THREE.DirectionalLight(0xfff1de, 1.6); key.position.set(7, 18, 11);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -17, right: 17, top: 12, bottom: -12, near: 1, far: 50 }); key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x35e0ff, 0.5); rim.position.set(-10, 6, -8); scene.add(rim);
  const world = new THREE.Group(); scene.add(world);

  const std = (c, m = 0.2, r = 0.7, x = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, ...x });
  const box = (w, h, d, mat, x, y, z, par = world, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; par.add(m); return m;
  };

  /* ---------- shell: floor, walls, street ---------- */
  const tile = document.createElement('canvas'); tile.width = tile.height = 256;
  { const c = tile.getContext('2d'); c.fillStyle = '#131b1d'; c.fillRect(0, 0, 256, 256); c.strokeStyle = 'rgba(159,176,179,.10)'; c.lineWidth = 2; c.strokeRect(1, 1, 254, 254); c.strokeStyle = 'rgba(159,176,179,.04)'; c.beginPath(); c.moveTo(128, 0); c.lineTo(128, 256); c.moveTo(0, 128); c.lineTo(256, 128); c.stroke(); }
  const tex = new THREE.CanvasTexture(tile); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 8); tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), new THREE.MeshStandardMaterial({ map: tex, color: 0x6b7a7d, metalness: 0.2, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), std(0x070b0c, 0, 1));
  street.rotation.x = -Math.PI / 2; street.position.y = -0.02; street.receiveShadow = true; world.add(street);
  const wallM = std(0x1a2528, 0.3, 0.6), trim = new THREE.MeshBasicMaterial({ color: 0x1d9e75 });
  box(24, 2.8, 0.2, wallM, 0, 1.4, -8.1);                       // back
  box(24, 0.06, 0.24, trim, 0, 2.82, -8.1, world, false);
  box(0.2, 1.1, 16, wallM, -12.1, 0.55, 0); box(0.2, 1.1, 16, wallM, 12.1, 0.55, 0);   // sides (cut away)
  box(8.2, 0.5, 0.2, wallM, -7.9, 0.25, 8.1); box(7.8, 0.5, 0.2, wallM, 8.1, 0.25, 8.1); // front, door gap x 4.2..8.2
  box(3.6, 0.03, 1.6, std(0x1d9e75, 0.1, 0.9), 6.2, 0.02, 8.6, world, false);              // door mat

  /* ---------- helpers ---------- */
  const GCOL = [0x1d9e75, 0xc9b99a, 0xa8553a, 0x27384f, 0xb8923a, 0x6b7f86, 0x8a4f62, 0x3d5a4a];
  function garment(color, kind) {
    const g = new THREE.Group(), m = std(color, 0.05, 0.85);
    const add = (w, h, d, x, y, rz = 0) => { const me = box(w, h, d, m, x, y, 0, g); me.rotation.z = rz; return me; };
    if (kind === 'pants') { add(0.27, 1.0, 0.15, -0.15, -0.05); add(0.27, 1.0, 0.15, 0.15, -0.05); add(0.58, 0.2, 0.16, 0, 0.45); }
    else { add(0.58, 0.95, 0.16, 0, 0); add(0.2, 0.4, 0.14, -0.36, 0.28, 0.45); add(0.2, 0.4, 0.14, 0.36, 0.28, -0.45); }
    return g;
  }

  /* ---------- load tag CAD, then build everything ---------- */
  const geos = {}, files = ['base', 'lid', 'pin', 'tackcap'];
  let got = 0;
  const loader = new STLLoader();
  files.forEach((f) => loader.load(`/cad/${f}.stl`, (g) => { geos[f] = toCreasedNormals(g, 0.55); if (++got === files.length) build(); }));
  const matTag = { base: std(0x1c2326, 0.6, 0.38), pin: std(0xbfc8cb, 1, 0.22), tackcap: std(0x1d9e75, 0.35, 0.35) };

  const tags = [], garments = [], people = {}, listeners = [], rings = [], pops = [];
  let gateLeds = [], field, cashier, ready = false;

  function makeTag(S) {
    const g = new THREE.Group(), inner = new THREE.Group();
    inner.position.set(-14.7 * S, 6.7 * S, 0); inner.scale.setScalar(S); g.add(inner);
    const lidMat = std(0x2a3437, 0.5, 0.28, { emissive: 0x35e0ff, emissiveIntensity: 0 });
    const parts = { base: new THREE.Mesh(geos.base, matTag.base), lid: new THREE.Mesh(geos.lid, lidMat), pin: new THREE.Mesh(geos.pin, matTag.pin), tackcap: new THREE.Mesh(geos.tackcap, matTag.tackcap) };
    Object.values(parts).forEach((m) => inner.add(m));
    return { g, parts, lidMat, S };
  }
  function addTag(par, S, x, y, z) {
    const t = makeTag(S); t.g.position.set(x, y, z); par.add(t.g);
    t.i = tags.length; t.home = { y, z }; Object.values(t.parts).forEach((m) => (m.userData.tag = t.i)); tags.push(t); return t;
  }

  function build() {
    /* clothing racks */
    const rackPos = [[-8.2, -5.3], [-3.6, -5.3], [-8.2, -1.7], [-3.6, -1.7]];
    const rackM = std(0x2a3437, 0.8, 0.3);
    rackPos.forEach(([cx, cz], r) => {
      box(0.08, 1.9, 0.08, rackM, cx - 2.1, 0.95, cz); box(0.08, 1.9, 0.08, rackM, cx + 2.1, 0.95, cz);
      box(4.4, 0.06, 0.06, rackM, cx, 1.9, cz); box(0.06, 0.06, 0.7, rackM, cx - 2.1, 0.03, cz); box(0.06, 0.06, 0.7, rackM, cx + 2.1, 0.03, cz);
      for (let i = 0; i < 5; i++) {
        const x = cx + (i - 2) * 0.82, g = garment(GCOL[(r * 5 + i) % GCOL.length], (i + r) % 3 === 2 ? 'pants' : 'shirt');
        g.position.set(x, 1.3, cz); world.add(g);
        const t = addTag(world, 0.0095, x, 1.5, cz + 0.1);
        garments.push({ g, tag: t, cx: x, cz, rack: r, idx: i });
      }
    });
    /* wall shelving (folded stacks) */
    const shelfM = std(0x1b2427, 0.8, 0.35);
    box(7.4, 2.4, 0.1, std(0x0e1517, 0.4, 0.7), 6, 1.2, -7.0);
    [0.3, 1.1, 1.9].forEach((y) => box(7.4, 0.07, 0.95, shelfM, 6, y, -6.5));
    [2.3, 9.7].forEach((x) => box(0.1, 2.4, 0.95, shelfM, x, 1.2, -6.5));
    const shelfTags = [];
    for (let row = 0; row < 3; row++) for (let c = 0; c < 5; c++) {
      const x = 3.3 + c * 1.4, y0 = 0.34 + row * 0.8, col = GCOL[(row * 5 + c + 2) % GCOL.length];
      const m = std(col, 0.05, 0.9);
      box(1.0, 0.26, 0.7, m, x, y0 + 0.13, -6.4); const top = box(1.0, 0.26, 0.7, m, x, y0 + 0.4, -6.4);
      const t = addTag(world, 0.0105, x, y0 + 0.4, -6.04); shelfTags.push(t);
    }
    /* dead-zone display table (no listener nearby) */
    box(3.4, 0.8, 1.7, std(0x24302f, 0.3, 0.6), -5.8, 0.4, 3.1);
    for (let c = 0; c < 4; c++) {
      const m = std(GCOL[(c + 4) % GCOL.length], 0.05, 0.9), x = -6.9 + c * 0.75;
      box(0.6, 0.18, 0.6, m, x, 0.89, 3.1); box(0.6, 0.18, 0.6, m, x, 1.07, 3.1);
      addTag(world, 0.007, x, 1.07, 3.43);
    }
    tableTags = tags.slice(-4);
    /* checkout: counter, register, queue posts, cashier */
    box(1.2, 1.05, 4.4, std(0x1f2a2c, 0.5, 0.45), 9.3, 0.52, 3.5);
    box(1.25, 0.05, 4.45, std(0x35e0ff, 0.2, 0.3, { emissive: 0x35e0ff, emissiveIntensity: 0.25 }), 9.3, 1.07, 3.5, world, false);
    box(0.5, 0.35, 0.5, std(0x0b1113, 0.6, 0.3), 9.4, 1.28, 2.6); box(0.06, 0.4, 0.55, std(0x1d9e75, 0.1, 0.4, { emissive: 0x1d9e75, emissiveIntensity: 0.6 }), 9.18, 1.5, 2.6);
    const postM = std(0xbfc8cb, 1, 0.25);
    [[7.1, 0.4], [7.1, 1.9]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 12), postM); p.position.set(x, 0.5, z); p.castShadow = true; world.add(p); const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), postM); b.position.set(x, 1.02, z); world.add(b); });
    box(0.03, 0.03, 1.5, std(0x1d9e75, 0.1, 0.6), 7.1, 0.9, 1.15, world, false);
    /* fitting room + plants + mannequin */
    box(2.4, 2.4, 0.08, std(0x2a3437, 0.5, 0.5), -10.6, 1.2, -7.3); box(0.08, 2.4, 1.8, std(0x2a3437, 0.5, 0.5), -11.8, 1.2, -6.4);
    box(0.08, 2.4, 1.8, std(0x2a3437, 0.5, 0.5), -9.4, 1.2, -6.4);
    box(2.3, 2.2, 0.06, std(0x1d9e75, 0, 0.95, { transparent: true, opacity: 0.85 }), -10.6, 1.2, -5.55);
    [[-11.3, 6.6], [11.2, -7.2], [11.2, 6.9]].forEach(([x, z]) => {
      box(0.5, 0.45, 0.5, std(0x2a3437, 0.4, 0.5), x, 0.22, z);
      for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.28 - i * 0.03, 12, 10), std(0x1d6b52, 0, 0.9)); l.position.set(x + Math.sin(i * 2) * 0.12, 0.7 + i * 0.28, z + Math.cos(i * 2) * 0.12); l.castShadow = true; world.add(l); }
    });

    /* exit gate (58 kHz AM) */
    const pedGeo = new THREE.BoxGeometry(0.34, 1.7, 0.6);
    gateLeds = [4.8, 7.2].map((x) => {
      const m = new THREE.Mesh(pedGeo, std(0x222c30, 0.7, 0.3)); m.position.set(x, 0.85, 6.9); m.castShadow = true; world.add(m);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.06), new THREE.MeshBasicMaterial({ color: 0x1d9e75 })); l.position.set(0, 0.5, 0.31); m.add(l); return l;
    });
    field = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    field.position.set(6, 0.95, 6.9); world.add(field);

    /* listeners: puck + listening cone + floor zone + sound-path overlay */
    [[-5.9, -3.5, 4.7, 'Rack listener'], [6, -4.9, 4.2, 'Shelf listener']].forEach(([x, z, r, name]) => {
      const g = new THREE.Group(); g.position.set(x, 3.0, z);
      const led = new THREE.MeshBasicMaterial({ color: 0x1d9e75 });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 32), std(0x20292c, 0.7, 0.3)));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 8, 32), led); ring.rotation.x = Math.PI / 2; ring.position.y = -0.11; g.add(ring);
      const stem = box(0.04, 1.0, 0.04, std(0x20292c, 0.7, 0.3), 0, 0.6, 0, g, false);
      world.add(g);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 3.0, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
      cone.position.set(x, 1.5, z); world.add(cone);
      const zone = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r, 128), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
      zone.rotation.x = -Math.PI / 2; zone.position.set(x, 0.03, z); world.add(zone);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.045, depthWrite: false }));
      fill.rotation.x = -Math.PI / 2; fill.position.set(x, 0.025, z); world.add(fill);
      const tip = document.createElement('div'); tip.className = 'tip'; tip.innerHTML = `<span class="dot"></span><em>${name} · listening</em><div class="eq">${'<i></i>'.repeat(9)}</div>`;
      wrap.append(tip);
      listeners.push({ pos: new THREE.Vector3(x, 3.0, z), r, led, zone, fill, cone, tip, name, g, idle: 0 });
    });
    zoneObjs = listeners.flatMap((l) => [l.zone, l.fill, l.cone]);

    /* people */
    people.A = person({ top: 0xc9b99a, pants: 0x27384f, hair: 0x3a2a20, scarf: 0x1d9e75, tote: 0x8a6a3d, skin: 0xe0b393 });
    people.B = person({ top: 0x242b30, pants: 0x111517, hair: 0x15110f, hat: 'cap', hatC: 0x3b4650, backpack: 0x2d3a3d, skin: 0xb98562 });
    people.C = person({ top: 0x6e3b2e, pants: 0x3a3f46, hat: 'beanie', hatC: 0xb8923a, glasses: true, long: true, tote: 0x20292c, skin: 0xd9a982 });
    cashier = person({ top: 0x1d9e75, pants: 0x14191b, hair: 0x6b4a2c, skin: 0xc58f6b, apron: 0x0e3436 });
    cashier.g.position.set(10.35, 0, 3.4); cashier.g.rotation.y = -Math.PI / 2; cashier.g.visible = true;
    const man = person({ top: 0xd8d0c0, pants: 0xd8d0c0, skin: 0xd8d0c0, hair: null }); man.g.position.set(3.2, 0, 5.4); man.g.rotation.y = 0.5; man.g.visible = true;
    Object.values(people).forEach((p) => { p.g.visible = false; world.add(p.g); world.add(p.g); });
    world.add(cashier.g); world.add(man.g);
    ['A', 'B', 'C'].forEach((k) => { const p = people[k]; const gm = garment(k === 'A' ? 0x27384f : k === 'B' ? 0xa8553a : 0x3d5a4a, 'shirt'); gm.position.set(0, -0.02, 0.18); gm.scale.setScalar(0.8); gm.rotation.y = 0.3; p.carry.add(gm);
      const t = makeTag(0.0085); t.g.position.set(0, 0.12, 0.1); gm.add(t.g); p.carryTag = t; p.carry.visible = false; });

    wrap.classList.add('ready'); ready = true; restoreAll(); start();
  }
  let tableTags = [], zoneObjs = [];

  /* ---------- people ---------- */
  function person(o) {
    const g = new THREE.Group(), root = new THREE.Group(); root.scale.setScalar(0.74); g.add(root);
    const skin = std(o.skin, 0, 0.7), top = std(o.top, 0.05, 0.75), pants = std(o.pants, 0.05, 0.8), shoe = std(0x14191b, 0.2, 0.6);
    const mk = (geo, mat, x, y, z, par = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    const torso = mk(new THREE.CapsuleGeometry(0.28, 0.55, 6, 16), top, 0, 1.5, 0); torso.scale.z = 0.7;
    if (o.long) mk(new THREE.CylinderGeometry(0.3, 0.38, 0.55, 20), top, 0, 1.0, 0);
    if (o.apron) mk(new THREE.BoxGeometry(0.4, 0.7, 0.05), std(o.apron, 0.1, 0.8), 0, 1.35, 0.19);
    mk(new THREE.SphereGeometry(0.24, 20, 16), skin, 0, 2.15, 0);
    if (o.hair != null) mk(new THREE.SphereGeometry(0.26, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), std(o.hair, 0, 0.9), 0, 2.17, -0.01);
    if (o.hat === 'cap') { mk(new THREE.SphereGeometry(0.27, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), std(o.hatC, 0, 0.8), 0, 2.2, 0); mk(new THREE.BoxGeometry(0.3, 0.03, 0.2), std(o.hatC, 0, 0.8), 0, 2.2, 0.27); }
    if (o.hat === 'beanie') { mk(new THREE.SphereGeometry(0.275, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), std(o.hatC, 0, 0.95), 0, 2.2, 0); mk(new THREE.SphereGeometry(0.07, 10, 8), std(o.hatC, 0, 0.95), 0, 2.5, 0); }
    if (o.glasses) mk(new THREE.BoxGeometry(0.36, 0.07, 0.05), std(0x05080a, 0.8, 0.2), 0, 2.17, 0.23);
    if (o.scarf) { const s = mk(new THREE.TorusGeometry(0.21, 0.08, 8, 24), std(o.scarf, 0, 0.95), 0, 1.93, 0); s.rotation.x = Math.PI / 2; }
    if (o.backpack) mk(new THREE.BoxGeometry(0.44, 0.58, 0.22), std(o.backpack, 0.1, 0.8), 0, 1.55, -0.32);
    if (o.tote) { mk(new THREE.BoxGeometry(0.14, 0.42, 0.36), std(o.tote, 0.05, 0.9), -0.46, 1.05, 0.02); const st = mk(new THREE.TorusGeometry(0.2, 0.015, 6, 16, Math.PI), std(o.tote, 0.05, 0.9), -0.4, 1.3, 0); st.rotation.set(0, Math.PI / 2, Math.PI / 2); }
    const leg = (x) => { const p = new THREE.Group(); p.position.set(x, 1.05, 0); root.add(p); mk(new THREE.CapsuleGeometry(0.1, 0.7, 6, 12), pants, 0, -0.5, 0, p); mk(new THREE.BoxGeometry(0.18, 0.1, 0.34), shoe, 0, -1.0, 0.06, p); return p; };
    const arm = (x) => { const p = new THREE.Group(); p.position.set(x, 1.82, 0); root.add(p); mk(new THREE.CapsuleGeometry(0.075, 0.5, 6, 10), top, 0, -0.38, 0, p); mk(new THREE.SphereGeometry(0.07, 10, 8), skin, 0, -0.72, 0, p); return p; };
    const armR = arm(0.36), carry = new THREE.Group(); carry.position.set(0, -0.72, 0.1); armR.add(carry);
    return { g, root, legL: leg(-0.14), legR: leg(0.14), armL: arm(-0.36), armR, carry, walk: 0, reach: 0, ph: Math.random() * 6, h: 0 };
  }
  const allPeople = () => [...Object.values(people), cashier].filter(Boolean);
  function animatePeople(dt) {
    allPeople().forEach((p) => {
      p.ph += dt * 9 * (0.3 + p.walk);
      const s = Math.sin(p.ph) * p.walk;
      p.legL.rotation.x = s * 0.7; p.legR.rotation.x = -s * 0.7; p.armL.rotation.x = -s * 0.6;
      p.armR.rotation.x = s * 0.6 * (1 - p.reach) - 1.5 * p.reach;
      p.root.position.y = Math.abs(s) * 0.05;
    });
  }

  /* ---------- rings, sound path, pop-ups ---------- */
  const ringGeo = new THREE.RingGeometry(0.94, 1, 96);
  for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; scene.add(m); rings.push(m); }
  let ri = 0;
  function ping(pos, size, n, maxOpacity = 0.9) {
    for (let i = 0; i < n; i++) {
      const m = rings[ri++ % rings.length]; m.position.copy(pos); m.userData = { k: 0, size, max: maxOpacity };
      gsap.to(m.userData, { k: 1, duration: 1.2, delay: i * 0.2, ease: 'power1.out', overwrite: 'auto', onStart: () => (m.visible = true), onComplete: () => (m.visible = false) });
    }
  }
  function pop(text, pos, cls = '', ms = 2200) {
    const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text; wrap.append(el);
    const p = { el, pos: pos.clone(), until: performance.now() + ms }; pops.push(p);
  }
  function soundPath(from, L, then) {
    const mid = from.clone().lerp(L.pos, 0.5); mid.y += 1.4;
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, L.pos.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineDashedMaterial({ color: 0x35e0ff, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.9 }));
    line.computeLineDistances(); scene.add(line);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); scene.add(dot);
    const o = { t: 0 };
    gsap.to(o, { t: 1, duration: 0.8, ease: 'power1.in', onUpdate: () => dot.position.copy(curve.getPoint(o.t)),
      onComplete: () => { scene.remove(dot); gsap.to(line.material, { opacity: 0, duration: 0.8, onComplete: () => { scene.remove(line); line.geometry.dispose(); } }); then(); } });
  }

  /* ---------- fingerprint panel + log ---------- */
  const specEl = $('#store-spec'); for (let i = 0; i < 20; i++) specEl.append(document.createElement('i'));
  const logEl = $('#store-log'), capEl = $('#store-cap'), t0 = performance.now();
  const log = (src, msg) => {
    const li = document.createElement('li');
    li.innerHTML = `<time>${((performance.now() - t0) / 1000).toFixed(0).padStart(3, '0')}s</time><b>${src}</b><span>${msg}</span>`;
    logEl.prepend(li); while (logEl.children.length > 4) logEl.lastChild.remove();
  };
  const caption = (txt) => { capEl.classList.remove('on'); void capEl.offsetWidth; capEl.textContent = txt; capEl.classList.add('on'); };
  function showCode(i, el = specEl) {
    let x = (i + 3) * 9301 + 49297; const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const peaks = new Set(); while (peaks.size < 3) peaks.add(1 + Math.floor(rnd() * 18));
    [...el.children].forEach((b, j) => { b.style.height = (peaks.has(j) ? 55 + rnd() * 40 : 6 + rnd() * 12) + '%'; b.classList.toggle('hot', peaks.has(j)); });
    $('#store-code').textContent = 'Code ' + String(i + 1).padStart(2, '0');
  }
  const inZone = (pos) => listeners.filter((L) => Math.hypot(pos.x - L.pos.x, pos.z - L.pos.z) < L.r).sort((a, b) => Math.hypot(pos.x - a.pos.x, pos.z - a.pos.z) - Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z))[0];
  function hear(L, code) {
    gsap.timeline().to(L.led.color, { r: 1, g: 0.62, b: 0.26, duration: 0.12 }).to(L.led.color, { r: 0.11, g: 0.62, b: 0.46, duration: 1.6, delay: 1 });
    gsap.fromTo(L.zone.material, { opacity: 1 }, { opacity: 0.4, duration: 1.6 });
    L.tip.classList.add('hear'); L.tip.querySelector('em').textContent = `${L.name} · heard code ${String(code + 1).padStart(2, '0')}`;
    [...L.tip.querySelector('.eq').children].forEach((b) => (b.style.height = 20 + Math.random() * 80 + '%'));
    setTimeout(() => { L.tip.classList.remove('hear'); L.tip.querySelector('em').textContent = `${L.name} · listening`; }, 2600);
    showCode(code); log(L.name, `ring heard · code ${String(code + 1).padStart(2, '0')}`);
  }

  /* ---------- tag actions ---------- */
  function tagPos(t) { return t.g.getWorldPosition(new THREE.Vector3()); }
  function pullTag(t, { drop = false, silent = false } = {}) {
    const tl = gsap.timeline(), S = t.S, travel = 14;
    tl.to([t.parts.pin.position, t.parts.tackcap.position], { z: travel, duration: 0.25, ease: 'power2.out' }, 0);
    if (silent) return tl.add(() => { pop('Tag removed · no ring', tagPos(t), 'ok'); }, 0.2);
    tl.to(t.lidMat, { emissiveIntensity: 0.9, duration: 0.08 }, 0.22)
      .to(t.lidMat, { emissiveIntensity: 0, duration: 0.9 }, 0.35)
      .add(() => {
        const p = tagPos(t), L = inZone(p), code = t.i;
        if (L) {
          ping(p, 2.6, 3); soundPath(p, L, () => hear(L, code));
        } else {
          ping(p, 1.5, 3, 0.55); pop('Out of range · not heard', p, 'warn', 2600);
          log('No listener in range', `ring from code ${String(code + 1).padStart(2, '0')} fades before reaching one`);
        }
      }, 0.24);
    if (drop) tl.to(t.g.position, { y: 0.07, z: t.g.position.z + 0.5, duration: 0.5, ease: 'bounce.out' }, 0.9).to(t.g.rotation, { x: -1.35, duration: 0.5 }, 0.9);
    return tl;
  }
  function restoreAll() {
    tags.forEach((t) => { gsap.killTweensOf([t.g.position, t.g.rotation, t.parts.pin.position, t.parts.tackcap.position]); t.parts.pin.position.z = t.parts.tackcap.position.z = 0; t.g.position.y = t.home.y; t.g.position.z = t.home.z; t.g.rotation.x = 0; t.g.visible = true; });
    garments.forEach((g) => (g.g.visible = true));
    Object.values(people).forEach((p) => { p.g.visible = false; p.carry.visible = false; p.reach = 0; p.walk = 0; p.carryTag.g.visible = true; p.carryTag.parts.pin.position.z = p.carryTag.parts.tackcap.position.z = 0; });
    gateLeds.forEach((l) => l.material.color.setRGB(0.11, 0.62, 0.46)); field.material.opacity = 0;
  }
  function gateAlarm() {
    log('Exit gate', '58 kHz label detected'); pop('58 kHz label detected', new THREE.Vector3(6, 2.1, 6.9), 'alarm', 2800);
    ping(new THREE.Vector3(6, 0.95, 6.9), 2.4, 3);
    gsap.timeline().to(field.material, { opacity: 0.6, duration: 0.12 }).to(field.material, { opacity: 0, duration: 1.1 });
    gateLeds.forEach((l) => { l.material.color.setRGB(1, 0.62, 0.26); gsap.to(l.material.color, { r: 0.11, g: 0.62, b: 0.46, duration: 1.4, delay: 0.9 }); });
  }

  /* ---------- choreography ---------- */
  const DOOR = [5.9, 9.8];
  function route(tl, p, t, from, pts, speed = 3.4) {
    let cur = { x: from[0], z: from[1] };
    tl.to(p, { walk: 1, duration: 0.15 }, t);
    pts.forEach(([x, z]) => {
      const dx = x - cur.x, dz = z - cur.z, d = Math.hypot(dx, dz); if (d < 0.01) return;
      let a = Math.atan2(dx, dz); a += Math.PI * 2 * Math.round((p.h - a) / (Math.PI * 2)); p.h = a;
      tl.to(p.g.rotation, { y: a, duration: 0.3, ease: 'power1.out' }, t).to(p.g.position, { x, z, duration: d / speed, ease: 'none' }, t);
      t += d / speed; cur = { x, z };
    });
    tl.to(p, { walk: 0, duration: 0.2 }, t); return { t, at: [cur.x, cur.z] };
  }
  const face = (tl, p, t, a) => { a += Math.PI * 2 * Math.round((p.h - a) / (Math.PI * 2)); p.h = a; tl.to(p.g.rotation, { y: a, duration: 0.35, ease: 'power1.out' }, t); };
  const reach = (tl, p, t, hold) => { tl.to(p, { reach: 1, duration: 0.35 }, t).to(p, { reach: 0, duration: 0.35 }, t + hold); };
  const spawn = (tl, p, t, x, z) => tl.set(p.g, { visible: true }, t).set(p.g.position, { x, z, y: 0 }, t);
  const N = Math.PI, E = Math.PI / 2;

  function beatA(tl, t0) {            // pays: tag comes off at checkout, no alarm
    const p = people.A, gm = garments.find((g) => g.rack === 3 && g.idx === 2);
    p.h = 0; spawn(tl, p, t0, ...DOOR);
    tl.add(() => caption('A shopper picks a shirt.'), t0);
    let r = route(tl, p, t0 + 0.2, DOOR, [[6, 6], [3, 3], [-3.1, -0.3]]);
    face(tl, p, r.t + 0.1, N); reach(tl, p, r.t + 0.3, 0.9);
    tl.add(() => { gm.g.visible = false; gm.tag.g.visible = false; p.carry.visible = true; }, r.t + 0.65);
    r = route(tl, p, r.t + 1.8, r.at, [[4, 2.8], [7.7, 3.4]]);
    face(tl, p, r.t + 0.05, E);
    tl.add(() => caption('At checkout the tag comes off quietly.'), r.t + 0.2);
    reach(tl, cashier, r.t + 0.5, 0.8);
    tl.add(() => { const ct = p.carryTag; gsap.to([ct.parts.pin.position, ct.parts.tackcap.position], { z: 14, duration: 0.3 }); pop('Tag removed · no ring', new THREE.Vector3(8.4, 2.2, 3.4), 'ok'); log('Checkout', 'tag removed, sale complete'); }, r.t + 0.9)
      .add(() => { p.carryTag.g.visible = false; }, r.t + 1.5);
    r = route(tl, p, r.t + 2.0, r.at, [[6, 6.2], [6, 9.9]], 3.2);
    tl.add(() => pop('No alarm', new THREE.Vector3(6, 2.1, 6.9), 'ok', 1800), r.t - 1.2).set(p.g, { visible: false }, r.t + 0.1);
    return r.t + 0.2;
  }
  function beatB(tl, t0) {            // pulls the tag at a rack: the listener hears it
    const p = people.B, gm = garments.find((g) => g.rack === 0 && g.idx === 1);
    p.h = 0; spawn(tl, p, t0, ...DOOR);
    let r = route(tl, p, t0, DOOR, [[6, 6], [0, 3], [-8.2, -3.7]]);
    face(tl, p, r.t + 0.1, N);
    tl.add(() => caption('Someone tries to pull a tag off in the aisle.'), r.t);
    face(tl, p, r.t + 0.5, N + 0.7); face(tl, p, r.t + 1.0, N - 0.7); face(tl, p, r.t + 1.5, N);   // looks around
    reach(tl, p, r.t + 1.9, 1.0);
    tl.add(pullTag(gm.tag, { drop: true }), r.t + 2.15)
      .add(() => caption('A listener near the rack hears the ring.'), r.t + 2.6)
      .add(() => { gm.g.visible = false; p.carry.visible = true; p.carryTag.g.visible = false; }, r.t + 2.9);
    r = route(tl, p, r.t + 3.9, r.at, [[-1, -3.2], [2, 0], [6, 5.6], [6, 9.9]]);
    tl.set(p.g, { visible: false }, r.t + 0.1);
    return r.t + 0.2;
  }
  function beatC(tl, t0) {            // leaves with a tag still on: the gate reads the label
    const p = people.C, sh = tags.filter((t) => t.S === 0.0105), item = sh[7];
    p.h = 0; spawn(tl, p, t0, ...DOOR);
    let r = route(tl, p, t0, DOOR, [[6, 6], [5.4, -4.3]]);
    face(tl, p, r.t + 0.1, N); reach(tl, p, r.t + 0.3, 0.9);
    tl.add(() => caption('Another shopper tucks an item away, tag still on.'), r.t + 0.3)
      .add(() => { p.carry.visible = true; item.g.visible = false; }, r.t + 0.65)
      .add(() => { p.carry.visible = false; }, r.t + 1.6);                                               // hidden under the coat
    const r2 = route(tl, p, r.t + 1.8, r.at, [[6, 5.1], [6, 9.9]]);
    const cross = r.t + 1.8 + Math.hypot(0.6, 9.4) / 3.4 + (6.9 - 5.1) / 3.4;
    tl.add(() => caption('The 58 kHz label meets the exit gate.'), cross - 0.6).add(gateAlarm, cross)
      .set(p.g, { visible: false }, r2.t + 0.1);
    return r2.t + 0.2;
  }
  const SCN = {
    pull: (tl) => beatB(tl, 0.3), pay: (tl) => beatA(tl, 0.3), gate: (tl) => beatC(tl, 0.3),
    story: (tl) => { const a = beatA(tl, 0.3), b = beatB(tl, 4.5), c = beatC(tl, 15.5); return Math.max(a, b, c); },
  };

  /* ---------- controller ---------- */
  let paused = false, current = null, mode = 'story', inView = false;
  const btns = [...document.querySelectorAll('[data-scn]')];
  function setMode(m) { mode = m; btns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.scn === m)); if (current) { current.eventCallback('onComplete', null); current.kill(); current = null; restoreAll(); } next(); }
  btns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.scn)));
  $('#store-play').addEventListener('click', (e) => {
    paused = !paused; e.currentTarget.setAttribute('aria-pressed', paused); e.currentTarget.textContent = paused ? 'Play' : 'Pause';
    if (current) current.paused(paused); else if (!paused) next();
  });
  function next() {
    if (!ready || paused || !inView) return;
    if (current) return;
    restoreAll();
    const tl = gsap.timeline(); tl.add(() => {}, 0);
    const end = SCN[mode](tl); tl.add(() => {}, end);
    tl.eventCallback('onComplete', () => { current = null; gsap.delayedCall(1.5, next); });
    current = tl;
  }

  /* ---------- camera views, zones toggle, pointer ---------- */
  const VIEWS = { top: 86, bird: 62, floor: 30 };
  const cam = { elev: 62, yaw: 0 };
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    gsap.to(cam, { elev: VIEWS[b.dataset.view], duration: 1.1, ease: 'power3.inOut' });
  }));
  $('#zones-toggle').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on);
    zoneObjs.forEach((o) => (o.visible = on)); listeners.forEach((l) => (l.tip.style.display = on ? '' : 'none'));
  });
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let dragging = false, moved = 0, lx = 0;
  const pickable = () => tags.flatMap((t) => (t.g.visible ? Object.values(t.parts) : []));
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, camera);
    const h = ray.intersectObjects(pickable(), true)[0]; return h ? tags.find((t) => t.parts.base === h.object || t.parts.lid === h.object || t.parts.pin === h.object || t.parts.tackcap === h.object) : null;
  }
  canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lx = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) { moved += Math.abs(e.clientX - lx); cam.yaw = Math.max(-0.7, Math.min(0.7, cam.yaw + (e.clientX - lx) * 0.004)); lx = e.clientX; }
    else canvas.style.cursor = pick(e) ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved < 5) { const t = pick(e); if (t) { restoreTag(t); pullTag(t, { drop: false }); } }
  });
  function restoreTag(t) { gsap.killTweensOf([t.parts.pin.position, t.parts.tackcap.position]); t.parts.pin.position.z = t.parts.tackcap.position.z = 0; }

  /* ---------- render loop (only while visible) ---------- */
  let running = false, last = 0;
  new IntersectionObserver(([en]) => { inView = en.isIntersecting; if (inView) { start(); if (!current && !paused) next(); } else if (current) current.paused(true); if (inView && current && !paused) current.paused(false); }, { threshold: 0.12 }).observe(wrap);
  const fit = { d: 26 };
  function size() {
    const w = wrap.clientWidth, h = wrap.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
    fit.d = Math.max(25, 27 / (2 * Math.tan(THREE.MathUtils.degToRad(15)) * (w / h))); camera.updateProjectionMatrix();
  }
  addEventListener('resize', size); size();
  function start() { if (running || !ready) return; running = true; last = performance.now(); requestAnimationFrame(loop); }
  const ctr = new THREE.Vector3(0, 0.6, 0.6), v = new THREE.Vector3();
  function loop(now) {
    if (!inView) { running = false; return; }
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const e = THREE.MathUtils.degToRad(cam.elev), a = cam.yaw + Math.sin(now / 4500) * 0.025;
    camera.position.set(ctr.x + Math.sin(a) * Math.cos(e) * fit.d, ctr.y + Math.sin(e) * fit.d, ctr.z + Math.cos(a) * Math.cos(e) * fit.d);
    camera.lookAt(ctr);
    animatePeople(dt);
    rings.forEach((m) => { if (!m.visible) return; const { k, size, max } = m.userData; m.quaternion.copy(camera.quaternion); m.scale.setScalar(0.25 + k * size); m.material.opacity = (1 - k) * max; });
    listeners.forEach((L) => { L.cone.material.opacity = 0.045 + 0.02 * Math.sin(now / 600); L.idle = (L.idle + dt) % 3.2; });
    const r = wrap.getBoundingClientRect();
    const place = (el, pos, dy = 0) => { v.copy(pos); v.y += dy; v.project(camera); el.style.transform = `translate(${(v.x * 0.5 + 0.5) * r.width}px,${(-v.y * 0.5 + 0.5) * r.height}px) translate(-50%,-100%)`; };
    listeners.forEach((L) => place(L.tip, L.pos, 0.5));
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; if (now > p.until) { p.el.remove(); pops.splice(i, 1); } else place(p.el, p.pos, 0.4); }
    renderer.render(scene, camera);
  }
}
