// VILAX live 3D v2 — one WebGL context for the page. Every [data-vlx3d] slot is drawn into its own rect
// (viewport + scissor). Motion is a pure function of scroll progress (reversible), plus cursor parallax.
// Theme switches recolor materials / vertex colors in place — no shader rebuilds.
// @ts-nocheck — перенесено из прототипа Claude Design 14.10.2026 (prototype/vilax3d.js) почти дословно (SITE-24):
// three 0.169.0 — зависимость пакета (в прототипе — esm.sh), RoundedBoxGeometry и RoomEnvironment — из three/examples/jsm.
import * as THREE from 'three';
import { RoundedBoxGeometry as RBG } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment as RE } from 'three/examples/jsm/environments/RoomEnvironment.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const lerp = (a, b, t) => a + (b - a) * t;
function spring(s, target, dt, k = 140, z = 0.62) {
  const c = 2 * Math.sqrt(k) * z, n = Math.ceil(dt / 0.008), h = dt / Math.max(1, n);
  for (let i = 0; i < n; i++) { s.v += (k * (target - s.x) - c * s.v) * h; s.x += s.v * h; }
  return s.x;
}
// soft spring curve 0→1 with a small overshoot (used as a pure function of a 0..1 driver)
const springy = (x) => { x = clamp(x); return 1 - Math.exp(-6 * x) * Math.cos(7.5 * x) * (1 - x) - (x === 1 ? 0 : 0); };

const PAL = {
  dark: {
    ink: '#F5F7FA', steel: '#C3CCDA', slate: '#91A0B7', navy: '#0B1528', navy2: '#14233E', metal: '#1A2B4A',
    cyan: '#18F2DF', blue: '#2297FF', gradA: '#18F2DF', gradB: '#2297FF', frost: '#DCE5F1', glassOp: 0.26,
    fog: { fusion: '#0B1528' }, shadow: 0.45, env: 0.85
  },
  light: {
    ink: '#020817', steel: '#56657D', slate: '#91A0B7', navy: '#E3E9F1', navy2: '#D3DCE8', metal: '#C7D0DC',
    cyan: '#18F2DF', blue: '#0B6BCB', gradA: '#12C7BA', gradB: '#0B6BCB', frost: '#FFFFFF', glassOp: 0.34,
    fog: { fusion: '#FFFFFF' }, shadow: 0.22, env: 1.0
  }
};

export async function boot(host) {
  const T = THREE, RoundedBoxGeometry = RBG, RoomEnvironment = RE;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '30' });
  let R;
  try { R = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return null; }
  document.body.appendChild(canvas);
  R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  R.outputColorSpace = T.SRGBColorSpace;
  R.toneMapping = T.ACESFilmicToneMapping;
  R.toneMappingExposure = 1.05;
  R.shadowMap.enabled = true;
  R.shadowMap.type = T.PCFSoftShadowMap;
  R.setClearColor(0x000000, 0);
  R.autoClear = false;
  const pmrem = new T.PMREMGenerator(R);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e) => { mouse.tx = (e.clientX / innerWidth) * 2 - 1; mouse.ty = (e.clientY / innerHeight) * 2 - 1; };
  window.addEventListener('pointermove', onMove, { passive: true });

  /* ───────── geometry helpers ───────── */
  const C = (hex) => new T.Color(hex);
  function rrShape(w, h, r) {
    const s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function rrPath(w, h, r) { const p = rrShape(w, h, r); return new T.Path(p.getPoints(24).reverse()); }
  // bevelled slab in the XY plane, thickness along Z, centred
  function slab(w, h, d, r, b = 0.02) {
    b = Math.min(b, d / 2.2, Math.min(w, h) / 4);
    const g = new T.ExtrudeGeometry(rrShape(w - 2 * b, h - 2 * b, Math.max(0.002, r - b)), { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 5, curveSegments: 18 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    return g;
  }
  function frame(w, h, r, t, d) {
    const s = rrShape(w, h, r); s.holes.push(rrPath(w - 2 * t, h - 2 * t, Math.max(0.01, r - t)));
    const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 24 });
    g.translate(0, 0, -d / 2);
    return g;
  }
  function puck(rad, th, edge) {
    const pts = [new T.Vector2(0, -th / 2)];
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; pts.push(new T.Vector2(rad - edge + Math.cos(a) * edge, Math.sin(a) * (th / 2))); }
    pts.push(new T.Vector2(0, th / 2));
    return new T.LatheGeometry(pts, 48);
  }
  // gradient tube along a curve; vertex colors from x (brand gradient runs cyan → blue, left → right)
  function gradTube(curve, radius, segs, xr) {
    const g = new T.TubeGeometry(curve, segs, radius, 6, false);
    g.userData.xr = xr;
    return g;
  }
  function paintGrad(g, a, b) {
    const p = g.attributes.position, [x0, x1] = g.userData.xr || [-1, 1];
    let c = g.attributes.color;
    if (!c) { c = new T.BufferAttribute(new Float32Array(p.count * 3), 3); g.setAttribute('color', c); }
    const ca = C(a), cb = C(b), col = new T.Color();
    for (let i = 0; i < p.count; i++) { col.lerpColors(ca, cb, clamp((p.getX(i) - x0) / (x1 - x0))); c.setXYZ(i, col.r, col.g, col.b); }
    c.needsUpdate = true;
  }
  const drawTo = (mesh, k) => { const n = mesh.geometry.index.count, q = 36; mesh.geometry.setDrawRange(0, Math.floor((n * clamp(k)) / q) * q); mesh.visible = k > 0.002; };

  const phys = (o) => new T.MeshPhysicalMaterial({ envMapIntensity: 1, ...o });
  const threadMat = () => new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.3, envMapIntensity: 1 });
  const glass = () => phys({ roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, transparent: true, depthWrite: false, ior: 1.45, specularIntensity: 1 });

  function stage(scene, { shadow = true, rim = '#2297FF' } = {}) {
    scene.environment = env;
    scene.add(new T.HemisphereLight(0xffffff, 0x101a30, 0.5));
    const key = new T.DirectionalLight(0xffffff, 1.7); key.position.set(3, 7, 5); scene.add(key);
    const rimL = new T.DirectionalLight(rim, 0.9); rimL.position.set(-5, 2, -4); scene.add(rimL);
    if (shadow) {
      key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 8; key.shadow.bias = -0.0005;
      Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 25 });
    }
    return key;
  }
  function ground(scene, y) {
    const m = new T.ShadowMaterial({ opacity: 0.35 });
    const g = new T.Mesh(new T.PlaneGeometry(40, 40), m); g.rotation.x = -Math.PI / 2; g.position.y = y; g.receiveShadow = true; scene.add(g);
    return m;
  }
  function setOpacity(group, op) {
    group.traverse((o) => {
      if (!o.material) return;
      const m = o.material, base = m.userData.baseOp ?? (m.userData.baseOp = m.opacity);
      const tr = m.userData.glass || op < 0.999;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = base * op;
    });
    group.visible = op > 0.003;
  }
  function envAll(scene, v) { scene.traverse((o) => { if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = v; }); }
  const follow = (dt) => { mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 3.5); mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 3.5); };

  /* ───────── Platform as one system. Core in the middle: a disc with revenue by the hour and a forecast line.
               Three pedestals on one circle around it, 120° apart (equal distance to each other), each tied
               to Core by a brand thread; the whole platform turns slowly and pauses while a block is hovered:
               Guests 360 (inquiry → booking → return), Finance (P&L waterfall),
               People & Academy (learning steps + badge), Loyalty (member card in the phone + points). ───────── */
  function makeSystem() {
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(34, 1, 0.1, 80);
    const key = stage(scene); key.shadow.mapSize.set(1024, 1024);
    const sh = ground(scene, -0.09);
    const root = new T.Group(); scene.add(root);
    const M = {
      metal: phys({ roughness: 0.28, metalness: 0.75, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
      top: phys({ roughness: 0.35, metalness: 0.4, clearcoat: 0.8 }),
      frost: phys({ roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }),
      steel: phys({ roughness: 0.3, metalness: 0.45, clearcoat: 0.6 }),
      cyan: phys({ roughness: 0.22, metalness: 0.1, clearcoat: 1 }),
      blue: phys({ roughness: 0.25, metalness: 0.1, clearcoat: 1 })
    };
    const G = glass(); G.userData.glass = true;
    const cast = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
    const mods = {};
    function module(k, x, z, rad) {
      const outer = new T.Group(); outer.position.set(x, 0, z);
      const lift = new T.Group(); outer.add(lift);
      const ped = cast(new T.Mesh(puck(rad, 0.12, 0.045), M.metal)); ped.position.y = -0.03; lift.add(ped);
      const pt = new T.Mesh(puck(rad - 0.05, 0.02, 0.008), M.top); pt.position.y = 0.035; lift.add(pt);
      const body = new T.Group(); body.position.y = 0.05; lift.add(body);
      root.add(outer);
      mods[k] = { outer, lift, body, x, z, rad, S: k === 'base' ? 1 : 1.22, h: { x: 0, v: 0 }, label: new T.Vector3(0, k === 'base' ? 1.12 : 1.05, 0), up: true, anim: [] };
      return mods[k];
    }
    // Core
    const core = module('base', 0, 0, 1.2);
    // the three blocks sit on one circle, 120° apart
    const RING = 2.35, at = (deg) => [RING * Math.cos((deg * Math.PI) / 180), RING * Math.sin((deg * Math.PI) / 180)];
    const HB = [0.3, 0.55, 0.82, 0.64, 0.46, 0.72, 0.9, 0.62, 0.42];
    const bars = HB.map((h, i) => {
      const fut = i >= 7;
      const m = cast(new T.Mesh(new RoundedBoxGeometry(0.15, 1, 0.15, 4, 0.035), fut ? G : i === 6 ? M.cyan : M.blue));
      m.geometry.translate(0, 0.5, 0); m.position.set(-0.76 + i * 0.19, 0, -0.1); if (fut) m.renderOrder = 2; core.body.add(m);
      return { m, h };
    });
    const line = new T.Mesh(gradTube(new T.CatmullRomCurve3(HB.map((h, i) => new T.Vector3(-0.76 + i * 0.19, h * 0.95 + 0.14, 0.02))), 0.012, 120, [-0.8, 0.8]), threadMat());
    core.body.add(line);
    core.anim.push((p) => { bars.forEach((b, i) => { b.m.scale.y = Math.max(0.001, b.h * smooth(0, 1, p * 1.5 - i * 0.06)); }); drawTo(line, smooth(0.45, 0.9, p)); });
    // Guests 360
    const g = module('guests', ...at(195), 0.62);
    const bub = cast(new T.Mesh(slab(0.56, 0.34, 0.08, 0.16, 0.03), M.frost)); bub.position.set(-0.1, 0.78, 0.05); bub.rotation.set(0, 0.35, 0.06);
    const tail = cast(new T.Mesh(slab(0.12, 0.12, 0.08, 0.03, 0.02), M.frost)); tail.rotation.z = Math.PI / 4; tail.position.set(-0.3, -0.15, 0); bub.add(tail);
    const cal = cast(new T.Mesh(slab(0.44, 0.48, 0.06, 0.06, 0.02), M.steel)); cal.position.set(0.14, 0.32, -0.05); cal.rotation.set(-0.15, -0.35, 0);
    const calTop = new T.Mesh(slab(0.44, 0.1, 0.064, 0.03, 0.01), M.cyan); calTop.position.y = 0.2; cal.add(calTop);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const d = new T.Mesh(slab(0.08, 0.07, 0.02, 0.015, 0.005), r === 1 && c === 1 ? M.cyan : M.frost); d.position.set(-0.12 + c * 0.12, 0.02 - r * 0.11, 0.035); cal.add(d); }
    const loop = new T.Mesh(new T.TorusGeometry(0.5, 0.016, 10, 120, Math.PI * 1.55), M.blue);
    const loopG = new T.Group(); loopG.position.y = 0.5; loopG.rotation.set(Math.PI / 2 - 0.25, 0, 0); loopG.add(loop);
    const arrow = cast(new T.Mesh(new T.ConeGeometry(0.05, 0.12, 24), M.blue)); loop.add(arrow);
    g.body.add(bub, cal, loopG);
    g.anim.push((p, t) => { loop.rotation.z = -0.4 + p * 0.9 + t * 0.08; const e = Math.PI * 1.55; arrow.position.set(Math.cos(e) * 0.5, Math.sin(e) * 0.5, 0); arrow.rotation.z = e; bub.position.y = 0.78 + Math.sin(t * 1.2) * 0.02; });
    // People & Academy: learning steps, a climber, a badge on top
    const pe = module('people', ...at(75), 0.62);
    [0.12, 0.24, 0.36, 0.5].forEach((h, i) => { const s = cast(new T.Mesh(new RoundedBoxGeometry(0.2, h, 0.42, 4, 0.03), i === 3 ? M.blue : M.frost)); s.position.set(-0.3 + i * 0.2, h / 2, 0); pe.body.add(s); });
    const fig = new T.Group();
    const fb = cast(new T.Mesh(new T.CapsuleGeometry(0.07, 0.12, 6, 24), M.steel)); fb.position.y = 0.14;
    const fh = cast(new T.Mesh(new T.SphereGeometry(0.06, 32, 24), M.steel)); fh.position.y = 0.32; fig.add(fb, fh); pe.body.add(fig);
    const badge = cast(new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.05, 6), M.cyan)); badge.rotation.x = Math.PI / 2; pe.body.add(badge);
    pe.body.rotation.y = 0.5;
    pe.anim.push((p, t) => { const k = Math.min(2, Math.floor(clamp(p * 1.3) * 3)); const steps = [0.12, 0.24, 0.36]; fig.position.set(-0.3 + k * 0.2, steps[k], 0); badge.position.set(0.3, 0.78 + Math.sin(t * 1.4) * 0.02, 0); badge.rotation.z = p * Math.PI * 1.2 + t * 0.3; });
    // Loyalty: phone with the member card, points circling
    const lo = module('loyalty', ...at(315), 0.62);
    const phone = cast(new T.Mesh(slab(0.44, 0.86, 0.05, 0.09, 0.02), M.metal)); phone.position.set(0, 0.5, 0); phone.rotation.set(-0.12, -0.5, 0);
    const screen = new T.Mesh(slab(0.38, 0.78, 0.01, 0.07, 0.004), M.top); screen.position.z = 0.028; phone.add(screen);
    const card = cast(new T.Mesh(slab(0.32, 0.2, 0.02, 0.03, 0.008), M.cyan)); card.position.set(0, 0.17, 0.04); phone.add(card);
    for (let i = 0; i < 3; i++) { const r = new T.Mesh(slab(0.3, 0.05, 0.012, 0.02, 0.004), M.steel); r.position.set(0, -0.06 - i * 0.1, 0.036); phone.add(r); }
    const coin = puck(0.075, 0.03, 0.012);
    const pts = [0, 1, 2].map(() => { const c = cast(new T.Mesh(coin, M.cyan)); c.rotation.x = Math.PI / 2; lo.body.add(c); return c; });
    lo.body.add(phone);
    lo.anim.push((p, t) => { pts.forEach((c, i) => { const a = i * 2.1 + p * 2.5 + t * 0.35; c.position.set(Math.cos(a) * 0.48, 0.42 + Math.sin(a * 1.3) * 0.1, Math.sin(a) * 0.48); c.rotation.z = a; c.scale.setScalar(Math.max(0.001, smooth(0, 1, p * 1.5 - i * 0.12))); }); });
    // threads from each pedestal into Core
    const ties = ['guests', 'people', 'loyalty'].map((k) => {
      const tm = threadMat();
      const m = mods[k], dir = new T.Vector3(-m.x, 0, core.z - m.z).normalize();
      const s = new T.Vector3(m.x + dir.x * m.rad * m.S, 0.0, m.z + dir.z * m.rad * m.S), e = new T.Vector3(core.x - dir.x * core.rad, 0.0, core.z - dir.z * core.rad);
      const mid = s.clone().lerp(e, 0.5); mid.y = 0.02;
      // drawn from Core outward, so the thread can follow a block as it grows out
      const mesh = new T.Mesh(gradTube(new T.QuadraticBezierCurve3(e, mid, s), 0.014, 60, [-2.6, 2.6]), tm); root.add(mesh); return mesh;
    });
    const order = ['base', 'guests', 'people', 'loyalty'];
    // own material copies per module, so dimming one module never touches the others
    const keyOf = new Map(Object.entries(M).map(([k, m]) => [m, k])); keyOf.set(G, 'glass');
    order.forEach((k) => {
      const cache = new Map();
      mods[k].outer.traverse((o) => {
        if (!o.material) return;
        if (!cache.has(o.material)) { const c = o.material.clone(); c.userData = { ...o.material.userData, k: keyOf.get(o.material) }; cache.set(o.material, c); }
        o.material = cache.get(o.material);
      });
    });
    const v = new T.Vector3();
    let spinA = 0, spinV = 1, grow = 0;
    // a block's size and distance from Core while it grows out (e: 0 → 1); at e = 1 it is exactly at rest
    const budR = (e) => lerp(core.rad - 0.1, RING, easeOut(e)), budS = (e) => 0.12 + 0.88 * springy(e);
    return {
      key: 'platform-all', scene, cam,
      setTheme(th, P) {
        M.metal.color.set('#14233E'); M.top.color.set(th === 'dark' ? '#0B1528' : '#1A2B4A');
        M.frost.color.set(th === 'dark' ? '#DCE5F1' : '#E3E9F1'); M.steel.color.set(th === 'dark' ? '#91A0B7' : '#91A0B7');
        M.cyan.color.set('#18F2DF'); M.blue.color.set('#2297FF');
        G.color.set(th === 'dark' ? '#DCE5F1' : '#FFFFFF'); G.userData.baseOp = P.glassOp; G.opacity = P.glassOp;
        root.traverse((o) => { const m = o.material; if (!m || !m.userData.k) return; if (m.userData.k === 'glass') { m.color.copy(G.color); m.userData.baseOp = P.glassOp; } else if (M[m.userData.k]) m.color.copy(M[m.userData.k].color); });
        paintGrad(line.geometry, '#18F2DF', '#2297FF'); ties.forEach((m) => paintGrad(m.geometry, P.gradA, P.gradB));
        sh.opacity = th === 'dark' ? 0.42 : 0.2; envAll(scene, P.env);
      },
      update(dt, p, st, since, aspect, r) {
        // framed tight to the turning ring: fit width and height, whichever is tighter
        const halfW = 3.15, halfH = 2.1, tn = Math.tan((17 * Math.PI) / 180);
        const d = Math.max(6.4, halfW / (tn * aspect) + 1.6, halfH / tn + 1.6);
        cam.position.set(0, d * 0.5, d * 0.86); cam.lookAt(0, 0.15, -0.35); cam.aspect = aspect; cam.updateProjectionMatrix();
        const red = st.reduced, pp = red ? 1 : p, t = red ? 0 : since;
        const hover = st.plat || null;
        // the three blocks grow out of Core as the model comes into view: driven by how far the model is in the
        // viewport (reversible), eased so a jump in scroll still glides, and held until Core itself has appeared
        // start: half of the model has risen above the fold; end: the whole model is in view
        const vh = innerHeight, g0 = vh - (r ? r.height : 0) / 2, g1 = r ? Math.max(vh * 0.5 - r.height / 2, vh * 0.92 - r.height) : 0;
        const q = r ? clamp((g0 - r.top) / Math.max(1, g0 - g1)) : 1;
        grow += ((red ? 1 : Math.min(q, smooth(0.35, 0.8, since))) - grow) * (1 - Math.exp(-dt * 3.2));
        if (red) grow = 1;
        order.forEach((k, i) => {
          const m = mods[k];
          m.anim.forEach((fn) => fn(pp, t));
          const pop = red ? 1 : springy((since - i * 0.13) / 0.9);
          const e = i ? clamp((grow - (i - 1) * 0.12) / 0.64) : 1; m.e = e;
          if (i) { const f = budR(e) / RING; m.outer.position.set(m.x * f, 0, m.z * f); }
          m.outer.scale.setScalar(Math.max(0.0001, i ? m.S * budS(e) : (0.9 + 0.1 * pop) * m.S));
          if (red) { m.h.x = hover === k ? 1 : 0; } else spring(m.h, hover === k ? 1 : 0, dt, 170, 0.7);
          m.lift.position.y = m.h.x * 0.16 + (i ? 0 : (1 - clamp(pop)) * -0.3);
          setOpacity(m.outer, (i ? smooth(0, 0.22, e) : clamp(since / 0.5)) * (hover && hover !== k ? 0.4 : 1));
          const el = r && document.querySelector('[data-vlx-label="' + k + '"]');
          if (el) {
            v.copy(m.label); m.lift.localToWorld(v); v.project(cam);
            const lw = el.offsetWidth || 120, px = Math.min(r.width - lw / 2 - 4, Math.max(lw / 2 + 4, (v.x + 1) / 2 * r.width));
            el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + ((1 - v.y) / 2 * r.height).toFixed(1) + 'px) ' + (m.up ? 'translate(-50%,-100%)' : 'translate(-50%,6px)');
            el.style.opacity = String((i ? smooth(0.7, 1, e) : clamp((since - 0.3) / 0.5)) * (hover && hover !== k ? 0.45 : 1));
          }
        });
        // each thread reaches exactly to its block's inner edge while the block travels out
        ties.forEach((m, i) => {
          const b = mods[order[i + 1]], end = RING - b.rad * b.S;
          drawTo(m, clamp((budR(b.e) - b.rad * b.S * budS(b.e) - core.rad) / (end - core.rad)));
          setOpacity(m, hover && hover !== 'base' && hover !== order[i + 1] ? 0.35 : 1);
        });
        follow(dt);
        spinV += ((hover ? 0 : 1) - spinV) * Math.min(1, dt * 2.5); spinA += spinV * 0.1 * dt;
        root.rotation.y = red ? 0 : spinA + mouse.x * 0.14 + (1 - p) * 0.25;
        root.rotation.x = red ? 0 : mouse.y * 0.03;
      }
    };
  }

  /* ───────── Onboarding: five bevelled stations strung on one gradient thread; the thread passes
               each station and lifts it; the last station is a glass block with a cyan core ───────── */
  function makeOnboarding() {
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
    stage(scene, { shadow: false });
    const root = new T.Group(); scene.add(root);
    const pm = phys({ roughness: 0.3, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const ringM = phys({ roughness: 0.3, metalness: 0.2 });
    const pg = puck(0.3, 0.12, 0.05), ring = new T.TorusGeometry(0.3, 0.008, 8, 64);
    const st = [];
    for (let i = 0; i < 4; i++) {
      const g = new T.Group(); const m = new T.Mesh(pg, pm); const r = new T.Mesh(ring, ringM); r.rotation.x = Math.PI / 2; r.position.y = 0.062;
      g.add(m, r); root.add(g); st.push({ g, i });
    }
    const lastG = new T.Group();
    const lShell = new T.Mesh(new RoundedBoxGeometry(0.62, 0.46, 0.62, 6, 0.12), glass()); lShell.material.userData.glass = true; lShell.renderOrder = 2;
    const lCoreM = phys({ roughness: 0.2, metalness: 0.1, clearcoat: 1 });
    const lCore = new T.Mesh(new RoundedBoxGeometry(0.38, 0.24, 0.38, 5, 0.07), lCoreM);
    lastG.add(lCore, lShell); root.add(lastG); st.push({ g: lastG, i: 4, last: true });
    const tm = threadMat();
    let tube = null, W = 0, H = 1.25, xs = [], fr = [];
    function build(aspect) {
      W = H * aspect;
      if (tube) { root.remove(tube); tube.geometry.dispose(); }
      xs = [0, 1, 2, 3, 4].map((i) => ((i + 0.5) / 5 - 0.5) * W);
      const pts = [new T.Vector3(xs[0] - W * 0.11, 0, -0.35)];
      xs.forEach((x, i) => { pts.push(new T.Vector3(x, 0, 0)); if (i < 4) pts.push(new T.Vector3((x + xs[i + 1]) / 2, 0, i % 2 ? -0.42 : 0.42)); });
      const curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
      tube = new T.Mesh(gradTube(curve, 0.02, 520, [-W / 2, W / 2]), tm); root.add(tube);
      if (curPal) paintGrad(tube.geometry, curPal.gradA, curPal.gradB);
      fr = xs.map((x) => { let best = 0, bd = 1e9; for (let k = 0; k <= 400; k++) { const q = curve.getPointAt(k / 400); const dd = Math.abs(q.x - x) + Math.abs(q.z); if (dd < bd) { bd = dd; best = k / 400; } } return best; });
      st.forEach((s) => s.g.position.set(xs[s.i], 0, 0));
    }
    let curPal = null;
    return {
      key: 'onboarding', scene, cam,
      setTheme(th, P) {
        curPal = P;
        pm.color.set(th === 'dark' ? '#14233E' : '#14233E'); pm.metalness = 0.6;
        ringM.color.set(P.cyan);
        lShell.material.color.set(th === 'dark' ? '#DCE5F1' : '#FFFFFF'); lShell.material.userData.baseOp = P.glassOp; lShell.material.opacity = P.glassOp;
        lCoreM.color.set(th === 'dark' ? '#18F2DF' : '#2297FF');
        if (tube) paintGrad(tube.geometry, P.gradA, P.gradB);
        envAll(scene, P.env);
      },
      update(dt, p, s, since, aspect) {
        if (!tube || Math.abs(H * aspect - W) > 1e-3) build(aspect);
        Object.assign(cam, { left: -W / 2, right: W / 2, top: H / 2, bottom: -H / 2 });
        cam.position.set(0, 3.6, 6); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
        const prog = s.reduced ? 1 : clamp(p * 1.08);
        drawTo(tube, prog);
        for (const o of st) {
          const f = fr[o.i] ?? o.i / 4;
          const reach = smooth(f - 0.04, f + 0.02, prog);
          const bump = o.last ? smooth(f - 0.02, f + 0.06, prog) : smooth(f - 0.02, f + 0.05, prog) * (1 - smooth(f + 0.1, f + 0.2, prog));
          o.g.scale.setScalar(Math.max(0.0001, springy(reach)));
          o.g.position.y = bump * 0.16;
          o.g.rotation.y = (1 - reach) * 1.2 + (o.last ? 0.6 : 0);
          setOpacity(o.g, reach);
        }
        follow(dt);
        root.rotation.y = s.reduced ? 0 : mouse.x * 0.035;
      }
    };
  }

  /* ───────── Fusion «как управляют сегодня»: five clear icons float in the air (chats, overdue bill,
               report, spreadsheet, services). Scrolling flies each icon straight into its own part of the
               VILAX mark; on the way it breaks into small pieces that settle along the threads, so the mark
               is built from the icons themselves. The assembled mark hands over to the crisp DOM <img>. ───────── */
  function makeFusion() {
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(32, 1, 0.1, 80);
    stage(scene, { shadow: false });
    const root = new T.Group(); scene.add(root);
    const M = {
      frost: phys({ roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }),
      paper: phys({ roughness: 0.45, metalness: 0, sheen: 0.4, clearcoat: 0.3 }),
      blue: phys({ roughness: 0.25, metalness: 0.1, clearcoat: 1 }),
      cyan: phys({ roughness: 0.22, metalness: 0.1, clearcoat: 1 }),
      steel: phys({ roughness: 0.3, metalness: 0.5, clearcoat: 0.5 }),
      navy: phys({ roughness: 0.28, metalness: 0.75, clearcoat: 0.6 })
    };
    const mm = (k) => { const m = M[k].clone(); m.userData.k = k; return m; };
    const icons = [];
    const icon = (fn) => { const outer = new T.Group(), spin = new T.Group(), g = new T.Group(); outer.add(spin); spin.add(g); fn(g); root.add(outer); icons.push({ outer, spin, g }); };
    // 1 · chats: a big bubble with typing dots, a smaller reply behind it
    icon((g) => {
      const big = new T.Mesh(slab(1.15, 0.78, 0.16, 0.32, 0.05), mm('frost')); g.add(big);
      const tail = new T.Mesh(slab(0.22, 0.22, 0.16, 0.05, 0.04), big.material); tail.rotation.z = Math.PI / 4; tail.position.set(-0.36, -0.38, 0); g.add(tail);
      [-0.27, 0, 0.27].forEach((x) => { const d = new T.Mesh(new T.SphereGeometry(0.075, 32, 24), mm('navy')); d.position.set(x, 0, 0.1); g.add(d); });
      const small = new T.Mesh(slab(0.72, 0.46, 0.12, 0.2, 0.04), mm('blue')); small.position.set(0.5, 0.52, -0.2); g.add(small);
    });
    // 2 · debts: an invoice with an overdue clock
    icon((g) => {
      const bill = new T.Mesh(slab(0.92, 1.2, 0.05, 0.08, 0.02), mm('paper')); g.add(bill);
      [0.36, 0.2, 0.04].forEach((y, i) => { const l = new T.Mesh(slab(i ? 0.6 : 0.42, 0.06, 0.012, 0.025, 0.005), mm('steel')); l.position.set(i ? -0.04 : -0.13, y, 0.03); g.add(l); });
      const total = new T.Mesh(slab(0.3, 0.1, 0.014, 0.03, 0.005), mm('navy')); total.position.set(0.17, -0.18, 0.03); g.add(total);
      const clock = new T.Mesh(puck(0.27, 0.1, 0.035), mm('cyan')); clock.rotation.x = Math.PI / 2; clock.position.set(0.34, -0.46, 0.1); g.add(clock);
      const h1 = new T.Mesh(slab(0.035, 0.16, 0.02, 0.012, 0.006), mm('navy')); h1.position.set(0.34, -0.39, 0.16); g.add(h1);
      const h2 = new T.Mesh(slab(0.035, 0.12, 0.02, 0.012, 0.006), mm('navy')); h2.rotation.z = -Math.PI / 2.4; h2.position.set(0.39, -0.47, 0.16); g.add(h2);
    });
    // 3 · reports: a document with a bar chart
    icon((g) => {
      const doc = new T.Mesh(slab(0.92, 1.2, 0.05, 0.08, 0.02), mm('frost')); g.add(doc);
      const head = new T.Mesh(slab(0.6, 0.08, 0.012, 0.03, 0.005), mm('blue')); head.position.set(-0.08, 0.42, 0.03); g.add(head);
      [0.32, 0.55, 0.42, 0.7].forEach((h, i) => { const bar = new T.Mesh(new RoundedBoxGeometry(0.14, h, 0.06, 3, 0.025), mm(i === 3 ? 'cyan' : 'blue')); bar.position.set(-0.27 + i * 0.18, -0.48 + h / 2, 0.05); g.add(bar); });
    });
    // 4 · spreadsheets: a sheet with a header row and a first column
    icon((g) => {
      const sheet = new T.Mesh(slab(1.25, 0.95, 0.05, 0.08, 0.02), mm('frost')); g.add(sheet);
      const cg = slab(0.19, 0.12, 0.02, 0.02, 0.006);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const k = r === 0 ? 'blue' : c === 0 ? 'steel' : 'paper';
        const cell = new T.Mesh(cg, mm(k)); cell.position.set(-0.44 + c * 0.22, 0.32 - r * 0.16, 0.035); g.add(cell);
      }
    });
    // 5 · services: a gear with two app tiles
    icon((g) => {
      const s = new T.Shape(), N = 9, R1 = 0.5, R2 = 0.4;
      for (let i = 0; i < N * 4; i++) { const ang = (i / (N * 4)) * Math.PI * 2, r = i % 4 < 2 ? R1 : R2; const x = Math.cos(ang) * r, y = Math.sin(ang) * r; if (i === 0) s.moveTo(x, y); else s.lineTo(x, y); }
      s.closePath(); const hole = new T.Path(); hole.absarc(0, 0, 0.16, 0, Math.PI * 2, true); s.holes.push(hole);
      const gg = new T.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 24 }); gg.translate(0, 0, -0.07);
      const gear = new T.Mesh(gg, mm('navy')); g.add(gear); g.userData.gear = gear;
      const t1 = new T.Mesh(slab(0.36, 0.36, 0.1, 0.09, 0.03), mm('cyan')); t1.position.set(0.55, 0.42, -0.1); g.add(t1);
      const t2 = new T.Mesh(slab(0.3, 0.3, 0.1, 0.08, 0.03), mm('blue')); t2.position.set(-0.52, -0.45, -0.12); g.add(t2);
    });
    const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
    const v = new T.Vector3();
    // icon homes (wide / narrow layout); each icon flies along a gentle bend into its part of the mark
    const LAY = [
      [[-3.2, -0.55], [-1.6, 0.2], [0, 0.5], [1.6, 0.2], [3.2, -0.55]],
      [[-1.15, 1.75], [1.15, 1.75], [-1.45, -0.1], [1.45, -0.1], [0, -1.95]]
    ];
    const WIN = [0, 1, 2, 3, 4].map((i) => [0.12 + i * 0.06, 0.46 + i * 0.06]);
    const pose = { x: 0, y: 0, s: 1 };
    const iconPose = (B, i, e, cx, cy, sc) => {
      const bx = B[i][0], by = B[i][1], dx = cx - bx, dy = cy - by, k = Math.sin(Math.PI * e) * 0.22 * (i % 2 ? 1 : -1);
      pose.x = bx + dx * e - dy * k; pose.y = by + dy * e + dx * k; pose.s = sc * (1 - 0.55 * e);
    };
    // the mark rebuilt from ~1.7k small pieces: sampled from the logo raster, laid along the threads
    const RW = 356, RH = 304, STEP = 3;
    const SRC = [['frost', 'frost', 'blue', 'navy'], ['paper', 'paper', 'steel', 'cyan'], ['frost', 'blue', 'blue', 'cyan'], ['frost', 'paper', 'blue', 'steel'], ['navy', 'navy', 'cyan', 'blue']];
    const gA = C('#18F2DF'), gB = C('#2297FF'), WHITE = new T.Color(1, 1, 1), col = new T.Color(), tcol = new T.Color();
    const ZERO = new T.Matrix4().makeScale(0, 0, 0), dum = new T.Object3D();
    const PK = { state: 0, list: null, mesh: null, cent: null, key: '', ver: 0, env: 1 };
    // matte, untone-mapped: a piece facing the camera shows the logo's own gradient colour; tilted pieces pick up the key light
    const pmat = new T.MeshLambertMaterial({ emissive: 0xffffff, emissiveIntensity: 0.62, toneMapped: false });
    pmat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor;\n#endif'); };
    const rng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // pieces are split between the icons in equal arcs around the mark, matched to the icons' order around the layout
    function assign(list, B) {
      const n = list.length, xs = B.map((q) => q[0]), ys = B.map((q) => q[1]);
      const mx = (Math.max(...xs) + Math.min(...xs)) / 2, hx = (Math.max(...xs) - Math.min(...xs)) / 2 || 1;
      const my = (Math.max(...ys) + Math.min(...ys)) / 2, hy = (Math.max(...ys) - Math.min(...ys)) / 2 || 1;
      const ia = B.map((q) => Math.atan2((q[1] - my) / hy, (q[0] - mx) / hx));
      let cu = 0, cv = 0; list.forEach((q) => { cu += q.u; cv += q.v; }); cu /= n; cv /= n;
      const pa = list.map((q) => Math.atan2(cv - q.v, q.u - cu));
      const idx = list.map((_, k) => k).sort((x, y) => pa[x] - pa[y]), io = [0, 1, 2, 3, 4].sort((x, y) => ia[x] - ia[y]);
      const gap = (x, y) => { const g = Math.abs(x - y) % (2 * Math.PI); return g > Math.PI ? 2 * Math.PI - g : g; };
      let best = [0, 0], bc = Infinity;
      for (let s = 0; s < n; s += Math.max(1, n >> 7)) for (let r = 0; r < 5; r++) {
        let c = 0; for (let j = 0; j < n; j++) c += gap(pa[idx[(j + s) % n]], ia[io[(r + Math.floor((j * 5) / n)) % 5]]);
        if (c < bc) { bc = c; best = [s, r]; }
      }
      const ic = new Array(n), cen = [0, 1, 2, 3, 4].map(() => [0, 0, 0]);
      for (let j = 0; j < n; j++) {
        const k = idx[(j + best[0]) % n], i = io[(best[1] + Math.floor((j * 5) / n)) % 5];
        ic[k] = i; cen[i][0] += list[k].u - 0.5; cen[i][1] += 0.5 - list[k].v; cen[i][2]++;
      }
      return { ic, cen: cen.map((c) => [c[0] / Math.max(1, c[2]), c[1] / Math.max(1, c[2])]) };
    }
    function buildPieces(im) {
      const cvs = document.createElement('canvas'); cvs.width = RW; cvs.height = RH;
      const cx = cvs.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0, RW, RH);
      const d = cx.getImageData(0, 0, RW, RH).data;
      const A = (x, y) => (x < 0 || y < 0 || x >= RW || y >= RH ? 0 : d[(y * RW + x) * 4 + 3] / 255);
      const rnd = rng(20261014), list = [];
      for (let y0 = 0; y0 < RH; y0 += STEP) for (let x0 = 0; x0 < RW; x0 += STEP) {
        const px = Math.min(RW - 1, Math.floor(x0 + rnd() * STEP)), py = Math.min(RH - 1, Math.floor(y0 + rnd() * STEP));
        if (A(px, py) < 0.5) continue;
        // thread direction from the local structure tensor of the alpha mask
        let a = 0, b = 0, c = 0;
        for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
          const gx = A(px + i + 1, py + j) - A(px + i - 1, py + j), gy = A(px + i, py + j + 1) - A(px + i, py + j - 1);
          a += gx * gx; b += gx * gy; c += gy * gy;
        }
        list.push({
          u: (px + 0.5) / RW, v: (py + 0.5) / RH, ang: -(0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2), sz: 0.85 + 0.3 * rnd(),
          r1: rnd(), r2: rnd(), sw: 0.15 + 0.3 * rnd(), sj: rnd() - 0.5, lift: 0.3 + rnd(),
          rx: (rnd() * 2 - 1) * 7, ry: (rnd() * 2 - 1) * 7, rz: (rnd() * 2 - 1) * 4, oa: rnd() * Math.PI * 2, or: Math.sqrt(rnd()) * 0.5, sk: Math.floor(rnd() * 4)
        });
      }
      if (!list.length) { PK.state = -1; return; }
      const asg = LAY.map((B) => assign(list, B));
      list.forEach((q, k) => { q.ic = [asg[0].ic[k], asg[1].ic[k]]; q.eL = ease(smooth(0, 1, 0.3 + 0.45 * q.r1)); });
      const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), pmat, list.length);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      for (let k = 0; k < list.length; k++) { mesh.setMatrixAt(k, ZERO); mesh.setColorAt(k, WHITE); }
      mesh.instanceColor.setUsage(T.DynamicDrawUsage);
      root.add(mesh);
      Object.assign(PK, { state: 2, list, mesh, cent: asg.map((q) => q.cen), key: '' });
      try { if (R.compileAsync) R.compileAsync(scene, cam).catch(() => {}); } catch (e) { /* ignore */ }
    }
    function loadPieces() {
      const el = document.querySelector('[data-f="logo"] img');
      if (!el) return;
      PK.state = 1;
      const im = new Image();
      im.onload = () => { try { buildPieces(im); } catch (e) { PK.state = -1; } };
      im.onerror = () => { PK.state = -1; };
      im.src = el.currentSrc || el.src;
    }
    // a pure function of scroll: each piece leaves its icon while the icon flies, then eases into its slot
    function layPieces(p, red, lay, B, sc, Lx, Ly, Lw, Lh) {
      const key = [lay, p.toFixed(4), Lx.toFixed(3), Ly.toFixed(3), Lw.toFixed(3), PK.ver].join('|');
      if (key === PK.key) return;
      PK.key = key;
      const L = PK.list, mesh = PK.mesh, cen = PK.cent[lay], out = red ? 1 : smooth(0.84, 0.9, p);
      if (out >= 1 || p < 0.2) { mesh.visible = false; return; }
      const sp = (Lw * STEP) / RW, sweep = lerp(-0.3, 1.3, smooth(0.7, 0.8, p));
      let shown = 0;
      for (let k = 0; k < L.length; k++) {
        const q = L[k], i = q.ic[lay], w = WIN[i], pL = w[0] + (w[1] - w[0]) * (0.3 + 0.45 * q.r1), f0 = (p - pL) / (0.12 + 0.06 * q.r2);
        if (f0 <= 0) { mesh.setMatrixAt(k, ZERO); continue; }
        shown++;
        const f = Math.min(1, f0), g = 1 - Math.pow(1 - f, 3), arc = Math.sin(Math.PI * g), ug = 1 - g;
        iconPose(B, i, q.eL, Lx + cen[i][0] * Lw, Ly + cen[i][1] * Lh, sc);
        const sx = pose.x + Math.cos(q.oa) * q.or * pose.s, sy = pose.y + Math.sin(q.oa) * q.or * pose.s;
        const tx = Lx + (q.u - 0.5) * Lw, ty = Ly + (0.5 - q.v) * Lh, dx = tx - sx, dy = ty - sy;
        const bend = ((i % 2 ? 1 : -1) * q.sw + q.sj * 0.2) * arc;
        dum.position.set(sx + dx * g - dy * bend, sy + dy * g + dx * bend, q.lift * arc);
        dum.rotation.set(q.rx * ug, q.ry * ug, q.ang + q.rz * ug);
        const s = q.sz * sp * smooth(0, 0.14, f) * (1 + 0.7 * arc) * (1 - out);
        dum.scale.set(1.8 * s, 0.85 * s, 0.6 * s);
        dum.updateMatrix(); mesh.setMatrixAt(k, dum.matrix);
        col.copy(M[SRC[i][q.sk]].color).lerp(tcol.copy(gA).lerp(gB, q.u), smooth(0.05, 0.55, f));
        const sh = Math.exp(-Math.pow((q.u - sweep) / 0.08, 2)) * 0.5;
        if (sh > 0.01) col.lerp(WHITE, sh);
        mesh.setColorAt(k, col);
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.visible = shown > 0;
    }
    return {
      key: 'fusion', mode: 'sticky', scene, cam,
      setTheme(th, P) {
        const F = th === 'dark'
          ? { frost: '#DCE5F1', paper: '#EEF2F8', blue: '#2297FF', cyan: '#18F2DF', steel: '#91A0B7', navy: '#14233E' }
          : { frost: '#E3E9F1', paper: '#F5F7FA', blue: '#2297FF', cyan: '#18E0CF', steel: '#91A0B7', navy: '#14233E' };
        for (const k in M) M[k].color.set(F[k]);
        root.traverse((o) => { if (o.material && o.material.userData.k) o.material.color.copy(M[o.material.userData.k].color); });
        envAll(scene, P.env); PK.env = P.env; PK.ver++;
      },
      update(dt, p, st, since, aspect, r) {
        const wide = aspect > 1.15, red = st.reduced, t = red ? 0 : since, lay = wide ? 0 : 1, B = LAY[lay];
        const halfW = wide ? 4.1 : 2.1, tn = Math.tan((16 * Math.PI) / 180);
        const d = Math.max(8, halfW / (tn * aspect) + 1.2);
        cam.position.set(0, 0, d); cam.lookAt(0, 0, 0); cam.aspect = aspect; cam.updateProjectionMatrix();
        const sc = wide ? 0.95 : 0.78, hH = d * tn, hW = hH * aspect;
        // the DOM logo's box mapped onto the z=0 plane, so the pieces land exactly under the crisp mark
        let Lx = 0, Ly = 0.3, Lw = wide ? 3.2 : 3;
        const im = r && document.querySelector('[data-f="logo"] img');
        if (im) {
          const ir = im.getBoundingClientRect();
          if (ir.width > 4 && r.height > 4) {
            Lw = (ir.width / r.height) * 2 * hH;
            Lx = (((ir.left + ir.width / 2 - r.left) / r.width) * 2 - 1) * hW;
            Ly = (1 - ((ir.top + ir.height / 2 - r.top) / r.height) * 2) * hH;
          }
        }
        const Lh = (Lw * RH) / RW;
        if (PK.state === 0) loadPieces();
        const cen = PK.state === 2 ? PK.cent[lay] : null;
        follow(dt);
        icons.forEach((ic, i) => {
          const w = WIN[i], tl = red ? 1 : clamp((p - w[0]) / (w[1] - w[0])), e = ease(smooth(0, 1, tl));
          iconPose(B, i, e, cen ? Lx + cen[i][0] * Lw : Lx, cen ? Ly + cen[i][1] * Lh : Ly, sc);
          const bob = red ? 0 : Math.sin(t * 0.9 + i * 1.3) * 0.07 * (1 - e);
          ic.outer.position.set(pose.x, pose.y + bob, 0);
          ic.outer.scale.setScalar(Math.max(0.0001, pose.s));
          ic.spin.rotation.set((red ? 0 : mouse.y * 0.12) + Math.sin(t * 0.6 + i) * 0.06, (red ? 0 : mouse.x * 0.3) + Math.sin(t * 0.5 + i * 2) * 0.12 - 0.15 * (i - 2) * 0.4, e * 0.8 * (i % 2 ? 1 : -1));
          if (ic.g.userData.gear) ic.g.userData.gear.rotation.z = t * 0.4 + p * 3;
          setOpacity(ic.outer, 1 - smooth(0.3, 0.78, tl));
          const el = r && document.querySelector('[data-vlx-label="f' + i + '"]');
          if (el) {
            v.set(0, -0.82, 0); ic.outer.localToWorld(v); v.project(cam);
            const lw = el.offsetWidth || 120, px = Math.min(r.width - lw / 2 - 6, Math.max(lw / 2 + 6, (v.x + 1) / 2 * r.width));
            el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + ((1 - v.y) / 2 * r.height).toFixed(1) + 'px) translate(-50%,0)';
            el.style.opacity = String((1 - smooth(0, 0.3, e)) * clamp(since / 0.6));
          }
        });
        if (PK.state === 2) layPieces(p, red, lay, B, sc, Lx, Ly, Lw, Lh);
      }
    };
  }

  const items = [makeFusion(), makeSystem(), makeOnboarding()];
  let theme = null;
  const setTheme = (th) => { if (th === theme) return; theme = th; items.forEach((i) => i.setTheme(th, PAL[th])); };
  setTheme(host.getState().theme);
  try { if (R.compileAsync) await Promise.all(items.map((i) => R.compileAsync(i.scene, i.cam))); } catch (e) { /* ignore */ }

  const seen = items.map(() => 0);
  const size = new T.Vector2();
  let last = performance.now(), raf = 0, running = true;
  function frameLoop(now) {
    raf = requestAnimationFrame(frameLoop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const w = innerWidth, h = innerHeight;
    R.getSize(size); if (size.x !== w || size.y !== h) R.setSize(w, h, false);
    const st = host.getState(); setTheme(st.theme);
    R.setScissorTest(false); R.clear(); R.setScissorTest(true);
    items.forEach((it, idx) => {
      const el = document.querySelector(`[data-vlx3d="${it.key}"]`);
      if (!el) { seen[idx] = 0; return; }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.bottom < 0 || r.top > h) return;
      if (!seen[idx]) seen[idx] = now;
      const sec = el.closest('section') || el, sr = sec.getBoundingClientRect();
      let p;
      if (st.reduced) p = 1;
      else if (it.mode === 'sticky') p = clamp(-sr.top / Math.max(1, sr.height - h));
      else p = clamp((h * 0.92 - sr.top) / (h * 0.75));
      let clipB = Math.min(r.bottom, h); const nx = sec.nextElementSibling;
      if (nx) clipB = Math.min(clipB, nx.getBoundingClientRect().top + 12);
      const clipT = Math.max(r.top, 0);
      if (clipB <= clipT) return;
      it.update(dt, p, st, (now - seen[idx]) / 1000, r.width / r.height, r);
      R.setViewport(r.left, h - r.bottom, r.width, r.height);
      R.setScissor(r.left, h - clipB, r.width, clipB - clipT);
      R.render(it.scene, it.cam);
    });
  }
  raf = requestAnimationFrame(frameLoop);
  const onVis = () => {
    if (document.hidden && running) { cancelAnimationFrame(raf); running = false; }
    else if (!document.hidden && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frameLoop); }
  };
  document.addEventListener('visibilitychange', onVis);
  return { destroy() { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pointermove', onMove); R.dispose(); canvas.remove(); } };
}
